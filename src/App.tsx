import { useState } from "react";
import type { FormEvent } from "react";

import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
  connectWallet as connectStellarWallet,
  disconnectWallet as disconnectStellarWallet,
  getConnectedWallet,
  PromptRailWalletError,
  signTransaction as signWalletTransaction,
  SUPPORTED_WALLETS,
} from "./services/wallet";

import "./App.css";

const horizonServer = new Horizon.Server(
  "https://horizon-testnet.stellar.org",
);

const STROOPS_PER_XLM = 10_000_000n;

function xlmToStroops(value: string): bigint | null {
  const cleanValue = value.trim();

  if (!/^\d+(?:\.\d{1,7})?$/.test(cleanValue)) {
    return null;
  }

  const [wholePart, fractionPart = ""] =
    cleanValue.split(".");

  try {
    const whole = BigInt(wholePart);

    const fraction = BigInt(
      fractionPart.padEnd(7, "0"),
    );

    return (
      whole * STROOPS_PER_XLM +
      fraction
    );
  } catch {
    return null;
  }
}

function getWalletErrorMessage(
  error: unknown,
): string {
  if (error instanceof PromptRailWalletError) {
    switch (error.code) {
      case "USER_REJECTED":
        return "The wallet request was rejected.";

      case "WALLET_NOT_AVAILABLE":
        return "The selected wallet is not available. Install or unlock it, then try again.";

      case "WRONG_NETWORK":
        return "PromptRail only supports Stellar Testnet. Switch your wallet to Testnet and reconnect.";

      case "NOT_CONNECTED":
        return "No active wallet connection was found. Reconnect your wallet.";

      case "SIGNING_FAILED":
        return "The wallet could not sign the transaction.";

      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected wallet error occurred.";
}

function App() {
  const [walletAddress, setWalletAddress] =
    useState<string | null>(null);

  const [connecting, setConnecting] =
    useState(false);

  const [connectionError, setConnectionError] =
    useState<string | null>(null);

  const [network, setNetwork] =
    useState<string | null>(null);

  const [
    networkPassphrase,
    setNetworkPassphrase,
  ] = useState<string | null>(null);

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

  const [
    transactionError,
    setTransactionError,
  ] = useState<string | null>(null);

  const [
    transactionHash,
    setTransactionHash,
  ] = useState<string | null>(null);

  const isTestnet =
    networkPassphrase === Networks.TESTNET;

  /*
   * Fetch native XLM balance from Horizon Testnet.
   */
  const fetchBalance = async (
    address: string,
  ) => {
    try {
      setBalanceLoading(true);
      setBalanceError(null);

      const account =
        await horizonServer.loadAccount(
          address,
        );

      const nativeBalance =
        account.balances.find(
          (balance) =>
            balance.asset_type === "native",
        );

      if (!nativeBalance) {
        setXlmBalance("0");
        return;
      }

      setXlmBalance(
        nativeBalance.balance,
      );
    } catch (error) {
      console.error(
        "Balance fetch failed:",
        error,
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
          "This wallet is not funded on Stellar Testnet yet.",
        );
      } else {
        setBalanceError(
          "Could not fetch your XLM balance from Stellar Testnet.",
        );
      }
    } finally {
      setBalanceLoading(false);
    }
  };

  /*
   * Connect through Stellar Wallets Kit.
   */
  const handleConnectWallet =
    async () => {
      try {
        setConnecting(true);

        setConnectionError(null);
        setBalanceError(null);

        setTransactionError(null);
        setTransactionHash(null);

        const connected =
          await connectStellarWallet();

        setWalletAddress(
          connected.address,
        );

        setNetwork(
          connected.network ||
            "TESTNET",
        );

        setNetworkPassphrase(
          connected.networkPassphrase,
        );

        await fetchBalance(
          connected.address,
        );
      } catch (error) {
        console.error(
          "Wallet connection failed:",
          error,
        );

        setWalletAddress(null);
        setNetwork(null);

        setNetworkPassphrase(null);
        setXlmBalance(null);

        setConnectionError(
          getWalletErrorMessage(error),
        );
      } finally {
        setConnecting(false);
      }
    };

  /*
   * Disconnect Wallets Kit and clear local UI state.
   */
  const handleDisconnectWallet =
    async () => {
      let disconnectError:
        | string
        | null = null;

      try {
        await disconnectStellarWallet();
      } catch (error) {
        console.error(
          "Wallet disconnect failed:",
          error,
        );

        disconnectError =
          getWalletErrorMessage(error);
      } finally {
        setWalletAddress(null);
        setNetwork(null);

        setNetworkPassphrase(null);
        setXlmBalance(null);

        setBalanceError(null);

        setDestination("");
        setAmount("");

        setTransactionHash(null);
        setTransactionError(null);

        setConnectionError(
          disconnectError,
        );
      }
    };

  /*
   * Recheck current wallet and network.
   */
  const recheckNetwork = async () => {
    try {
      setConnectionError(null);
      setBalanceError(null);

      const connected =
        await getConnectedWallet();

      setWalletAddress(
        connected.address,
      );

      setNetwork(
        connected.network ||
          "TESTNET",
      );

      setNetworkPassphrase(
        connected.networkPassphrase,
      );

      await fetchBalance(
        connected.address,
      );
    } catch (error) {
      console.error(
        "Network check failed:",
        error,
      );

      setNetwork(null);
      setNetworkPassphrase(null);

      setXlmBalance(null);

      setConnectionError(
        getWalletErrorMessage(error),
      );
    }
  };

  /*
   * Refresh balance.
   */
  const refreshBalance = async () => {
    if (
      !walletAddress ||
      !isTestnet
    ) {
      return;
    }

    await fetchBalance(
      walletAddress,
    );
  };

  /*
   * Send XLM on Stellar Testnet.
   */
  const sendXlm = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!walletAddress) {
      setTransactionError(
        "Connect a wallet before creating a transaction.",
      );

      return;
    }

    try {
      setSending(true);

      setTransactionError(null);
      setTransactionHash(null);

      /*
       * 1. Recheck wallet + Testnet immediately
       * before transaction construction.
       */
      const connected =
        await getConnectedWallet();

      if (
        connected.networkPassphrase !==
        Networks.TESTNET
      ) {
        throw new PromptRailWalletError(
          "WRONG_NETWORK",
          "Refusing to transact outside Stellar Testnet.",
        );
      }

      /*
       * Prevent signing if the user changed accounts
       * outside PromptRail.
       */
      if (
        connected.address !==
        walletAddress
      ) {
        throw new PromptRailWalletError(
          "NOT_CONNECTED",
          "The active wallet account changed. Reconnect before signing.",
        );
      }

      setNetwork(
        connected.network ||
          "TESTNET",
      );

      setNetworkPassphrase(
        connected.networkPassphrase,
      );

      /*
       * 2. Validate destination.
       */
      const cleanDestination =
        destination.trim();

      if (
        !StrKey.isValidEd25519PublicKey(
          cleanDestination,
        )
      ) {
        throw new Error(
          "Enter a valid Stellar G... address.",
        );
      }

      if (
        cleanDestination ===
        walletAddress
      ) {
        throw new Error(
          "Please use a different Testnet account as the recipient.",
        );
      }

      /*
       * 3. Validate XLM amount using integer
       * stroops instead of floating-point maths.
       */
      const cleanAmount =
        amount.trim();

      const amountStroops =
        xlmToStroops(cleanAmount);

      if (
        amountStroops === null ||
        amountStroops <= 0n
      ) {
        throw new Error(
          "Enter a valid XLM amount greater than 0 with at most 7 decimal places.",
        );
      }

      /*
       * Basic preflight balance check.
       */
      if (xlmBalance) {
        const balanceStroops =
          xlmToStroops(xlmBalance);

        if (
          balanceStroops !== null &&
          amountStroops >=
            balanceStroops
        ) {
          throw new Error(
            "Insufficient XLM balance for this payment and network fees.",
          );
        }
      }

      /*
       * 4. Standard payment requires recipient
       * account to already exist.
       */
      try {
        await horizonServer.loadAccount(
          cleanDestination,
        );
      } catch {
        throw new Error(
          "Recipient account is not funded on Stellar Testnet. Fund the recipient first.",
        );
      }

      /*
       * 5. Load current source account.
       */
      const sourceAccount =
        await horizonServer.loadAccount(
          walletAddress,
        );

      /*
       * 6. Build unsigned transaction.
       */
      const transaction =
        new TransactionBuilder(
          sourceAccount,
          {
            fee: BASE_FEE,
            networkPassphrase:
              Networks.TESTNET,
          },
        )
          .addOperation(
            Operation.payment({
              destination:
                cleanDestination,

              asset:
                Asset.native(),

              amount:
                cleanAmount,
            }),
          )
          .addMemo(
            Memo.text(
              "PromptRail Yellow Belt",
            ),
          )
          .setTimeout(30)
          .build();

      /*
       * 7. Serialize unsigned transaction.
       *
       * IMPORTANT:
       * Stellar SDK 16.x uses toXDR().
       * SDK 17 renamed this to toXdr().
       */
      const unsignedXdr =
        transaction
          .toEnvelope()
          .toXDR("base64");

      /*
       * 8. Sign through the selected wallet.
       */
      const signedTxXdr =
        await signWalletTransaction(
          unsignedXdr,
          walletAddress,
        );

      /*
       * 9. Parse signed transaction.
       *
       * IMPORTANT:
       * Stellar SDK 16.x uses fromXDR().
       */
      const signedTransaction =
        TransactionBuilder.fromXDR(
          signedTxXdr,
          Networks.TESTNET,
        );

      /*
       * 10. Submit to Stellar Testnet.
       */
      const result =
        await horizonServer.submitTransaction(
          signedTransaction,
        );

      /*
       * 11. Success.
       */
      setTransactionHash(
        result.hash,
      );

      setAmount("");

      await fetchBalance(
        walletAddress,
      );
    } catch (error) {
      console.error(
        "Transaction failed:",
        error,
      );

      /*
       * Wallet-specific errors.
       */
      if (
        error instanceof
        PromptRailWalletError
      ) {
        setTransactionError(
          getWalletErrorMessage(error),
        );

        return;
      }

      /*
       * Horizon transaction errors.
       */
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
        const operationCodes =
          resultCodes.operations ?? [];

        const insufficientBalance =
          resultCodes.transaction ===
            "tx_insufficient_balance" ||
          operationCodes.includes(
            "op_underfunded",
          );

        if (insufficientBalance) {
          setTransactionError(
            "Insufficient XLM balance to complete this transaction while maintaining Stellar reserves and fees.",
          );

          return;
        }

        const operationCode =
          operationCodes.join(", ");

        setTransactionError(
          operationCode
            ? `Stellar rejected the transaction: ${operationCode}`
            : `Stellar rejected the transaction: ${
                resultCodes.transaction ??
                "unknown error"
              }`,
        );

        return;
      }

      setTransactionError(
        error instanceof Error
          ? error.message
          : "The transaction could not be completed.",
      );
    } finally {
      setSending(false);
    }
  };

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
          STELLAR YELLOW BELT
        </div>

        <h2>
          Multi-wallet rails
          <br />
          for the agentic web.
        </h2>

        <p>
          Connect your preferred Stellar
          wallet, verify Testnet and
          securely sign PromptRail
          transactions without exposing
          private keys.
        </p>
      </section>

      <section className="wallet-card">
        <div className="card-icon">
          W
        </div>

        {walletAddress ? (
          <>
            <h3>
              Wallet connected
            </h3>

            <p>
              Your Stellar wallet is
              connected to PromptRail.
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
                  10,
                )}
                ...
                {walletAddress.slice(
                  -10,
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
                        xlmBalance,
                      ).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits:
                            2,

                          maximumFractionDigits:
                            7,
                        },
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
                    -- XLM
                  </strong>
                )}

                <button
                  className="balance-refresh"
                  type="button"
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
              <div
                className="balance-error"
                role="alert"
              >
                <strong>
                  Wallet balance unavailable
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
                    ? "Stellar Testnet"
                    : network}
                </strong>

                <span>
                  {isTestnet
                    ? "Ready for test transactions."
                    : "PromptRail blocks transactions outside Testnet."}
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
                      Create locally,
                      sign with your
                      selected wallet and
                      submit to Stellar.
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
                        event,
                      ) =>
                        setDestination(
                          event.target
                            .value,
                        )
                      }
                      placeholder="G..."
                      autoComplete="off"
                      spellCheck={false}
                      disabled={
                        sending
                      }
                    />
                  </label>

                  <label>
                    Amount

                    <div className="amount-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          amount
                        }
                        onChange={(
                          event,
                        ) =>
                          setAmount(
                            event.target
                              .value,
                          )
                        }
                        placeholder="1.00"
                        autoComplete="off"
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
                      ? "Waiting for wallet..."
                      : "Send XLM"}
                  </button>
                </form>
              )}

            {transactionError && (
              <div
                className="transaction-result transaction-failure"
                role="alert"
                aria-live="polite"
              >
                <span className="result-icon">
                  !
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
              <div
                className="transaction-result transaction-success"
                aria-live="polite"
              >
                <span className="result-icon">
                  OK
                </span>

                <div>
                  <strong>
                    Payment successful
                  </strong>

                  <p>
                    Your XLM payment was
                    confirmed on Stellar
                    Testnet.
                  </p>

                  <span className="hash-label">
                    TRANSACTION HASH
                  </span>

                  <code>
                    {transactionHash.slice(
                      0,
                      12,
                    )}
                    ...
                    {transactionHash.slice(
                      -12,
                    )}
                  </code>

                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction -&gt;
                  </a>
                </div>
              </div>
            )}

            <button
              className="secondary-button"
              type="button"
              onClick={
                recheckNetwork
              }
            >
              Recheck Wallet & Network
            </button>

            <button
              className="disconnect-button"
              type="button"
              onClick={
                handleDisconnectWallet
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
              Choose a supported Stellar
              wallet to access PromptRail
              on Testnet.
            </p>

            <button
              className="primary-button"
              type="button"
              onClick={
                handleConnectWallet
              }
              disabled={
                connecting
              }
            >
              {connecting
                ? "Opening wallet selector..."
                : "Connect Wallet"}
            </button>

            <span className="card-note">
              Supported:{" "}
              {SUPPORTED_WALLETS.join(
                " / ",
              )}
            </span>
          </>
        )}

        {connectionError && (
          <div
            className="connection-error"
            role="alert"
            aria-live="polite"
          >
            {connectionError}
          </div>
        )}

        <span className="card-note">
          Your private keys never leave
          your wallet.
        </span>
      </section>

      <footer>
        Built on Stellar | PromptRail
        Yellow Belt
      </footer>
    </main>
  );
}

export default App;