import {
  Networks,
  StrKey,
} from "@stellar/stellar-sdk";

import {
  Client,
  networks,
  type Endpoint,
} from "promptrail_registry";

import {
  getConnectedWallet,
  PromptRailWalletError,
  signTransaction as signWalletTransaction,
} from "./wallet";

const RPC_URL =
  "https://soroban-testnet.stellar.org";

const MAX_NAME_BYTES = 80;

const MAX_PRICE_STROOPS =
  1_000_000_000_000n;

export const REGISTRY_CONTRACT_ID =
  networks.testnet.contractId;

export type RegistryTxStatus =
  | "IDLE"
  | "PREPARING"
  | "AWAITING_SIGNATURE"
  | "PENDING"
  | "SUCCESS"
  | "FAILED";

export interface RegisterRegistryInput {
  owner: string;
  name: string;
  priceStroops: bigint;
  onStatus?: (
    status: RegistryTxStatus,
  ) => void;
}

export interface RegisterRegistryResult {
  endpoint: Endpoint;
  hash: string;
}

const readClient = new Client({
  ...networks.testnet,
  rpcUrl: RPC_URL,
});

function bytesToHex(
  bytes: Uint8Array,
): string {
  return Array.from(
    bytes,
    (byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
  ).join("");
}

function validateOwner(
  owner: string,
): void {
  if (
    !StrKey.isValidEd25519PublicKey(
      owner,
    )
  ) {
    throw new Error(
      "A valid Stellar G... owner address is required.",
    );
  }
}

function validateName(
  name: string,
): void {
  if (!name) {
    throw new Error(
      "API name cannot be empty.",
    );
  }

  const byteLength =
    new TextEncoder().encode(
      name,
    ).length;

  if (
    byteLength >
    MAX_NAME_BYTES
  ) {
    throw new Error(
      "API name cannot exceed 80 UTF-8 bytes.",
    );
  }
}

function validatePrice(
  price: bigint,
): void {
  if (price <= 0n) {
    throw new Error(
      "API price must be greater than 0 stroops.",
    );
  }

  if (
    price >
    MAX_PRICE_STROOPS
  ) {
    throw new Error(
      "API price exceeds the PromptRail Registry limit.",
    );
  }
}

function normalizeRegistryError(
  error: unknown,
): Error {
  if (
    error instanceof
    PromptRailWalletError
  ) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (
    message.includes(
      "EndpointExists",
    ) ||
    message.includes(
      "ContractError(5)",
    ) ||
    message.includes(
      "Error(Contract, #5)",
    )
  ) {
    return new Error(
      "This wallet already has a PromptRail Registry entry.",
    );
  }

  if (
    message.includes(
      "EmptyName",
    ) ||
    message.includes(
      "ContractError(1)",
    )
  ) {
    return new Error(
      "API name cannot be empty.",
    );
  }

  if (
    message.includes(
      "NameTooLong",
    ) ||
    message.includes(
      "ContractError(2)",
    )
  ) {
    return new Error(
      "API name is too long.",
    );
  }

  if (
    message.includes(
      "InvalidPrice",
    ) ||
    message.includes(
      "ContractError(3)",
    )
  ) {
    return new Error(
      "The Registry rejected the API price.",
    );
  }

  if (
    message.includes(
      "Unauthorized",
    ) ||
    message.includes(
      "ContractError(6)",
    )
  ) {
    return new Error(
      "The connected wallet is not authorized for this Registry operation.",
    );
  }

  if (
    message
      .toLowerCase()
      .includes(
        "insufficient",
      ) ||
    message.includes(
      "tx_insufficient_balance",
    ) ||
    message.includes(
      "op_underfunded",
    )
  ) {
    return new Error(
      "Insufficient Testnet XLM to pay the Soroban transaction fee.",
    );
  }

  return error instanceof Error
    ? error
    : new Error(message);
}

export async function getRegistryEntry(
  owner: string,
): Promise<Endpoint | null> {
  const cleanOwner =
    owner.trim();

  validateOwner(
    cleanOwner,
  );

  try {
    const transaction =
      await readClient.get({
        owner: cleanOwner,
      });

    /*
     * Security invariant:
     * get() must remain read-only.
     */
    if (
      !transaction.isReadCall
    ) {
      throw new Error(
        "Registry get() unexpectedly requested a state-changing transaction.",
      );
    }

    return transaction.result.unwrap();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    /*
     * EndpointNotFound = RegistryError #4.
     * This is a normal application state.
     */
    if (
      message.includes(
        "EndpointNotFound",
      ) ||
      message.includes(
        "ContractError(4)",
      ) ||
      message.includes(
        "Error(Contract, #4)",
      )
    ) {
      return null;
    }

    throw normalizeRegistryError(
      error,
    );
  }
}

export async function registerRegistryEntry(
  input: RegisterRegistryInput,
): Promise<RegisterRegistryResult> {
  const owner =
    input.owner.trim();

  const name =
    input.name.trim();

  const price =
    input.priceStroops;

  const setStatus = (
    status: RegistryTxStatus,
  ) => {
    input.onStatus?.(
      status,
    );
  };

  setStatus(
    "PREPARING",
  );

  try {
    validateOwner(owner);
    validateName(name);
    validatePrice(price);

    /*
     * Security:
     * Re-read the active wallet immediately
     * before building the Soroban transaction.
     */
    const connected =
      await getConnectedWallet();

    if (
      connected
        .networkPassphrase !==
      Networks.TESTNET
    ) {
      throw new PromptRailWalletError(
        "WRONG_NETWORK",
        "PromptRail Registry writes are restricted to Stellar Testnet.",
      );
    }

    if (
      connected.address !==
      owner
    ) {
      throw new PromptRailWalletError(
        "NOT_CONNECTED",
        "The active wallet account changed. Reconnect before registering.",
      );
    }

    /*
     * SEP-43 compatible signing callback.
     * Private keys remain inside the wallet.
     */
    const walletSigner =
      async (
        transactionXdr: string,
      ) => {
        const signedTxXdr =
          await signWalletTransaction(
            transactionXdr,
            owner,
          );

        return {
          signedTxXdr,
          signerAddress:
            owner,
        };
      };

    /*
     * A write client must use the connected
     * G-account as transaction source.
     */
    const writeClient =
      new Client({
        ...networks.testnet,

        rpcUrl:
          RPC_URL,

        publicKey:
          owner,

        signTransaction:
          walletSigner,
      });

    /*
     * Builds + simulates register().
     */
    const transaction =
      await writeClient.register(
        {
          owner,
          name,
          price,
        },
        {
          timeoutInSeconds:
            30,
        },
      );

    /*
     * A contract Result::Err is still a valid
     * simulation response, so unwrap BEFORE
     * asking the wallet to sign.
     */
    const simulatedEndpoint =
      transaction
        .result
        .unwrap();

    /*
     * register() must cause a state write.
     */
    if (
      transaction.isReadCall
    ) {
      throw new Error(
        "Registry register() unexpectedly produced a read-only transaction.",
      );
    }

    /*
     * owner is also the transaction source,
     * therefore require_auth() should not
     * require another G-account auth entry.
     */
    const additionalSigners =
      transaction
        .needsNonInvokerSigningBy();

    if (
      additionalSigners.length >
      0
    ) {
      throw new Error(
        `Unexpected additional authorization required: ${additionalSigners.join(", ")}`,
      );
    }

    /*
     * Verify the simulated return value matches
     * exactly what PromptRail intended to write.
     */
    if (
      simulatedEndpoint.owner !==
        owner ||
      simulatedEndpoint.name !==
        name ||
      simulatedEndpoint.price !==
        price ||
      simulatedEndpoint.active !==
        true
    ) {
      throw new Error(
        "Registry simulation returned unexpected endpoint data.",
      );
    }

    setStatus(
      "AWAITING_SIGNATURE",
    );

    /*
     * Wallet popup happens here.
     */
    await transaction.sign();

    if (
      !transaction.signed
    ) {
      throw new Error(
        "The wallet did not produce a signed Registry transaction.",
      );
    }

    /*
     * Hash is computed from the exact signed
     * envelope that will be submitted.
     */
    const hash =
      bytesToHex(
        transaction
          .signed
          .hash(),
      );

    setStatus(
      "PENDING",
    );

    /*
     * Submit through Stellar RPC.
     * SentTransaction waits/polls for the
     * finalized network outcome.
     */
    const sent =
      await transaction.send();

    const endpoint =
      sent.result.unwrap();

    /*
     * Verify finalized result again.
     */
    if (
      endpoint.owner !==
        owner ||
      endpoint.name !==
        name ||
      endpoint.price !==
        price
    ) {
      throw new Error(
        "Final Registry result did not match the submitted endpoint.",
      );
    }

    setStatus(
      "SUCCESS",
    );

    return {
      endpoint,
      hash,
    };
  } catch (error) {
    setStatus(
      "FAILED",
    );

    throw normalizeRegistryError(
      error,
    );
  }
}