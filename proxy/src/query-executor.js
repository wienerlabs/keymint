const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const owsModule = require("./ows");
const solana = require("./solana");
const upstream = require("./upstream");
const payments = require("./payments");

function loadIDL() {
  const paths = [
    path.resolve(__dirname, "../idl/keymint_payment.json"),
    path.resolve(__dirname, "../../program/target/idl/keymint_payment.json"),
  ];
  for (const p of paths) {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch {}
  }
  throw new Error("IDL file not found");
}

/**
 * Execute a full x402 query flow:
 *   1. Check price for endpoint
 *   2. Build Anchor verify_and_pay transaction
 *   3. Sign with OWS wallet
 *   4. Broadcast to Solana devnet
 *   5. Forward to upstream API
 *
 * @param {object} params
 * @param {string} params.walletName - OWS wallet name
 * @param {string} params.endpoint - Keymint endpoint path (e.g. /v1/address/0x.../portfolio)
 * @param {string} [params.passphrase] - OWS passphrase
 * @param {function} params.onStep - Callback for step updates: (step, detail) => void
 * @returns {Promise<object>} The upstream API response
 */
async function executeQuery({ walletName, endpoint, passphrase, onStep }) {
  const connection = solana.getConnection();
  const config = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../config.json"), "utf-8")
  );

  // Step 1: Match endpoint and get price
  onStep("matching", { endpoint });

  const matched = matchEndpoint(endpoint, config);
  if (!matched) {
    throw new Error(`Endpoint not found: ${endpoint}`);
  }

  const price = matched.config.price;
  onStep("price_found", {
    endpoint,
    price,
    priceUSD: price / 1_000_000,
  });

  // Step 2: Resolve wallet
  const walletInfo = owsModule.getWallet(walletName);
  const payerPubkey = new PublicKey(walletInfo.solanaAddress);

  onStep("wallet_resolved", {
    wallet: walletName,
    address: walletInfo.solanaAddress,
  });

  // Step 3: Build transaction
  onStep("building_tx", { message: "Building Anchor transaction..." });

  const programId = new PublicKey(process.env.PROGRAM_ID);
  const usdcMint = new PublicKey(process.env.USDC_MINT);

  const publisherPDA = solana.getPublisherPDA();
  const publisherTokenAccount = await solana.getPublisherTokenAccount();
  const payerTokenAccount = await getAssociatedTokenAddress(
    usdcMint,
    payerPubkey
  );

  const timestamp = Math.floor(Date.now() / 1000);
  const timestampBuffer = Buffer.alloc(8);
  timestampBuffer.writeBigInt64LE(BigInt(timestamp));

  const [auditLogPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("audit"), payerPubkey.toBuffer(), timestampBuffer],
    programId
  );

  const idl = loadIDL();
  const dummyWallet = {
    publicKey: payerPubkey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new anchor.AnchorProvider(connection, dummyWallet, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);

  const ix = await program.methods
    .verifyAndPay(
      new anchor.BN(price),
      endpoint,
      new anchor.BN(timestamp)
    )
    .accounts({
      payer: payerPubkey,
      publisherAccount: publisherPDA,
      payerTokenAccount,
      publisherTokenAccount,
      auditLog: auditLogPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // Step 4: Get blockhash and serialize
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");

  const tx = new Transaction({
    feePayer: payerPubkey,
    recentBlockhash: blockhash,
  });
  tx.add(ix);

  const txBuf = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const txHex = txBuf.toString("hex");

  onStep("tx_built", { message: "Transaction built, signing with OWS..." });

  // Step 5: Sign with OWS
  const signResult = owsModule.signTransaction(
    walletName,
    txHex,
    passphrase || ""
  );

  // Place signature into buffer
  const sigBuf = Buffer.from(signResult.signature, "hex");
  const signedTx = Buffer.from(txHex, "hex");
  sigBuf.copy(signedTx, 1, 0, 64);

  onStep("signed", { message: "OWS signed. Broadcasting to Solana devnet..." });

  // Step 6: Broadcast
  const txSignature = await connection.sendRawTransaction(signedTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  onStep("broadcast", {
    txSignature,
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
  });

  // Step 7: Wait for confirmation
  onStep("confirming", { message: "Waiting for on-chain confirmation..." });

  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  onStep("confirmed", {
    txSignature,
    message: "Payment confirmed on-chain!",
  });

  payments.markConsumed(txSignature);
  solana.invalidateAuditCache();

  // Step 8: Forward to upstream
  onStep("forwarding", { message: "Forwarding to upstream API..." });

  const data = await upstream.forward(matched.config.upstream, matched.params);

  payments.recordPayment({
    payer: walletInfo.solanaAddress,
    endpoint,
    amount: price,
    txSignature,
    data,
  });

  const publisherWallet = solana.getPublisherWallet();
  onStep("complete", {
    txSignature,
    price,
    priceUSD: price / 1_000_000,
    payer: walletInfo.solanaAddress,
    publisher: publisherWallet.publicKey.toBase58(),
    publisherPDA: solana.getPublisherPDA().toBase58(),
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
  });

  return { data, txSignature, price };
}

/** Match an endpoint path to config (same logic as main handler) */
function matchEndpoint(requestPath, config) {
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

module.exports = { executeQuery };
