"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkQuibiDevTestEstimateStatus, sendManualQuibiDevTestEstimate } from "@/lib/quibi/dev-write-actions";

export function QuibiManualTestSendPanel({ serviceRequestId, quoteId, documentId, recipient, version,
  operationState, sendId, sendStatus }: {
  serviceRequestId: string; quoteId: string; documentId: string; recipient: string; version: number;
  operationState?: string; sendId?: string | null; sendStatus?: string | null;
}) {
  const router = useRouter(), locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [attempted, setAttempted] = useState(false), [message, setMessage] = useState("");
  const canSend = !attempted && (!operationState || operationState === "prepared");
  function run(form: FormData, statusOnly: boolean) {
    if (locked.current) return;
    locked.current = true;
    form.set("serviceRequestId", serviceRequestId); form.set("quoteId", quoteId);
    if (!statusOnly) setAttempted(true);
    startTransition(async () => {
      try {
        const result = statusOnly ? await checkQuibiDevTestEstimateStatus(form) : await sendManualQuibiDevTestEstimate(form);
        setMessage(result.ok ? result.detail : result.message);
      } catch { setMessage("Izid ni znan. Ne ponavljajte pošiljanja; preverite dnevnik."); }
      finally { locked.current = false; router.refresh(); }
    });
  }
  return <section className="space-y-3 border-t pt-3">
    <h3 className="font-medium">Testno pošiljanje obstoječega Quibi DEV predračuna</h3>
    <p className="text-sm">Dokument #{documentId}, različica {version}. Prejemnik: {recipient}.</p>
    <p className="text-xs text-amber-800">Pošlje se obstoječi odobreni dokument. Status sent pomeni predajo poštnemu strežniku; prejem in dostava stranki nista potrjena.</p>
    {canSend && <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(new FormData(e.currentTarget), false); }}>
      <label className="block text-sm">Dokaz preverjanja vozila in storitve za ta primer
        <textarea name="manualMatchReference" required minLength={12} maxLength={1000}
          className="mt-1 block w-full rounded border px-3 py-2" placeholder="Navedite, kako ste preverili dokument, vozilo in naročeno storitev." />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="manualMatchConfirmed" value="yes" required />
        Izrecno potrjujem, da postavke, stranka in vozilo na tem dokumentu pripadajo temu servisnemu primeru.
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="testSendConfirmed" value="yes" required />
        Potrjujem enkratno testno pošiljanje izključno na prikazani testni naslov.
      </label>
      <button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Preverjam in pošiljam…" : "Pošlji obstoječi predračun testno"}
      </button>
    </form>}
    {sendStatus && <p className="text-sm">Quibi status: {sendStatus}</p>}
    {!canSend && !sendId && <p className="text-sm">Ponovno pošiljanje je ustavljeno. Preverite dnevnik operacij; neznan izid ne dovoljuje ponovitve.</p>}
    {sendId && <button type="button" disabled={pending} onClick={() => run(new FormData(), true)}
      className="rounded border px-3 py-2 text-sm disabled:opacity-50">{pending ? "Preverjam…" : "Preveri status brez ponovnega pošiljanja"}</button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
