import { Networks } from "@stellar/stellar-sdk";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

const TESTNET_PASSPHRASE = Networks.TESTNET;

let initialized = false;

export const SUPPORTED_WALLETS = [
  "Freighter",
  "Albedo",
  "xBull",
] as const;

export type WalletErrorCode =
  | "WALLET_NOT_AVAILABLE"
  | "USER_REJECTED"
  | "WRONG_NETWORK"
  | "NOT_CONNECTED"
  | "SIGNING_FAILED"
  | "UNKNOWN";

export class PromptRailWalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "PromptRailWalletError";
    this.code = code;
  }
}

export interface ConnectedWallet {
  address: string;
  network: string;
  networkPassphrase: string;
}

export function initializeWalletKit(): void {
  if (initialized) {
    return;
  }

  StellarWalletsKit.init({
    modules: [
      new FreighterModule(),
      new AlbedoModule(),
      new xBullModule(),
    ],
  });

  StellarWalletsKit.setNetwork(Networks.TESTNET);

  initialized = true;
}

export async function connectWallet(): Promise<ConnectedWallet> {
  initializeWalletKit();

  try {
    const { address } = await StellarWalletsKit.authModal();

    if (!address) {
      throw new PromptRailWalletError(
        "NOT_CONNECTED",
        "The wallet did not return an address.",
      );
    }

    const { network, networkPassphrase } =
      await StellarWalletsKit.getNetwork();

    if (networkPassphrase !== TESTNET_PASSPHRASE) {
      await safeDisconnect();

      throw new PromptRailWalletError(
        "WRONG_NETWORK",
        "PromptRail currently supports Stellar Testnet only.",
      );
    }

    return {
      address,
      network,
      networkPassphrase,
    };
  } catch (error) {
    throw normalizeWalletError(error);
  }
}

export async function getConnectedWallet(): Promise<ConnectedWallet> {
  initializeWalletKit();

  try {
    const { address } = await StellarWalletsKit.getAddress();

    if (!address) {
      throw new PromptRailWalletError(
        "NOT_CONNECTED",
        "No wallet is connected.",
      );
    }

    const { network, networkPassphrase } =
      await StellarWalletsKit.getNetwork();

    if (networkPassphrase !== TESTNET_PASSPHRASE) {
      throw new PromptRailWalletError(
        "WRONG_NETWORK",
        "PromptRail currently supports Stellar Testnet only.",
      );
    }

    return {
      address,
      network,
      networkPassphrase,
    };
  } catch (error) {
    throw normalizeWalletError(error);
  }
}

export async function signTransaction(
  transactionXdr: string,
  address: string,
): Promise<string> {
  initializeWalletKit();

  if (!transactionXdr.trim()) {
    throw new PromptRailWalletError(
      "SIGNING_FAILED",
      "Transaction XDR is empty.",
    );
  }

  try {
    const { networkPassphrase } =
      await StellarWalletsKit.getNetwork();

    if (networkPassphrase !== TESTNET_PASSPHRASE) {
      throw new PromptRailWalletError(
        "WRONG_NETWORK",
        "Refusing to sign outside Stellar Testnet.",
      );
    }

    const { signedTxXdr } =
      await StellarWalletsKit.signTransaction(
        transactionXdr,
        {
          address,
          networkPassphrase: TESTNET_PASSPHRASE,
        },
      );

    if (!signedTxXdr) {
      throw new PromptRailWalletError(
        "SIGNING_FAILED",
        "The wallet did not return a signed transaction.",
      );
    }

    return signedTxXdr;
  } catch (error) {
    throw normalizeWalletError(error, "SIGNING_FAILED");
  }
}

export async function disconnectWallet(): Promise<void> {
  initializeWalletKit();

  try {
    await StellarWalletsKit.disconnect();
  } catch (error) {
    throw normalizeWalletError(error);
  }
}

async function safeDisconnect(): Promise<void> {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Best-effort cleanup only.
  }
}

function normalizeWalletError(
  error: unknown,
  fallbackCode: WalletErrorCode = "UNKNOWN",
): PromptRailWalletError {
  if (error instanceof PromptRailWalletError) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown wallet error.";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("denied") ||
    normalized.includes("cancel")
  ) {
    return new PromptRailWalletError(
      "USER_REJECTED",
      "The wallet request was rejected.",
    );
  }

  if (
    normalized.includes("not installed") ||
    normalized.includes("not available") ||
    normalized.includes("unavailable") ||
    normalized.includes("wallet not found")
  ) {
    return new PromptRailWalletError(
      "WALLET_NOT_AVAILABLE",
      "The selected wallet is not available.",
    );
  }

  return new PromptRailWalletError(
    fallbackCode,
    message,
  );
}