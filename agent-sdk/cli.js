#!/usr/bin/env node

/**
 * Keymint Agent SDK CLI
 * Access x402-enabled APIs with OWS wallet auto-payment.
 *
 * Usage:
 *   node cli.js setup                — Create OWS wallet
 *   node cli.js policy               — Set spending policy
 *   node cli.js fetch <endpoint>     — Make API request (auto-pay)
 *   node cli.js wallets              — List wallets
 */

const {
  KeymintClient,
  createOWSWallet,
  createOWSPolicy,
  listOWSWallets,
} = require("./index");

const PROXY_URL = process.env.KEYMINT_PROXY_URL || "http://localhost:4001";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const WALLET_NAME = process.env.KEYMINT_WALLET || "keymint-agent";
const PASSPHRASE = process.env.KEYMINT_PASSPHRASE || "";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "setup": {
      console.log("Creating OWS wallet...");
      try {
        const wallet = createOWSWallet(WALLET_NAME, PASSPHRASE);
        const solAccount = wallet.accounts.find(
          (a) => a.chainId.startsWith("solana:")
        );
        console.log(`Wallet: ${wallet.name}`);
        console.log(`Solana address: ${solAccount?.address}`);
        console.log(`\nTo get devnet SOL:`);
        console.log(`  solana airdrop 2 ${solAccount?.address} --url devnet`);
        console.log(`\nTo get devnet USDC, use a faucet:`);
        console.log(`  https://spl-token-faucet.com/?token-name=USDC`);
      } catch (e) {
        if (e.message.includes("already exists")) {
          console.log(`Wallet '${WALLET_NAME}' already exists.`);
          const wallets = listOWSWallets();
          const w = wallets.find((w) => w.name === WALLET_NAME);
          if (w) {
            const solAccount = w.accounts.find(
              (a) => a.chainId.startsWith("solana:")
            );
            console.log(`Solana address: ${solAccount?.address}`);
          }
        } else {
          throw e;
        }
      }
      break;
    }

    case "policy": {
      const expiresAt = args[0] || null;

      console.log("Creating OWS policy...");
      createOWSPolicy({ expiresAt });
      console.log(
        `Policy: allowed_chains=solana:devnet${expiresAt ? `, expires=${expiresAt}` : ""}`
      );
      break;
    }

    case "fetch": {
      const endpoint = args[0];
      if (!endpoint) {
        console.error(
          "Endpoint required. Example: node cli.js fetch /v1/tokens/price"
        );
        process.exit(1);
      }

      let client;
      try {
        client = KeymintClient.fromOWSWallet(
          PROXY_URL,
          WALLET_NAME,
          PASSPHRASE,
          RPC_URL
        );
        console.log(`OWS wallet: ${client.walletAddress.toBase58()}`);
      } catch {
        const keypairPath = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
        client = KeymintClient.fromKeypairFile(PROXY_URL, keypairPath, RPC_URL);
        console.log(`Keypair wallet: ${client.walletAddress.toBase58()}`);
      }

      console.log(`Endpoint: ${endpoint}`);
      console.log("Sending request...\n");

      const data = await client.fetch(endpoint);
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "wallets": {
      const wallets = listOWSWallets();
      if (wallets.length === 0) {
        console.log("No OWS wallets found. Run 'node cli.js setup' to create one.");
      } else {
        wallets.forEach((w) => {
          const solAccount = w.accounts.find(
            (a) => a.chainId.startsWith("solana:")
          );
          console.log(
            `${w.name} — Solana: ${solAccount?.address || "n/a"}`
          );
        });
      }
      break;
    }

    default:
      console.log(`
Keymint Agent SDK CLI

Commands:
  setup                       Create OWS wallet
  policy [expiresAt]          Set Solana-only spending policy
  fetch <endpoint>            Make API request (auto-pay)
  wallets                     List wallets

Environment variables:
  KEYMINT_PROXY_URL           Proxy URL (default: http://localhost:4001)
  KEYMINT_WALLET              OWS wallet name (default: keymint-agent)
  KEYMINT_PASSPHRASE          OWS wallet passphrase
  SOLANA_RPC_URL              Solana RPC (default: devnet)
  SOLANA_KEYPAIR              Keypair file path (fallback if no OWS)
      `);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
