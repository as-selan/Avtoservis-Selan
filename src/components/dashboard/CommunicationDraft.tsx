"use client";

import { useState } from "react";

export function CommunicationDraft({ title, body }: { title: string; body: string }) {
  const [message, setMessage] = useState("");
  return <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h2 className="font-semibold text-amber-950">Pripravljeno sporočilo · {title}</h2>
    <p className="text-xs text-amber-900">To je osnutek. Kopiranje ne pošlje sporočila in ne spremeni stanja primera. Pred pošiljanjem preverite vsebino in morebitno prilogo.</p>
    <textarea readOnly value={body} aria-label="Osnutek sporočila za stranko"
      className="min-h-32 w-full resize-y rounded border border-amber-300 bg-white p-3 text-sm text-slate-900" />
    <button type="button" className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white"
      onClick={async () => {
        try { await navigator.clipboard.writeText(body); setMessage("Osnutek je kopiran. Sporočilo ni poslano."); }
        catch { setMessage("Kopiranje ni uspelo. Besedilo lahko označite in kopirate ročno."); }
      }}>Kopiraj osnutek</button>
    {message && <p role="status" className="text-sm text-amber-950">{message}</p>}
  </section>;
}
