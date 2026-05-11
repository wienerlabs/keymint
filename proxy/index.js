const IS_SERVERLESS = !!(process.env.VERCEL || process.env.NETLIFY);

if (!IS_SERVERLESS) {
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

const corsOrigin = process.env.CORS_ORIGIN || "*";
const allowedOrigins =
  corsOrigin === "*"
    ? "*"
    : corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-402-payment", "x-publisher-key"],
  })
);
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

// Initialize eagerly in local dev (non-serverless)
if (!IS_SERVERLESS) {
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

function patternMatches(pattern, recordedEndpoint) {
  if (recordedEndpoint === pattern) return true;
  const regexStr = "^" + pattern.replace(/:(\w+)/g, "([^/]+)") + "$";
  return new RegExp(regexStr).test(recordedEndpoint);
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

  if (payments.isConsumed(txSignature)) {
    return res.status(402).json({
      error: "Payment already consumed",
      detail: "This transaction signature has already been used to unlock a request",
    });
  }

  let verificationResult;
  try {
    verificationResult = await solana.verifyPayment(txSignature, endpointConfig.price, req.path);
  } catch (err) {
    return res.status(402).json({ error: "Payment verification failed", detail: err.message });
  }

  payments.markConsumed(txSignature);
  solana.invalidateAuditCache();

  try {
    const data = await upstream.forward(endpointConfig.upstream, params, req.query);
    payments.recordPayment({
      payer: verificationResult.payer,
      endpoint: req.path,
      amount: endpointConfig.price,
      txSignature,
      data,
    });
    return res.json({
      status: "ok",
      data,
      payment: { txSignature, amount: endpointConfig.price, payer: verificationResult.payer },
    });
  } catch (err) {
    // Forward failed after the on-chain payment was already accepted. We still
    // record the payment (without data) so the audit trail and dashboard reflect
    // the loss and the user can see the failure on the explorer.
    payments.recordPayment({
      payer: verificationResult.payer,
      endpoint: req.path,
      amount: endpointConfig.price,
      txSignature,
    });
    const status = err.status || 502;
    console.warn(
      `[keymint-proxy] Upstream failed after payment: ${err.kind || "error"} (${status}) tx=${txSignature}`
    );
    return res.status(status).json({
      error: err.kind || "upstream_error",
      detail: err.message,
      paidTxSignature: txSignature,
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
        const aggregate = onChainStats.endpoints.reduce(
          (acc, s) => {
            if (patternMatches(pattern, s.endpoint)) {
              acc.count += s.count;
              acc.earned += s.earned;
            }
            return acc;
          },
          { count: 0, earned: 0 }
        );
        return {
          pattern,
          price: cfg.price,
          priceUSD: cfg.price / 1_000_000,
          count: aggregate.count,
          earned: aggregate.earned,
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
    const payerFilter = req.query.payer;
    // When filtering by payer we read more rows from chain so the post-filter
    // window still has at most `limit` matches.
    const fetchLimit = payerFilter ? Math.max(limit * 5, 50) : limit;
    const onChainPayments = await solana.getOnChainAuditLogs(fetchLimit);
    const filtered = payerFilter
      ? onChainPayments.filter((p) => p.payer === payerFilter)
      : onChainPayments;
    const enriched = filtered.slice(0, limit).map((p) => {
      const match = payments.findMatchingRecord(p.payer, p.amount, p.timestamp);
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

function requirePublisherKey(req, res) {
  const expected = process.env.PUBLISHER_API_KEY;
  if (!expected) {
    res.status(503).json({
      error: "Pricing API disabled",
      detail: "Set PUBLISHER_API_KEY in .env to enable price updates",
    });
    return false;
  }
  const provided = req.headers["x-publisher-key"];
  if (provided !== expected) {
    res.status(401).json({ error: "Invalid publisher key" });
    return false;
  }
  return true;
}

app.get("/api/payments/:txSig", (req, res) => {
  const { txSig } = req.params;
  if (!txSig || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(txSig)) {
    return res.status(400).json({ error: "Invalid txSignature" });
  }
  const record = payments.getByTxSignature(txSig);
  if (!record) {
    return res.status(404).json({
      error: "Not found",
      detail:
        "No in-memory record for this signature. Either it predates this proxy session, or it has aged out of the recent buffer (max 100).",
      explorerUrl: `https://explorer.solana.com/tx/${txSig}?cluster=devnet`,
    });
  }
  res.json({
    ...record,
    explorerUrl: `https://explorer.solana.com/tx/${txSig}?cluster=devnet`,
  });
});

app.put("/api/endpoints/price", (req, res) => {
  if (!requirePublisherKey(req, res)) return;
  const { endpoint, price } = req.body;
  if (!endpoint || typeof price !== "number" || price <= 0) {
    return res.status(400).json({ error: "Valid endpoint and price required" });
  }
  if (!config.endpoints[endpoint]) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  config.endpoints[endpoint].price = price;
  if (!IS_SERVERLESS) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  res.json({
    success: true,
    endpoint,
    newPrice: price,
    newPriceUSD: price / 1_000_000,
    persistent: !IS_SERVERLESS,
  });
});

// ─────────── OWS Wallet API ───────────

app.get("/api/wallets", (_req, res) => {
  if (IS_SERVERLESS) {
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

app.post("/api/wallets", (req, res) => {
  if (IS_SERVERLESS) {
    return res.status(501).json({
      error: "Wallet creation not available in cloud mode",
      detail: "Run the dashboard locally to create OWS wallets",
    });
  }
  const name = (req.body?.name || "").trim();
  const passphrase = req.body?.passphrase || "";
  if (!name || !/^[a-zA-Z0-9_-]{2,40}$/.test(name)) {
    return res.status(400).json({
      error: "Invalid name",
      detail: "Use 2-40 chars: letters, digits, underscore, hyphen",
    });
  }
  try {
    const owsModule = require("./src/ows");
    const existing = owsModule.listWallets().find((w) => w.name === name);
    if (existing) {
      return res.status(409).json({ error: "Wallet name already exists" });
    }
    const wallet = owsModule.createWallet(name, passphrase);
    res.status(201).json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/wallets/:name", async (req, res) => {
  if (IS_SERVERLESS) {
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
  if (IS_SERVERLESS) {
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

app.get("/api/config", (req, res) => {
  const pkg = require("./package.json");
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  res.json({
    version: pkg.version,
    endpoints: Object.entries(config.endpoints).map(([pattern, cfg]) => ({
      pattern,
      price: cfg.price,
      priceUSD: cfg.price / 1_000_000,
    })),
    programId: process.env.PROGRAM_ID,
    network: process.env.SOLANA_NETWORK || "devnet",
    usdcMint: process.env.USDC_MINT,
    publisher: process.env.PUBLISHER_WALLET || null,
    proxyUrl: `${proto}://${host}`,
    runtime: {
      vercel: !!process.env.VERCEL,
      netlify: !!process.env.NETLIFY,
      serverless: IS_SERVERLESS,
      persistent: !IS_SERVERLESS,
      pricingApiEnabled: !!process.env.PUBLISHER_API_KEY,
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────── Server ───────────

module.exports = app;

if (!IS_SERVERLESS) {
  const PORT = process.env.PROXY_PORT || 4001;
  app.listen(PORT, () => {
    console.log(`[keymint-proxy] Running on port ${PORT}`);
    console.log(`[keymint-proxy] Endpoints:`);
    for (const [pattern, cfg] of Object.entries(config.endpoints)) {
      console.log(`  ${pattern} → $${cfg.price / 1_000_000} USDC`);
    }
  });
}
