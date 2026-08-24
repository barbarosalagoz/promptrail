# PromptRail Security

Last reviewed: 2026-08-25

This document records the security controls, dependency findings and known limitations reviewed during development of PromptRail Yellow Belt.

PromptRail currently runs on **Stellar Testnet**.

---

## Security Status

Current status:

```text
PASS WITH DOCUMENTED UPSTREAM WARNINGS
```

The application passed its local lint, build, smart-contract test and static-analysis gates.

Known dependency findings are documented below rather than hidden or automatically force-upgraded.

---

## Key Management

PromptRail never requests or stores Stellar private keys.

Wallet signing is delegated to supported Stellar wallets.

Supported application wallet modules:

```text
Freighter
Albedo
xBull
```

The deployment identity was created using Stellar CLI secure identity storage.

Only its public address is documented:

```text
GD4ZZVS4TTHJG5MVVQ75KWKEDGKONSAR4HHZH6YIMYWQPEZXH6EQWG3A
```

No private seed is committed to this repository.

The application does not store wallet signing secrets in:

```text
source code
localStorage
environment files
the Git repository
```

---

## Network Enforcement

PromptRail Yellow Belt is intentionally restricted to:

```text
Stellar Testnet
```

Before signing transactions, the frontend verifies:

- The wallet is connected
- The active account matches the expected account
- The active network passphrase is Stellar Testnet

Transactions are rejected when these conditions are not met.

---

## Smart Contract Authorization

State-changing contract methods require authorization from the endpoint owner.

The contract uses:

```rust
owner.require_auth();
```

for Registry writes.

The transaction source account therefore provides the required authorization when the connected wallet signs the transaction.

---

## Smart Contract Validation

The Registry contract validates:

- Empty names
- Maximum API name size
- Zero prices
- Negative prices
- Maximum allowed price
- Duplicate endpoint registration
- Missing endpoints

Contract failures use typed errors rather than relying only on generic panics.

---

## Read-only Contract Calls

The `get()` method performs no state mutation.

Read-only frontend Registry reads therefore remain simulation-only operations.

---

## Contract Events

PromptRail publishes typed Registry activity for:

```text
EndpointRegistered
PriceUpdated
StatusChanged
```

The frontend event service filters by the exact deployed contract ID:

```text
CD5OS7U3PO3TFSRKZXV4ZH3AQFKWZSGAPE6ENGBBXCQRLTGDCZF5XB26
```

The event feed also:

- Uses event IDs for deduplication
- Tracks an RPC cursor
- Prevents overlapping polling requests
- Ignores unsupported event types
- Validates decoded event structures before exposing them to the UI

---

## Contract Tests

Final local test result:

```text
15 passed
0 failed
```

The test suite covers:

- Successful registration
- Required owner authorization
- Missing authorization
- Duplicate registration
- Empty names
- Oversized names
- Zero prices
- Negative prices
- Prices above the maximum
- Missing Registry entries
- Registry reads
- Owner price updates
- Invalid price updates
- Endpoint deactivation
- Event emission

---

## Rust Static Analysis

The following checks completed successfully:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
stellar contract build
```

The latest optimized contract build produced:

```text
WASM size:
5192 bytes

WASM hash:
650c9e433562d411bbaa471c616684c230ac7ff65e402354f2e402f748889270
```

---

## Cargo Audit

`cargo audit` reported no known vulnerability.

One maintenance warning remains:

```text
Crate: paste
Version: 1.0.15
Advisory: RUSTSEC-2024-0436
Classification: unmaintained
```

This dependency is transitive through the current Soroban dependency graph.

The warning is monitored rather than replaced locally because PromptRail does not directly depend on `paste`.

---

## Scout Soroban Audit

Scout was evaluated during development.

The installed Scout tooling currently attempts to compile analysis targets using:

```text
wasm32-unknown-unknown
```

while the active Soroban SDK / Stellar toolchain requires:

```text
wasm32v1-none
```

This caused an analysis-toolchain incompatibility.

A partial Scout run displaying zero findings is therefore **not classified as a successful Scout audit**.

PromptRail does not claim Scout verification until this tooling incompatibility is resolved upstream or with a supported toolchain combination.

---

## Frontend Dependency Audit

Final npm audit summary:

```text
Critical: 0
High:     0
Moderate: 5
Low:      13
Total:    18
```

The remaining findings originate from transitive dependencies installed through Stellar Wallets Kit.

Observed dependency paths include optional wallet ecosystems such as:

```text
Trezor
HOT Wallet
NEAR
Solana
```

Relevant advisories include transitive versions of:

```text
elliptic
uuid
```

PromptRail does not execute:

```bash
npm audit fix --force
```

because npm proposes replacing the current Stellar Wallets Kit with an older breaking release.

A forced dependency downgrade is not considered a safe remediation.

---

## Wallet Module Minimization

PromptRail does not use Wallets Kit `defaultModules()`.

The application explicitly enables only:

```text
Freighter
Albedo
xBull
```

This reduces the wallet integration surface used by the application.

---

## Production Bundle Review

The minified production JavaScript bundle was searched for:

```text
trezor
hot-wallet
near-api-js
solana
protobufjs
elliptic
```

The optional wallet package names were not found in the normal production bundle.

A separate source-map build was then inspected.

No source paths were detected for:

```text
Trezor
HOT Wallet
NEAR
Solana
protobufjs
node_modules/elliptic
```

The string `elliptic` appeared only inside `@noble/ed25519` source content:

```text
../../node_modules/@noble/ed25519/index.js
../../packages/promptrail_registry/node_modules/@noble/ed25519/index.js
```

This is separate from the vulnerable npm `elliptic` package reported by `npm audit`.

After the source-map inspection, PromptRail was rebuilt normally so production source maps are not intentionally included in the final deployment.

---

## Frontend Quality Gates

The final frontend checks completed successfully:

```bash
npm run lint
npm run build
```

Vite emits a bundle-size warning for a JavaScript chunk larger than 500 kB.

This is treated as a performance optimization item rather than a security failure.

Future versions can introduce additional code splitting.

---

## Contract Transaction Confirmation

Soroban Registry writes use the generated Stellar contract client.

Before wallet signing, PromptRail:

- Builds the contract invocation
- Simulates the invocation
- Validates the simulated result
- Checks for unexpected non-invoker authorization requirements

The connected wallet then signs the transaction.

After submission, PromptRail waits for transaction finalization before showing the Registry operation as successful.

---

## XLM Payments

Classic XLM payments are:

- Constructed locally
- Restricted to Testnet
- Signed by the connected wallet
- Submitted through Stellar Horizon

The frontend validates:

- Recipient address
- Recipient Testnet account existence
- Positive amount
- Decimal precision
- Available balance
- Active wallet address
- Active network

Stellar network errors are surfaced to the user instead of being silently treated as successful transactions.

---

## Known Limitations

PromptRail Yellow Belt is a Testnet builder-challenge application.

Current limitations include:

1. One Registry entry per wallet owner.
2. Event synchronization uses RPC polling rather than a persistent push transport.
3. Several low/moderate unused transitive Wallets Kit dependencies remain installed.
4. Scout audit completion is blocked by the currently tested WASM target mismatch.
5. Bundle size can be further optimized with code splitting.

None of these limitations should be interpreted as production financial-security certification.

---

## Reporting Security Issues

Do not include private keys, wallet seeds or sensitive account information in a public GitHub issue.

For repository-level problems, open an issue containing only the minimum information required to reproduce the problem.

---

## Security Principles

PromptRail Yellow Belt follows these principles:

```text
Never custody wallet keys
Testnet-only transaction enforcement
Explicit authorization
Validate before signing
Confirm before reporting success
Minimize enabled wallet integrations
Filter event sources by contract
Do not force dependency downgrades
Document unresolved upstream warnings
```
