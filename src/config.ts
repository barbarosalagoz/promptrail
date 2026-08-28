/*
 * Central, env-driven configuration.
 *
 * Every deployed address and endpoint the app talks to lives here — nothing
 * else in the codebase hardcodes network facts. Values can be overridden per
 * environment via Vite env vars (see .env.example); the defaults are the
 * live Testnet deployment documented in the README.
 */

const env = import.meta.env;

export const NETWORK = {
  /** Human label shown in the UI. */
  name: "TESTNET",
  passphrase: "Test SDF Network ; September 2015",
  sorobanRpcUrl: env.VITE_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  explorerBase: "https://stellar.expert/explorer/testnet",
} as const;

export const CONTRACTS = {
  /** Yellow Belt escrow tracker. */
  paymentTracker:
    env.VITE_TRACKER_ID ??
    "CDWVMXTDTU6DJUG3BDUKI6SK72VIAVTJ44VWCL2VZ7OX5TCRRVD7HH6X",
  /** Orange Belt service catalog. */
  serviceRegistry:
    env.VITE_REGISTRY_ID ??
    "CDPCOA6EGW5KN2TFOUZ2KS5ONSM3H44ZCMHTPBPM43VMJ5PTGWJ7JJSX",
  /** Orange Belt payment router (cross-calls the registry). */
  paymentRouter:
    env.VITE_ROUTER_ID ??
    "CCQXYM6U5TVKWXI6HKEIQFBYYA7PHRDPMCZFV2NGRN4NRGQ2ELZP5YCX",
} as const;

export const explorerTx = (hash: string) => `${NETWORK.explorerBase}/tx/${hash}`;

export const explorerContract = (id: string) =>
  `${NETWORK.explorerBase}/contract/${id}`;
