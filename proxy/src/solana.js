const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

function loadIDL() {
  // Try bundled copy first (Vercel), then original path (local)
  const paths = [
    path.resolve(__dirname, "../idl/keymint_payment.json"),
    path.resolve(__dirname, "../../program/target/idl/keymint_payment.json"),
  ];
  for (const p of paths) {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch {}
  }
  throw new Error("IDL file not found");
}

let _program = null;
let _connection = null;
let _publisherWallet = null;

/** Initialize Solana connection and Anchor program */
function initialize() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const programId = process.env.PROGRAM_ID;
  const publisherWalletPath =
    process.env.PUBLISHER_WALLET_KEYPAIR ||
    `${process.env.HOME}/.config/solana/id.json`;

  if (!rpcUrl || !programId) {
    throw new Error("SOLANA_RPC_URL and PROGRAM_ID env variables are required");
  }

  _connection = new Connection(rpcUrl, "confirmed");

  // Support env-based keypair (Vercel) or file-based (local)
  let walletData;
  if (process.env.PUBLISHER_WALLET_KEYPAIR_JSON) {
    walletData = JSON.parse(process.env.PUBLISHER_WALLET_KEYPAIR_JSON);
  } else {
    walletData = JSON.parse(fs.readFileSync(publisherWalletPath, "utf-8"));
  }
  _publisherWallet = Keypair.fromSecretKey(Uint8Array.from(walletData));

  const wallet = new anchor.Wallet(_publisherWallet);
  const provider = new anchor.AnchorProvider(_connection, wallet, {
    commitment: "confirmed",
  });

  const idl = loadIDL();
  _program = new anchor.Program(idl, provider);

  console.log(`[solana] Program ID: ${programId}`);
  console.log(`[solana] Publisher: ${_publisherWallet.publicKey.toBase58()}`);
  console.log(`[solana] RPC: ${rpcUrl}`);
}

/**
 * Verify a payment transaction on-chain
 * @param {string} txSignature - Transaction signature
 * @param {number} expectedAmount - Expected USDC amount (smallest unit)
 * @param {string} endpoint - Requested endpoint
 * @returns {Promise<{verified: boolean, payer: string}>}
 */
async function verifyPayment(txSignature, expectedAmount, endpoint) {
  const tx = await _connection.getTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found or not yet confirmed");
  }

  if (tx.meta?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const programId = new PublicKey(process.env.PROGRAM_ID);
  const accountKeys = tx.transaction.message.staticAccountKeys
    ? tx.transaction.message.staticAccountKeys.map((k) => k.toBase58())
    : tx.transaction.message.accountKeys.map((k) => k.toBase58());

  if (!accountKeys.includes(programId.toBase58())) {
    throw new Error("Transaction does not invoke the correct program ID");
  }

  const logs = tx.meta?.logMessages || [];
  const paymentLog = logs.find((log) => log.includes("lamports, endpoint:"));

  if (!paymentLog) {
    throw new Error("Payment verification log not found in transaction");
  }

  const payer = accountKeys[0];
  return { verified: true, payer };
}

/** Compute publisher PDA address */
function getPublisherPDA() {
  const programId = new PublicKey(process.env.PROGRAM_ID);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("publisher"), _publisherWallet.publicKey.toBuffer()],
    programId
  );
  return pda;
}

/** Get publisher USDC token account */
async function getPublisherTokenAccount() {
  const usdcMint = new PublicKey(process.env.USDC_MINT);
  return getAssociatedTokenAddress(usdcMint, _publisherWallet.publicKey);
}

/** Read publisher account from on-chain (for stats) */
async function getPublisherStats() {
  const pda = getPublisherPDA();
  try {
    const account = await _program.account.publisherAccount.fetch(pda);
    return {
      authority: account.authority.toBase58(),
      totalEarned: account.totalEarned.toNumber(),
      totalRequests: account.totalRequests.toNumber(),
    };
  } catch {
    return { authority: _publisherWallet.publicKey.toBase58(), totalEarned: 0, totalRequests: 0 };
  }
}

/** Build payment instruction (sent in 402 response) */
async function buildPaymentInstruction(amount, endpoint) {
  const programId = process.env.PROGRAM_ID;
  const publisherWallet = _publisherWallet.publicKey.toBase58();
  const publisherPDA = getPublisherPDA().toBase58();
  const publisherTokenAccount = (await getPublisherTokenAccount()).toBase58();
  const usdcMint = process.env.USDC_MINT;

  return {
    programId,
    method: "verify_and_pay",
    args: {
      amount,
      endpoint,
      timestamp: "CURRENT_UNIX_TIMESTAMP",
    },
    accounts: {
      payer: "CALLER_WALLET",
      publisherAccount: publisherPDA,
      payerTokenAccount: "CALLER_USDC_ATA",
      publisherTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      systemProgram: "11111111111111111111111111111111",
    },
    meta: {
      publisherWallet,
      usdcMint,
      network: process.env.SOLANA_NETWORK || "devnet",
      rpcUrl: process.env.SOLANA_RPC_URL,
    },
  };
}

/**
 * Read on-chain AuditLog accounts
 * @param {number} [limit=20] - Max results
 * @returns {Promise<Array>} Audit log records
 */
async function getOnChainAuditLogs(limit = 20) {
  try {
    const allAuditLogs = await _program.account.auditLog.all();
    const sorted = allAuditLogs
      .map((log) => ({
        payer: log.account.payer.toBase58(),
        publisher: log.account.publisher.toBase58(),
        amount: log.account.amount.toNumber(),
        endpoint: log.account.endpoint,
        timestamp: new Date(
          log.account.timestamp.toNumber() * 1000
        ).toISOString(),
        timestampRaw: log.account.timestamp.toNumber(),
        publicKey: log.publicKey.toBase58(),
      }))
      .sort((a, b) => b.timestampRaw - a.timestampRaw);

    return sorted.slice(0, limit);
  } catch {
    return [];
  }
}

/** Compute endpoint stats from on-chain AuditLog accounts */
async function getOnChainEndpointStats() {
  try {
    const allAuditLogs = await _program.account.auditLog.all();
    const stats = {};
    const callers = new Set();

    for (const log of allAuditLogs) {
      const endpoint = log.account.endpoint;
      const amount = log.account.amount.toNumber();
      const payer = log.account.payer.toBase58();

      if (!stats[endpoint]) {
        stats[endpoint] = { count: 0, earned: 0 };
      }
      stats[endpoint].count += 1;
      stats[endpoint].earned += amount;
      callers.add(payer);
    }

    return {
      endpoints: Object.entries(stats).map(([endpoint, s]) => ({
        endpoint,
        count: s.count,
        earned: s.earned,
      })),
      activeCallers: callers.size,
    };
  } catch {
    return { endpoints: [], activeCallers: 0 };
  }
}

function getConnection() {
  return _connection;
}

function getPublisherWallet() {
  return _publisherWallet;
}

function getProgram() {
  return _program;
}

module.exports = {
  initialize,
  verifyPayment,
  getPublisherPDA,
  getPublisherTokenAccount,
  getPublisherStats,
  buildPaymentInstruction,
  getOnChainAuditLogs,
  getOnChainEndpointStats,
  getConnection,
  getPublisherWallet,
  getProgram,
};
