# PromptRail

**Machine Payments on Stellar**

PromptRail Launchpad is a Stellar Testnet dApp built for the **Stellar Journey to Mastery — White Belt Challenge**.

It demonstrates the fundamental building blocks of a Stellar application:

* Connecting a Freighter wallet
* Detecting and validating the active Stellar network
* Fetching an account's XLM balance
* Building a Stellar payment transaction
* Signing the transaction securely with Freighter
* Submitting the signed transaction to Stellar Testnet
* Displaying transaction success, failure, and transaction hash information

PromptRail is designed as the first technical foundation for a broader vision: enabling programmable and machine-to-machine payments for APIs and AI agents using Stellar.

---

## Live Demo

Deployment link will be added after production deployment.

---

## White Belt Requirements

| Requirement                        | Status |
| ---------------------------------- | ------ |
| Freighter wallet setup             | ✅      |
| Stellar Testnet support            | ✅      |
| Wallet connect                     | ✅      |
| Wallet disconnect                  | ✅      |
| Fetch XLM balance                  | ✅      |
| Display XLM balance                | ✅      |
| Send XLM on Testnet                | ✅      |
| Transaction signing with Freighter | ✅      |
| Success feedback                   | ✅      |
| Failure feedback                   | ✅      |
| Transaction hash display           | ✅      |
| Stellar explorer link              | ✅      |
| Error handling                     | ✅      |
| Public GitHub repository           | ✅      |
| 10+ meaningful commits             | ✅      |
| Public deployment                  | ⏳      |

---

## Screenshots

### Wallet Connected

The application detects Freighter, requests wallet access, and displays the connected Stellar public address.

![Wallet Connected](docs/screenshots/wallet-connected.png)

---

### XLM Balance

PromptRail fetches the connected wallet's native XLM balance directly from Stellar Testnet through Horizon.

![XLM Balance](docs/screenshots/balance-testnet.png)

---

### Successful Testnet Transaction

A real XLM payment is created, signed through Freighter, submitted to Stellar Testnet, and confirmed by Horizon.

The interface displays the transaction hash and provides a direct link to the transaction on Stellar Expert.

![Successful Testnet Transaction](docs/screenshots/payment-success.png)

---

### Transaction Error Handling

PromptRail validates transaction inputs and provides clear failure feedback when a payment cannot be completed.

![Transaction Error](docs/screenshots/payment-error.png)

---

## How It Works

```text
User
  │
  ▼
PromptRail
  │
  ├── Connect Freighter
  │
  ▼
Freighter Wallet
  │
  ├── Public Stellar Address
  │
  ▼
Stellar Horizon Testnet
  │
  ├── Account Data
  └── XLM Balance

Payment Flow
  │
  ▼
Recipient + Amount
  │
  ▼
TransactionBuilder
  │
  ▼
XLM Payment Operation
  │
  ▼
Freighter Signature
  │
  ▼
Signed XDR
  │
  ▼
Stellar Horizon Testnet
  │
  ▼
Transaction Confirmed
  │
  ▼
Transaction Hash + Updated Balance
```

---

## Features

### Freighter Wallet Integration

PromptRail detects whether the Freighter wallet is available and requests access to the user's Stellar public address.

Private keys are never exposed to PromptRail.

---

### Network Validation

The application reads the currently active Freighter network.

Transactions are only allowed when the wallet is connected to:

```text
Stellar Testnet
```

If Freighter is connected to the public Stellar network instead, PromptRail displays a warning and prevents Testnet transaction activity.

---

### XLM Balance

PromptRail loads the connected Stellar account through Horizon and displays its native XLM balance.

The balance can also be manually refreshed from the interface.

---

### XLM Payments

Users can enter:

* A Stellar recipient address
* An XLM amount

PromptRail then:

1. Validates the destination address
2. Validates the amount
3. Confirms that the recipient exists on Stellar Testnet
4. Loads the sender's account
5. Builds an XLM payment transaction
6. Converts the transaction to XDR
7. Requests a signature from Freighter
8. Submits the signed transaction to Horizon
9. Displays the transaction result
10. Refreshes the wallet balance

---

### Transaction Feedback

Successful transactions display:

* Success confirmation
* Transaction hash
* Stellar Explorer link
* Updated XLM balance

Failed transactions display a clear error state to the user.

Examples include:

* Invalid Stellar addresses
* Recipient accounts that are not funded
* Incorrect network selection
* Invalid XLM amounts
* Rejected transactions

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* CSS

### Stellar

* Stellar JavaScript SDK
* Freighter API
* Stellar Horizon
* Stellar Testnet

### Development

* ESLint
* Git
* GitHub

---

## Installation

### Prerequisites

Make sure the following are installed:

* Node.js
* npm
* Git
* Freighter Wallet browser extension

Freighter must be configured to use **Stellar Testnet**.

---

### Clone the Repository

```bash
git clone <YOUR-GITHUB-REPOSITORY-URL>
cd promptrail
```

---

### Install Dependencies

```bash
npm install
```

---

### Start the Development Server

```bash
npm run dev
```

Vite will provide a local development URL, typically:

```text
http://localhost:5173
```

Open it in a browser where the Freighter extension is installed.

---

## Using PromptRail

### 1. Connect Freighter

Click:

```text
Connect Freighter
```

Approve the connection request inside Freighter.

---

### 2. Switch to Testnet

PromptRail verifies the active Stellar network.

The application should display:

```text
✓ Stellar Testnet
Ready for test transactions.
```

---

### 3. Fund Your Testnet Wallet

A Stellar Testnet account must be funded before it exists on the Testnet ledger.

Use Stellar's Testnet funding tools to obtain test XLM.

Testnet XLM has no monetary value.

---

### 4. Check Your Balance

After the Testnet account is funded, PromptRail retrieves and displays the current XLM balance.

---

### 5. Send XLM

Enter:

```text
Recipient: G...
Amount: 1
```

Click:

```text
Send XLM
```

Freighter will open a transaction approval request.

Review the transaction and approve the signature.

---

### 6. Transaction Confirmation

After Horizon accepts the transaction, PromptRail displays:

```text
✓ Payment successful

Transaction Hash
xxxxxxxxxxxx...xxxxxxxxxxxx

View transaction ↗
```

The wallet balance is refreshed automatically after confirmation.

---

## Security

PromptRail never requests, stores, or handles a user's private key.

Transaction signing occurs inside Freighter.

The application only receives:

* The public Stellar address
* Wallet network information
* Signed transaction XDR after user approval

This project currently operates exclusively on **Stellar Testnet**.

---

## Project Structure

```text
promptrail/
│
├── docs/
│   └── screenshots/
│       ├── wallet-connected.png
│       ├── balance-testnet.png
│       ├── payment-success.png
│       └── payment-error.png
│
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
│
├── public/
│
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Development Progress

PromptRail was developed incrementally with meaningful Git commits covering:

1. Project initialization
2. Base dashboard interface
3. Freighter wallet integration
4. Stellar Testnet network validation
5. XLM balance handling
6. Signed XLM Testnet payments
7. Transaction screenshots and testing
8. Project documentation
9. Deployment preparation
10. Submission preparation

---

## White Belt Learning Outcomes

This project demonstrates practical understanding of:

* Stellar account architecture
* Stellar public addresses
* Testnet development
* Horizon account queries
* XLM balances
* Stellar transactions
* Payment operations
* XDR serialization
* Wallet-based transaction signing
* Transaction submission
* Transaction hashes
* Blockchain explorer verification
* User-facing Web3 error handling

---

## Future Vision

PromptRail Launchpad is the first stage of a broader machine-payment infrastructure project.

Future versions may introduce:

* Soroban smart contracts
* Paid API endpoints
* Stablecoin payments
* Usage-based API billing
* AI agent payments
* Machine-to-machine payment flows
* Developer SDKs
* Payment analytics
* Mainnet support

The long-term idea is simple:

> Make digital services directly purchasable by software.

---

## Challenge

Built for:

**Stellar Journey to Mastery — White Belt**

Network:

**Stellar Testnet**

---

## License

MIT
