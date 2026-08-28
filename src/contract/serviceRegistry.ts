/*
 * Typed client for the deployed Service Registry contract.
 */

import {
  addressArg,
  i128Arg,
  invoke,
  simulateView,
  stringArg,
  u32Arg,
} from "../services/soroban";

import type { InvocationResult, TxStatusListener } from "../services/soroban";

import { CONTRACTS } from "../config";

export const REGISTRY_ID = CONTRACTS.serviceRegistry;

export interface Service {
  id: number;
  provider: string;
  name: string;
  /** Price in stroops of the settlement token. */
  price: bigint;
  payoutAddress: string;
  active: boolean;
}

interface RawService {
  id: number | bigint;
  provider: string;
  name: string;
  price: bigint;
  payout_address: string;
  active: boolean;
}

function toService(raw: RawService): Service {
  return {
    id: Number(raw.id),
    provider: raw.provider,
    name: raw.name,
    price: BigInt(raw.price),
    payoutAddress: raw.payout_address,
    active: raw.active,
  };
}

/** Page through the active services. */
export async function listActiveServices(
  viewer: string,
  offset = 0,
  limit = 20
): Promise<Service[]> {
  const raw = await simulateView<RawService[]>(
    viewer,
    REGISTRY_ID,
    "list_active",
    [u32Arg(offset), u32Arg(limit)],
    "registry"
  );

  return (raw ?? []).map(toService);
}

/** Fetch one service (active or not). */
export async function getService(viewer: string, id: number): Promise<Service> {
  const raw = await simulateView<RawService>(
    viewer,
    REGISTRY_ID,
    "get_service",
    [u32Arg(id)],
    "registry"
  );

  return toService(raw);
}

/** Total number of services ever registered. */
export async function getServiceCount(viewer: string): Promise<number> {
  return Number(
    await simulateView<number | bigint>(
      viewer,
      REGISTRY_ID,
      "get_service_count",
      [],
      "registry"
    )
  );
}

/** Register a new service. Provider-authorized; returns the new id. */
export async function registerService(
  provider: string,
  name: string,
  price: bigint,
  payoutAddress: string,
  onStatus?: TxStatusListener
): Promise<InvocationResult<number>> {
  const result = await invoke<number | bigint>(
    provider,
    REGISTRY_ID,
    "register_service",
    [addressArg(provider), stringArg(name), i128Arg(price), addressArg(payoutAddress)],
    onStatus,
    "registry"
  );

  return { hash: result.hash, value: Number(result.value) };
}

/** Take a service off the market. Provider only. */
export function deactivateService(
  provider: string,
  id: number,
  onStatus?: TxStatusListener
): Promise<InvocationResult<null>> {
  return invoke<null>(
    provider,
    REGISTRY_ID,
    "deactivate_service",
    [u32Arg(id)],
    onStatus,
    "registry"
  );
}
