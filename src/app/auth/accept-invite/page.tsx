"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Hosted Supabase's default invitation and recovery templates verify the link
// at GoTrue, then return a short-lived session in the URL fragment. Exchange
// it into our cookie-backed SSR client before rendering the password form.
export default function AcceptInvitePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function complete() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const kind = fragment.get("type");
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      // Tokens must not remain in browser history or be copied with the URL.
      window.history.replaceState(null, "", "/auth/accept-invite");
      if (!(["invite", "recovery"].includes(kind ?? "") && accessToken && refreshToken)) {
        if (active) setFailed(true);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        if (active) setFailed(true);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: accessToken, refresh_token: refreshToken,
      });
      if (error) {
        if (active) setFailed(true);
        return;
      }
      window.location.replace("/nastavi-geslo");
    }
    void complete();
    return () => { active = false; };
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <div className="w-full max-w-md rounded-xl border bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Avtoservis Selan</h1>
      {failed ? <p role="alert" className="mt-3 text-sm text-red-700">
        Povezava ni veljavna ali je potekla. Zahtevajte novo povabilo oziroma ponastavitev gesla.
      </p> : <p role="status" className="mt-3 text-sm">Preverjanje povezave…</p>}
    </div>
  </main>;
}
