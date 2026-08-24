import {
  Client,
  networks,
  type Endpoint,
} from "promptrail_registry";

const RPC_URL =
  "https://soroban-testnet.stellar.org";

export const REGISTRY_CONTRACT_ID =
  networks.testnet.contractId;

const registryClient = new Client({
  ...networks.testnet,
  rpcUrl: RPC_URL,
});

export async function getRegistryEntry(
  owner: string,
): Promise<Endpoint | null> {
  const cleanOwner = owner.trim();

  if (!cleanOwner) {
    throw new Error(
      "A Stellar wallet address is required.",
    );
  }

  try {
    const transaction =
      await registryClient.get({
        owner: cleanOwner,
      });

    /*
     * get() is intentionally read-only.
     * Refuse to continue if the simulated
     * call unexpectedly requires a write.
     */
    if (!transaction.isReadCall) {
      throw new Error(
        "Registry get() unexpectedly requested a state-changing transaction.",
      );
    }

    /*
     * The generated binding returns:
     *
     * Result<Endpoint, ErrorMessage>
     *
     * unwrap() gives us Endpoint when the
     * Soroban Result is Ok.
     *
     * If it is Err, unwrap() throws and the
     * catch block below handles it.
     */
    const endpoint =
      transaction.result.unwrap();

    return endpoint;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    /*
     * RegistryError::EndpointNotFound = 4
     *
     * A missing entry is a normal application
     * state rather than a frontend crash.
     */
    if (
      message.includes(
        "EndpointNotFound",
      ) ||
      message.includes(
        "Error(Contract, #4)",
      ) ||
      message.includes(
        "ContractError(4)",
      )
    ) {
      return null;
    }

    throw error;
  }
}