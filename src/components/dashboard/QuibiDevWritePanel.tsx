"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareQuibiEstimate, checkQuibiDevTestEstimateStatus, createQuibiDevEstimate, sendQuibiDevTestEstimate, updateQuibiDevEstimate } from "@/lib/quibi/dev-write-actions";
import type { QuibiChoice } from "@/lib/quibi/write-options";

export function QuibiDevWritePanel({ serviceRequestId, mode, quoteId, choices, sendStatus, sendId, operationState, lineDescription }: {
  serviceRequestId: string; mode: "prepare" | "create" | "update" | "send"; quoteId?: string;
  lineDescription?: string;
  choices?: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[] };
  sendStatus?: string | null; sendId?: string | null; operationState?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [preparedSha, setPreparedSha] = useState<string | null>(null);
  const [dispatchStarted, setDispatchStarted] = useState(false);
  const lock = useRef(false);
  if ((mode === "create" || mode === "prepare") && (!choices?.saleTypes.length || !choices.units.length || !choices.vatRates.length))
    return <p role="alert" className="text-sm text-amber-800">Quibijevi šifranti niso na voljo; ustvarjanje je ustavljeno.</p>;
  return <form className="space-y-3 border-t pt-3" onChange={event => {if (!(event.target instanceof HTMLInputElement) || event.target.name !== "createConfirmed") setPreparedSha(null)}} onSubmit={(event) => {
    event.preventDefault();
    if (lock.current || pending || (mode === "send" && operationState && !sendId && operationState !== "prepared")) return;
    const form = new FormData(event.currentTarget);
    form.set("serviceRequestId", serviceRequestId);
    if (quoteId) form.set("quoteId", quoteId);
    const dispatch = mode === "create" && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch') === 'yes';
    if (dispatch && (!preparedSha || dispatchStarted || form.get('createConfirmed') !== 'yes')) {setMessage('Potrdite CREATE pregledanega payload-a.');return;}
    if (dispatch) {form.set('expectedSha', preparedSha!);setDispatchStarted(true)}
    lock.current = true;
    startTransition(async () => {
      try { const result = (mode === "prepare" || (mode === "create" && !dispatch)) ? await prepareQuibiEstimate(form) : mode === "create" ? await createQuibiDevEstimate(form)
        : mode === "update" ? await updateQuibiDevEstimate(form) : sendId ? await checkQuibiDevTestEstimateStatus(form) : await sendQuibiDevTestEstimate(form);
      setMessage(result.ok ? result.detail : result.message);
      if (!dispatch && (mode === "create" || mode === "prepare")) setPreparedSha(result.ok ? result.sha ?? null : null);
      router.refresh();
      } catch {setMessage("Izid ni potrjen. Preverite dnevnik; pošiljanja ali ustvarjanja ne ponavljajte.")} finally {lock.current = false}
    });
  }}>
    <h3 className="font-medium">{mode === "prepare" ? "Pripravi ponudbo za popravilo" : mode === "create" ? "Ustvari predračun v Quibiju" :
      mode === "update" ? "Popravi zavrnjeni Quibi predračun" : "Pošlji predračun samo na testni naslov"}</h3>
    {(mode === "create" || mode === "prepare") && <>
      {lineDescription && <p className="text-sm">Postavka za pregled: {lineDescription}</p>}
      <p className="text-xs text-amber-800">{mode === "prepare" ? "Priprava uporablja samo Quibi READ; dokumenta ne ustvari in ničesar ne pošlje." : "To ustvari dejanski dokument v konfiguriranem Quibi okolju."} {mode === "prepare" ? "Payload in SHA sta samo za pregled in nista shranjen poslovni dokument. Pred ustvarjanjem bo izvedeno novo preverjanje." : "Ponavljanje uporabi isti shranjeni zahtevek. Quibi bo po ustvaritvi ponovno prebran; ceno mora nato potrditi Tadej."}</p>
      <label className="block text-sm">Vrsta prodaje
        <select name="saleTypeId" required className="mt-1 block w-full rounded border px-3 py-2">
          {choices?.saleTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">Enota
          <select name="unitId" required className="mt-1 block w-full rounded border px-3 py-2">
            {choices?.units.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">DDV
          <select name="vatId" required className="mt-1 block w-full rounded border px-3 py-2">
            {choices?.vatRates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </>}
    {(mode === "prepare" || mode === "create" || mode === "update") && <>
      <label className="block text-sm">Cena za eno storitev z DDV (€)
        <input name="unitPrice" type="number" min="0.01" max="1000000" step="0.01" required
          className="mt-1 block w-full rounded border px-3 py-2" />
      </label>
      <label className="flex gap-2 text-sm"><input name="serviceMatchConfirmed" type="checkbox" value="yes" required />
        Preveril sem, da storitev, stranka, vozilo in predračun pripadajo temu primeru.
      </label>
    </>}
    {mode === "send" && <>
      <p className="text-xs text-amber-800">Prejemnik je izključno dovoljen testni naslov. To ni dostava stranki. Status »sent« pomeni predajo poštnemu strežniku, ne prejema ali branja.</p>
      {sendStatus && <p className="text-sm">Zadnji status testnega pošiljanja: {sendStatus}</p>}
      <label className="flex gap-2 text-sm"><input name="testSendConfirmed" type="checkbox" value="yes" required={!sendId} />
        Potrjujem pošiljanje samo na konfiguriran testni naslov.
      </label>
    </>}
    <button disabled={pending || (mode === "send" && !!operationState && !sendId && operationState !== "prepared")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
      {pending ? "Preverjam…" : mode === "prepare" ? "Preveri ponudbo in SHA" : mode === "create" ? "Preveri ponudbo in SHA" : mode === "update" ? "Popravi in preveri" : sendId ? "Preveri status brez ponovnega pošiljanja" : "Pošlji testno"}
    </button>
    {mode === "create" && preparedSha && <div className="space-y-2">
      <p className="break-all text-xs">Pregledani SHA: {preparedSha}</p>
      <label className="flex gap-2 text-sm"><input name="createConfirmed" type="checkbox" value="yes" disabled={dispatchStarted}/>Izrecno potrjujem en CREATE pregledanega predračuna v Quibi DEV.</label>
      <button data-dispatch="yes" disabled={pending || dispatchStarted} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{dispatchStarted ? 'Dispatch sprožen; pred nadaljevanjem preverite dnevnik' : 'Ustvari pregledani predračun v Quibiju'}</button>
    </div>}
    {message && <p role={message.startsWith("Priprava preverjena") || message.startsWith("Quibi DEV") || message.startsWith("Quibi je") ? "status" : "alert"} className="whitespace-pre-wrap break-all text-sm">{message}</p>}
  </form>;
}
