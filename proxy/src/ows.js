const ows = require("@open-wallet-standard/core");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");

/**
 * List all OWS wallets with their Solana addresses
 * @returns {Array<{name: string, id: string, solanaAddress: string|null}>}
 */
function listWallets() {
  const wallets = ows.listWallets();
  return wallets.map((w) => {
    const solAccount = w.accounts.find(
      (a) => a.chainId === "solana" || a.chainId.startsWith("solana:")
    );
    return {
      name: w.name,
      id: w.id,
      solanaAddress: solAccount?.address || null,
    };
  });
}

/**
 * Get a single OWS wallet's Solana address
 * @param {string} nameOrId - Wallet name or ID
 * @returns {{name: string, solanaAddress: string}}
 */
function getWallet(nameOrId) {
  const wallet = ows.getWallet(nameOrId);
  const solAccount = wallet.accounts.find(
    (a) => a.chainId === "solana" || a.chainId.startsWith("solana:")
  );
  if (!solAccount) {
    throw new Error(`No Solana account found in wallet '${nameOrId}'`);
  }
  return {
    name: wallet.name,
    id: wallet.id,
    solanaAddress: solAccount.address,
  };
}

/**
 * Get USDC balance for a Solana address
 * @param {string} address - Solana public key
 * @returns {Promise<{sol: number, usdc: number}>}
 */
async function getBalance(address) {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL,
    "confirmed"
  );
  const pubkey = new PublicKey(address);

  const solBalance = await connection.getBalance(pubkey);
  const solAmount = solBalance / 1e9;

  let usdcAmount = 0;
  try {
    const usdcMint = new PublicKey(process.env.USDC_MINT);
    const ata = await getAssociatedTokenAddress(usdcMint, pubkey);
    const tokenBalance = await connection.getTokenAccountBalance(ata);
    usdcAmount = parseFloat(tokenBalance.value.uiAmountString || "0");
  } catch {
    // No USDC ATA exists yet
  }

  return { sol: solAmount, usdc: usdcAmount };
}

/**
 * Sign a Solana transaction with OWS wallet
 * @param {string} walletName - OWS wallet name
 * @param {string} txHex - Serialized unsigned transaction (hex)
 * @param {string} [passphrase] - Wallet passphrase
 * @returns {{signature: string}}
 */
function signTransaction(walletName, txHex, passphrase) {
  return ows.signTransaction(walletName, "solana", txHex, passphrase || "");
}

module.exports = {
  listWallets,
  getWallet,
  getBalance,
  signTransaction,
};
