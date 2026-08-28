import { useCallback, useEffect, useRef, useState } from "react";

import { AppError, classifyError } from "../errors";

export interface PollingData<T> {
  /** Last successfully fetched value, kept during background refreshes. */
  data: T | null;
  /** True until the first fetch settles — drive skeletons off this. */
  loading: boolean;
  error: AppError | null;
  /** Manual refresh; shows the loading state while it runs. */
  refresh: () => Promise<void>;
}

/**
 * Fetch-and-poll for chain data.
 *
 * Runs `fetcher` immediately and then every `intervalMs`, holding the last
 * good value during background refreshes so lists don't flicker. Polling
 * pauses while `paused` is true (e.g. while the user's own transaction is in
 * flight). Stale responses from an unmounted or superseded effect are
 * dropped.
 */
export function usePollingData<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  paused = false
): PollingData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Keep the latest fetcher without retriggering the polling effect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const result = await fetcherRef.current();

      if (isActive()) {
        setData(result);
        setError(null);
      }
    } catch (raw) {
      if (isActive()) {
        setError(classifyError(raw));
      }
    } finally {
      if (isActive()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (paused) {
      return;
    }

    let active = true;

    void load(() => active);

    const interval = window.setInterval(() => {
      void load(() => active);
    }, intervalMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [load, intervalMs, paused]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(() => true);
  }, [load]);

  return { data, loading, error, refresh };
}
