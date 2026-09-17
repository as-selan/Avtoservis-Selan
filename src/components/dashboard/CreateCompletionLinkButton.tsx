"use client";

import { useState } from "react";
import { issueCompletionLinkAction } from "@/lib/completion/actions";

export function CreateCompletionLinkButton({
  serviceRequestId,
  compact = false,
}: {
  serviceRequestId: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreate() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const result = await issueCompletionLinkAction(serviceRequestId);
      if (!result.ok) {
        setUrl(null);
        setError(result.message);
        return;
      }
      setUrl(result.url);
    } finally {
      setPending(false);
    }
  }

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={compact ? "mt-3 space-y-2" : "space-y-2"}>
      <button
        type="button"
        onClick={() => void onCreate()}
        disabled={pending}
        className={
          compact
            ? "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            : "inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {pending ? "Ustvarjam…" : "Ustvari povezavo za dopolnitev"}
      </button>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {url ? (
        <div className="space-y-1">
          <label className="block">
            <span className="sr-only">Povezava za dopolnitev</span>
            <input
              readOnly
              value={url}
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            {copied ? "Kopirano" : "Kopiraj povezavo"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
