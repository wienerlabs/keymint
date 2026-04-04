const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const ows = require("@open-wallet-standard/core");
const fs = require("fs");
const path = require("path");

const IDL_PATH = path.resolve(
  __dirname,
  "../program/target/idl/keymint_payment.json"
);

class KeymintClient {
  /**
   * @param {object} options
   * @param {string} options.proxyUrl - Keymint proxy URL
   * @param {string} [options.rpcUrl] - Solana RPC URL
   * @param {string} [options.owsWallet] - OWS wallet name or ID
   * @param {string} [options.owsPassphrase] - OWS wallet passphrase
   * @param {Keypair} [options.keypair] - Direct Solana keypair (alternative to OWS)
   */
  constructor({ proxyUrl, rpcUrl, owsWallet, owsPassphrase, keypair }) {
    if (!proxyUrl) throw new Error("proxyUrl is required");
    if (!owsWallet && !keypair) {
      throw new Error("owsWallet or keypair is required");
    }

    this.proxyUrl = proxyUrl.replace(/\/$/, "");
    this.rpcUrl = rpcUrl || "https://api.devnet.solana.com";
    this.connection = new Connection(this.rpcUrl, "confirmed");
    this._program = null;
    this._idl = null;

    this.owsWallet = owsWallet || null;
    this.owsPassphrase = owsPassphrase || null;
    this.keypair = keypair || null;

    if (this.owsWallet) {
      const walletInfo = ows.getWallet(this.owsWallet);
      const solAccount = walletInfo.accounts.find(
        (a) => a.chainId === "solana" || a.chainId.startsWith("solana:")
      );
      if (!solAccount) {
        throw new Error(
          `No Solana account found in OWS wallet '${this.owsWallet}'`
        );
      }
      this.walletAddress = new PublicKey(solAccount.address);
    } else {
      this.walletAddress = this.keypair.publicKey;
    }
  }

  /** Create client from OWS wallet */
  static fromOWSWallet(proxyUrl, walletName, passphrase, rpcUrl) {
    return new KeymintClient({
      proxyUrl,
      owsWallet: walletName,
      owsPassphrase: passphrase,
      rpcUrl,
    });
  }

  /** Create client from keypair file */
  static fromKeypairFile(proxyUrl, keypairPath, rpcUrl) {
    const resolvedPath = keypairPath.replace(/^~/, process.env.HOME);
    const data = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(data));
    return new KeymintClient({ proxyUrl, keypair, rpcUrl });
  }

  /** Load IDL and prepare Anchor program */
  _ensureProgram() {
    if (this._program) return this._program;

    this._idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
    const dummyWallet = {
      publicKey: this.walletAddress,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    };
    const provider = new anchor.AnchorProvider(this.connection, dummyWallet, {
      commitment: "confirmed",
    });
    this._program = new anchor.Program(this._idl, provider);
    return this._program;
  }

  /**
   * Fetch from proxy. Automatically pays if 402 is returned.
   * @param {string} endpoint - API endpoint (e.g. /v1/address/0x.../portfolio)
   * @returns {Promise<object>} API response
   */
  async fetch(endpoint) {
    const url = `${this.proxyUrl}${endpoint}`;

    const firstResponse = await this._httpGet(url);

    if (firstResponse.status !== 402) {
      return firstResponse.data;
    }

    const paymentInfo = firstResponse.data;
    const txSignature = await this._executePayment(paymentInfo);

    const secondResponse = await this._httpGet(url, {
      "x-402-payment": JSON.stringify({ txSignature }),
    });

    if (secondResponse.status >= 400) {
      throw new Error(
        `API error (${secondResponse.status}): ${JSON.stringify(secondResponse.data)}`
      );
    }

    return secondResponse.data;
  }

  /** Build and send on-chain payment transaction */
  async _executePayment(paymentInfo) {
    const program = this._ensureProgram();
    const instruction = paymentInfo.paymentInstruction;

    const publisherPDA = new PublicKey(instruction.accounts.publisherAccount);
    const publisherTokenAccount = new PublicKey(
      instruction.accounts.publisherTokenAccount
    );
    const usdcMint = new PublicKey(instruction.meta.usdcMint);

    const payerTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      this.walletAddress
    );

    const timestamp = Math.floor(Date.now() / 1000);

    const programId = new PublicKey(instruction.programId);
    const timestampBuffer = Buffer.alloc(8);
    timestampBuffer.writeBigInt64LE(BigInt(timestamp));

    const [auditLogPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("audit"),
        this.walletAddress.toBuffer(),
        timestampBuffer,
      ],
      programId
    );

    const ix = await program.methods
      .verifyAndPay(
        new anchor.BN(instruction.args.amount),
        instruction.args.endpoint,
        new anchor.BN(timestamp)
      )
      .accounts({
        payer: this.walletAddress,
        publisherAccount: publisherPDA,
        payerTokenAccount,
        publisherTokenAccount,
        auditLog: auditLogPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    if (this.owsWallet) {
      return this._signAndSendWithOWS(ix);
    }
    return this._signAndSendWithKeypair(ix);
  }

  /**
   * Sign with OWS wallet and broadcast.
   * Uses signTransaction + manual broadcast (signAndSend has blockhash issues on devnet).
   */
  async _signAndSendWithOWS(instruction) {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("finalized");

    const tx = new Transaction({
      feePayer: this.walletAddress,
      recentBlockhash: blockhash,
    });
    tx.add(instruction);

    const txBuf = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const txHex = txBuf.toString("hex");

    const signResult = ows.signTransaction(
      this.owsWallet,
      "solana",
      txHex,
      this.owsPassphrase
    );

    // Place signature into serialized transaction buffer
    // Legacy transaction: byte[0] = num signatures, bytes[1..65] = first signature
    const sigBuf = Buffer.from(signResult.signature, "hex");
    const signedTx = Buffer.from(txHex, "hex");
    sigBuf.copy(signedTx, 1, 0, 64);

    const txSignature = await this.connection.sendRawTransaction(signedTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log(`[keymint-sdk] OWS payment sent: ${txSignature}`);
    console.log(
      `[keymint-sdk] Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
    );

    await this.connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    return txSignature;
  }

  /** Sign with keypair and send */
  async _signAndSendWithKeypair(instruction) {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const tx = new Transaction({
      feePayer: this.walletAddress,
      recentBlockhash: blockhash,
    });
    tx.add(instruction);
    tx.sign(this.keypair);

    const rawTx = tx.serialize();
    const txSignature = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log(`[keymint-sdk] Keypair payment sent: ${txSignature}`);

    await this.connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    return txSignature;
  }

  /** HTTP GET request */
  async _httpGet(url, extraHeaders = {}) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
    });

    const data = await response.json();
    return { status: response.status, data };
  }
}

/** Create an OWS wallet (convenience function) */
function createOWSWallet(name, passphrase) {
  return ows.createWallet(name, passphrase);
}

/**
 * Create an OWS policy — restricted to Solana chain, optional expiry
 * @param {object} options
 * @param {string} [options.id] - Policy ID
 * @param {string} [options.name] - Policy name
 * @param {string} [options.expiresAt] - ISO 8601 date (optional)
 */
function createOWSPolicy({ id, name, expiresAt } = {}) {
  const policyId = id || `keymint-solana-${Date.now()}`;
  const policyName = name || "keymint-solana-devnet";
  const policy = {
    id: policyId,
    name: policyName,
    version: 1,
    created_at: new Date().toISOString(),
    allowed_chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
    rules: [],
    action: "deny",
  };
  if (expiresAt) {
    policy.expires_at = expiresAt;
  }
  ows.createPolicy(JSON.stringify(policy));
  return policyId;
}

/** List existing OWS wallets */
function listOWSWallets() {
  return ows.listWallets();
}

module.exports = {
  KeymintClient,
  createOWSWallet,
  createOWSPolicy,
  listOWSWallets,
};
