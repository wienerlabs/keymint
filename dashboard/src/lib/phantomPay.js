/* global BigInt */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Buffer } from "buffer";

// Anchor `verify_and_pay` instruction discriminator (from program IDL).
const VERIFY_AND_PAY_DISCRIMINATOR = Buffer.from([
  232, 197, 99, 115, 240, 124, 158, 31,
]);

/** Borsh-encode `verify_and_pay(amount: u64, endpoint: string, timestamp: i64)` */
function encodeVerifyAndPay(amount, endpoint, timestamp) {
  const endpointBytes = Buffer.from(endpoint, "utf-8");
  const buf = Buffer.alloc(8 + 8 + 4 + endpointBytes.length + 8);
  let offset = 0;
  VERIFY_AND_PAY_DISCRIMINATOR.copy(buf, offset);
  offset += 8;
  buf.writeBigUInt64LE(BigInt(amount), offset);
  offset += 8;
  buf.writeUInt32LE(endpointBytes.length, offset);
  offset += 4;
  endpointBytes.copy(buf, offset);
  offset += endpointBytes.length;
  buf.writeBigInt64LE(BigInt(timestamp), offset);
  return buf;
}

function deriveAuditLogPda(programId, payer, timestamp) {
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigInt64LE(BigInt(timestamp));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("audit"), payer.toBuffer(), tsBuf],
    programId
  );
  return pda;
}

/**
 * Run the full x402 flow against the proxy using Phantom for signing.
 *
 *   1. GET endpoint → 402 + paymentInstruction
 *   2. Build Anchor verify_and_pay instruction
 *   3. Phantom signs
 *   4. Broadcast + confirm
 *   5. Retry GET with x-402-payment header
 *
 * @param {object} args
 * @param {string} args.proxyUrl - http://localhost:4001 or production proxy
 * @param {string} args.rpcUrl   - Solana RPC URL (devnet)
 * @param {string} args.endpoint - Path like /v1/tokens/price
 * @param {object} args.phantom  - window.phantom.solana provider
 * @param {function} args.onStep - (step, detail) => void
 */
export async function runPhantomQuery({
  proxyUrl,
  rpcUrl,
  endpoint,
  phantom,
  onStep,
}) {
  const step = (name, detail = {}) => onStep && onStep(name, detail);

  step("matching", { endpoint });

  // 1. Get 402
  const r1 = await fetch(`${proxyUrl}${endpoint}`);
  if (r1.status !== 402) {
    const body = await r1.json().catch(() => ({}));
    throw new Error(
      `Expected 402 but got ${r1.status}: ${body.error || body.detail || ""}`
    );
  }
  const info = await r1.json();
  step("price_found", {
    price: info.price,
    priceUSD: info.priceUSD,
    endpoint,
  });

  if (!phantom?.publicKey) {
    throw new Error("Phantom not connected");
  }
  const payer = new PublicKey(phantom.publicKey.toString());
  step("wallet_resolved", { address: payer.toBase58() });

  // 2. Build instruction
  step("building_tx", {});
  const programId = new PublicKey(info.paymentInstruction.programId);
  const usdcMint = new PublicKey(info.paymentInstruction.meta.usdcMint);
  const publisherPDA = new PublicKey(
    info.paymentInstruction.accounts.publisherAccount
  );
  const publisherTokenAccount = new PublicKey(
    info.paymentInstruction.accounts.publisherTokenAccount
  );
  const payerTokenAccount = await getAssociatedTokenAddress(usdcMint, payer);
  const timestamp = Math.floor(Date.now() / 1000);
  const auditLog = deriveAuditLogPda(programId, payer, timestamp);

  const data = encodeVerifyAndPay(info.price, endpoint, timestamp);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: publisherPDA, isSigner: false, isWritable: true },
      { pubkey: payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: publisherTokenAccount, isSigner: false, isWritable: true },
      { pubkey: auditLog, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const connection = new Connection(rpcUrl, "confirmed");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("finalized");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
  tx.add(ix);

  step("tx_built", {});

  // 3. Phantom sign
  const signed = await phantom.signTransaction(tx);
  step("signed", {});

  // 4. Broadcast + confirm
  const txSignature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  step("broadcast", {
    txSignature,
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
  });

  step("confirming", {});
  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  step("confirmed", { txSignature });

  // 5. Retry with payment header
  step("forwarding", {});
  const r2 = await fetch(`${proxyUrl}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      "x-402-payment": JSON.stringify({ txSignature }),
    },
  });
  const finalBody = await r2.json();
  if (!r2.ok) {
    throw new Error(
      finalBody.detail || finalBody.error || `Proxy returned ${r2.status}`
    );
  }
  step("complete", {
    txSignature,
    price: info.price,
    priceUSD: info.priceUSD,
    payer: payer.toBase58(),
    publisher: info.paymentInstruction.meta.publisherWallet,
    publisherPDA: publisherPDA.toBase58(),
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
  });

  return { data: finalBody.data, txSignature, price: info.price };
}
