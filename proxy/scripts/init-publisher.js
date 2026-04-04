/**
 * Initializes the publisher PDA account on-chain.
 * Only needs to be run once.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const programId = process.env.PROGRAM_ID;
  const keypairPath = process.env.PUBLISHER_WALLET_KEYPAIR;

  const connection = new Connection(rpcUrl, "confirmed");
  const walletData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const idlPath = path.resolve(__dirname, "../../program/target/idl/keymint_payment.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);

  const [publisherPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("publisher"), keypair.publicKey.toBuffer()],
    new PublicKey(programId)
  );

  console.log(`Publisher: ${keypair.publicKey.toBase58()}`);
  console.log(`Publisher PDA: ${publisherPDA.toBase58()}`);
  console.log(`Program: ${programId}`);

  const info = await connection.getAccountInfo(publisherPDA);
  if (info) {
    console.log("Publisher PDA already exists, skipping.");
    const account = await program.account.publisherAccount.fetch(publisherPDA);
    console.log(`  totalEarned: ${account.totalEarned.toNumber()}`);
    console.log(`  totalRequests: ${account.totalRequests.toNumber()}`);
    return;
  }

  console.log("Creating publisher PDA...");
  const tx = await program.methods
    .initializePublisher()
    .accounts({
      publisherAccount: publisherPDA,
      authority: keypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([keypair])
    .rpc({ commitment: "confirmed" });

  console.log(`TX: ${tx}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  console.log("Publisher PDA created successfully!");
}

main().catch(console.error);
