"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceManualSlotOffer, proposeManualSlots } from "@/lib/appointments/manual-slots-actions";
import { ljubljanaWallTimeToIso } from "@/lib/appointments/ljubljana-time";

type Offer = {
  id: string; status: string; slot_1: string; slot_2: string; slot_3: string;
  selected_slot: number | null; availability_reference: string;
  offer_reference: string | null; response_reference: string | null;
  booking_reference: string | null;
};

export function ManualSlotOffer({ serviceRequestId, appointmentType, offer, realDevWrite = false }: {
  serviceRequestId: string; appointmentType: "diagnosis" | "service"; offer: Offer | null; realDevWrite?: boolean;
}) {
  const router = useRouter();
  const demo = !realDevWrite && (process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1");
  const [slots, setSlots] = useState(["", "", ""]);
  const [reference, setReference] = useState("");
  const [selected, setSelected] = useState(1);
  const [attested, setAttested] = useState(false);
  const [cancelReference, setCancelReference] = useState("");
  const [cancelAttested, setCancelAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const title = appointmentType === "diagnosis" ? "Termin predhodnega pregleda" : "Termin popravila";
  const statusMessage = offer?.status === "proposed" ? "Tri možnosti so pripravljene, niso še poslane ali rezervirane."
    : offer?.status === "offered" ? demo ? "Pošiljanje možnosti je simulirano; nobena ni rezervirana." : "Tri možnosti so bile ročno poslane; nobena ni začasno rezervirana."
      : offer?.status === "selected" ? "Stranka je izbrala termin; rezervacija v MyPlanlyju še ni potrjena."
        : offer?.status === "confirmed" ? "Termin je interno potrjen na podlagi ročno zabeležene rezervacije v MyPlanlyju. Samodejne sinhronizacije ni."
          : "Tri možnosti je treba dejansko preveriti v MyPlanlyju. Aplikacija ne preverja razpoložljivosti sama.";
  function create() {
    if (pending || !attested) return;
    const converted = slots.map(ljubljanaWallTimeToIso);
    if (converted.some((value) => !value)) {
      setMessage("Neveljaven ali dvoumen lokalni čas Europe/Ljubljana. Izberite drug čas.");
      return;
    }
    startTransition(async () => {
      const result = await proposeManualSlots(serviceRequestId, appointmentType, converted as string[], reference);
      setMessage(result.ok ? "Tri ročno preverjene možnosti so shranjene kot predlog." : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  function advance(action: "send" | "select" | "confirm" | "cancel") {
    if (!offer || pending || !attested) return;
    startTransition(async () => {
      const result = await advanceManualSlotOffer(offer.id, action, reference,
        action === "select" ? selected : undefined);
      setMessage(result.ok ? demo ? "Demo korak je shranjen; nič ni poslano ali rezervirano." : "Dejanski ročni korak termina je shranjen." : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  function cancel() {
    if (!offer || pending || !cancelAttested || cancelReference.trim().length < 4) return;
    startTransition(async () => {
      const result = await advanceManualSlotOffer(offer.id, "cancel", cancelReference);
      setMessage(result.ok ? "Neveljavna ponudba terminov je umaknjena; pripravite nove možnosti." : result.message);
      if (result.ok) {
        setCancelAttested(false); setCancelReference(""); setAttested(false);
        setReference(""); setSlots(["", "", ""]); router.refresh();
      }
    });
  }
  return <section className="rounded-xl border bg-white p-4 space-y-3">
    <h2 className="font-semibold">{title}</h2>
    <p className="text-sm text-amber-800">{statusMessage}</p>
    {offer && <ol className="list-decimal pl-5 text-sm space-y-1">{[offer.slot_1,offer.slot_2,offer.slot_3].map((slot, index) =>
      <li key={index}>{new Date(slot).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "medium", timeStyle: "short" })}
        {offer.selected_slot === index + 1 ? " · izbrano" : ""}</li>)}</ol>}
    {!offer && <div className="space-y-2">
      {[0,1,2].map((index) => <label key={index} className="block text-sm">Možnost {index + 1} · Europe/Ljubljana
        <input type="datetime-local" className="mt-1 block rounded border px-2 py-1" value={slots[index]}
          onChange={(event) => setSlots((current) => current.map((value, position) => position === index ? event.target.value : value))} />
      </label>)}
    </div>}
    {offer?.status === "offered" && <label className="block text-sm">Izbrana možnost
      <select className="mt-1 block rounded border px-2 py-1" value={selected}
        onChange={(event) => setSelected(Number(event.target.value))}>
        <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
      </select></label>}
    {offer?.status !== "confirmed" && !(demo && offer?.status === "selected") && <>
      <label className="block text-sm">{!offer ? "Referenca preverjanja razpoložljivosti" : offer.status === "proposed" ? demo ? "Referenca simuliranega pošiljanja" : "Referenca dejansko poslanih možnosti" : offer.status === "offered" ? "Referenca strankine izbire" : "Referenca dejanske rezervacije v MyPlanlyju"}
        <input className="mt-1 block w-full rounded border px-2 py-1" value={reference} maxLength={200}
          onChange={(event) => setReference(event.target.value)} placeholder="Sledljiv ID ali zapis" />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
        {!offer ? demo ? "Za demo sem pripravil tri sintetične možnosti; MyPlanly ni preverjen." : "Tri termine sem dejansko preveril v MyPlanlyju."
          : offer.status === "proposed" ? demo ? "Simuliram pošiljanje; stranka ne prejme sporočila." : "Te tri možnosti sem dejansko poslal stranki."
            : offer.status === "offered" ? demo ? "Simuliram strankino izbiro." : "Prejel sem dejansko izbiro stranke."
              : "Izbrani termin sem dejansko rezerviral v MyPlanlyju."}
      </label>
      <div className="flex flex-wrap gap-2">
        {!offer ? <button type="button" disabled={pending || !attested || reference.trim().length < 4 || slots.some((slot) => !slot)}
          onClick={create} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Shrani tri možnosti</button>
          : offer.status === "proposed" ? <button type="button" disabled={pending || !attested || reference.trim().length < 4}
            onClick={() => advance("send")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{demo ? "Simuliraj pošiljanje možnosti" : "Evidentiraj dejansko pošiljanje"}</button>
            : offer.status === "offered" ? <button type="button" disabled={pending || !attested || reference.trim().length < 4}
              onClick={() => advance("select")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Evidentiraj strankino izbiro</button>
              : <button type="button" disabled={pending || !attested || reference.trim().length < 4}
                  onClick={() => advance("confirm")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Potrdi ročno rezerviran termin</button>}
      </div>
    </>}
    {demo && offer?.status === "selected" && <p className="text-sm text-amber-800">Demo se ustavi pri izbiri. Dejanska rezervacija v MyPlanlyju ni mogoča.</p>}
    {offer?.status === "confirmed" && <p className="text-xs text-slate-600">Referenca ročne rezervacije: {offer.booking_reference}</p>}
    {offer && offer.status !== "confirmed" && <div className="space-y-2 border-t pt-3">
      <p className="text-xs text-slate-600">Če nobena možnost ne velja več ali jo je stranka zavrnila, umaknite ponudbo. Ker ni bilo začasne rezervacije, ni samodejnega sproščanja terminov.</p>
      <label className="block text-sm">Referenca umika ali zavrnitve
        <input className="mt-1 block w-full rounded border px-2 py-1" value={cancelReference} maxLength={200}
          onChange={(event) => setCancelReference(event.target.value)} />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={cancelAttested} onChange={(event) => setCancelAttested(event.target.checked)} />
        Preveril sem, da ponudba terminov ne velja več.</label>
      <button type="button" disabled={pending || !cancelAttested || cancelReference.trim().length < 4}
        onClick={cancel} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Umakni ponudbo in pripravi nove možnosti</button>
    </div>}
    {message && <p role={message.includes("shranjen") || message.includes("shranjene") ? "status" : "alert"} className="text-sm">{message}</p>}
  </section>;
}
