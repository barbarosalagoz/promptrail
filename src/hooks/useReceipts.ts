import { getPayerReceipts } from "../contract/paymentRouter";

import type { Receipt } from "../contract/paymentRouter";

import { usePollingData } from "./usePollingData";

import type { PollingData } from "./usePollingData";

const POLL_INTERVAL_MS = 8_000;

/** The connected wallet's payment receipts, kept fresh by polling. */
export function useReceipts(
  viewer: string,
  paused = false
): PollingData<Receipt[]> {
  return usePollingData(
    () => getPayerReceipts(viewer, viewer),
    POLL_INTERVAL_MS,
    paused
  );
}
