/*
 * Multi-wallet service built on StellarWalletsKit.
 *
 * The kit presents a wallet-selection modal (Freighter, Albedo, xBull) and
 * gives the rest of the app one uniform surface: connect, read the address,
 * sign, disconnect. Every failure is normalized through src/errors.ts so the
 * UI shows distinct messages for wallet-not-found, user-rejected, etc.
 */

import { Networks } from "@stellar/stellar-sdk";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { Networks as KitNetworks } from "@creit.tech/stellar-wallets-kit/types";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

import { AppError, classifyError, walletNotFound } from "../errors";

const TESTNET_PASSPHRASE: string = Networks.TESTNET;

let initialized = false;

export interface ConnectedWallet {
  address: string;
  network: string;
  networkPassphrase: string;
}

export interface WalletOption {
  id: string;
  name: string;
  available: boolean;
  url: string;
}

function initializeWalletKit(): void {
  if (initialized) {
    return;
  }

  StellarWalletsKit.init({
    modules: [new FreighterModule(), new AlbedoModule(), new xBullModule()],
  });

  StellarWalletsKit.setNetwork(KitNetworks.TESTNET);

  initialized = true;
}

/**
 * List the wallets the kit knows about and whether each is reachable in this
 * browser, so the UI can offer install guidance before a failed connect.
 */
export async function getWalletOptions(): Promise<WalletOption[]> {
  initializeWalletKit();

  const wallets = await StellarWalletsKit.refreshSupportedWallets();

  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    available: wallet.isAvailable,
    url: wallet.url,
  }));
}

/**
 * Open the kit's wallet-selection modal and connect the chosen wallet.
 *
 * Rejects with a typed AppError: WALLET_NOT_FOUND when the chosen wallet is
 * not installed, USER_REJECTED when the user declines, WRONG_NETWORK when the
 * wallet is not on Testnet.
 */
export async function connectWallet(): Promise<ConnectedWallet> {
  initializeWalletKit();

  try {
    const { address } = await StellarWalletsKit.authModal();

    if (!address) {
      throw new AppError(
        "NOT_CONNECTED",
        "The wallet did not return an address."
      );
    }

    const { network, networkPassphrase } = await StellarWalletsKit.getNetwork();

    if (networkPassphrase && networkPassphrase !== TESTNET_PASSPHRASE) {
      await safeDisconnect();

      throw new AppError(
        "WRONG_NETWORK",
        `PromptRail requires Stellar Testnet, but the wallet is on ${
          network || "another network"
        }.`,
        "Switch the wallet to Testnet and connect again."
      );
    }

    return {
      address,
      network: network || "TESTNET",
      networkPassphrase: networkPassphrase || TESTNET_PASSPHRASE,
    };
  } catch (error) {
    throw withWalletContext(error);
  }
}

/** The network the connected wallet currently reports. */
export async function getWalletNetwork(): Promise<{
  network: string;
  networkPassphrase: string;
}> {
  initializeWalletKit();

  try {
    return await StellarWalletsKit.getNetwork();
  } catch (error) {
    throw withWalletContext(error);
  }
}

/**
 * Sign a base64 transaction envelope with the connected wallet.
 * Refuses to sign anything outside Testnet.
 */
export async function signWithWallet(
  transactionXdr: string,
  address: string
): Promise<string> {
  initializeWalletKit();

  try {
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();

    if (networkPassphrase && networkPassphrase !== TESTNET_PASSPHRASE) {
      throw new AppError(
        "WRONG_NETWORK",
        "Refusing to sign outside Stellar Testnet.",
        "Switch the wallet to Testnet and try again."
      );
    }

    const { signedTxXdr } = await StellarWalletsKit.signTransaction(
      transactionXdr,
      {
        address,
        networkPassphrase: TESTNET_PASSPHRASE,
      }
    );

    if (!signedTxXdr) {
      throw new AppError(
        "UNKNOWN",
        "The wallet did not return a signed transaction."
      );
    }

    return signedTxXdr;
  } catch (error) {
    throw withWalletContext(error);
  }
}

export async function disconnectWallet(): Promise<void> {
  initializeWalletKit();

  await safeDisconnect();
}

async function safeDisconnect(): Promise<void> {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Best-effort cleanup only.
  }
}

/** Name of the module the user picked, for error messages. */
function selectedWalletName(): string | undefined {
  try {
    return StellarWalletsKit.selectedModule?.productName;
  } catch {
    return undefined;
  }
}

function withWalletContext(error: unknown): AppError {
  const classified = classifyError(error, selectedWalletName());

  // Re-point generic not-found messages at the wallet the user actually chose.
  if (classified.kind === "WALLET_NOT_FOUND") {
    return walletNotFound(selectedWalletName());
  }

  return classified;
}
