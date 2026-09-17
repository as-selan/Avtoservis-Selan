"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { IntakeMissingField } from "@/lib/intake/types";
import {
  COMPLETION_API_PATH,
  COMPLETION_COMPLETED_MESSAGE,
  COMPLETION_UNAVAILABLE_MESSAGE,
} from "@/lib/completion/constants";
import {
  sanitizeCompletionPublicResponse,
  type CompletionPublicResponse,
} from "@/lib/completion/public";
import { readCompletionTokenFromHash } from "@/lib/completion/url";
import { validateCompletionFields } from "@/lib/completion/validate";

const FIELD_LABELS: Record<IntakeMissingField, string> = {
  phone: "Telefon",
  email: "E-pošta",
  vin: "VIN",
  make: "Znamka",
  model: "Model",
};

type FormState = {
  phone: string;
  email: string;
  vin: string;
  make: string;
  model: string;
};

const EMPTY_FORM: FormState = {
  phone: "",
  email: "",
  vin: "",
  make: "",
  model: "",
};

type UiState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "completed" }
  | { kind: "form"; missing: IntakeMissingField[]; notice: string | null };

async function callCompletionApi(
  token: string,
  body: Record<string, unknown>,
): Promise<CompletionPublicResponse> {
  try {
    const response = await fetch(COMPLETION_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json().catch(() => null);
    return sanitizeCompletionPublicResponse(json);
  } catch {
    return sanitizeCompletionPublicResponse(null);
  }
}

function scrubTokenFragmentFromUrl(): void {
  if (!window.location.hash) return;
  const pathAndQuery = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(
    window.history.state,
    "",
    pathAndQuery || "/dopolnitev",
  );
}

export function CompletionClient() {
  const tokenRef = useRef<string | null>(null);
  const [ui, setUi] = useState<UiState>({ kind: "loading" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, setPending] = useState(false);

  const missingSet = useMemo(() => {
    if (ui.kind !== "form") return new Set<IntakeMissingField>();
    return new Set(ui.missing);
  }, [ui]);

  useEffect(() => {
    function applyHash() {
      const tokenFromHash = readCompletionTokenFromHash(window.location.hash);
      if (tokenFromHash) {
        tokenRef.current = tokenFromHash;
        scrubTokenFragmentFromUrl();
      } else if (!tokenRef.current) {
        setUi({ kind: "unavailable" });
        return;
      } else {
        // Fragment already scrubbed; keep in-memory token.
        return;
      }

      const token = tokenRef.current;
      if (!token) {
        setUi({ kind: "unavailable" });
        return;
      }

      setUi({ kind: "loading" });
      void callCompletionApi(token, { action: "resolve" })
        .then((result) => {
          if (!result.ok) {
            setUi({ kind: "unavailable" });
            return;
          }
          if (result.completed) {
            setUi({ kind: "completed" });
            return;
          }
          setUi({
            kind: "form",
            missing: result.missing_fields,
            notice: null,
          });
        })
        .catch(() => {
          setUi({ kind: "unavailable" });
        });
    }

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = tokenRef.current;
    if (!token || ui.kind !== "form" || pending) return;

    const payload: Partial<FormState> = {};
    for (const field of ui.missing) {
      payload[field] = form[field];
    }

    const validated = validateCompletionFields(payload);
    if (!validated.ok) {
      setUi({
        kind: "form",
        missing: ui.missing,
        notice: "Preverite vnesena polja in poskusite znova.",
      });
      return;
    }

    setPending(true);
    try {
      const result = await callCompletionApi(token, {
        action: "submit",
        ...payload,
      });
      if (!result.ok) {
        setUi({ kind: "unavailable" });
        return;
      }
      if (result.completed) {
        setUi({ kind: "completed" });
        return;
      }
      setForm(EMPTY_FORM);
      setUi({
        kind: "form",
        missing: result.missing_fields,
        notice: result.message ?? null,
      });
    } catch {
      setUi({ kind: "unavailable" });
    } finally {
      setPending(false);
    }
  }

  if (ui.kind === "loading") {
    return (
      <p className="text-sm text-slate-600" role="status">
        Preverjam povezavo…
      </p>
    );
  }

  if (ui.kind === "unavailable") {
    return (
      <p className="text-sm text-slate-600" role="alert">
        {COMPLETION_UNAVAILABLE_MESSAGE}
      </p>
    );
  }

  if (ui.kind === "completed") {
    return (
      <p className="text-sm leading-relaxed text-slate-700" role="status">
        {COMPLETION_COMPLETED_MESSAGE}
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <p className="text-sm leading-relaxed text-slate-600">
        Izpolnite manjkajoča polja. Servis bo nato lahko pripravil ponudbo.
      </p>
      {ui.notice ? (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
          {ui.notice}
          {ui.missing.length > 0
            ? ` Še manjka: ${ui.missing.map((f) => FIELD_LABELS[f]).join(", ")}.`
            : ""}
        </p>
      ) : null}

      {missingSet.has("phone") ? (
        <label className="block text-sm font-medium text-slate-800">
          Telefon
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            autoComplete="tel"
          />
        </label>
      ) : null}
      {missingSet.has("email") ? (
        <label className="block text-sm font-medium text-slate-800">
          E-pošta
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            autoComplete="email"
          />
        </label>
      ) : null}
      {missingSet.has("vin") ? (
        <label className="block text-sm font-medium text-slate-800">
          VIN
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm uppercase"
            value={form.vin}
            onChange={(e) => setForm((p) => ({ ...p, vin: e.target.value }))}
          />
        </label>
      ) : null}
      {missingSet.has("make") ? (
        <label className="block text-sm font-medium text-slate-800">
          Znamka
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={form.make}
            onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))}
          />
        </label>
      ) : null}
      {missingSet.has("model") ? (
        <label className="block text-sm font-medium text-slate-800">
          Model
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            value={form.model}
            onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Shranjujem…" : "Pošlji podatke"}
      </button>
    </form>
  );
}
