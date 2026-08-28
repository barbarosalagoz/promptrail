import { fetchEvents } from "../services/soroban";

import { stroopsToXlm } from "../services/amounts";

import { REGISTRY_ID } from "../contract/serviceRegistry";
import { ROUTER_ID } from "../contract/paymentRouter";

import { usePollingData } from "./usePollingData";

import type { PollingData } from "./usePollingData";

const POLL_INTERVAL_MS = 8_000;

export interface ActivityItem {
  id: string;
  /** Raw event symbol, e.g. "service_paid". */
  kind: string;
  /** Human-readable one-liner, e.g. "Paid 5 XLM for service #0". */
  label: string;
  txHash: string;
  ledger: number;
  closedAt: string;
}

const shorten = (address: unknown) => {
  const value = String(address ?? "");
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
};

/**
 * Turn a decoded registry/router event into a human-readable line. Exported
 * for tests.
 */
export function describeEvent(
  kind: string,
  data: Record<string, unknown> | null,
  topics: unknown[]
): string | null {
  const id = data?.id !== undefined ? Number(data.id) : undefined;
  const name = data?.name !== undefined ? String(data.name) : undefined;
  const price =
    data?.price !== undefined ? stroopsToXlm(BigInt(data.price as bigint)) : undefined;

  switch (kind) {
    case "service_registered":
      return `Service #${id} "${name}" registered at ${price} XLM by ${shorten(topics[0])}`;
    case "service_updated":
      return `Service #${id} updated: "${name}" now ${price} XLM`;
    case "service_deactivated":
      return `Service #${id} deactivated by ${shorten(topics[0])}`;
    case "service_paid": {
      const amount =
        data?.amount !== undefined
          ? stroopsToXlm(BigInt(data.amount as bigint))
          : "?";
      const serviceId =
        data?.service_id !== undefined ? Number(data.service_id) : "?";
      return `${shorten(topics[0])} paid ${amount} XLM for service #${serviceId}`;
    }
    default:
      return null;
  }
}

/**
 * A merged, human-readable feed of the registry's and the router's on-chain
 * events, newest first, kept fresh by polling Soroban RPC.
 */
export function useActivityFeed(paused = false): PollingData<ActivityItem[]> {
  return usePollingData(
    async () => {
      const events = await fetchEvents([REGISTRY_ID, ROUTER_ID], 12);

      const items: ActivityItem[] = [];

      for (const event of events) {
        const label = describeEvent(
          event.kind,
          (event.data as Record<string, unknown> | null) ?? null,
          event.topics
        );

        if (!label) {
          continue;
        }

        items.push({
          id: event.id,
          kind: event.kind,
          label,
          txHash: event.txHash,
          ledger: event.ledger,
          closedAt: event.closedAt,
        });
      }

      return items;
    },
    POLL_INTERVAL_MS,
    paused
  );
}
