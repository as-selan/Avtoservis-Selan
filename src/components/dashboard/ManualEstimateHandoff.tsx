"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordManualEstimateDelivery, recordManualEstimateDecision } from "@/lib/quibi/manual-estimate-action";

export function ManualEstimateHandoff({ quoteId, delivered, decision }: {
  quoteId: string;
  delivered: boolean;
  decision: string | null;
}) {
  const router = useRouter();
  const demo = process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.APP_ENV === "preproduction" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1";
  const [channel, setChannel] = useState("email");
  const [reference, setReference] = useState("");
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(kind: "delivery" | "approved" | "rejected") {
    if (pending || !attested || reference.trim().length < 4) return;
    startTransition(async () => {
      const result = kind === "delivery"
        ? await recordManualEstimateDelivery(quoteId, channel, reference)
        : await recordManualEstimateDecision(quoteId, kind, reference);
      setMessage(result.ok
        ? kind === "delivery" ? demo ? "Demo – ni poslano. Simulacija je shranjena." : "Dejanska ročna dostava je evidentirana."
          : demo ? "Simulirana odločitev je shranjena." : "Strankina odločitev je evidentirana."
        : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  if (decision) return <p className="text-sm">Strankina odločitev: {decision}. Evidentirano za to različico predračuna.</p>;
  return <div className="space-y-2 border-t pt-3">
    <h3 className="font-medium">{delivered ? "Odgovor stranke" : demo ? "Simulirano pošiljanje" : "Dejansko ročno pošiljanje"}</h3>
    <p className="text-xs text-amber-800">{demo ? "Demo – ni poslano. Uporabite samo sintetično referenco QA-SIM-." : "Ta zapis je ročno dokazilo zaposlenega; aplikacija sporočila ne pošlje sama."}</p>
    {!delivered && <label className="block text-sm">Uporabljen kanal
      <select className="mt-1 block rounded border px-2 py-1" value={channel} onChange={(event) => setChannel(event.target.value)}>
        <option value="email">E-pošta</option><option value="sms">SMS</option>
        <option value="in_person">Osebno</option><option value="other">Drugo</option>
      </select>
    </label>}
    <label className="block text-sm">{demo ? "Sintetična referenca QA-SIM" : delivered ? "Referenca dejanskega odgovora" : "Referenca poslanega sporočila"}
      <input className="mt-1 block w-full rounded border px-2 py-1" value={reference} maxLength={200}
        onChange={(event) => setReference(event.target.value)} placeholder="ID sporočila ali sledljiv zapis" />
    </label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
      {demo ? "Potrjujem simulacijo brez dejanske komunikacije." : delivered ? "Prejel sem dejanski odgovor stranke za to različico." : "Ta predračun sem dejansko poslal stranki po navedenem kanalu."}
    </label>
    <div className="flex flex-wrap gap-2">
      {delivered ? <>
        <button type="button" disabled={pending || !attested || reference.trim().length < 4} onClick={() => submit("approved")}
          className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Stranka potrdi popravilo</button>
        <button type="button" disabled={pending || !attested || reference.trim().length < 4} onClick={() => submit("rejected")}
          className="rounded border px-3 py-2 text-sm disabled:opacity-50">Stranka zavrne predračun</button>
      </> : <button type="button" disabled={pending || !attested || reference.trim().length < 4} onClick={() => submit("delivery")}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">{demo ? "Simuliraj pošiljanje" : "Evidentiraj dejansko pošiljanje"}</button>}
    </div>
    {message && <p role={message.includes("evidentirana") ? "status" : "alert"} className="text-sm">{message}</p>}
  </div>;
}
