"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advancePublishedFixedPriceCase } from "@/lib/fixed-price/actions";

type Path = {
  status: string; service_label: string; final_price_eur: number;
  published_url: string; communication_reference: string | null;
  decision_reference: string | null;
};

export function PublishedFinalPrice({ serviceRequestId, path, canApprove, serviceWanted }: {
  serviceRequestId: string; path: Path | null; canApprove: boolean; serviceWanted: string | null;
}) {
  const router = useRouter();
  const demo = process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.APP_ENV === "preproduction" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1";
  const label = serviceWanted?.trim() ?? "";
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [reference, setReference] = useState("");
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(action: "prepare" | "approve" | "communicate" | "accept" | "reject") {
    if (pending || (action !== "prepare" && !attested)) return;
    startTransition(async () => {
      const result = await advancePublishedFixedPriceCase(serviceRequestId, action, {
        serviceLabel: label, finalPrice: price, publishedUrl: url, reference,
      });
      setMessage(result.ok ? "Ročni korak je zabeležen. Preverite novo stanje primera." : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  const mismatch = !!path && (!label || path.service_label.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI") !== label.replace(/\s+/g, " ").toLocaleLowerCase("sl-SI"));
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
    <h2 className="font-semibold">Storitev z objavljeno končno ceno</h2>
    <p className="text-sm">Ta pot velja samo, če je končna cena že objavljena na spletni strani. Ločen predhodni pregled in predračun nista obvezna. Selan tu ne ustvari Quibijevega dokumenta in ničesar samodejno ne pošlje.</p>
    {!path ? <div className="space-y-2">
      <label className="block text-sm">Storitev iz primera<input className="mt-1 block w-full rounded border p-2" value={label} readOnly /></label>
      {!label && <p role="alert" className="text-amber-900">Najprej v primeru zabeležite točno storitev, za katero velja objavljena cena.</p>}
      <label className="block text-sm">Objavljena končna cena v EUR<input className="mt-1 block w-full rounded border p-2" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label className="block text-sm">Povezava do objavljene cene (HTTPS)<input className="mt-1 block w-full rounded border p-2" type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>
      <button type="button" disabled={pending || !label.trim() || !price.trim() || !url.trim()} onClick={() => submit("prepare")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Zabeleži objavljeno ceno za pregled</button>
    </div> : <div className="space-y-2 text-sm">
      {mismatch && <p role="alert" className="font-medium text-red-800">Objavljena storitev se ne ujema s storitvijo tega primera. Cene ni dovoljeno odobriti ali poslati. Primer potrebuje popravek in nov pregled.</p>}
      <p>{path.service_label} · {Number(path.final_price_eur).toLocaleString("sl-SI", { style: "currency", currency: "EUR" })}</p>
      {/^https:\/\//.test(path.published_url) && <a href={path.published_url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 underline">Odpri objavljeno ceno</a>}
      <p>Stanje: {path.status}. {demo ? "Komunikacija in odgovor sta v demu simulirana; uporabite QA-SIM referenco." : "Ročno sporočanje cene in odgovor stranke zahtevata sledljivo referenco."}</p>
      {path.status === "prepared" && canApprove && <>
        <label className="flex gap-2"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />Pregledal sem objavljeno storitev in končno ceno.</label>
        <button type="button" disabled={pending || !attested || mismatch} onClick={() => submit("approve")} className="rounded border px-3 py-2 disabled:opacity-50">Tadejeva odobritev cene</button>
      </>}
      {(["approved", "communicated"] as string[]).includes(path.status) && <>
        <label className="block">{demo ? "Sintetična referenca QA-SIM" : path.status === "approved" ? "Referenca dejanskega sporočila stranki" : "Referenca dejanskega odgovora stranke"}
          <input className="mt-1 block w-full rounded border p-2" value={reference} maxLength={200} onChange={e => setReference(e.target.value)} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />
          {demo ? "Potrjujem simulacijo brez dejanske komunikacije." : path.status === "approved" ? "Ceno sem dejansko sporočil stranki." : "Prejel sem dejansko odločitev stranke."}</label>
        {path.status === "approved" ? <button type="button" disabled={pending || !attested || mismatch || reference.trim().length < 4} onClick={() => submit("communicate")} className="rounded border px-3 py-2 disabled:opacity-50">Zabeleži sporočeno ceno</button>
          : <div className="flex flex-wrap gap-2"><button type="button" disabled={pending || !attested || mismatch || reference.trim().length < 4} onClick={() => submit("accept")} className="rounded border px-3 py-2 disabled:opacity-50">Stranka naroči storitev</button>
            <button type="button" disabled={pending || !attested || mismatch || reference.trim().length < 4} onClick={() => submit("reject")} className="rounded border px-3 py-2 disabled:opacity-50">Stranka zavrne storitev</button></div>}
      </>}
      {path.communication_reference && <p>{demo ? "Demo – ni poslano" : "Sporočeno ročno"}; referenca: {path.communication_reference}. Ni samodejne dostave.</p>}
      {path.decision_reference && <p>Odločitev zabeležena ročno; referenca: {path.decision_reference}.</p>}
      {path.status === "accepted" && <p>Naslednji korak: ročno preverite tri termine v MyPlanlyju.</p>}
      {path.status === "rejected" && <p>Storitev ni naročena; termina ne ponujajte brez nove potrditve.</p>}
    </div>}
    {message && <p role={message.startsWith("Ročni korak") ? "status" : "alert"} className="text-sm">{message}</p>}
  </section>;
}
