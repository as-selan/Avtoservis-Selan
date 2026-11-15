"use client";

import { useMemo, useSyncExternalStore } from "react";

const emptySubscribe = () => () => undefined;

/**
 * SSR + first hydration use the same server `initialNowIso`.
 * After hydration, switch to the live local clock.
 * Do not call `new Date()` independently on SSR vs first client paint.
 */
export function useDashboardNow(initialNowIso: string): Date {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const initialNow = useMemo(() => {
    const parsed = new Date(initialNowIso);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid dashboard generatedAt");
    }
    return parsed;
  }, [initialNowIso]);

  return useMemo(() => {
    if (!isClient) {
      return initialNow;
    }
    return new Date();
  }, [isClient, initialNow]);
}
