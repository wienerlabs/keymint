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

const app = express();
app.use(cors());
app.use(express.json());

// Read config
const CONFIG_PATH = path.resolve(__dirname, "config.json");
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// Lazy initialization — don't crash on import
let _initialized = false;
function ensureInitialized() {
  if (_initialized) return;
  try {
    solana.initialize();
    upstream.initialize();
    _initialized = true;
  } catch (err) {
    console.error("[keymint-proxy] Init error:", err.message);
    throw err;
  }
}

// Initialize eagerly in local dev (non-Vercel)
if (!process.env.VERCEL) {
  ensureInitialized();
}

// ─────────── x402 Proxy Middleware ───────────

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

async function x402Handler(req, res) {
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }

  const matched = matchEndpoint(req.path);
  if (!matched) {
    return res.status(404).json({
      error: "Endpoint not found",
      availableEndpoints: Object.keys(config.endpoints),
    });
  }

  const { config: endpointConfig, params } = matched;
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

  let verificationResult;
  try {
    verificationResult = await solana.verifyPayment(txSignature, endpointConfig.price, req.path);
  } catch (err) {
    return res.status(402).json({ error: "Payment verification failed", detail: err.message });
  }

  payments.recordPayment({
    payer: verificationResult.payer,
    endpoint: req.path,
    amount: endpointConfig.price,
    txSignature,
  });

  try {
    const data = await upstream.forward(endpointConfig.upstream, params, req.query);
    return res.json({
      status: "ok",
      data,
      payment: { txSignature, amount: endpointConfig.price, payer: verificationResult.payer },
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

// Proxy endpoints — use regex for Vercel compat (Express 5 {*path} not supported)
app.all(/^\/v1\/(.*)$/, x402Handler);

// ─────────── Dashboard API ───────────

app.get("/api/stats", async (_req, res) => {
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/endpoints", async (_req, res) => {
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/payments", async (req, res) => {
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }
  try {
    const limit = parseInt(req.query.limit) || 20;
    const onChainPayments = await solana.getOnChainAuditLogs(limit);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/endpoints/price", (req, res) => {
  const { endpoint, price } = req.body;
  if (!endpoint || typeof price !== "number" || price <= 0) {
    return res.status(400).json({ error: "Valid endpoint and price required" });
  }
  if (!config.endpoints[endpoint]) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  config.endpoints[endpoint].price = price;
  // Only write to disk in local dev (Vercel filesystem is readonly)
  if (!process.env.VERCEL) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  res.json({ success: true, endpoint, newPrice: price, newPriceUSD: price / 1_000_000 });
});

// ─────────── OWS Wallet API ───────────

app.get("/api/wallets", (_req, res) => {
  if (process.env.VERCEL) {
    return res.json([]);
  }
  try {
    const owsModule = require("./src/ows");
    const wallets = owsModule.listWallets();
    res.json(wallets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/wallets/:name", async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(404).json({ error: "OWS wallets not available in cloud mode" });
  }
  try {
    const owsModule = require("./src/ows");
    const wallet = owsModule.getWallet(req.params.name);
    const balance = await owsModule.getBalance(wallet.solanaAddress);
    res.json({ ...wallet, balance });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get("/api/balance/:address", async (req, res) => {
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }
  try {
    const { Connection, PublicKey } = require("@solana/web3.js");
    const { getAssociatedTokenAddress } = require("@solana/spl-token");
    const connection = solana.getConnection();
    const pubkey = new PublicKey(req.params.address);
    const solBalance = await connection.getBalance(pubkey);
    let usdcAmount = 0;
    try {
      const usdcMint = new PublicKey(process.env.USDC_MINT);
      const ata = await getAssociatedTokenAddress(usdcMint, pubkey);
      const tokenBalance = await connection.getTokenAccountBalance(ata);
      usdcAmount = parseFloat(tokenBalance.value.uiAmountString || "0");
    } catch {}
    res.json({ sol: solBalance / 1e9, usdc: usdcAmount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────── Query Execution with SSE ───────────

app.get("/api/query/stream", async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({ error: "SSE streaming not supported in serverless mode. Use the agent-sdk CLI locally." });
  }
  try { ensureInitialized(); } catch (err) {
    return res.status(503).json({ error: "Service initializing", detail: err.message });
  }
  const { executeQuery } = require("./src/query-executor");
  const { wallet, endpoint, passphrase } = req.query;
  if (!wallet || !endpoint) {
    return res.status(400).json({ error: "wallet and endpoint query params required" });
  }
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
    sendStep("result", { data: result.data, txSignature: result.txSignature, price: result.price });
  } catch (err) {
    sendStep("error", { message: err.message });
  }
  res.end();
});

app.get("/api/config", (_req, res) => {
  res.json({
    endpoints: config.endpoints,
    programId: process.env.PROGRAM_ID,
    network: process.env.SOLANA_NETWORK || "devnet",
    usdcMint: process.env.USDC_MINT,
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────── Server ───────────

module.exports = app;

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
