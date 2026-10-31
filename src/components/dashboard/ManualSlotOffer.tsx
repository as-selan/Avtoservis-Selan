"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceManualSlotOffer, proposeManualSlots } from "@/lib/appointments/manual-slots-actions";
import { manualSlotDraft, slotProposalMessage, manualOfferExpired } from "@/lib/appointments/manual-slot-draft";
import { CommunicationDraft } from "./CommunicationDraft";

type Offer = {
  id: string; status: string; slot_1: string; slot_2: string; slot_3: string;
  selected_slot: number | null; availability_reference: string;
  offer_reference: string | null; response_reference: string | null;
  booking_reference: string | null;
};

export function ManualSlotOffer({ serviceRequestId, appointmentType, offer, realDevWrite = false, syntheticQaAllowed = false, inactiveReason }: {
  serviceRequestId: string; appointmentType: "diagnosis" | "service"; offer: Offer | null; realDevWrite?: boolean; syntheticQaAllowed?: boolean; inactiveReason?: string;
}) {
  const router = useRouter();
  const demo = !realDevWrite && (process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1");
  const inFlight = useRef(false);
  const [slots, setSlots] = useState(["", "", ""]);
  const [reference, setReference] = useState("");
  const [selected, setSelected] = useState(1);
  const [attested, setAttested] = useState(false);
  const [cancelReference, setCancelReference] = useState("");
  const [cancelAttested, setCancelAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [checkedAt] = useState(() => Date.now());
  const expired = !!offer && manualOfferExpired(offer, checkedAt);
  const blocked = offer?.status !== "confirmed" && (!!inactiveReason || expired);
  const title = appointmentType === "diagnosis" ? "Termin predhodnega pregleda" : "Termin popravila";
  const statusMessage = blocked ? inactiveReason ?? "Termini so potekli. To ni potrjena rezervacija. Umaknite staro ponudbo in preverite nove možnosti." : offer?.status === "proposed" ? "Tri možnosti so pripravljene, niso še poslane ali rezervirane."
    : offer?.status === "offered" ? demo ? "Nobena možnost še ni rezervirana." : "Tri možnosti so bile ročno poslane; nobena ni začasno rezervirana."
      : offer?.status === "selected" ? "Stranka je izbrala termin; ročna rezervacija še ni potrjena."
        : offer?.status === "confirmed" && offer.booking_reference?.startsWith("QA-SIM-") ? "Termin je evidentiran za testni primer. Zunanja rezervacija ni potrjena." : offer?.status === "confirmed" ? "Termin je interno potrjen na podlagi ročno zabeležene rezervacije v preverjenem koledarju. Samodejne sinhronizacije ni."
          : "Vnesite tri možnosti iz dejansko preverjenega koledarja. Samodejni vir razpoložljivosti še ni povezan; aplikacija prostih terminov ne ugiba.";
  const draft = !offer ? manualSlotDraft(slots, checkedAt) : null;
  function run(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try { await operation(); }
      catch { setMessage("Ni bilo mogoče preveriti shranjenega stanja termina. Osvežite primer pred ponovitvijo; vneseni podatki ostanejo prikazani."); }
      finally { inFlight.current = false; }
    });
  }
  function create() {
    if (pending || !attested || blocked) return;
    const draft = manualSlotDraft(slots);
    if (!draft.ok) {
      setMessage(draft.message);
      return;
    }
    run(async () => {
      const result = await proposeManualSlots(serviceRequestId, appointmentType, draft.slots, reference);
      setMessage(result.ok ? "Tri ročno preverjene možnosti so shranjene kot predlog." : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  function advance(action: "send" | "select" | "confirm" | "confirm_synthetic" | "cancel") {
    if (!offer || pending || !attested || blocked) return;
    run(async () => {
      const result = await advanceManualSlotOffer(offer.id, action, reference,
        action === "select" ? selected : undefined);
      setMessage(result.ok ? action === "confirm_synthetic" ? "Termin je shranjen za testni primer; zunanje rezervacije ni." : demo ? "Korak je shranjen; sporočilo ni poslano in termin ni rezerviran." : "Dejanski ročni korak termina je shranjen." : result.message);
      if (result.ok) { setAttested(false); setReference(""); router.refresh(); }
    });
  }
  function cancel() {
    if (!offer || pending || !cancelAttested || cancelReference.trim().length < 4) return;
    run(async () => {
      const result = await advanceManualSlotOffer(offer.id, "cancel", cancelReference);
      setMessage(result.ok ? "Neveljavna ponudba terminov je umaknjena; pripravite nove možnosti." : result.message);
      if (result.ok) {
        setCancelAttested(false); setCancelReference(""); setAttested(false);
        setReference(""); setSlots(["", "", ""]); router.refresh();
      }
    });
  }
  return <section className="rounded-xl border bg-white p-4 space-y-3">
    <h2 className="font-semibold">{title}</h2>{(demo||syntheticQaAllowed||offer?.booking_reference?.startsWith("QA-SIM-"))&&<span data-test-case-badge className="text-xs text-slate-600">Testni primer</span>}
    <p className="text-sm text-amber-800">{statusMessage}</p>
    {offer?.availability_reference?.startsWith("QA-SIM") && <details className="text-xs text-slate-500"><summary>Več podrobnosti</summary><p role="note" className="text-sm text-amber-800">QA-SIM: testni predlogi terminov. Ne potrjujejo dejanske razpoložljivosti delavnice ali rezervacije.</p></details>}
    {offer && <ol className="list-decimal pl-5 text-sm space-y-1">{[offer.slot_1,offer.slot_2,offer.slot_3].map((slot, index) =>
      <li key={index}>{new Date(slot).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "medium", timeStyle: "short" })}
        {offer.selected_slot === index + 1 ? " · izbrano" : ""}</li>)}</ol>}
    {!offer && !blocked && <div className="space-y-2">
      {[0,1,2].map((index) => <label key={index} className="block text-sm">Možnost {index + 1} · Europe/Ljubljana
        <input type="datetime-local" className="mt-1 block min-h-11 w-full rounded border px-2 py-1" value={slots[index]}
          onChange={(event) => setSlots((current) => current.map((value, position) => position === index ? event.target.value : value))} />
      </label>)}
    </div>}
    {!offer && draft && !draft.ok && slots.some(Boolean) && <p role="status" className="text-sm text-amber-800">{draft.message}</p>}
    {!demo && !blocked && offer?.status === "proposed" && <CommunicationDraft key={offer.id} title="Trije predlogi terminov" body={slotProposalMessage([offer.slot_1, offer.slot_2, offer.slot_3])} />}
    {!offer && draft?.ok && attested && reference.trim().length >= 4 && !blocked && <CommunicationDraft key={draft.message} title="Trije predlogi terminov · pred shranjevanjem preverite razpoložljivost" body={draft.message} />}
    {!blocked && offer?.status === "offered" && <label className="block text-sm">Izbrana možnost
      <select className="mt-1 block rounded border px-2 py-1" value={selected}
        onChange={(event) => setSelected(Number(event.target.value))}>
        <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
      </select></label>}
    {!blocked && offer?.status !== "confirmed" && !(demo && !syntheticQaAllowed && offer?.status === "selected") && <>
      <label className="block text-sm">{!offer ? "Kje in kdaj ste preverili razpoložljivost" : offer.status === "proposed" ? demo ? "Referenca sporočila" : "Referenca dejansko poslanih možnosti" : offer.status === "offered" ? "Referenca strankine izbire" : syntheticQaAllowed ? "Referenca potrditve" : "Referenca dejanske ročne rezervacije"}
        <input className="mt-1 block w-full rounded border px-2 py-1" value={reference} maxLength={200}
          onChange={(event) => setReference(event.target.value)} placeholder={!offer ? "Npr. koledar delavnice, datum in čas preverjanja" : "Datum, kanal in zapis dogovora"} />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
        {!offer ? demo ? "Pripravil sem tri možnosti za označeni testni primer; zunanja razpoložljivost ni potrjena." : "Tri termine sem dejansko preveril v svojem koledarju."
          : offer.status === "proposed" ? demo ? "Evidentiram korak za testni primer; sporočilo ne bo poslano." : "Te tri možnosti sem dejansko poslal stranki."
            : offer.status === "offered" ? demo ? "Evidentiram izbiro za testni primer." : "Prejel sem dejansko izbiro stranke."
              : syntheticQaAllowed ? "Potrjujem termin za testni primer; zunanja rezervacija ni potrjena." : "Izbrani termin sem dejansko rezerviral v svojem koledarju."}
      </label>
      <div className="flex flex-wrap gap-2">
        {!offer ? <button type="button" disabled={pending || !attested || reference.trim().length < 4 || !draft?.ok}
          onClick={create} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Shrani tri možnosti</button>
          : offer.status === "proposed" ? <button type="button" disabled={pending || !attested || reference.trim().length < 4}
            onClick={() => advance("send")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{demo ? "Evidentiraj možnosti" : "Evidentiraj dejansko pošiljanje"}</button>
            : offer.status === "offered" ? <button type="button" disabled={pending || !attested || reference.trim().length < 4}
              onClick={() => advance("select")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Evidentiraj strankino izbiro</button>
              : <button type="button" disabled={pending || !attested || reference.trim().length < 4}
                  onClick={() => advance(syntheticQaAllowed ? "confirm_synthetic" : "confirm")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">{syntheticQaAllowed ? "Potrdi termin" : "Potrdi ročno rezerviran termin"}</button>}
      </div>
    </>}
    {demo && !syntheticQaAllowed && offer?.status === "selected" && <p className="text-sm text-amber-800">Termin ni rezerviran. Zunanja rezervacija trenutno ni na voljo.</p>}
    {offer?.status === "confirmed" && <p className="text-xs text-slate-600">{offer.booking_reference?.startsWith("QA-SIM-") ? "Referenca testnega primera; zunanje rezervacije ni:" : "Referenca ročne rezervacije:"} {offer.booking_reference}</p>}
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
