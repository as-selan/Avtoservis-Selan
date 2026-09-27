"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkManualQuibiEstimate } from "@/lib/quibi/manual-estimate-action";

export function LinkManualEstimateForm({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter();
  const [estimateId, setEstimateId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return <form className="space-y-2 border-t pt-3" onSubmit={(event) => {
    event.preventDefault();
    if (!confirmed || pending) return;
    startTransition(async () => {
      const result = await linkManualQuibiEstimate(serviceRequestId, estimateId.trim());
      setMessage(result.ok ? `Quibijev predračun je povezan kot različica #${result.versionNo}.` : result.message);
      if (result.ok) { setConfirmed(false); router.refresh(); }
    });
  }}>
    <h3 className="font-medium">Poveži dejanski predračun, izdelan ročno v Quibiju</h3>
    <p className="text-xs text-slate-600">V Quibiju ustvarite dokument, preverite stranko in prepišite njegov resnični ID. Selan pred povezavo znova prebere dokument in postavke.</p>
    <label className="block text-sm">Quibijev ID predračuna
      <input className="mt-1 block w-full rounded border px-3 py-2" inputMode="numeric" pattern="[0-9]+" required value={estimateId}
        onChange={(event) => setEstimateId(event.target.value)} />
    </label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />
      Ročno sem preveril, da gre za predračun tega primera.
    </label>
    <button type="submit" disabled={!confirmed || pending} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
      {pending ? "Preverjam…" : "Preveri in poveži predračun"}
    </button>
    {message && <p role={message.startsWith("Quibijev predračun je povezan") ? "status" : "alert"} className="text-sm">{message}</p>}
  </form>;
}
