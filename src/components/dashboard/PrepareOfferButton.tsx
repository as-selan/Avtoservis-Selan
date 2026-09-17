"use client";

import { useState } from "react";
import { prepareOfferAction } from "@/lib/offer-preparation/actions";
import {
  OFFER_PREP_ACTION_LABEL,
  OFFER_PREP_GENERIC_ERROR,
  OFFER_PREP_READY_NEXT_ACTION,
  OFFER_PROVIDER_UNCONFIGURED_MESSAGE,
} from "@/lib/offer-preparation/constants";

export function PrepareOfferButton({
  serviceRequestId,
  alreadyPrepared = false,
  compact = false,
}: {
  serviceRequestId: string;
  alreadyPrepared?: boolean;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [prepared, setPrepared] = useState(alreadyPrepared);
  const [error, setError] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(
    alreadyPrepared ? OFFER_PROVIDER_UNCONFIGURED_MESSAGE : null,
  );

  async function onPrepare() {
    setPending(true);
    setError(null);
    try {
      const result = await prepareOfferAction(serviceRequestId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPrepared(true);
      setProviderMessage(result.unconfiguredMessage);
    } catch {
      setError(OFFER_PREP_GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={compact ? "mt-3 space-y-2" : "space-y-2"}>
      {prepared ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-700">
            {OFFER_PREP_READY_NEXT_ACTION}
          </p>
          <p className="text-xs text-slate-600">{providerMessage}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void onPrepare()}
          disabled={pending}
          className={
            compact
              ? "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              : "inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          }
        >
          {pending ? "Pripravljam…" : OFFER_PREP_ACTION_LABEL}
        </button>
      )}
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
