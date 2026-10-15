"use client";

import {useRouter} from 'next/navigation';
import { useState } from "react";
import { prepareOfferAction } from "@/lib/offer-preparation/actions";
import {
  OFFER_PREP_ACTION_LABEL,
  OFFER_PREP_GENERIC_ERROR,
  OFFER_PREP_READY_NEXT_ACTION,
} from "@/lib/offer-preparation/constants";

export function PrepareOfferButton({
  serviceRequestId,
  alreadyPrepared = false,
  compact = false,
  providerReady,
}: {
  serviceRequestId: string;
  alreadyPrepared?: boolean;
  compact?: boolean;
  providerReady?: boolean;
}) {
  const router=useRouter();
  const [pending, setPending] = useState(false);
  const [prepared, setPrepared] = useState(alreadyPrepared);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
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
          {providerReady === false && <p className="text-xs text-slate-600">Ponudbo lahko informativno pregledate. Ustvarjanje dokumenta trenutno ni omogočeno.</p>}
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
