import { useEffect, useState } from "react";
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

import type { Endpoint } from "promptrail_registry";

import {
  connectWallet as connectStellarWallet,
  disconnectWallet as disconnectStellarWallet,
  getConnectedWallet,
  PromptRailWalletError,
  signTransaction as signWalletTransaction,
  SUPPORTED_WALLETS,
} from "./services/wallet";

import {
  getRegistryEntry,
  registerRegistryEntry,
  REGISTRY_CONTRACT_ID,
  type RegistryTxStatus,
} from "./services/registry";

import {
  startRegistryEventFeed,
  type RegistryActivity,
  type RegistryEventFeed,
} from "./services/events";

import "./App.css";

const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");

const STROOPS_PER_XLM = 10_000_000n;

const MAX_REGISTRY_PRICE_STROOPS = 1_000_000_000_000n;

const MAX_ACTIVITY_ITEMS = 20;

function xlmToStroops(value: string): bigint | null {
  const cleanValue = value.trim();

  if (!/^\d+(?:\.\d{1,7})?$/.test(cleanValue)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = cleanValue.split(".");

  try {
    const whole = BigInt(wholePart);

    const fraction = BigInt(fractionPart.padEnd(7, "0"));

    return whole * STROOPS_PER_XLM + fraction;
  } catch {
    return null;
  }
}

function stroopsToXlm(value: bigint): string {
  const negative = value < 0n;

  const absolute = negative ? -value : value;

  const whole = absolute / STROOPS_PER_XLM;

  const fraction = (absolute % STROOPS_PER_XLM)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");

  const formatted = fraction ? `${whole}.${fraction}` : whole.toString();

  return negative ? `-${formatted}` : formatted;
}

function getWalletErrorMessage(error: unknown): string {
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

function registryStatusLabel(status: RegistryTxStatus): string {
  switch (status) {
    case "PREPARING":
      return "Preparing transaction";

    case "AWAITING_SIGNATURE":
      return "Awaiting wallet signature";

    case "PENDING":
      return "Pending on Stellar";

    case "SUCCESS":
      return "Registry transaction confirmed";

    case "FAILED":
      return "Registry transaction failed";

    default:
      return "";
  }
}

function shortenAddress(value: string): string {
  if (value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function activityTitle(activity: RegistryActivity): string {
  switch (activity.type) {
    case "EndpointRegistered":
      return "Endpoint registered";

    case "PriceUpdated":
      return "Price updated";

    case "StatusChanged":
      return "Status changed";
  }
}

function activityDescription(activity: RegistryActivity): string {
  switch (activity.type) {
    case "EndpointRegistered": {
      const name = activity.name ?? "Unnamed endpoint";

      const price =
        activity.priceStroops !== undefined
          ? `${stroopsToXlm(activity.priceStroops)} XLM`
          : "Unknown price";

      return `${name} registered at ${price}.`;
    }

    case "PriceUpdated": {
      const oldPrice =
        activity.oldPriceStroops !== undefined
          ? `${stroopsToXlm(activity.oldPriceStroops)} XLM`
          : "unknown";

      const newPrice =
        activity.newPriceStroops !== undefined
          ? `${stroopsToXlm(activity.newPriceStroops)} XLM`
          : "unknown";

      return `Price changed from ${oldPrice} to ${newPrice}.`;
    }

    case "StatusChanged":
      return activity.active ? "Endpoint activated." : "Endpoint deactivated.";
  }
}

function formatClosedAt(value?: string): string {
  if (!value) {
    return "Ledger time unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);

  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [network, setNetwork] = useState<string | null>(null);

  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(
    null,
  );

  const [xlmBalance, setXlmBalance] = useState<string | null>(null);

  const [balanceLoading, setBalanceLoading] = useState(false);

  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [registryEntry, setRegistryEntry] = useState<Endpoint | null>(null);

  const [registryLoading, setRegistryLoading] = useState(false);

  const [registryError, setRegistryError] = useState<string | null>(null);

  const [registryName, setRegistryName] = useState("");

  const [registryPrice, setRegistryPrice] = useState("");

  const [registryTxStatus, setRegistryTxStatus] =
    useState<RegistryTxStatus>("IDLE");

  const [registryTxError, setRegistryTxError] = useState<string | null>(null);

  const [registryTxHash, setRegistryTxHash] = useState<string | null>(null);

  const [registryActivities, setRegistryActivities] = useState<
    RegistryActivity[]
  >([]);

  const [eventFeedLoading, setEventFeedLoading] = useState(false);

  const [eventFeedError, setEventFeedError] = useState<string | null>(null);

  const [destination, setDestination] = useState("");

  const [amount, setAmount] = useState("");

  const [sending, setSending] = useState(false);

  const [transactionError, setTransactionError] = useState<string | null>(null);

  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const isTestnet = networkPassphrase === Networks.TESTNET;

  const registryBusy =
    registryTxStatus === "PREPARING" ||
    registryTxStatus === "AWAITING_SIGNATURE" ||
    registryTxStatus === "PENDING";

  /*
   * Start the contract-specific live event feed.
   *
   * The service already filters by PromptRail's
   * deployed contract ID and deduplicates event ids.
   */
  useEffect(() => {
    if (!walletAddress || !isTestnet) {
      return;
    }

    let cancelled = false;

    let feed: RegistryEventFeed | undefined;

    const startFeed = async () => {
      try {
        const createdFeed = await startRegistryEventFeed(
          (events) => {
            if (cancelled) {
              return;
            }

            setEventFeedLoading(false);

            setEventFeedError(null);

            if (events.length === 0) {
              return;
            }

            setRegistryActivities((current) => {
              const merged = [...events, ...current];

              const unique = new Map<string, RegistryActivity>();

              for (const activity of merged) {
                unique.set(activity.id, activity);
              }

              return Array.from(unique.values())
                .sort((a, b) => b.ledger - a.ledger)
                .slice(0, MAX_ACTIVITY_ITEMS);
            });
          },

          (error) => {
            if (cancelled) {
              return;
            }

            setEventFeedLoading(false);

            setEventFeedError(error.message);
          },
        );

        if (cancelled) {
          createdFeed.stop();
          return;
        }

        feed = createdFeed;
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEventFeedLoading(false);

        setEventFeedError(
          error instanceof Error
            ? error.message
            : "Could not start the Registry event feed.",
        );
      }
    };

    void startFeed();

    return () => {
      cancelled = true;

      feed?.stop();
    };
  }, [walletAddress, isTestnet]);

  const fetchBalance = async (address: string) => {
    try {
      setBalanceLoading(true);

      setBalanceError(null);

      const account = await horizonServer.loadAccount(address);

      const nativeBalance = account.balances.find(
        (balance) => balance.asset_type === "native",
      );

      if (!nativeBalance) {
        setXlmBalance("0");

        return;
      }

      setXlmBalance(nativeBalance.balance);
    } catch (error) {
      console.error("Balance fetch failed:", error);

      setXlmBalance(null);

      const possibleError = error as {
        response?: {
          status?: number;
        };
      };

      if (possibleError.response?.status === 404) {
        setBalanceError("This wallet is not funded on Stellar Testnet yet.");
      } else {
        setBalanceError(
          "Could not fetch your XLM balance from Stellar Testnet.",
        );
      }
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchRegistryEntry = async (address: string) => {
    try {
      setRegistryLoading(true);

      setRegistryError(null);

      const entry = await getRegistryEntry(address);

      setRegistryEntry(entry);
    } catch (error) {
      console.error("Registry read failed:", error);

      setRegistryEntry(null);

      setEventFeedLoading(false);

      setRegistryError(
        error instanceof Error
          ? error.message
          : "Could not read the PromptRail Registry.",
      );
    } finally {
      setRegistryLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      setConnecting(true);

      setConnectionError(null);

      setBalanceError(null);

      setRegistryError(null);

      setRegistryTxError(null);

      setTransactionError(null);

      setRegistryActivities([],);

      setEventFeedLoading(false,);

      setEventFeedError(null,);

      const connected = await connectStellarWallet();

      setWalletAddress(connected.address);

      setNetwork(connected.network || "TESTNET");

      setNetworkPassphrase(connected.networkPassphrase);

      await Promise.all([
        fetchBalance(connected.address),

        fetchRegistryEntry(connected.address),
      ]);
    } catch (error) {
      console.error("Wallet connection failed:", error);

      setWalletAddress(null);

      setNetwork(null);

      setNetworkPassphrase(null);

      setXlmBalance(null);

      setRegistryEntry(null);

      setConnectionError(getWalletErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    let disconnectError: string | null = null;

    try {
      await disconnectStellarWallet();
    } catch (error) {
      console.error("Wallet disconnect failed:", error);

      disconnectError = getWalletErrorMessage(error);
    } finally {
      setWalletAddress(null);

      setNetwork(null);

      setNetworkPassphrase(null);

      setXlmBalance(null);

      setBalanceError(null);

      setRegistryEntry(null);

      setRegistryError(null);

      setRegistryName("");

      setRegistryPrice("");

      setRegistryTxStatus("IDLE");

      setRegistryTxError(null);

      setRegistryTxHash(null);

      setRegistryActivities([]);

      setEventFeedError(null);

      setDestination("");

      setAmount("");

      setTransactionHash(null);

      setTransactionError(null);

      setConnectionError(disconnectError);
    }
  };

  const recheckNetwork = async () => {
    try {
      setConnectionError(null);

      setBalanceError(null);

      setRegistryError(null);

      const connected = await getConnectedWallet();

      setWalletAddress(connected.address);

      setNetwork(connected.network || "TESTNET");

      setNetworkPassphrase(connected.networkPassphrase);

      await Promise.all([
        fetchBalance(connected.address),

        fetchRegistryEntry(connected.address),
      ]);
    } catch (error) {
      console.error("Network check failed:", error);

      setNetwork(null);

      setNetworkPassphrase(null);

      setXlmBalance(null);

      setRegistryEntry(null);

      setConnectionError(getWalletErrorMessage(error));
    }
  };

  const refreshBalance = async () => {
    if (!walletAddress || !isTestnet) {
      return;
    }

    await fetchBalance(walletAddress);
  };

  const refreshRegistry = async () => {
    if (!walletAddress || !isTestnet) {
      return;
    }

    await fetchRegistryEntry(walletAddress);
  };

  const handleRegisterRegistry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!walletAddress) {
      setRegistryTxStatus("FAILED");

      setRegistryTxError("Connect a wallet before registering an API.");

      return;
    }

    if (registryEntry) {
      setRegistryTxStatus("FAILED");

      setRegistryTxError("This wallet already has a Registry entry.");

      return;
    }

    const cleanName = registryName.trim();

    const priceStroops = xlmToStroops(registryPrice);

    if (!cleanName) {
      setRegistryTxStatus("FAILED");

      setRegistryTxError("Enter an API name.");

      return;
    }

    if (priceStroops === null || priceStroops <= 0n) {
      setRegistryTxStatus("FAILED");

      setRegistryTxError(
        "Enter a valid XLM price greater than 0 with at most 7 decimal places.",
      );

      return;
    }

    if (priceStroops > MAX_REGISTRY_PRICE_STROOPS) {
      setRegistryTxStatus("FAILED");

      setRegistryTxError("The Registry price is above the allowed maximum.");

      return;
    }

    try {
      setRegistryTxError(null);

      setRegistryTxHash(null);

      const result = await registerRegistryEntry({
        owner: walletAddress,

        name: cleanName,

        priceStroops,

        onStatus: setRegistryTxStatus,
      });

      setRegistryEntry(result.endpoint);

      setRegistryTxHash(result.hash);

      setRegistryName("");

      setRegistryPrice("");

      await Promise.all([
        fetchBalance(walletAddress),

        fetchRegistryEntry(walletAddress),
      ]);
    } catch (error) {
      console.error("Registry write failed:", error);

      setRegistryTxError(getWalletErrorMessage(error));
    }
  };

  const sendXlm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!walletAddress) {
      setTransactionError("Connect a wallet before creating a transaction.");

      return;
    }

    try {
      setSending(true);

      setTransactionError(null);

      setTransactionHash(null);

      const connected = await getConnectedWallet();

      if (connected.networkPassphrase !== Networks.TESTNET) {
        throw new PromptRailWalletError(
          "WRONG_NETWORK",
          "Refusing to transact outside Stellar Testnet.",
        );
      }

      if (connected.address !== walletAddress) {
        throw new PromptRailWalletError(
          "NOT_CONNECTED",
          "The active wallet account changed. Reconnect before signing.",
        );
      }

      setNetwork(connected.network || "TESTNET");

      setNetworkPassphrase(connected.networkPassphrase);

      const cleanDestination = destination.trim();

      if (!StrKey.isValidEd25519PublicKey(cleanDestination)) {
        throw new Error("Enter a valid Stellar G... address.");
      }

      if (cleanDestination === walletAddress) {
        throw new Error(
          "Please use a different Testnet account as the recipient.",
        );
      }

      const cleanAmount = amount.trim();

      const amountStroops = xlmToStroops(cleanAmount);

      if (amountStroops === null || amountStroops <= 0n) {
        throw new Error(
          "Enter a valid XLM amount greater than 0 with at most 7 decimal places.",
        );
      }

      if (xlmBalance) {
        const balanceStroops = xlmToStroops(xlmBalance);

        if (balanceStroops !== null && amountStroops >= balanceStroops) {
          throw new Error(
            "Insufficient XLM balance for this payment and network fees.",
          );
        }
      }

      try {
        await horizonServer.loadAccount(cleanDestination);
      } catch {
        throw new Error(
          "Recipient account is not funded on Stellar Testnet. Fund the recipient first.",
        );
      }

      const sourceAccount = await horizonServer.loadAccount(walletAddress);

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,

        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: cleanDestination,

            asset: Asset.native(),

            amount: cleanAmount,
          }),
        )
        .addMemo(Memo.text("PromptRail Yellow Belt"))
        .setTimeout(30)
        .build();

      const unsignedXdr = transaction.toEnvelope().toXDR("base64");

      const signedTxXdr = await signWalletTransaction(
        unsignedXdr,
        walletAddress,
      );

      const signedTransaction = TransactionBuilder.fromXDR(
        signedTxXdr,
        Networks.TESTNET,
      );

      const result = await horizonServer.submitTransaction(signedTransaction);

      setTransactionHash(result.hash);

      setAmount("");

      await fetchBalance(walletAddress);
    } catch (error) {
      console.error("Transaction failed:", error);

      if (error instanceof PromptRailWalletError) {
        setTransactionError(getWalletErrorMessage(error));

        return;
      }

      const horizonError = error as {
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

      const resultCodes = horizonError.response?.data?.extras?.result_codes;

      if (resultCodes) {
        const operationCodes = resultCodes.operations ?? [];

        const insufficientBalance =
          resultCodes.transaction === "tx_insufficient_balance" ||
          operationCodes.includes("op_underfunded");

        if (insufficientBalance) {
          setTransactionError(
            "Insufficient XLM balance to complete this transaction while maintaining Stellar reserves and fees.",
          );

          return;
        }

        const operationCode = operationCodes.join(", ");

        setTransactionError(
          operationCode
            ? `Stellar rejected the transaction: ${operationCode}`
            : `Stellar rejected the transaction: ${
                resultCodes.transaction ?? "unknown error"
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
          <div className="brand-mark">P</div>

          <div>
            <h1>PromptRail</h1>

            <span>Machine Payments on Stellar</span>
          </div>
        </div>

        <div
          className={`network-badge ${
            network && !isTestnet ? "network-badge-wrong" : ""
          }`}
        >
          <span
            className={`network-dot ${
              network && !isTestnet ? "network-dot-wrong" : ""
            }`}
          />

          {network ?? "TESTNET"}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">STELLAR YELLOW BELT</div>

        <h2>
          Smart contract rails
          <br />
          for the agentic web.
        </h2>

        <p>
          Connect a Stellar wallet, register an API on Soroban, and watch
          PromptRail Registry events update from Testnet.
        </p>
      </section>

      <section className="wallet-card">
        <div className="card-icon">W</div>

        {walletAddress ? (
          <>
            <h3>Wallet connected</h3>

            <p>Your Stellar wallet is connected to PromptRail.</p>

            <div className="connected-status">
              <span className="connected-dot" />
              Connected
            </div>

            <div className="wallet-address">
              <span className="wallet-address-label">Stellar Address</span>

              <strong>
                {walletAddress.slice(0, 10)}
                ...
                {walletAddress.slice(-10)}
              </strong>
            </div>

            {isTestnet && (
              <div className="balance-panel">
                <span className="balance-label">XLM BALANCE</span>

                {balanceLoading ? (
                  <strong className="balance-value">Loading...</strong>
                ) : xlmBalance ? (
                  <>
                    <strong className="balance-value">
                      {Number(xlmBalance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,

                        maximumFractionDigits: 7,
                      })}{" "}
                      XLM
                    </strong>

                    <span className="balance-caption">
                      Stellar Testnet balance
                    </span>
                  </>
                ) : (
                  <strong className="balance-value">-- XLM</strong>
                )}

                <button
                  className="balance-refresh"
                  type="button"
                  onClick={refreshBalance}
                  disabled={balanceLoading}
                >
                  {balanceLoading ? "Refreshing..." : "Refresh Balance"}
                </button>
              </div>
            )}

            {balanceError && (
              <div className="balance-error" role="alert">
                <strong>Wallet balance unavailable</strong>

                <span>{balanceError}</span>
              </div>
            )}

            {network && (
              <div
                className={`network-panel ${
                  isTestnet ? "network-panel-good" : "network-panel-wrong"
                }`}
              >
                <span className="network-panel-label">ACTIVE NETWORK</span>

                <strong>{isTestnet ? "Stellar Testnet" : network}</strong>

                <span>
                  {isTestnet
                    ? "Ready for Soroban transactions."
                    : "PromptRail blocks transactions outside Testnet."}
                </span>
              </div>
            )}

            {isTestnet && (
              <div className="payment-form">
                <div className="payment-heading">
                  <span className="payment-eyebrow">SOROBAN REGISTRY</span>

                  <h4>My Registry Entry</h4>

                  <p>
                    Read and write API metadata through the deployed PromptRail
                    smart contract.
                  </p>
                </div>

                {registryLoading ? (
                  <div className="network-panel network-panel-good">
                    <span className="network-panel-label">CONTRACT STATE</span>

                    <strong>Reading Registry...</strong>

                    <span>Simulating a read-only Soroban call.</span>
                  </div>
                ) : registryError ? (
                  <div className="connection-error" role="alert">
                    {registryError}
                  </div>
                ) : registryEntry ? (
                  <>
                    <div className="wallet-address">
                      <span className="wallet-address-label">API NAME</span>

                      <strong>{registryEntry.name}</strong>
                    </div>

                    <div
                      className={`network-panel ${
                        registryEntry.active
                          ? "network-panel-good"
                          : "network-panel-wrong"
                      }`}
                    >
                      <span className="network-panel-label">
                        REGISTRY STATUS
                      </span>

                      <strong>
                        {registryEntry.active ? "Active" : "Inactive"}
                      </strong>

                      <span>Stored on Stellar Testnet.</span>
                    </div>

                    <div className="wallet-address">
                      <span className="wallet-address-label">API PRICE</span>

                      <strong>{stroopsToXlm(registryEntry.price)} XLM</strong>

                      <span className="balance-caption">
                        {registryEntry.price.toString()} stroops
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="balance-error">
                      <strong>No Registry entry yet</strong>

                      <span>
                        Register this wallet&apos;s first API endpoint.
                      </span>
                    </div>

                    <form onSubmit={handleRegisterRegistry}>
                      <label>
                        API Name
                        <input
                          type="text"
                          value={registryName}
                          onChange={(event) =>
                            setRegistryName(event.target.value)
                          }
                          placeholder="PromptRail Demo API"
                          autoComplete="off"
                          disabled={registryBusy}
                        />
                      </label>

                      <label>
                        Price
                        <div className="amount-input">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={registryPrice}
                            onChange={(event) =>
                              setRegistryPrice(event.target.value)
                            }
                            placeholder="0.02"
                            autoComplete="off"
                            disabled={registryBusy}
                          />

                          <span>XLM</span>
                        </div>
                      </label>

                      <button
                        className="primary-button"
                        type="submit"
                        disabled={
                          registryBusy || !registryName || !registryPrice
                        }
                      >
                        {registryTxStatus === "AWAITING_SIGNATURE"
                          ? "Check your wallet..."
                          : registryTxStatus === "PENDING"
                            ? "Pending on Stellar..."
                            : registryTxStatus === "PREPARING"
                              ? "Preparing..."
                              : "Register API"}
                      </button>
                    </form>
                  </>
                )}

                {registryTxStatus !== "IDLE" && (
                  <div
                    className={`network-panel ${
                      registryTxStatus === "FAILED"
                        ? "network-panel-wrong"
                        : "network-panel-good"
                    }`}
                    aria-live="polite"
                  >
                    <span className="network-panel-label">
                      TRANSACTION STATUS
                    </span>

                    <strong>{registryStatusLabel(registryTxStatus)}</strong>

                    <span>
                      {registryTxStatus === "PREPARING" &&
                        "Building and simulating the contract call."}

                      {registryTxStatus === "AWAITING_SIGNATURE" &&
                        "Approve the exact Testnet transaction in your wallet."}

                      {registryTxStatus === "PENDING" &&
                        "The signed transaction is being finalized on Stellar."}

                      {registryTxStatus === "SUCCESS" &&
                        "The Registry write is confirmed on-chain."}

                      {registryTxStatus === "FAILED" &&
                        "The Registry write did not complete."}
                    </span>
                  </div>
                )}

                {registryTxError && (
                  <div className="connection-error" role="alert">
                    {registryTxError}
                  </div>
                )}

                {registryTxHash && (
                  <div className="transaction-result transaction-success">
                    <span className="result-icon">OK</span>

                    <div>
                      <strong>Registry transaction confirmed</strong>

                      <p>
                        Your API metadata was written to PromptRail Registry on
                        Testnet.
                      </p>

                      <span className="hash-label">TRANSACTION HASH</span>

                      <code>
                        {registryTxHash.slice(0, 12)}
                        ...
                        {registryTxHash.slice(-12)}
                      </code>

                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${registryTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Registry transaction -&gt;
                      </a>
                    </div>
                  </div>
                )}

                <div className="wallet-address">
                  <span className="wallet-address-label">CONTRACT</span>

                  <strong>
                    {REGISTRY_CONTRACT_ID.slice(0, 10)}
                    ...
                    {REGISTRY_CONTRACT_ID.slice(-10)}
                  </strong>
                </div>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={refreshRegistry}
                  disabled={registryLoading || registryBusy}
                >
                  {registryLoading
                    ? "Reading Registry..."
                    : "Refresh Registry Entry"}
                </button>
              </div>
            )}

            {isTestnet && (
              <div className="payment-form">
                <div className="payment-heading">
                  <span className="payment-eyebrow">LIVE CONTRACT EVENTS</span>

                  <h4>Live Registry Activity</h4>

                  <p>Contract-filtered Testnet events update automatically.</p>
                </div>

                {eventFeedLoading && (
                  <div className="network-panel network-panel-good">
                    <span className="network-panel-label">EVENT FEED</span>

                    <strong>Connecting...</strong>

                    <span>Reading recent PromptRail Registry events.</span>
                  </div>
                )}

                {eventFeedError && (
                  <div className="connection-error" role="alert">
                    {eventFeedError}
                  </div>
                )}

                {!eventFeedLoading &&
                  !eventFeedError &&
                  registryActivities.length === 0 && (
                    <div className="balance-error">
                      <strong>No recent Registry events</strong>

                      <span>
                        New PromptRail contract activity will appear here
                        automatically.
                      </span>
                    </div>
                  )}

                {registryActivities.map((activity) => (
                  <div
                    className="transaction-result transaction-success"
                    key={activity.id}
                  >
                    <span className="result-icon">E</span>

                    <div>
                      <strong>{activityTitle(activity)}</strong>

                      <p>{activityDescription(activity)}</p>

                      <span className="hash-label">OWNER</span>

                      <code>{shortenAddress(activity.owner)}</code>

                      <span className="hash-label">LEDGER</span>

                      <code>{activity.ledger}</code>

                      <p>{formatClosedAt(activity.ledgerClosedAt)}</p>

                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${activity.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View event transaction -&gt;
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isTestnet && xlmBalance && (
              <form className="payment-form" onSubmit={sendXlm}>
                <div className="payment-heading">
                  <span className="payment-eyebrow">MACHINE PAYMENT</span>

                  <h4>Send Testnet XLM</h4>

                  <p>
                    Create locally, sign with your selected wallet and submit to
                    Stellar.
                  </p>
                </div>

                <label>
                  Recipient
                  <input
                    type="text"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="G..."
                    autoComplete="off"
                    spellCheck={false}
                    disabled={sending}
                  />
                </label>

                <label>
                  Amount
                  <div className="amount-input">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="1.00"
                      autoComplete="off"
                      disabled={sending}
                    />

                    <span>XLM</span>
                  </div>
                </label>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={sending || !destination || !amount}
                >
                  {sending ? "Waiting for wallet..." : "Send XLM"}
                </button>
              </form>
            )}

            {transactionError && (
              <div
                className="transaction-result transaction-failure"
                role="alert"
                aria-live="polite"
              >
                <span className="result-icon">!</span>

                <div>
                  <strong>Transaction failed</strong>

                  <p>{transactionError}</p>
                </div>
              </div>
            )}

            {transactionHash && (
              <div
                className="transaction-result transaction-success"
                aria-live="polite"
              >
                <span className="result-icon">OK</span>

                <div>
                  <strong>Payment successful</strong>

                  <p>Your XLM payment was confirmed on Stellar Testnet.</p>

                  <span className="hash-label">TRANSACTION HASH</span>

                  <code>
                    {transactionHash.slice(0, 12)}
                    ...
                    {transactionHash.slice(-12)}
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
              onClick={recheckNetwork}
              disabled={registryBusy}
            >
              Recheck Wallet & Network
            </button>

            <button
              className="disconnect-button"
              type="button"
              onClick={handleDisconnectWallet}
              disabled={registryBusy}
            >
              Disconnect Wallet
            </button>
          </>
        ) : (
          <>
            <h3>Connect your wallet</h3>

            <p>
              Choose a supported Stellar wallet to access PromptRail on Testnet.
            </p>

            <button
              className="primary-button"
              type="button"
              onClick={handleConnectWallet}
              disabled={connecting}
            >
              {connecting ? "Opening wallet selector..." : "Connect Wallet"}
            </button>

            <span className="card-note">
              Supported: {SUPPORTED_WALLETS.join(" / ")}
            </span>
          </>
        )}

        {connectionError && (
          <div className="connection-error" role="alert" aria-live="polite">
            {connectionError}
          </div>
        )}

        <span className="card-note">
          Your private keys never leave your wallet.
        </span>
      </section>

      <footer>Built on Stellar | PromptRail Yellow Belt</footer>
    </main>
  );
}

export default App;
