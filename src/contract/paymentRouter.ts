/*
 * Typed client for the deployed Payment Router contract.
 *
 * pay_for_service is where the on-chain cross-contract call happens: the
 * router resolves the service from the registry inside its own invocation.
 */

import { addressArg, invoke, simulateView, u32Arg } from "../services/soroban";

import type { InvocationResult, TxStatusListener } from "../services/soroban";

import { CONTRACTS } from "../config";

export const ROUTER_ID = CONTRACTS.paymentRouter;

export interface Receipt {
  id: number;
  payer: string;
  serviceId: number;
  provider: string;
  amount: bigint;
  timestamp: number;
}

interface RawReceipt {
  id: number | bigint;
  payer: string;
  service_id: number | bigint;
  provider: string;
  amount: bigint;
  timestamp: bigint | number;
}

function toReceipt(raw: RawReceipt): Receipt {
  return {
    id: Number(raw.id),
    payer: raw.payer,
    serviceId: Number(raw.service_id),
    provider: raw.provider,
    amount: BigInt(raw.amount),
    timestamp: Number(raw.timestamp),
  };
}

/**
 * Pay for a registered service. The router cross-calls the registry, moves
 * the price from the payer to the provider's payout address, and returns the
 * receipt id.
 */
export async function payForService(
  payer: string,
  serviceId: number,
  onStatus?: TxStatusListener
): Promise<InvocationResult<number>> {
  const result = await invoke<number | bigint>(
    payer,
    ROUTER_ID,
    "pay_for_service",
    [addressArg(payer), u32Arg(serviceId)],
    onStatus,
    "router"
  );

  return { hash: result.hash, value: Number(result.value) };
}

/** Fetch one receipt. */
export async function getReceipt(viewer: string, id: number): Promise<Receipt> {
  const raw = await simulateView<RawReceipt>(
    viewer,
    ROUTER_ID,
    "get_receipt",
    [u32Arg(id)],
    "router"
  );

  return toReceipt(raw);
}

/** Total number of receipts ever recorded. */
export async function getReceiptCount(viewer: string): Promise<number> {
  return Number(
    await simulateView<number | bigint>(
      viewer,
      ROUTER_ID,
      "get_receipt_count",
      [],
      "router"
    )
  );
}

/** Full receipt records paid by an address, newest first. */
export async function getPayerReceipts(
  viewer: string,
  payer: string
): Promise<Receipt[]> {
  const ids = await simulateView<Array<number | bigint>>(
    viewer,
    ROUTER_ID,
    "get_payer_receipts",
    [addressArg(payer)],
    "router"
  );

  const receipts = await Promise.all(
    (ids ?? []).map((id) => getReceipt(viewer, Number(id)))
  );

  return receipts.sort((a, b) => b.id - a.id);
}
