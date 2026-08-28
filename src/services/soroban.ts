/*
 * Shared Soroban transport.
 *
 * The one place the app talks raw RPC: read-only views run through
 * simulation, writes are prepared, signed by the connected wallet, submitted,
 * and polled to completion, and contract events are fetched via getEvents.
 * The typed clients in src/contract/* compose these; components never touch
 * RPC directly.
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

import { signWithWallet } from "./wallet";

import { AppError, classifyError } from "../errors";
import type { ContractName } from "../errors";

import { NETWORK } from "../config";

/** Inclusion fee. `prepareTransaction` adds the Soroban resource fee on top. */
const INCLUSION_FEE = String(Number(BASE_FEE) * 100);

const server = new rpc.Server(NETWORK.sorobanRpcUrl);

/* ------------------------------------------------------------------ */
/* Argument encoding helpers                                           */
/* ------------------------------------------------------------------ */

export const addressArg = (value: string): xdr.ScVal =>
  new Address(value).toScVal();

export const i128Arg = (value: bigint): xdr.ScVal =>
  nativeToScVal(value, { type: "i128" });

export const u32Arg = (value: number): xdr.ScVal =>
  nativeToScVal(value, { type: "u32" });

export const stringArg = (value: string): xdr.ScVal =>
  nativeToScVal(value, { type: "string" });

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

function buildInvocation(
  source: Awaited<ReturnType<typeof server.getAccount>>,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
) {
  return new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
}

/**
 * Run a read-only view through simulation.
 *
 * `sourceAddress` only shapes a well-formed envelope; nothing is signed,
 * submitted, or charged.
 */
export async function simulateView<T>(
  sourceAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  contract: ContractName = "tracker"
): Promise<T> {
  const account = await server.getAccount(sourceAddress);
  const simulation = await server.simulateTransaction(
    buildInvocation(account, contractId, method, args)
  );

  if (rpc.Api.isSimulationError(simulation)) {
    throw classifyError(new Error(simulation.error), undefined, contract);
  }

  if (!simulation.result?.retval) {
    throw new AppError("UNKNOWN", `The contract returned no value from ${method}.`);
  }

  return scValToNative(simulation.result.retval) as T;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface InvocationResult<T> {
  hash: string;
  value: T;
}

/** Progress of an in-flight write, for live status indicators in the UI. */
export interface TxStatus {
  phase: "signing" | "pending";
  hash?: string;
}

export type TxStatusListener = (status: TxStatus) => void;

/**
 * Prepare, sign with the connected wallet, submit, and await a
 * state-changing call. `onStatus` fires as the transaction advances.
 */
export async function invoke<T>(
  sourceAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  onStatus?: TxStatusListener,
  contract: ContractName = "tracker"
): Promise<InvocationResult<T>> {
  const account = await server.getAccount(sourceAddress);

  let prepared;

  try {
    prepared = await server.prepareTransaction(
      buildInvocation(account, contractId, method, args)
    );
  } catch (error) {
    throw classifyError(error, undefined, contract);
  }

  onStatus?.({ phase: "signing" });

  const signedXdr = await signWithWallet(
    prepared.toEnvelope().toXdr("base64"),
    sourceAddress
  );

  const sent = await server.sendTransaction(
    TransactionBuilder.fromXdr(signedXdr, Networks.TESTNET)
  );

  if (sent.status === "ERROR") {
    throw new AppError("UNKNOWN", "Stellar rejected the transaction.");
  }

  onStatus?.({ phase: "pending", hash: sent.hash });

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
      throw new AppError(
        "UNKNOWN",
        `The transaction failed on-chain (${hash.slice(0, 8)}...).`
      );
    }

    if (Date.now() > deadline) {
      throw new AppError(
        "UNKNOWN",
        "Timed out waiting for confirmation. Check the explorer for the final status."
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** A decoded contract event, ready for the activity feed. */
export interface RawContractEvent {
  id: string;
  contractId: string;
  /** First topic as a native value — the event name symbol. */
  kind: string;
  txHash: string;
  ledger: number;
  closedAt: string;
  /** Remaining topics, decoded. */
  topics: unknown[];
  /** Event data payload, decoded (usually a map of named fields). */
  data: unknown;
}

/** How far back to scan for events (~2 hours of ledgers at ~5s each). */
const EVENT_LOOKBACK_LEDGERS = 1_500;

/**
 * Fetch recent events for any set of contracts straight from Soroban RPC,
 * newest first.
 */
export async function fetchEvents(
  contractIds: string[],
  limit = 20
): Promise<RawContractEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - EVENT_LOOKBACK_LEDGERS);

  const response = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds }],
    limit: 100,
  });

  const items: RawContractEvent[] = [];

  for (const event of response.events) {
    if (!event.topic.length) {
      continue;
    }

    let kind: unknown;

    try {
      kind = scValToNative(event.topic[0]);
    } catch {
      continue;
    }

    if (typeof kind !== "string") {
      continue;
    }

    let topics: unknown[] = [];
    let data: unknown = null;

    try {
      topics = event.topic.slice(1).map((t) => scValToNative(t));
      data = scValToNative(event.value);
    } catch {
      // Keep the event with just its kind if decoding fails.
    }

    items.push({
      id: event.id,
      contractId: event.contractId?.toString() ?? "",
      kind,
      txHash: event.txHash,
      ledger: event.ledger,
      closedAt: event.ledgerClosedAt,
      topics,
      data,
    });
  }

  return items.reverse().slice(0, limit);
}
