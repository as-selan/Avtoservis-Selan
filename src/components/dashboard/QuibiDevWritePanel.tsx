"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareQuibiEstimateRevision, prepareQuibiEstimate, checkQuibiDevTestEstimateStatus, createQuibiDevEstimate, sendQuibiDevTestEstimate, updateQuibiDevEstimate } from "@/lib/quibi/dev-write-actions";
import type { EstimateReview } from '@/lib/quibi/estimate-preparation';
import type { CreatedEstimateSummary } from '@/lib/quibi/created-estimate-summary';
import type { QuibiChoice } from "@/lib/quibi/write-options";

export function QuibiDevWritePanel({ serviceRequestId, mode, quoteId, choices, sendStatus, sendId, operationState, lineDescription, writeEnabled=true }: {
  serviceRequestId: string; mode: "prepare" | "create" | "update" | "send"; quoteId?: string;
  writeEnabled?:boolean;
  lineDescription?: string;
  choices?: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[] };
  sendStatus?: string | null; sendId?: string | null; operationState?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [preparedSha, setPreparedSha] = useState<string | null>(null);
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [document, setDocument] = useState<CreatedEstimateSummary | null>(null);
  const money = (amount:number) => amount.toLocaleString('sl-SI',{style:'currency',currency:'EUR'});
  const [confirmed, setConfirmed] = useState(false);
  const [dispatchStarted, setDispatchStarted] = useState(false);
  const lock = useRef(false);
  if ((mode === "create" || mode === "prepare") && (!choices?.saleTypes.length || !choices.units.length || !choices.vatRates.length))
    return <p role="alert" className="text-sm text-amber-800">Quibijevi šifranti niso na voljo; ustvarjanje je ustavljeno.</p>;
  return <form className="space-y-3 border-t pt-3" onChange={event => {if (!(event.target instanceof HTMLInputElement) || !["createConfirmed","updateConfirmed"].includes(event.target.name)) {setPreparedSha(null);setReview(null);setConfirmed(false)}}} onSubmit={(event) => {
    event.preventDefault();
    if (lock.current || pending || (mode === "send" && operationState && !sendId && operationState !== "prepared")) return;
    const form = new FormData(event.currentTarget);
    form.set("serviceRequestId", serviceRequestId);
    if (quoteId) form.set("quoteId", quoteId);
    const dispatch = (mode === "create" || mode === "update") && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch') === 'yes';
    if (dispatch && (!writeEnabled || !preparedSha || dispatchStarted || form.get(mode==='update'?'updateConfirmed':'createConfirmed') !== 'yes')) {setMessage('Preglejte postavko in potrdite ustvarjanje predračuna.');return;}
    if (dispatch) {form.set('expectedSha', preparedSha!);setDispatchStarted(true)}
    lock.current = true;
    startTransition(async () => {
      try { const result = mode==="update"&&!dispatch?await prepareQuibiEstimateRevision(form):(mode === "prepare" || (mode === "create" && !dispatch)) ? await prepareQuibiEstimate(form) : mode === "create" ? await createQuibiDevEstimate(form)
        : mode === "update" ? await updateQuibiDevEstimate(form) : sendId ? await checkQuibiDevTestEstimateStatus(form) : await sendQuibiDevTestEstimate(form);
      setMessage(result.ok ? result.detail : result.message);
      if(result.ok && result.document) setDocument(result.document);
      if(!dispatch) {setReview(result.ok ? result.review ?? null : null);setConfirmed(false);}
      if (!dispatch && (mode === "create" || mode === "prepare" || mode === "update")) setPreparedSha(result.ok ? result.sha ?? null : null);
      router.refresh();
      } catch {setMessage("Izid ni potrjen. Preverite dnevnik; pošiljanja ali ustvarjanja ne ponavljajte.")} finally {lock.current = false}
    });
  }}>
    {document && <section role="status" className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
      <p className="font-semibold">Quibi predračun #{document.id}{document.number ? ` · ${document.number}` : ''}</p>
      <p>Znesek po Quibiju: {money(Number(document.amount.replace(',', '.')))}</p>
      <a className="block text-blue-700 underline" href={`/dashboard/stranke/${document.customerId}/quibi/predracuni/${document.id}`}>Odpri predračun</a>
      <a className="block text-blue-700 underline" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${document.customerId}/estimate/${document.id}/pdf`}>Odpri PDF iz Quibija</a>
      {!document.linked && <p role="alert">Povezava s primerom zahteva pregled. Ne ustvarjajte drugega predračuna.</p>}
      <p>Dokument ni poslan. Pošiljanje zahteva ločeno odobritev.</p>
    </section>}
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
      {pending ? "Preverjam…" : mode === "prepare" ? "Preglej ponudbo" : mode === "create" ? "Preglej ponudbo" : mode === "update" ? "Preglej popravek" : sendId ? "Preveri status brez ponovnega pošiljanja" : "Pošlji testno"}
    </button>
    {(mode === "create" || mode === "prepare" || mode === "update") && preparedSha && <div className="space-y-2">
      {review && <section aria-label="Pregled ponudbe pred ustvarjanjem" className="space-y-2 rounded border bg-slate-50 p-3 text-sm">
        <p>Quibi stranka #{review.customerId} · vozilo #{review.vehicleId}</p>
        <p>{review.numbering} · {review.saleType}</p>
        {review.lines.map((line,index)=><div key={index} className="space-y-1 border-t pt-2">
          <p className="whitespace-pre-wrap break-words font-medium">{line.description}</p>
          <p>Količina: {line.quantity} {line.unit} · DDV: {line.vat} · popust: {line.discount} %</p>
          <p>Cena na enoto z DDV: {money(line.unitPrice)}</p>
        </div>)}
        <p className="font-semibold">Skupaj z DDV: {money(review.total)}</p>
      </section>}
      <details className="text-xs"><summary>Podrobnosti preverjanja</summary><p className="break-all">Prstni odtis: {preparedSha}</p></details>
      <label className="flex gap-2 text-sm"><input name={mode==="update"?"updateConfirmed":"createConfirmed"} type="checkbox" value="yes" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={dispatchStarted||mode==="prepare"||!writeEnabled}/>Potrjujem {mode==="update"?"posodobitev":"ustvarjanje"} pregledanega predračuna v Quibi DEV.</label>
      <button data-dispatch="yes" disabled={pending || dispatchStarted || !confirmed || mode==="prepare" || !writeEnabled} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{mode==='prepare'||!writeEnabled?'Zapis čaka na odobreno aktivacijo DEV WRITE':dispatchStarted ? 'Dispatch sprožen; pred nadaljevanjem preverite dnevnik' : mode==='update'?'Posodobi pregledani predračun v Quibiju':'Ustvari pregledani predračun v Quibiju'}</button>
    </div>}
    {message && <p role={message.startsWith("Priprava preverjena") || message.startsWith("Quibi DEV") || message.startsWith("Quibi je") ? "status" : "alert"} className="whitespace-pre-wrap break-all text-sm">{message.split("\n")[0]}</p>}
    {message.includes("\n") && <details className="text-xs"><summary>Podrobnosti priprave za pregled</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">{message.slice(message.indexOf("\n")+1)}</pre></details>}
  </form>;
}
