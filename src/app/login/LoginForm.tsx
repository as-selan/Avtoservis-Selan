"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginAction, type LoginState } from "./actions";
import { authLinkRedirectTarget, recoveryCodeRedirectTarget } from "./recovery-link";

const initialState: LoginState = { error: null };

export function LoginForm({ signedIn }: { signedIn: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);

  useEffect(() => {
    const target = authLinkRedirectTarget(window.location.hash) ?? recoveryCodeRedirectTarget(window.location.search);
    if (target) {
      window.location.replace(target);
    } else if (signedIn) {
      window.location.replace("/dashboard");
    }
  }, [signedIn]);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryPending) return;
    setRecoveryPending(true);
    setRecoveryUnavailable(false);
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setRecoveryUnavailable(true);
      setRecoveryPending(false);
      return;
    }
    try {
      // The dedicated callback exchanges either a session fragment or PKCE code.
      // Supabase's redirect allowlist must include this exact application URL.
      await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/recovery`,
      });
      // The response must not disclose whether the address has an account.
      setRecoveryRequested(true);
    } catch {
      setRecoveryUnavailable(true);
    } finally {
      setRecoveryPending(false);
    }
  }

  if (forgotPassword) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Ponastavitev gesla</h2>
        <p className="text-sm text-slate-600">Vnesite e-poštni naslov svojega povabljenega računa.</p>
        {recoveryRequested ? (
          <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Če račun obstaja, smo poslali navodila za ponastavitev gesla.
          </p>
        ) : (
          <form onSubmit={requestRecovery} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="recovery-email" className="block text-sm font-medium text-slate-800">E-pošta</label>
              <input id="recovery-email" type="email" autoComplete="email" required value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2" />
            </div>
            {recoveryUnavailable ? <p role="alert" className="text-sm text-red-600">Zahteve trenutno ni mogoče poslati. Poskusite pozneje.</p> : null}
            <button type="submit" disabled={recoveryPending}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-70">
              {recoveryPending ? "Pošiljanje…" : "Pošlji navodila"}
            </button>
          </form>
        )}
        <button type="button" onClick={() => { setForgotPassword(false); setRecoveryRequested(false); }}
          className="text-sm font-medium text-blue-700 hover:underline">Nazaj na prijavo</button>
      </div>
    );
  }

  return (
    <div className="space-y-4"><form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-slate-800">
          E-pošta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-800"
        >
          Geslo
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Prijava…" : "Prijava"}
      </button>
    </form>
      <button type="button" onClick={() => setForgotPassword(true)}
        className="text-sm font-medium text-blue-700 hover:underline">Pozabljeno geslo</button>
    </div>
  );
}
