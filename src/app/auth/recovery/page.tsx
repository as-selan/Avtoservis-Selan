"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** Exchange a one-time recovery credential before entering the password form. */
export default function RecoveryCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function complete() {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const code = query.get("code");
      const flowId = query.get("sb_flow_id");
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const recoveryFragment = fragment.get("type") === "recovery";

      // Remove one-time credentials from browser history before any async call.
      window.history.replaceState(null, "", "/auth/recovery");
      if (query.has("error") || (Boolean(code) === Boolean(accessToken && refreshToken))) {
        if (active) setFailed(true);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        if (active) setFailed(true);
        return;
      }

      try {
        const result = code
          ? await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
          : recoveryFragment && accessToken && refreshToken
            ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            : null;
        if (!result || result.error || !result.data.session) {
          if (active) setFailed(true);
          return;
        }
        window.location.replace("/nastavi-geslo");
      } catch {
        if (active) setFailed(true);
      }
    }
    void complete();
    return () => { active = false; };
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <div className="w-full max-w-md rounded-xl border bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Avtoservis Selan</h1>
      {failed ? <p role="alert" className="mt-3 text-sm text-red-700">
        Povezava za ponastavitev ni veljavna ali je potekla. Zahtevajte novo ponastavitev gesla.
      </p> : <p role="status" className="mt-3 text-sm">Preverjanje povezave…</p>}
    </div>
  </main>;
}
