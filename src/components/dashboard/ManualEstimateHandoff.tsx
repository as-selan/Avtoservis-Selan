"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordManualEstimateDelivery, recordManualEstimateDecision } from "@/lib/quibi/manual-estimate-action";

export function ManualEstimateHandoff({ quoteId, delivered, decision, realDevWrite = false, apiDispatch = false, syntheticQa = false }: {
  quoteId: string;
  delivered: boolean;
  decision: string | null;
  realDevWrite?: boolean;
  apiDispatch?: boolean;
  syntheticQa?:boolean;
}) {
  const router = useRouter();
  const demo = !realDevWrite && (process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1");
  const [channel, setChannel] = useState("email");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(kind: "delivery" | "approved" | "rejected") {
    const reference = (kind === "delivery" ? deliveryReference : (demo||syntheticQa) ? "QA-SIM-OPERATOR-"+kind : "").trim();
    if(syntheticQa&&kind!=='delivery'&&!reference.startsWith('QA-SIM-')){setMessage('Za simulirano odločitev uporabite referenco QA-SIM-.');return;}
    if (pending || kind === "delivery" && (reference.length < 4 || reference.length > 200)) return;
    startTransition(async () => {
      try {
        const result = kind === "delivery"
          ? await recordManualEstimateDelivery(quoteId, channel, reference)
          : await recordManualEstimateDecision(quoteId, kind, reference);
        setMessage(result.ok
          ? kind === "delivery"
            ? demo ? "Demo – simulacija dostave je shranjena; nič ni bilo poslano." : "Dejanska dostava je evidentirana."
            : (demo||syntheticQa) ? "Simulirana QA odločitev je shranjena; ni dejanska odobritev stranke." : "Strankina odločitev je evidentirana."
          : result.message);
        if (result.ok) {
          if (kind === "delivery") setDeliveryReference("");

          router.refresh();
        }
      } catch {
        setMessage("Zapis ni potrjen. Osvežite primer in preverite dejansko stanje.");
      }
    });
  }


  if (decision) {
    return <p className="text-sm">{syntheticQa?"Simulirana QA odločitev":"Strankina odločitev"}: {decision === "approved" ? "odobreno" : decision === "rejected" ? "zavrnjeno" : decision}. Evidentiral jo je uporabnik v Selanu za to različico predračuna; ni prevzeta iz Quibija.</p>;
  }

  const decisionReady = true;
  const deliveryReady = deliveryReference.trim().length >= 4 && deliveryReference.trim().length <= 200;
  return <section className="space-y-3 border-t pt-3">
    <h3 className="font-medium">{syntheticQa?"Simulirana QA odločitev (brez dejanske stranke)":"Odločitev stranke"}</h3>
    <p className="text-sm">
      {syntheticQa?"Ta sintetični DEV preizkus evidentira samo simulirano QA odobritev ali zavrnitev. Ne potrjuje dejanske strankine odločitve.":demo ? "Demo – uporabljajte samo sintetično referenco QA-SIM-." : "Če je stranka odgovorila osebno, po telefonu ali drugače, zabeležite njen dejanski odgovor. Predhodno evidentiranje pošiljanja ni potrebno."}
      {delivered && apiDispatch ? " Quibi je sporočilo predal poštnemu strežniku; prejem ni potrjen." : ""}
    </p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending || !decisionReady} onClick={() => submit("approved")}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">{syntheticQa?"Evidentiraj simulirano QA odobritev":"Stranka je odobrila"}</button>
      <button type="button" disabled={pending || !decisionReady} onClick={() => submit("rejected")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">{syntheticQa?"Evidentiraj simulirano QA zavrnitev":"Stranka je zavrnila predračun"}</button>
    </div>
    {!syntheticQa&&!delivered && <details className="space-y-2 rounded border p-3 text-sm">
      <summary className="cursor-pointer">Ločeno evidentiraj dejansko dostavo predračuna (neobvezno)</summary>
      <p className="pt-2">To uporabite samo, če je bil predračun dejansko izročen ali poslan. Evidentiranje dostave ni pogoj za zapis odločitve.</p>
      <label className="block">Uporabljen kanal
        <select className="mt-1 block rounded border px-2 py-1" value={channel} onChange={event => setChannel(event.target.value)}>
          <option value="email">E-pošta</option><option value="sms">SMS</option>
          <option value="in_person">Osebno</option><option value="other">Drugo</option>
        </select>
      </label>
      <label className="block">{demo ? "Referenca QA-SIM-" : "Referenca dejanske dostave"}
        <input className="mt-1 block w-full rounded border px-2 py-1" value={deliveryReference} maxLength={200}
          onChange={event => setDeliveryReference(event.target.value)} />
      </label>
      <button type="button" disabled={pending || !deliveryReady} onClick={() => submit("delivery")}
        className="rounded border px-3 py-2 disabled:opacity-50">{demo ? "Evidentiraj simulacijo" : "Evidentiraj dejansko dostavo"}</button>
    </details>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
