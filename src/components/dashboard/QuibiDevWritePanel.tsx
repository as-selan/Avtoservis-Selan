"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkQuibiDevTestEstimateStatus, createQuibiDevEstimate, sendQuibiDevTestEstimate, updateQuibiDevEstimate } from "@/lib/quibi/dev-write-actions";
import type { QuibiChoice } from "@/lib/quibi/write-options";

export function QuibiDevWritePanel({ serviceRequestId, mode, quoteId, choices, sendStatus, sendId, operationState }: {
  serviceRequestId: string; mode: "create" | "update" | "send"; quoteId?: string;
  choices?: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[] };
  sendStatus?: string | null; sendId?: string | null; operationState?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  if (mode === "create" && (!choices?.saleTypes.length || !choices.units.length || !choices.vatRates.length))
    return <p role="alert" className="text-sm text-amber-800">Quibijevi šifranti niso na voljo; ustvarjanje je ustavljeno.</p>;
  return <form className="space-y-3 border-t pt-3" onSubmit={(event) => {
    event.preventDefault();
    if (pending || (mode === "send" && operationState && !sendId && operationState !== "prepared")) return;
    const form = new FormData(event.currentTarget);
    form.set("serviceRequestId", serviceRequestId);
    if (quoteId) form.set("quoteId", quoteId);
    startTransition(async () => {
      const result = mode === "create" ? await createQuibiDevEstimate(form)
        : mode === "update" ? await updateQuibiDevEstimate(form) : sendId ? await checkQuibiDevTestEstimateStatus(form) : await sendQuibiDevTestEstimate(form);
      setMessage(result.ok ? result.detail : result.message);
      router.refresh();
    });
  }}>
    <h3 className="font-medium">{mode === "create" ? "Ustvari predračun v Quibi DEV" :
      mode === "update" ? "Popravi zavrnjeni Quibi DEV predračun" : "Pošlji predračun samo na testni naslov"}</h3>
    {mode === "create" && <>
      <p className="text-xs text-amber-800">To ustvari dejanski dokument v Quibi DEV. Ponavljanje uporabi isti shranjeni zahtevek. Quibi bo po ustvaritvi ponovno prebran; ceno mora nato potrditi Tadej.</p>
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
    {(mode === "create" || mode === "update") && <>
      <label className="block text-sm">Cena za eno storitev brez DDV (€)
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
      {pending ? "Preverjam…" : mode === "create" ? "Ustvari in preveri" : mode === "update" ? "Popravi in preveri" : sendId ? "Preveri status brez ponovnega pošiljanja" : "Pošlji testno"}
    </button>
    {message && <p role={message.startsWith("Quibi DEV") || message.startsWith("Quibi je") ? "status" : "alert"} className="text-sm">{message}</p>}
  </form>;
}
