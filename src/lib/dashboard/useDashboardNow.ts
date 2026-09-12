"use client";

import { useMemo, useSyncExternalStore } from "react";
import { DASHBOARD_INITIAL_CLOCK } from "@/lib/dashboard/demo-data";

const emptySubscribe = () => () => undefined;

/**
 * SSR + hydration both see `isClient === false` → shared INITIAL clock.
 * After hydration React re-reads the client snapshot (`true`) once and we
 * switch to the real local clock without an initial HTML mismatch.
 */
export function useDashboardNow(): Date {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return useMemo(() => {
    if (!isClient) {
      return DASHBOARD_INITIAL_CLOCK;
    }
    return new Date();
  }, [isClient]);
}
