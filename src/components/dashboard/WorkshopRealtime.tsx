"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createRefreshScheduler, REALTIME_TABLES } from "@/lib/supabase/realtime-refresh";

/** Database events invalidate server reads; payloads never become an alternate data store. */
export function WorkshopRealtime({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState("connecting");
  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!client) return;
    const scheduler = createRefreshScheduler({
      refresh: () => startTransition(() => router.refresh()),
      canRefresh: () => document.visibilityState === "visible" &&
        !document.querySelector('[data-unsaved="true"]') && !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'),
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (id) => window.clearTimeout(id),
    });
    let channel = client.channel(`workshop:${organizationId}`, { config: { postgres_changes_options: { wait: true } } });
    for (const table of REALTIME_TABLES) {
      channel = channel.on("postgres_changes", {
        event: "*", schema: "public", table,
        ...(table === "service_requests" || table === "service_case_assignments"
          ? { filter: `organization_id=eq.${organizationId}` } : {}),
      }, () => scheduler.changed());
    }
    channel.subscribe((nextStatus) => {
      setStatus(nextStatus.toLowerCase());
      // Reconcile the initial subscription and reconnect gaps.
      if (nextStatus === "SUBSCRIBED") {
        scheduler.changed();
      }
    });
    const resume = () => scheduler.resume();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("focusout", resume);
    return () => {
      scheduler.dispose();
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("focusout", resume);
      void client.removeChannel(channel);
    };
  }, [organizationId, pathname, router]);
  return <span hidden data-workshop-realtime={status} />;
}
