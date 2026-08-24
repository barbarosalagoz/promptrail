import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  isConnected,
  requestAccess,
  getNetworkDetails,
  signTransaction,
} from "@stellar/freighter-api";

import {
  Horizon,
  Asset,
  BASE_FEE,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import "./App.css";

const horizonServer = new Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

function App() {
  const [freighterInstalled, setFreighterInstalled] =
    useState<boolean | null>(null);

  const [walletAddress, setWalletAddress] =
    useState<string | null>(null);

  const [connecting, setConnecting] =
    useState(false);

  const [connectionError, setConnectionError] =
    useState<string | null>(null);

  const [network, setNetwork] =
    useState<string | null>(null);

  const [xlmBalance, setXlmBalance] =
    useState<string | null>(null);

  const [balanceLoading, setBalanceLoading] =
    useState(false);

  const [balanceError, setBalanceError] =
    useState<string | null>(null);

  const [destination, setDestination] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [transactionError, setTransactionError] =
    useState<string | null>(null);

  const [transactionHash, setTransactionHash] =
    useState<string | null>(null);

  /*
   * Detect Freighter
   */
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const result = await isConnected();

        if (result.error) {
          console.error(
            "Freighter check error:",
            result.error
          );

          setFreighterInstalled(false);
          return;
        }

        setFreighterInstalled(
          result.isConnected
        );
      } catch (error) {
        console.error(
          "Freighter detection failed:",
          error
        );

        setFreighterInstalled(false);
      }
    };

    checkFreighter();
  }, []);

  /*
   * Read active Freighter network
   */
  const checkNetwork = async () => {
    const networkResult =
      await getNetworkDetails();

    if (networkResult.error) {
      throw new Error(
        "Could not read the Freighter network."
      );
    }

    setNetwork(networkResult.network);

    return networkResult.network;
  };

  /*
   * Fetch XLM balance from Horizon Testnet
   */
  const fetchBalance = async (
    address: string
  ) => {
    try {
      setBalanceLoading(true);
      setBalanceError(null);

      const account =
        await horizonServer.loadAccount(
          address
        );

      const nativeBalance =
        account.balances.find(
          (balance) =>
            balance.asset_type ===
            "native"
        );

      if (!nativeBalance) {
        setXlmBalance("0");
        return;
      }

      setXlmBalance(
        nativeBalance.balance
      );
    } catch (error) {
      console.error(
        "Balance fetch failed:",
        error
      );

      setXlmBalance(null);

      const possibleError = error as {
        response?: {
          status?: number;
        };
      };

      if (
        possibleError.response?.status ===
        404
      ) {
        setBalanceError(
          "This wallet is not funded on Stellar Testnet yet."
        );
      } else {
        setBalanceError(
          "Could not fetch your XLM balance from Stellar Testnet."
        );
      }
    } finally {
      setBalanceLoading(false);
    }
  };

  /*
   * Connect Freighter
   */
  const connectWallet = async () => {
    try {
      setConnecting(true);

      setConnectionError(null);
      setBalanceError(null);

      const connectionResult =
        await isConnected();

      if (
        !connectionResult.isConnected
      ) {
        setFreighterInstalled(false);

        throw new Error(
          "Freighter could not be detected. Please unlock Freighter and refresh the page."
        );
      }

      const accessResult =
        await requestAccess();

      if (accessResult.error) {
        throw new Error(
          accessResult.error.message
        );
      }

      if (!accessResult.address) {
        throw new Error(
          "Freighter did not return a wallet address."
        );
      }

      const address =
        accessResult.address;

      setWalletAddress(address);

      const activeNetwork =
        await checkNetwork();

      if (
        activeNetwork !== "TESTNET"
      ) {
        setXlmBalance(null);

        setConnectionError(
          `PromptRail requires Stellar Testnet. Your Freighter wallet is currently using ${activeNetwork}. Please switch Freighter to Testnet.`
        );

        return;
      }

      await fetchBalance(address);
    } catch (error) {
      console.error(
        "Wallet connection failed:",
        error
      );

      setConnectionError(
        error instanceof Error
          ? error.message
          : "Could not connect to Freighter."
      );
    } finally {
      setConnecting(false);
    }
  };

  /*
   * Disconnect from PromptRail UI
   */
  const disconnectWallet = () => {
    setWalletAddress(null);
    setNetwork(null);
    setXlmBalance(null);

    setConnectionError(null);
    setBalanceError(null);

    setDestination("");
    setAmount("");

    setTransactionHash(null);
    setTransactionError(null);
  };

  /*
   * Recheck network
   */
  const recheckNetwork = async () => {
    try {
      setConnectionError(null);
      setBalanceError(null);

      const activeNetwork =
        await checkNetwork();

      if (
        activeNetwork !== "TESTNET"
      ) {
        setXlmBalance(null);

        setConnectionError(
          `PromptRail requires Stellar Testnet. Your Freighter wallet is currently using ${activeNetwork}. Please switch Freighter to Testnet.`
        );

        return;
      }

      if (walletAddress) {
        await fetchBalance(
          walletAddress
        );
      }
    } catch {
      setConnectionError(
        "Could not check the active Stellar network."
      );
    }
  };

  /*
   * Refresh XLM balance
   */
  const refreshBalance = async () => {
    if (
      !walletAddress ||
      network !== "TESTNET"
    ) {
      return;
    }

    await fetchBalance(
      walletAddress
    );
  };

  /*
   * Send XLM on Stellar Testnet
   */
  const sendXlm = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!walletAddress) {
      return;
    }

    try {
      setSending(true);

      setTransactionError(null);
      setTransactionHash(null);

      /*
       * 1. Verify Testnet
       */
      const activeNetwork =
        await checkNetwork();

      if (
        activeNetwork !== "TESTNET"
      ) {
        throw new Error(
          "Switch Freighter to Stellar Testnet before sending XLM."
        );
      }

      /*
       * 2. Validate recipient
       */
      const cleanDestination =
        destination.trim();

      if (
        !StrKey.isValidEd25519PublicKey(
          cleanDestination
        )
      ) {
        throw new Error(
          "Enter a valid Stellar G... address."
        );
      }

      if (
        cleanDestination ===
        walletAddress
      ) {
        throw new Error(
          "Please use a different Testnet account as the recipient."
        );
      }

      /*
       * 3. Validate amount
       */
      const cleanAmount =
        amount.trim();

      const numericAmount =
        Number(cleanAmount);

      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        throw new Error(
          "Enter an XLM amount greater than 0."
        );
      }

      const decimalPlaces =
        cleanAmount.split(".")[1]
          ?.length ?? 0;

      if (decimalPlaces > 7) {
        throw new Error(
          "XLM supports a maximum of 7 decimal places."
        );
      }

      if (
        xlmBalance &&
        numericAmount >=
          Number(xlmBalance)
      ) {
        throw new Error(
          "The payment amount is too high for this wallet balance."
        );
      }

      /*
       * 4. Recipient must already exist
       * on Testnet for a normal payment.
       */
      try {
        await horizonServer.loadAccount(
          cleanDestination
        );
      } catch {
        throw new Error(
          "Recipient account is not funded on Stellar Testnet. Fund the recipient first."
        );
      }

      /*
       * 5. Load source account
       */
      const sourceAccount =
        await horizonServer.loadAccount(
          walletAddress
        );

      /*
       * 6. Build payment transaction
       */
      const transaction =
        new TransactionBuilder(
          sourceAccount,
          {
            fee: BASE_FEE,
            networkPassphrase:
              Networks.TESTNET,
          }
        )
          .addOperation(
            Operation.payment({
              destination:
                cleanDestination,

              asset:
                Asset.native(),

              amount:
                numericAmount.toFixed(
                  Math.max(
                    1,
                    decimalPlaces
                  )
                ),
            })
          )
          .addMemo(
            Memo.text(
              "PromptRail White Belt"
            )
          )
          .setTimeout(30)
          .build();

      /*
       * 7. Convert transaction to Base64 XDR
       *
       * IMPORTANT:
       * Current installed SDK uses toXdr(),
       * not toXDR().
       */
      const unsignedXdr =
        transaction.toEnvelope().toXdr("base64");

      /*
       * 8. Ask Freighter to sign
       */
      const signResult =
        await signTransaction(
          unsignedXdr,
          {
            networkPassphrase:
              Networks.TESTNET,

            address:
              walletAddress,
          }
        );

      if (signResult.error) {
        throw new Error(
          signResult.error.message
        );
      }

      if (
        !signResult.signedTxXdr
      ) {
        throw new Error(
          "Freighter did not return a signed transaction."
        );
      }

      /*
       * 9. Convert signed XDR back
       * into a Stellar transaction
       *
       * IMPORTANT:
       * Current installed SDK uses fromXdr(),
       * not fromXDR().
       */
      const signedTransaction =
        TransactionBuilder.fromXdr(
          signResult.signedTxXdr,
          Networks.TESTNET
        );

      /*
       * 10. Submit to Stellar Testnet
       */
      const result =
        await horizonServer.submitTransaction(
          signedTransaction
        );

      /*
       * 11. Success
       */
      setTransactionHash(
        result.hash
      );

      setAmount("");

      await fetchBalance(
        walletAddress
      );
    } catch (error) {
      console.error(
        "Transaction failed:",
        error
      );

      const horizonError =
        error as {
          response?: {
            data?: {
              extras?: {
                result_codes?: {
                  transaction?: string;
                  operations?: string[];
                };
              };
            };
          };
        };

      const resultCodes =
        horizonError.response
          ?.data?.extras
          ?.result_codes;

      if (resultCodes) {
        const operationCode =
          resultCodes.operations?.join(
            ", "
          );

        setTransactionError(
          operationCode
            ? `Stellar rejected the transaction: ${operationCode}`
            : `Stellar rejected the transaction: ${
                resultCodes.transaction ??
                "unknown error"
              }`
        );

        return;
      }

      setTransactionError(
        error instanceof Error
          ? error.message
          : "The transaction could not be completed."
      );
    } finally {
      setSending(false);
    }
  };

  const isTestnet =
    network === "TESTNET";

  return (
    <main className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-mark">
            P
          </div>

          <div>
            <h1>PromptRail</h1>

            <span>
              Machine Payments on Stellar
            </span>
          </div>
        </div>

        <div
          className={`network-badge ${
            network && !isTestnet
              ? "network-badge-wrong"
              : ""
          }`}
        >
          <span
            className={`network-dot ${
              network && !isTestnet
                ? "network-dot-wrong"
                : ""
            }`}
          />

          {network ?? "TESTNET"}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          STELLAR WHITE BELT
        </div>

        <h2>
          The payment rail
          <br />
          for the agentic web.
        </h2>

        <p>
          Connect your Stellar wallet
          and make your first
          machine-to-machine payment
          on Testnet.
        </p>
      </section>

      <section className="wallet-card">
        <div className="card-icon">
          ✦
        </div>

        {walletAddress ? (
          <>
            <h3>
              Wallet connected
            </h3>

            <p>
              Your Freighter wallet
              is connected to
              PromptRail.
            </p>

            <div className="connected-status">
              <span className="connected-dot" />
              Connected
            </div>

            <div className="wallet-address">
              <span className="wallet-address-label">
                Stellar Address
              </span>

              <strong>
                {walletAddress.slice(
                  0,
                  10
                )}
                ...
                {walletAddress.slice(
                  -10
                )}
              </strong>
            </div>

            {isTestnet && (
              <div className="balance-panel">
                <span className="balance-label">
                  XLM BALANCE
                </span>

                {balanceLoading ? (
                  <strong className="balance-value">
                    Loading...
                  </strong>
                ) : xlmBalance ? (
                  <>
                    <strong className="balance-value">
                      {Number(
                        xlmBalance
                      ).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits:
                            2,
                          maximumFractionDigits:
                            7,
                        }
                      )}{" "}
                      XLM
                    </strong>

                    <span className="balance-caption">
                      Stellar Testnet
                      balance
                    </span>
                  </>
                ) : (
                  <strong className="balance-value">
                    — XLM
                  </strong>
                )}

                <button
                  className="balance-refresh"
                  onClick={
                    refreshBalance
                  }
                  disabled={
                    balanceLoading
                  }
                >
                  {balanceLoading
                    ? "Refreshing..."
                    : "Refresh Balance"}
                </button>
              </div>
            )}

            {balanceError && (
              <div className="balance-error">
                <strong>
                  Wallet not funded
                </strong>

                <span>
                  {balanceError}
                </span>
              </div>
            )}

            {network && (
              <div
                className={`network-panel ${
                  isTestnet
                    ? "network-panel-good"
                    : "network-panel-wrong"
                }`}
              >
                <span className="network-panel-label">
                  ACTIVE NETWORK
                </span>

                <strong>
                  {isTestnet
                    ? "✓ Stellar Testnet"
                    : `⚠ ${network}`}
                </strong>

                <span>
                  {isTestnet
                    ? "Ready for test transactions."
                    : "Switch Freighter to Testnet before continuing."}
                </span>
              </div>
            )}

            {isTestnet &&
              xlmBalance && (
                <form
                  className="payment-form"
                  onSubmit={sendXlm}
                >
                  <div className="payment-heading">
                    <span className="payment-eyebrow">
                      MACHINE PAYMENT
                    </span>

                    <h4>
                      Send Testnet XLM
                    </h4>

                    <p>
                      Create, sign and
                      submit a real
                      Stellar payment.
                    </p>
                  </div>

                  <label>
                    Recipient

                    <input
                      type="text"
                      value={
                        destination
                      }
                      onChange={(
                        event
                      ) =>
                        setDestination(
                          event.target
                            .value
                        )
                      }
                      placeholder="G..."
                      autoComplete="off"
                      disabled={
                        sending
                      }
                    />
                  </label>

                  <label>
                    Amount

                    <div className="amount-input">
                      <input
                        type="number"
                        min="0.0000001"
                        step="0.0000001"
                        value={
                          amount
                        }
                        onChange={(
                          event
                        ) =>
                          setAmount(
                            event.target
                              .value
                          )
                        }
                        placeholder="1.00"
                        disabled={
                          sending
                        }
                      />

                      <span>
                        XLM
                      </span>
                    </div>
                  </label>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      sending ||
                      !destination ||
                      !amount
                    }
                  >
                    {sending
                      ? "Waiting for Freighter..."
                      : "Send XLM"}
                  </button>
                </form>
              )}

            {transactionError && (
              <div className="transaction-result transaction-failure">
                <span className="result-icon">
                  ✕
                </span>

                <div>
                  <strong>
                    Transaction failed
                  </strong>

                  <p>
                    {
                      transactionError
                    }
                  </p>
                </div>
              </div>
            )}

            {transactionHash && (
              <div className="transaction-result transaction-success">
                <span className="result-icon">
                  ✓
                </span>

                <div>
                  <strong>
                    Payment successful
                  </strong>

                  <p>
                    Your XLM payment
                    was confirmed on
                    Stellar Testnet.
                  </p>

                  <span className="hash-label">
                    TRANSACTION HASH
                  </span>

                  <code>
                    {transactionHash.slice(
                      0,
                      12
                    )}
                    ...
                    {transactionHash.slice(
                      -12
                    )}
                  </code>

                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                </div>
              </div>
            )}

            <button
              className="secondary-button"
              onClick={
                recheckNetwork
              }
            >
              Recheck Network
            </button>

            <button
              className="disconnect-button"
              onClick={
                disconnectWallet
              }
            >
              Disconnect Wallet
            </button>
          </>
        ) : (
          <>
            <h3>
              Connect your wallet
            </h3>

            <p>
              Connect Freighter to
              access your Stellar
              Testnet account.
            </p>

            {freighterInstalled ===
            null ? (
              <button
                className="primary-button"
                disabled
              >
                Checking
                Freighter...
              </button>
            ) : freighterInstalled ? (
              <button
                className="primary-button"
                onClick={
                  connectWallet
                }
                disabled={
                  connecting
                }
              >
                {connecting
                  ? "Connecting..."
                  : "Connect Freighter"}
              </button>
            ) : (
              <>
                <a
                  className="primary-button install-link"
                  href="https://www.freighter.app/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Install
                  Freighter
                </a>

                <button
                  className="secondary-button"
                  onClick={() =>
                    window.location.reload()
                  }
                >
                  I've installed it
                  — Refresh
                </button>
              </>
            )}
          </>
        )}

        {connectionError && (
          <div className="connection-error">
            {connectionError}
          </div>
        )}

        <span className="card-note">
          Your private keys never
          leave your wallet.
        </span>
      </section>

      <footer>
        Built on Stellar ·
        PromptRail Launchpad
      </footer>
    </main>
  );
}

export default App;