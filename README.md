# Keymint

An x402 reverse proxy that monetizes any API with Solana USDC micropayments.

No accounts, no API keys. Just an OWS wallet and HTTP requests.

## Architecture

```
Agent (OWS Wallet)
    │
    │  1. GET /v1/address/0x.../portfolio
    ▼
┌──────────────┐
│  Keymint     │──── 2. 402 Payment Required (price + instruction)
│  Proxy       │
│  (Express)   │◄─── 3. Retry with x-402-payment header (tx signature)
└──────┬───────┘
       │                    ┌────────────────────┐
       │ 4. Verify on-chain │  Anchor Program    │
       │───────────────────►│  (Solana Devnet)   │
       │                    │                    │
       │                    │  • USDC transfer   │
       │                    │  • Audit log PDA   │
       │                    │  • PaymentEvent    │
       │                    └────────────────────┘
       │
       │ 5. Forward
       ▼
┌──────────────┐
│  Upstream    │──── 6. Return data to agent
│  (Zerion)    │
└──────────────┘
```

## Project Structure

```
keymint/
├── proxy/                    # Node.js Express — x402 reverse proxy
│   ├── index.js              # Main server (routes, x402 handler, dashboard API)
│   ├── config.json           # Endpoint pricing configuration
│   ├── src/
│   │   ├── solana.js         # Anchor program interaction, on-chain verify, audit log read
│   │   ├── upstream.js       # Zerion API client
│   │   └── payments.js       # In-memory payment records (enriches on-chain data)
│   └── scripts/
│       └── init-publisher.js # One-time publisher PDA initialization
│
├── program/                  # Anchor — Solana payment verification program
│   ├── programs/program/src/
│   │   └── lib.rs            # Smart contract: verify_and_pay, initialize_publisher
│   ├── target/
│   │   ├── deploy/program.so # Compiled SBF binary
│   │   └── idl/keymint_payment.json  # Anchor IDL
│   └── Anchor.toml
│
├── dashboard/                # React + Tailwind — publisher dashboard
│   ├── src/
│   │   ├── pages/            # Overview, Analytics, LiveFeed, Pricing
│   │   ├── components/       # Card, StatBox, Navbar
│   │   └── hooks/useApi.js   # Polling hook for proxy API
│   └── build/                # Production build
│
├── agent-sdk/                # JavaScript SDK — 2-line integration
│   ├── index.js              # KeymintClient (OWS + Keypair modes)
│   └── cli.js                # CLI: setup, policy, fetch, wallets
│
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template
└── .gitignore
```

## Deployed Program

| Item | Value |
|------|-------|
| **Program ID** | `EJeBowVHBopARqR3qCNXN7a2iJeM2Zf5c6gd2ZH8Lrs9` |
| **Network** | Solana Devnet |
| **USDC Mint** | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| **Publisher PDA** | `27XyS1K4DVmz9oPazyxwkx1UDVZX6eFGChiL4ZmhzAUC` |
| **Anchor Version** | 0.31.1 |
| **Solana CLI** | 2.2.12 |
| **Node.js** | >= 18 |

Explorer: https://explorer.solana.com/address/EJeBowVHBopARqR3qCNXN7a2iJeM2Zf5c6gd2ZH8Lrs9?cluster=devnet

## Endpoint Pricing

| Endpoint | Price (USDC) | Zerion Upstream |
|----------|-------------|-----------------|
| `/v1/address/:address/portfolio` | $0.01 | `/v1/wallets/{addr}/positions/?filter[positions]=only_simple` |
| `/v1/address/:address/positions` | $0.02 | `/v1/wallets/{addr}/positions/` |
| `/v1/tokens/price` | $0.005 | `/v1/chains/` |

Prices are configurable via `proxy/config.json` and the dashboard pricing panel.

## Quick Start (Full Setup)

### Prerequisites

- Node.js >= 18
- Solana CLI >= 2.2 (`agave-install init 2.2.12`)
- Anchor CLI 0.31.1 (`avm use 0.31.1`)
- Rust + Cargo (for program rebuild only)

### 1. Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
ZERION_API_KEY=your_zerion_key        # Get from https://developers.zerion.io
ZERION_BASE_URL=https://api.zerion.io
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
PUBLISHER_WALLET=<your solana address>
PUBLISHER_WALLET_KEYPAIR=/path/to/.config/solana/id.json
PROGRAM_ID=EJeBowVHBopARqR3qCNXN7a2iJeM2Zf5c6gd2ZH8Lrs9
PROXY_PORT=4001
DASHBOARD_PORT=3000
PROXY_API_URL=http://localhost:4001
```

### 2. Solana Devnet Wallet

```bash
solana config set --url devnet
solana-keygen new                # skip if you already have one
solana airdrop 2                 # get devnet SOL
solana balance                   # verify
```

### 3. Initialize Publisher (one-time)

```bash
cd proxy
npm install
node scripts/init-publisher.js
```

This creates the publisher PDA on-chain. You'll see the transaction on Solana Explorer.

### 4. Start Proxy

```bash
cd proxy
npm start
# Listening on http://localhost:4001
```

### 5. Start Dashboard

```bash
cd dashboard
npm install
npm start
# Opens http://localhost:3000
```

### 6. Setup Agent (OWS Wallet)

```bash
cd agent-sdk
npm install

# Create OWS wallet
node cli.js setup

# Fund the OWS wallet with SOL (for tx fees) and USDC (for payments):
solana transfer <OWS_SOLANA_ADDRESS> 0.5 --url devnet
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 5 <OWS_SOLANA_ADDRESS> \
  --url devnet --fund-recipient --allow-unfunded-recipient

# Create Solana-only policy
node cli.js policy
```

### 7. Make a Paid Request

```bash
# Via SDK CLI (OWS wallet signs automatically)
KEYMINT_WALLET=keymint-agent node cli.js fetch /v1/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/portfolio
```

You'll see:
1. OWS wallet address
2. 402 received, payment initiated
3. Transaction hash + Solana Explorer link
4. Zerion API data returned

## OWS (Open Wallet Standard) Integration

### How It Works

1. Agent calls `client.fetch(endpoint)`
2. Proxy returns 402 with payment instruction (program ID, accounts, amount)
3. SDK builds Anchor `verify_and_pay` transaction
4. OWS `signTransaction()` signs with Ed25519 key from vault
5. SDK broadcasts signed transaction to Solana devnet
6. SDK retries original request with `x-402-payment: { txSignature }` header
7. Proxy verifies transaction on-chain, forwards to Zerion

### SDK API

```javascript
const { KeymintClient, createOWSWallet, createOWSPolicy, listOWSWallets } = require('keymint-sdk');

// --- Option A: OWS Wallet (recommended for agents) ---
const client = KeymintClient.fromOWSWallet(
  'http://localhost:4001',   // proxy URL
  'keymint-agent',           // OWS wallet name
  '',                        // passphrase
  'https://api.devnet.solana.com'  // RPC (optional)
);

// --- Option B: Direct Keypair ---
const client = KeymintClient.fromKeypairFile(
  'http://localhost:4001',
  '~/.config/solana/id.json'
);

// Fetch with automatic payment
const result = await client.fetch('/v1/address/0x.../portfolio');
// result.data contains Zerion API response
// result.payment contains { txSignature, amount, payer }
```

### CLI Reference

```bash
node cli.js setup                  # Create OWS wallet (keymint-agent)
node cli.js wallets                # List all OWS wallets
node cli.js policy                 # Create Solana devnet policy
node cli.js fetch <endpoint>       # Make paid API request

# Environment variables:
#   KEYMINT_PROXY_URL   (default: http://localhost:4001)
#   KEYMINT_WALLET      (default: keymint-agent)
#   KEYMINT_PASSPHRASE  (default: empty)
#   SOLANA_RPC_URL      (default: devnet)
```

## x402 Payment Flow (Detailed)

```
Agent                          Proxy                       Solana Devnet
  │                              │                              │
  │  GET /v1/address/.../portfolio                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  402 Payment Required        │                              │
  │  { price, paymentInstruction │                              │
  │    programId, accounts... }  │                              │
  │◄─────────────────────────────│                              │
  │                              │                              │
  │  Build Anchor TX             │                              │
  │  OWS signTransaction()      │                              │
  │  sendRawTransaction()       │                              │
  │──────────────────────────────────────────────────────────►  │
  │                              │     verify_and_pay()         │
  │                              │     USDC transfer            │
  │                              │     AuditLog PDA created     │
  │                              │     PaymentEvent emitted     │
  │  TX confirmed               │                              │
  │◄──────────────────────────────────────────────────────────  │
  │                              │                              │
  │  GET /v1/address/.../portfolio                              │
  │  x-402-payment: { txSig }   │                              │
  │─────────────────────────────►│                              │
  │                              │  getTransaction(txSig)       │
  │                              │─────────────────────────────►│
  │                              │  TX verified                 │
  │                              │◄─────────────────────────────│
  │                              │                              │
  │                              │  Forward to Zerion           │
  │                              │─────────►  Zerion API        │
  │                              │◄─────────  Response          │
  │                              │                              │
  │  200 OK { data, payment }   │                              │
  │◄─────────────────────────────│                              │
```

## Anchor Program

### Instructions

| Instruction | Description | Accounts |
|-------------|-------------|----------|
| `initialize_publisher` | Create publisher PDA (one-time) | authority (signer), publisherAccount (PDA), systemProgram |
| `verify_and_pay(amount, endpoint, timestamp)` | Transfer USDC + write audit log | payer (signer), publisherAccount, payerTokenAccount, publisherTokenAccount, auditLog (PDA), tokenProgram, systemProgram |

### On-Chain Accounts

| Account | Type | Seeds | Description |
|---------|------|-------|-------------|
| PublisherAccount | PDA | `["publisher", authority]` | Aggregate stats: authority, total_earned, total_requests, bump |
| AuditLog | PDA | `["audit", payer, timestamp]` | Per-payment: payer, publisher, amount, endpoint, timestamp, bump |

### Events

| Event | Fields |
|-------|--------|
| `PaymentEvent` | payer, publisher, amount, endpoint, timestamp |

### Errors

| Code | Name | Message |
|------|------|---------|
| 6000 | InvalidAmount | Invalid payment amount |
| 6001 | EndpointTooLong | Endpoint too long (max 128 chars) |
| 6002 | InvalidTokenOwner | Token account owner mismatch |
| 6003 | MintMismatch | Token mint mismatch |
| 6004 | Overflow | Arithmetic overflow |
| 6005 | TimestampOutOfRange | Timestamp out of range (+-30s) |

## Dashboard

### Pages

1. **Overview** — Total earnings (USDC), query count, active callers. All data from on-chain PublisherAccount.
2. **Endpoint Analytics** — Per-endpoint usage bar charts. Data from on-chain AuditLog PDAs.
3. **Live Feed** — Last 20 transactions with payer address, endpoint, amount, timestamp, and clickable Solana Explorer link.
4. **Pricing** — Update endpoint prices in real-time. Writes to `proxy/config.json`.

### Design System

- Background: white (#ffffff)
- Accent colors: `#7DD8FF` (blue), `#FF7D97` (pink), `#FFE57D` (yellow)
- All components: rounded corners + thin black stroke (2px solid black)
- Flat design: no gradients, no shadows
- Typography: clean, minimal

## Dashboard API

| Method | Endpoint | Description | Data Source |
|--------|----------|-------------|-------------|
| GET | `/api/stats` | Summary stats | On-chain PublisherAccount + AuditLog |
| GET | `/api/endpoints` | Per-endpoint stats + prices | On-chain AuditLog + config.json |
| GET | `/api/payments?limit=N` | Recent payments with explorer links | On-chain AuditLog + in-memory tx sigs |
| PUT | `/api/endpoints/price` | Update endpoint price | config.json |
| GET | `/api/config` | Current configuration | .env + config.json |
| GET | `/health` | Health check | — |

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ZERION_API_KEY` | Yes | Zerion API key | `zk_abc123...` |
| `ZERION_BASE_URL` | Yes | Zerion API base URL | `https://api.zerion.io` |
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `SOLANA_NETWORK` | Yes | Network name | `devnet` |
| `USDC_MINT` | Yes | USDC token mint address | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| `PUBLISHER_WALLET` | Yes | Publisher Solana address | `CBDjvUk...` |
| `PUBLISHER_WALLET_KEYPAIR` | Yes | Absolute path to keypair JSON | `/Users/you/.config/solana/id.json` |
| `PROGRAM_ID` | Yes | Deployed Anchor program ID | `EJeBowV...` |
| `PROXY_PORT` | No | Proxy port (default: 4001) | `4001` |
| `DASHBOARD_PORT` | No | Dashboard dev port (default: 3000) | `3000` |
| `PROXY_API_URL` | No | Proxy URL for dashboard | `http://localhost:4001` |

## Zerion API Notes

- **Rate limits**: 1 request/second, 300 requests/day
- **Auth**: Basic auth with API key (key + ":" base64 encoded)
- **Wallet endpoints**: `/v1/wallets/{address}/positions/`
- **Global endpoints**: `/v1/chains/`
- Get a key at: https://developers.zerion.io

## Rebuilding the Anchor Program

The program is already deployed. Only rebuild if you modify `program/programs/program/src/lib.rs`.

**Known issue**: Solana platform-tools ships Cargo 1.84 which can't parse crates using `edition = "2024"`. Workaround:

```bash
cd program

# Use platform-tools Cargo to generate a compatible lockfile
PT="$HOME/.cache/solana/v1.47/platform-tools"
"$PT/rust/bin/cargo" generate-lockfile

# Pin problematic transitive dependencies
cargo update proc-macro-crate@3.5.0 --precise 3.2.0
cargo update unicode-segmentation@1.13.2 --precise 1.12.0

# Build with system cargo + platform-tools rustc
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
RUSTC="$PT/rust/bin/rustc" cargo-build-sbf --no-rustup-override

# Deploy
solana program deploy target/deploy/program.so \
  --program-id target/deploy/program-keypair.json

# Update IDL
anchor idl build -o target/idl/keymint_payment.json
```

## Adding a New Upstream API

1. Add endpoint entry to `proxy/config.json`:
   ```json
   "/v1/your/endpoint": {
     "price": 10000,
     "upstream": "/actual/upstream/path"
   }
   ```

2. If the upstream needs different auth or base URL, extend `proxy/src/upstream.js`.

3. Restart proxy. The new endpoint will automatically:
   - Return 402 with correct pricing
   - Verify payments on-chain
   - Forward to the upstream after payment

## Verified On-Chain Transactions

These transactions were executed during testing with OWS wallet `2XSQ7PDvY2fxceinUVxyeb3esf3SKzMgnuGkSAP2FWVn`:

| TX | Endpoint | Amount |
|----|----------|--------|
| [42JNGjv...](https://explorer.solana.com/tx/42JNGjvgfBR1ZYHf4GAjJMZDDrhyQ1Cja25zVDEtw99SomHvRKK667MYVHCFh2TH3oMEmthjdQ3jsQCLLz5B6vug?cluster=devnet) | portfolio | $0.01 |
| [2wyUyqP...](https://explorer.solana.com/tx/2wyUyqPS1EFG3PfYdd73NmsApZexoxWxRH1GA9L3s9AStmB8L5oawYXs2jrzfp5AcUMsuXmSXJF4TBJLrYLp7fWW?cluster=devnet) | tokens/price | $0.005 |
| [5dLchiC...](https://explorer.solana.com/tx/5dLchiCgoi1TjZCVkaKkS53gSBQccBD5CN5k66WaLr9dtpr3mczkER1dmjCGiUfZDNv4nYeRcfmfZZhFLhTtkzdt?cluster=devnet) | positions | $0.02 |

## Build Artifacts

```
program/target/deploy/program.so              # Compiled SBF binary (261KB)
program/target/deploy/program-keypair.json     # Program keypair (DO NOT LOSE)
program/target/idl/keymint_payment.json        # Anchor IDL (used by proxy + SDK)
dashboard/build/                               # Production React build
```
