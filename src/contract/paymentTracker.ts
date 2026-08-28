/*
 * Typed client for the deployed PromptRail Payment Tracker contract
 * (the Yellow Belt escrow contract).
 *
 * Transport lives in src/services/soroban.ts; this module only encodes
 * arguments and decodes results.
 */

import { xdr } from "@stellar/stellar-sdk";

import {
  addressArg,
  fetchEvents,
  i128Arg,
  invoke,
  simulateView,
  u32Arg,
} from "../services/soroban";

import type { InvocationResult, TxStatusListener } from "../services/soroban";

import { CONTRACTS, explorerContract } from "../config";

export { stroopsToXlm, xlmToStroops } from "../services/amounts";
export type { TxStatus, TxStatusListener } from "../services/soroban";

export const PAYMENT_TRACKER_ID = CONTRACTS.paymentTracker;

export const EXPLORER_CONTRACT_URL = explorerContract(PAYMENT_TRACKER_ID);

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
      ? (STATUS_BY_DISCRIMINANT[raw.status] ?? "Pending")
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
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Escrow a single payment. Returns the new payment id. */
export async function createPayment(
  sender: string,
  destination: string,
  amount: bigint,
  onStatus?: TxStatusListener
): Promise<InvocationResult<number>> {
  const result = await invoke<number>(
    sender,
    PAYMENT_TRACKER_ID,
    "create_payment",
    [addressArg(sender), addressArg(destination), i128Arg(amount)],
    onStatus
  );

  return { hash: result.hash, value: Number(result.value) };
}

/** Escrow one payment per recipient in a single invocation. */
export async function createBatch(
  sender: string,
  recipients: BatchRecipient[],
  onStatus?: TxStatusListener
): Promise<InvocationResult<number[]>> {
  const result = await invoke<Array<number | bigint>>(
    sender,
    PAYMENT_TRACKER_ID,
    "create_batch",
    [addressArg(sender), recipientsArg(recipients)],
    onStatus
  );

  return {
    hash: result.hash,
    value: (result.value ?? []).map(Number),
  };
}

/** Release an escrowed payment to its recipient. */
export function completePayment(
  sender: string,
  id: number,
  onStatus?: TxStatusListener
): Promise<InvocationResult<null>> {
  return invoke<null>(
    sender,
    PAYMENT_TRACKER_ID,
    "complete_payment",
    [u32Arg(id)],
    onStatus
  );
}

/** Refund an escrowed payment to its sender. */
export function cancelPayment(
  sender: string,
  id: number,
  onStatus?: TxStatusListener
): Promise<InvocationResult<null>> {
  return invoke<null>(
    sender,
    PAYMENT_TRACKER_ID,
    "cancel_payment",
    [u32Arg(id)],
    onStatus
  );
}

/** Fetch a single payment. */
export async function getPayment(
  viewer: string,
  id: number
): Promise<TrackedPayment> {
  return toTrackedPayment(
    await simulateView<RawPayment>(viewer, PAYMENT_TRACKER_ID, "get_payment", [
      u32Arg(id),
    ])
  );
}

/** Ids of payments sent by an address. */
export async function getSentIds(
  viewer: string,
  address: string
): Promise<number[]> {
  const ids = await simulateView<Array<number | bigint>>(
    viewer,
    PAYMENT_TRACKER_ID,
    "get_sent_ids",
    [addressArg(address)]
  );

  return (ids ?? []).map(Number);
}

/** Load the full payment records an address has sent, newest first. */
export async function getSentPayments(
  viewer: string,
  address: string
): Promise<TrackedPayment[]> {
  const ids = await getSentIds(viewer, address);

  const payments = await Promise.all(ids.map((id) => getPayment(viewer, id)));

  return payments.sort((a, b) => b.id - a.id);
}

/* ------------------------------------------------------------------ */
/* Contract events (tracker only — legacy shape kept for the panel)    */
/* ------------------------------------------------------------------ */

export type ContractEventKind =
  | "payment_created"
  | "payment_completed"
  | "payment_cancelled"
  | "tracker_initialized";

/** A decoded tracker event, newest-first in feeds. */
export interface ContractEventItem {
  id: string;
  kind: ContractEventKind;
  txHash: string;
  ledger: number;
  closedAt: string;
  paymentId?: number;
  amount?: bigint;
  from?: string;
  to?: string;
}

const TRACKER_EVENT_KINDS: ReadonlySet<string> = new Set([
  "payment_created",
  "payment_completed",
  "payment_cancelled",
  "tracker_initialized",
]);

/** Fetch this contract's recent events straight from Soroban RPC. */
export async function fetchContractEvents(
  limit = 10
): Promise<ContractEventItem[]> {
  const events = await fetchEvents([PAYMENT_TRACKER_ID], limit);

  const items: ContractEventItem[] = [];

  for (const event of events) {
    if (!TRACKER_EVENT_KINDS.has(event.kind)) {
      continue;
    }

    const item: ContractEventItem = {
      id: event.id,
      kind: event.kind as ContractEventKind,
      txHash: event.txHash,
      ledger: event.ledger,
      closedAt: event.closedAt,
    };

    const data = event.data as Record<string, unknown> | null;

    if (data && typeof data === "object") {
      if (data.id !== undefined) item.paymentId = Number(data.id);
      if (data.amount !== undefined)
        item.amount = BigInt(data.amount as bigint);
    }

    // from / to are topics 1 and 2 on payment events.
    if (event.topics.length >= 2) {
      item.from = String(event.topics[0]);
      item.to = String(event.topics[1]);
    }

    items.push(item);
  }

  return items;
}
