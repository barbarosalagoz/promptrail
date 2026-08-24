# PromptRail

**Smart contract rails for machine payments on Stellar.**

PromptRail is a Stellar Testnet dApp built for the Rise In Stellar Journey to Mastery Yellow Belt challenge.

The Yellow Belt version extends the original wallet/payment prototype with:

- Multi-wallet Stellar connectivity
- A deployed Soroban Registry smart contract
- Wallet-authorized contract writes
- Typed generated contract bindings
- Transaction lifecycle feedback
- Contract-filtered live event activity
- Testnet XLM payments

> Network: **Stellar Testnet**

---

## Live Demo

Deployment URL will be added after the Yellow Belt production deployment.

---

## Yellow Belt Features

### Multi-wallet support

PromptRail uses Stellar Wallets Kit with an explicit wallet allowlist:

- Freighter
- Albedo
- xBull

The application does not use the full `defaultModules()` wallet set.

Supported wallet failures include:

- Wallet unavailable
- User rejected request
- Wrong Stellar network
- Wallet disconnected
- Signing failure
- Insufficient XLM balance

---

## Soroban Registry

PromptRail Registry stores API endpoint metadata directly on Stellar Testnet.

Each registered endpoint contains:

```text
owner
name
price
active
```

The current Yellow Belt contract supports:

```text
register
get
update_price
set_active
```

### Contract Address

```text
CD5OS7U3PO3TFSRKZXV4ZH3AQFKWZSGAPE6ENGBBXCQRLTGDCZF5XB26
```

Network:

```text
Stellar Testnet
```

Deployer public key:

```text
GD4ZZVS4TTHJG5MVVQ75KWKEDGKONSAR4HHZH6YIMYWQPEZXH6EQWG3A
```

No deployer private key or seed is stored in this repository.

---

## Verified Contract Transaction

Initial verified Registry registration transaction:

```text
b7d372e76ac6b83662f68072d21fe3cd202406c9efe6126ef423a16d6cc867b9
```

Ledger:

```text
4316493
```

Registered entry:

```text
Name:  PromptRail Demo API
Price: 200000 stroops
       = 0.02 XLM
```

Explorer:

https://stellar.expert/explorer/testnet/tx/b7d372e76ac6b83662f68072d21fe3cd202406c9efe6126ef423a16d6cc867b9

---

## Wallet-signed Registry Writes

Registry writes are initiated by the frontend and signed by the connected Stellar wallet.

The UI exposes the full transaction state:

```text
PREPARING
    ↓
AWAITING_SIGNATURE
    ↓
PENDING
    ↓
SUCCESS / FAILED
```

PromptRail does not display a successful contract write until the Soroban transaction has finalized.

Before signing, the application validates:

- Connected account
- Stellar Testnet network
- Owner address
- API name
- UTF-8 name length
- Price bounds
- Simulated contract result
- Required non-invoker authorization

The contract itself independently enforces owner authorization with `require_auth()`.

---

## Live Registry Activity

PromptRail includes a live contract event feed.

The frontend polls Stellar RPC approximately every 3 seconds and filters events to the deployed PromptRail Registry contract.

Supported Registry activity:

```text
EndpointRegistered
PriceUpdated
StatusChanged
```

The feed:

- Filters by exact contract ID
- Decodes Soroban event values
- Deduplicates events by event ID
- Tracks the RPC cursor
- Prevents overlapping polling requests
- Displays the owner
- Displays the ledger
- Links to the originating transaction

This provides near-real-time synchronization between on-chain Registry activity and the frontend.

---

## Machine Payments

The application also retains the original PromptRail XLM payment functionality.

Payments are:

1. Built locally
2. Signed by the connected wallet
3. Submitted to Stellar Testnet
4. Confirmed through Horizon
5. Linked to Stellar Expert

PromptRail never handles the user's private key.

---

## Architecture

```text
                    ┌─────────────────────┐
                    │      React UI       │
                    │       + Vite        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│ Stellar Wallets Kit     │        │ Generated TS Bindings   │
│                         │        │                         │
│ Freighter               │        │ PromptRail Registry     │
│ Albedo                  │        └────────────┬────────────┘
│ xBull                   │                     │
└────────────┬────────────┘                     ▼
             │                      ┌─────────────────────────┐
             │                      │ Stellar Soroban RPC     │
             │                      │        Testnet          │
             │                      └────────────┬────────────┘
             │                                   │
             │                                   ▼
             │                      ┌─────────────────────────┐
             │                      │ PromptRail Registry     │
             │                      │ Soroban Contract        │
             │                      └─────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│ Stellar Horizon         │
│ Testnet XLM Payments    │
└─────────────────────────┘
```

---

## Smart Contract Security

The Registry contract includes:

- `owner.require_auth()` on state-changing methods
- Maximum API name length
- Positive price requirement
- Maximum price bound
- Duplicate registration protection
- Typed contract errors
- Contract events
- Read-only `get()` behavior
- Owner-controlled price updates
- Owner-controlled active status

Current test suite:

```text
15 passed
0 failed
```

Test coverage includes:

- Successful registration
- Missing authorization
- Authorization tree
- Duplicate registration
- Empty name
- Oversized name
- Zero price
- Negative price
- Excessive price
- Missing endpoint
- Price update
- Invalid price update
- Endpoint disable
- Registry reads
- Event emission

See [SECURITY.md](./SECURITY.md) for the full security review.

---

## Contract Build

Latest verified optimized WASM build:

```text
WASM size:
5192 bytes

WASM hash:
650c9e433562d411bbaa471c616684c230ac7ff65e402354f2e402f748889270
```

Exported functions:

```text
get
register
set_active
update_price
```

---

## Tech Stack

Frontend:

```text
React
TypeScript
Vite
@stellar/stellar-sdk
@creit.tech/stellar-wallets-kit
```

Blockchain:

```text
Stellar Testnet
Soroban
Rust
Stellar CLI
```

Contract client:

```text
Generated TypeScript Soroban bindings
```

---

## Development

Clone the repository:

```bash
git clone https://github.com/barbarosalagoz/promptrail.git
cd promptrail
```

Checkout Yellow Belt:

```bash
git checkout yellow-belt
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Build production frontend:

```bash
npm run build
```

---

## Soroban Development

Enter the Soroban workspace:

```bash
cd soroban
```

Run tests:

```bash
cargo test
```

Run formatting verification:

```bash
cargo fmt --check
```

Run Clippy:

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

Build the optimized contract:

```bash
stellar contract build
```

Run Rust dependency audit:

```bash
cargo audit
```

---

## Generated Contract Bindings

The TypeScript client is generated directly from the deployed Testnet contract:

```powershell
stellar contract bindings typescript `
  --network testnet `
  --contract-id CD5OS7U3PO3TFSRKZXV4ZH3AQFKWZSGAPE6ENGBBXCQRLTGDCZF5XB26 `
  --output-dir .\packages\promptrail_registry `
  --overwrite
```

This avoids manually duplicating the Soroban contract interface in frontend code.

---

## Screenshots

### Multi-wallet Selection

Expected file:

```text
docs/screenshots/wallet-options.png
```

### Wallet-signed Registry Write

Expected file:

```text
docs/screenshots/registry-write-success.png
```

### Live Registry Events

Expected file:

```text
docs/screenshots/live-registry-events.png
```

---

## Yellow Belt Checklist

- [x] Stellar wallet connection
- [x] Three wallet options
- [x] Wallet failure handling
- [x] Stellar Testnet enforcement
- [x] Soroban smart contract
- [x] Contract deployed to Testnet
- [x] Frontend contract read
- [x] Frontend wallet-signed contract write
- [x] Transaction lifecycle UI
- [x] Successful transaction verification
- [x] Contract events
- [x] Live frontend event synchronization
- [x] Contract security tests
- [x] Frontend dependency security review
- [x] Rust dependency security review
- [ ] Production Yellow Belt deployment
- [ ] Final screenshots committed

---

## Security

PromptRail is a Testnet demonstration project.

Do not send real funds to Testnet addresses shown in this repository.

Private keys, wallet seeds and signing secrets must never be committed.

See [SECURITY.md](./SECURITY.md).

---

## Repository

https://github.com/barbarosalagoz/promptrail

Yellow Belt development branch:

```text
yellow-belt
```

---

## License

Built as part of the Stellar Journey to Mastery builder challenge.
