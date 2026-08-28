/*
 * Typed client for the deployed PromptRail Payment Tracker contract.
 *
 * Reads go through Soroban RPC simulation (no signing, no fees). Writes are
 * prepared against RPC, signed by Freighter, submitted, and then polled to
 * completion.
 */

import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

import { signTransaction } from "@stellar/freighter-api";

/** Deployed on Stellar Testnet. See the Smart Contract section of the README. */
export const PAYMENT_TRACKER_ID =
  "CDWVMXTDTU6DJUG3BDUKI6SK72VIAVTJ44VWCL2VZ7OX5TCRRVD7HH6X";

export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

export const EXPLORER_CONTRACT_URL = `https://stellar.expert/explorer/testnet/contract/${PAYMENT_TRACKER_ID}`;

const STROOPS_PER_XLM = 10_000_000n;

/** Inclusion fee. `prepareTransaction` adds the Soroban resource fee on top. */
const INCLUSION_FEE = String(Number(BASE_FEE) * 100);

const server = new rpc.Server(SOROBAN_RPC_URL);

export type PaymentStatus = "Pending" | "Completed" | "Cancelled";

const STATUS_BY_DISCRIMINANT: PaymentStatus[] = [
  "Pending",
  "Completed",
  "Cancelled",
];

export interface TrackedPayment {
  id: number;
  from: string;
  to: string;
  amount: bigint;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface BatchRecipient {
  destination: string;
  amount: bigint;
}

/*
 * Contract error codes, mirrored from contracts/payment-tracker/src/lib.rs.
 * Simulation failures surface as "Error(Contract, #N)"; map N back to
 * something a person can read.
 */
const CONTRACT_ERRORS: Record<number, string> = {
  1: "The contract has already been initialized.",
  2: "The contract has no settlement token configured.",
  3: "Amount must be greater than zero.",
  4: "No payment exists with that id.",
  5: "That payment is already completed or cancelled.",
  6: "Add at least one recipient.",
  7: "Too many recipients in a single batch (max 100).",
  8: "Sender and recipient cannot be the same address.",
};

function describeContractError(raw: string): string {
  const match = raw.match(/Error\(Contract,\s*#(\d+)\)/);

  if (match) {
    const code = Number(match[1]);
    return CONTRACT_ERRORS[code] ?? `Contract rejected the call (error #${code}).`;
  }

  return raw;
}

/* ------------------------------------------------------------------ */
/* Amount helpers                                                      */
/* ------------------------------------------------------------------ */

/** Parse a user-entered XLM amount into stroops. */
export function xlmToStroops(value: string): bigint {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error(
      "Enter a positive amount with up to 7 decimal places."
    );
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const stroops =
    BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, "0"));

  if (stroops <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return stroops;
}

/** Render stroops as a trimmed XLM string. */
export function stroopsToXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;

  const whole = absolute / STROOPS_PER_XLM;
  const fraction = (absolute % STROOPS_PER_XLM)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");

  const rendered = fraction ? `${whole}.${fraction}` : `${whole}`;

  return negative ? `-${rendered}` : rendered;
}

/* ------------------------------------------------------------------ */
/* Argument encoding                                                   */
/* ------------------------------------------------------------------ */

const addressArg = (value: string): xdr.ScVal =>
  new Address(value).toScVal();

const i128Arg = (value: bigint): xdr.ScVal =>
  nativeToScVal(value, { type: "i128" });

const u32Arg = (value: number): xdr.ScVal =>
  nativeToScVal(value, { type: "u32" });

/** Encode `Vec<(Address, i128)>` for `create_batch`. */
const recipientsArg = (recipients: BatchRecipient[]): xdr.ScVal =>
  xdr.ScVal.scvVec(
    recipients.map((recipient) =>
      xdr.ScVal.scvVec([
        addressArg(recipient.destination),
        i128Arg(recipient.amount),
      ])
    )
  );

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function buildInvocation(
  source: Awaited<ReturnType<typeof server.getAccount>>,
  method: string,
  args: xdr.ScVal[]
) {
  return new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(PAYMENT_TRACKER_ID).call(method, ...args))
    .setTimeout(60)
    .build();
}

/**
 * Run a read-only view through simulation.
 *
 * `sourceAddress` is only used to build a well-formed transaction envelope;
 * nothing is signed, submitted, or charged.
 */
async function simulateView<T>(
  sourceAddress: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<T> {
  const account = await server.getAccount(sourceAddress);
  const simulation = await server.simulateTransaction(
    buildInvocation(account, method, args)
  );

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(describeContractError(simulation.error));
  }

  if (!simulation.result?.retval) {
    throw new Error(`The contract returned no value from ${method}.`);
  }

  return scValToNative(simulation.result.retval) as T;
}

export interface InvocationResult<T> {
  hash: string;
  value: T;
}

/**
 * Prepare, sign with Freighter, submit, and await a state-changing call.
 */
async function invoke<T>(
  sourceAddress: string,
  method: string,
  args: xdr.ScVal[]
): Promise<InvocationResult<T>> {
  const account = await server.getAccount(sourceAddress);

  /*
   * `prepareTransaction` simulates the call, attaches the resulting
   * authorization entries and Soroban resource footprint, and raises the fee
   * to cover them.
   */
  let prepared;

  try {
    prepared = await server.prepareTransaction(
      buildInvocation(account, method, args)
    );
  } catch (error) {
    throw new Error(
      describeContractError(
        error instanceof Error ? error.message : String(error)
      ),
      { cause: error }
    );
  }

  const signed = await signTransaction(prepared.toEnvelope().toXdr("base64"), {
    networkPassphrase: Networks.TESTNET,
    address: sourceAddress,
  });

  if (signed.error) {
    throw new Error(signed.error.message ?? "Freighter rejected the request.");
  }

  if (!signed.signedTxXdr) {
    throw new Error("Freighter did not return a signed transaction.");
  }

  const sent = await server.sendTransaction(
    TransactionBuilder.fromXdr(signed.signedTxXdr, Networks.TESTNET)
  );

  if (sent.status === "ERROR") {
    throw new Error("Stellar rejected the transaction.");
  }

  const confirmed = await waitForTransaction(sent.hash);

  return {
    hash: sent.hash,
    value: (confirmed.returnValue
      ? scValToNative(confirmed.returnValue)
      : null) as T,
  };
}

/** Poll RPC until the transaction leaves the NOT_FOUND state. */
async function waitForTransaction(hash: string) {
  const deadline = Date.now() + 45_000;

  for (;;) {
    const result = await server.getTransaction(hash);

    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return result;
    }

    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(
        `The transaction failed on-chain (${hash.slice(0, 8)}...).`
      );
    }

    if (Date.now() > deadline) {
      throw new Error(
        "Timed out waiting for confirmation. Check the explorer for the final status."
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

interface RawPayment {
  id: number;
  from: string;
  to: string;
  amount: bigint;
  status: number | string;
  created_at: bigint | number;
  updated_at: bigint | number;
}

function toTrackedPayment(raw: RawPayment): TrackedPayment {
  /*
   * A unit enum decodes to its discriminant. Accept a string too, so the UI
   * keeps working if the encoding ever changes.
   */
  const status =
    typeof raw.status === "number"
      ? STATUS_BY_DISCRIMINANT[raw.status] ?? "Pending"
      : (raw.status as PaymentStatus);

  return {
    id: Number(raw.id),
    from: raw.from,
    to: raw.to,
    amount: BigInt(raw.amount),
    status,
    createdAt: Number(raw.created_at),
    updatedAt: Number(raw.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Escrow a single payment. Returns the new payment id. */
export async function createPayment(
  sender: string,
  destination: string,
  amount: bigint
): Promise<InvocationResult<number>> {
  const result = await invoke<number>(sender, "create_payment", [
    addressArg(sender),
    addressArg(destination),
    i128Arg(amount),
  ]);

  return { hash: result.hash, value: Number(result.value) };
}

/** Escrow one payment per recipient in a single invocation. */
export async function createBatch(
  sender: string,
  recipients: BatchRecipient[]
): Promise<InvocationResult<number[]>> {
  const result = await invoke<Array<number | bigint>>(sender, "create_batch", [
    addressArg(sender),
    recipientsArg(recipients),
  ]);

  return {
    hash: result.hash,
    value: (result.value ?? []).map(Number),
  };
}

/** Release an escrowed payment to its recipient. */
export function completePayment(
  sender: string,
  id: number
): Promise<InvocationResult<null>> {
  return invoke<null>(sender, "complete_payment", [u32Arg(id)]);
}

/** Refund an escrowed payment to its sender. */
export function cancelPayment(
  sender: string,
  id: number
): Promise<InvocationResult<null>> {
  return invoke<null>(sender, "cancel_payment", [u32Arg(id)]);
}

/** Fetch a single payment. */
export async function getPayment(
  viewer: string,
  id: number
): Promise<TrackedPayment> {
  return toTrackedPayment(
    await simulateView<RawPayment>(viewer, "get_payment", [u32Arg(id)])
  );
}

/** Total number of payments the contract has ever created. */
export async function getPaymentCount(viewer: string): Promise<number> {
  return Number(await simulateView<number | bigint>(viewer, "get_payment_count"));
}

/** Ids of payments sent by an address. */
export async function getSentIds(
  viewer: string,
  address: string
): Promise<number[]> {
  const ids = await simulateView<Array<number | bigint>>(viewer, "get_sent_ids", [
    addressArg(address),
  ]);

  return (ids ?? []).map(Number);
}

/** Ids of payments received by an address. */
export async function getReceivedIds(
  viewer: string,
  address: string
): Promise<number[]> {
  const ids = await simulateView<Array<number | bigint>>(
    viewer,
    "get_received_ids",
    [addressArg(address)]
  );

  return (ids ?? []).map(Number);
}

/**
 * Load the full payment records an address has sent, newest first.
 */
export async function getSentPayments(
  viewer: string,
  address: string
): Promise<TrackedPayment[]> {
  const ids = await getSentIds(viewer, address);

  const payments = await Promise.all(
    ids.map((id) => getPayment(viewer, id))
  );

  return payments.sort((a, b) => b.id - a.id);
}
