"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
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
  );
}
