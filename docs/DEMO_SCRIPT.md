# PromptRail — 90-Second Demo Script (Orange Belt)

Target length: **1:30**. One sentence per beat; the timings assume a normal
speaking pace with the app already open at the live URL and the wallet
funded on Testnet.

Before recording: connect once so the wallet is authorized, then disconnect
— the take starts from the disconnected state.

| Time | Beat | What to show | What to say (one sentence) |
| --- | --- | --- | --- |
| 0:00–0:08 | Intro | Landing page, hero + TESTNET badge | "This is PromptRail — machine payments on Stellar, where services register on-chain and software pays for them." |
| 0:08–0:20 | Multi-wallet | Click **Connect Wallet**, hover the modal's three options, pick your wallet, approve | "Connection goes through StellarWalletsKit, so Freighter, Albedo, or xBull all work — I'll connect with Freighter." |
| 0:20–0:32 | Services catalog | Scroll to **On-Chain Services**; point at the three services and their XLM prices | "These services live in a Soroban registry contract — name, price, and payout address, all on-chain." |
| 0:32–0:50 | The cross-contract payment | Click **Pay** on "Translation API", approve in the wallet, let the status strip run signing → pending → confirmed | "Paying calls a second contract, the payment router, which resolves the service from the registry with a real cross-contract call and routes 5 XLM straight to the provider." |
| 0:50–1:02 | Live receipts + events | Point at the new receipt and the new `service_paid` line appearing in Marketplace activity; click its **tx** link, show the explorer, come back | "The receipt and the contract's own event stream update live from Soroban RPC — and every line links to the transaction on the explorer." |
| 1:02–1:14 | Provider flow | Open **+ Offer a service**, type a name and price, submit, approve; show it appear in the list | "Anyone can be a provider — registering a service is one signed transaction, and it's instantly payable." |
| 1:14–1:24 | Production quality | Resize the window to phone width (or switch device toolbar); scroll the mobile layout briefly | "The whole dApp is mobile-responsive, covered by 36 contract tests and 18 frontend tests, and gated by a CI pipeline on every push." |
| 1:24–1:30 | Close | Return to desktop view on the services list | "PromptRail: an on-chain service marketplace where the contracts do the talking — built on Stellar, Testnet today." |

## Recording notes

* Keep the wallet extension window on the same screen so approvals are
  visible but quick — pre-position it.
* If a confirmation takes longer than ~6 seconds, cut the wait in the edit;
  the status strip makes the jump legible.
* The mobile beat can be a pre-recorded 3-second clip spliced in if resizing
  live feels clumsy.
* Have one throwaway service name ready (e.g. "Demo OCR — 1 XLM") so the
  provider beat needs no thinking time.
