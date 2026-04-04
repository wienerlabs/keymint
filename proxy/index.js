if (!process.env.VERCEL) {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const solana = require("./src/solana");
const upstream = require("./src/upstream");
const payments = require("./src/payments");
const owsModule = require("./src/ows");
const { executeQuery } = require("./src/query-executor");

const app = express();
app.use(cors());
app.use(express.json());

// Read config
const CONFIG_PATH = path.resolve(__dirname, "config.json");
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// Initialize Solana and Zerion connections
solana.initialize();
upstream.initialize();

// ─────────── x402 Proxy Middleware ───────────

/** Match incoming request path to an endpoint config */
function matchEndpoint(requestPath) {
  for (const [pattern, endpointConfig] of Object.entries(config.endpoints)) {
    const regexStr = "^" + pattern.replace(/:(\w+)/g, "([^/]+)") + "$";
    const match = requestPath.match(new RegExp(regexStr));
    if (match) {
      const paramNames = [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { config: endpointConfig, params, pattern };
    }
  }
  return null;
}

/** x402 Payment Required handler and proxy */
async function x402Handler(req, res) {
  const matched = matchEndpoint(req.path);

  if (!matched) {
    return res.status(404).json({
      error: "Endpoint not found",
      availableEndpoints: Object.keys(config.endpoints),
    });
  }

  const { config: endpointConfig, params } = matched;

  // Check x-402-payment header
  const paymentHeader = req.headers["x-402-payment"];

  if (!paymentHeader) {
    const paymentInstruction = await solana.buildPaymentInstruction(
      endpointConfig.price,
      req.path
    );

    return res.status(402).json({
      status: 402,
      message: "Payment Required",
      price: endpointConfig.price,
      priceUSD: endpointConfig.price / 1_000_000,
      currency: "USDC",
      network: "solana-devnet",
      paymentInstruction,
    });
  }

  // Payment header present — parse tx signature
  let txSignature;
  try {
    const parsed = JSON.parse(paymentHeader);
    txSignature = parsed.txSignature || parsed.signature;
  } catch {
    txSignature = paymentHeader;
  }

  if (!txSignature || typeof txSignature !== "string") {
    return res.status(400).json({
      error: "Invalid x-402-payment header format",
      expected: 'JSON: {"txSignature": "..."} or plain string',
    });
  }

  // Verify on-chain
  let verificationResult;
  try {
    verificationResult = await solana.verifyPayment(
      txSignature,
      endpointConfig.price,
      req.path
    );
  } catch (err) {
    return res.status(402).json({
      error: "Payment verification failed",
      detail: err.message,
    });
  }

  // Record payment
  payments.recordPayment({
    payer: verificationResult.payer,
    endpoint: req.path,
    amount: endpointConfig.price,
    txSignature,
  });

  // Forward to upstream API
  try {
    const data = await upstream.forward(
      endpointConfig.upstream,
      params,
      req.query
    );

    return res.json({
      status: "ok",
      data,
      payment: {
        txSignature,
        amount: endpointConfig.price,
        payer: verificationResult.payer,
      },
    });
  } catch (err) {
    const status = err.response?.status || 502;
    return res.status(status).json({
      error: "Upstream API error",
      detail: err.response?.data || err.message,
    });
  }
}

// ─────────── API Routes ───────────

// Proxy endpoints
app.all("/v1/{*path}", x402Handler);

// ─────────── Dashboard API ───────────

// Summary stats — on-chain as primary source
app.get("/api/stats", async (_req, res) => {
  const [publisherStats, onChainEndpointStats] = await Promise.all([
    solana.getPublisherStats(),
    solana.getOnChainEndpointStats(),
  ]);

  res.json({
    totalEarned: publisherStats.totalEarned,
    totalRequests: publisherStats.totalRequests,
    activeCallers: onChainEndpointStats.activeCallers,
    onChain: publisherStats,
  });
});

// Per-endpoint stats — from on-chain audit logs
app.get("/api/endpoints", async (_req, res) => {
  const onChainStats = await solana.getOnChainEndpointStats();
  const endpointsWithPrices = Object.entries(config.endpoints).map(
    ([pattern, cfg]) => {
      const stat = onChainStats.endpoints.find(
        (s) => s.endpoint.includes(pattern.split(":")[0]) || s.endpoint === pattern
      ) || { count: 0, earned: 0 };
      return {
        pattern,
        price: cfg.price,
        priceUSD: cfg.price / 1_000_000,
        count: stat.count,
        earned: stat.earned,
      };
    }
  );
  res.json(endpointsWithPrices);
});

// Recent payments — on-chain audit logs + tx signature enrichment
app.get("/api/payments", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const onChainPayments = await solana.getOnChainAuditLogs(limit);

  // Enrich with tx signatures from in-memory records
  const recentMemory = payments.getRecentPayments(100);
  const enriched = onChainPayments.map((p) => {
    const match = recentMemory.find(
      (m) =>
        m.payer === p.payer &&
        m.amount === p.amount &&
        Math.abs(new Date(m.timestamp).getTime() - new Date(p.timestamp).getTime()) < 60000
    );
    return {
      ...p,
      txSignature: match?.txSignature || null,
      explorerUrl: match?.txSignature
        ? `https://explorer.solana.com/tx/${match.txSignature}?cluster=devnet`
        : `https://explorer.solana.com/address/${p.publicKey}?cluster=devnet`,
    };
  });

  res.json(enriched);
});

// Update endpoint price
app.put("/api/endpoints/price", (req, res) => {
  const { endpoint, price } = req.body;

  if (!endpoint || typeof price !== "number" || price <= 0) {
    return res.status(400).json({ error: "Valid endpoint and price required" });
  }

  if (!config.endpoints[endpoint]) {
    return res.status(404).json({ error: "Endpoint not found" });
  }

  config.endpoints[endpoint].price = price;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  res.json({
    success: true,
    endpoint,
    newPrice: price,
    newPriceUSD: price / 1_000_000,
  });
});

// ─────────── OWS Wallet API ───────────

// List all OWS wallets
app.get("/api/wallets", (_req, res) => {
  try {
    const wallets = owsModule.listWallets();
    res.json(wallets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get wallet details + balance
app.get("/api/wallets/:name", async (req, res) => {
  try {
    const wallet = owsModule.getWallet(req.params.name);
    const balance = await owsModule.getBalance(wallet.solanaAddress);
    res.json({ ...wallet, balance });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Get balance for any Solana address
app.get("/api/balance/:address", async (req, res) => {
  try {
    const balance = await owsModule.getBalance(req.params.address);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────── Query Execution with SSE ───────────

// Execute a full x402 query with real-time step streaming
app.get("/api/query/stream", async (req, res) => {
  const { wallet, endpoint, passphrase } = req.query;

  if (!wallet || !endpoint) {
    return res.status(400).json({ error: "wallet and endpoint query params required" });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const sendStep = (step, detail) => {
    const data = JSON.stringify({ step, ...detail, timestamp: Date.now() });
    res.write(`data: ${data}\n\n`);
  };

  try {
    const result = await executeQuery({
      walletName: wallet,
      endpoint: decodeURIComponent(endpoint),
      passphrase: passphrase || "",
      onStep: sendStep,
    });

    // Send final result
    sendStep("result", {
      data: result.data,
      txSignature: result.txSignature,
      price: result.price,
    });
  } catch (err) {
    sendStep("error", { message: err.message });
  }

  res.end();
});

// Config info
app.get("/api/config", (_req, res) => {
  res.json({
    endpoints: config.endpoints,
    programId: process.env.PROGRAM_ID,
    network: process.env.SOLANA_NETWORK || "devnet",
    usdcMint: process.env.USDC_MINT,
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────── Server ───────────

// Export for Vercel serverless
module.exports = app;

// Local dev: listen on port
if (!process.env.VERCEL) {
  const PORT = process.env.PROXY_PORT || 4001;
  app.listen(PORT, () => {
    console.log(`[keymint-proxy] Running on port ${PORT}`);
    console.log(`[keymint-proxy] Endpoints:`);
    for (const [pattern, cfg] of Object.entries(config.endpoints)) {
      console.log(`  ${pattern} → $${cfg.price / 1_000_000} USDC`);
    }
  });
}
