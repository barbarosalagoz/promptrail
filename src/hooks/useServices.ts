import { listActiveServices } from "../contract/serviceRegistry";

import type { Service } from "../contract/serviceRegistry";

import { usePollingData } from "./usePollingData";

import type { PollingData } from "./usePollingData";

const POLL_INTERVAL_MS = 8_000;

/** Active services from the on-chain registry, kept fresh by polling. */
export function useServices(
  viewer: string,
  paused = false
): PollingData<Service[]> {
  return usePollingData(
    () => listActiveServices(viewer, 0, 20),
    POLL_INTERVAL_MS,
    paused
  );
}
