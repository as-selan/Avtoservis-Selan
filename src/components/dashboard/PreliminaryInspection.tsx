"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPreliminaryInspection } from "@/lib/inspections/actions";

export function PreliminaryInspection({ serviceRequestId, status, findings, repairDecision }: {
  serviceRequestId: string;
  status: "requested" | "completed" | null;
  findings: string | null;
  repairDecision: "pending" | "ordered" | "not_ordered" | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(action: "request" | "complete" | "repair_ordered" | "repair_not_ordered") {
    if (pending || (action !== "request" && !attested)) return;
    startTransition(async () => {
      const result = await recordPreliminaryInspection(serviceRequestId, action, text);
      setMessage(result.ok ? "Korak predhodnega pregleda je shranjen." : result.message);
      if (result.ok) { setAttested(false); setText(""); router.refresh(); }
    });
  }
  return <section className="rounded-xl border bg-white p-4 space-y-2">
    <h2 className="font-semibold">Predhodni pregled vozila</h2>
    {!status && <><p className="text-sm text-slate-600">Če je potreben predhodni pregled, ga zabeležite pri istem primeru. Termin dogovorite in preverite ročno v MyPlanlyju.</p>
      <button type="button" disabled={pending} onClick={() => submit("request")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Označi potreben predhodni pregled</button></>}
    {status === "requested" && <>
      <p className="text-sm text-amber-800">Pregled je potreben. Termin in razpoložljivost je treba potrditi ročno; v aplikaciji še ni zunanje rezervacije.</p>
      <label className="block text-sm">Dejanske ugotovitve po opravljenem pregledu
        <textarea className="mt-1 block w-full rounded border px-2 py-1" value={text} maxLength={2000}
          onChange={(event) => setText(event.target.value)} />
      </label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
        Pregled je bil dejansko opravljen; navedene ugotovitve so resnične.</label>
      <button type="button" disabled={pending || !attested || text.trim().length < 4} onClick={() => submit("complete")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Zabeleži opravljen pregled</button>
    </>}
    {status === "completed" && <>
      <p className="text-sm">Ugotovitve: {findings}</p>
      {repairDecision === "pending" && <>
        <p className="text-sm text-amber-800">Obračun pregleda še ni določen: čaka na dejansko odločitev o popravilu. Cene in računa aplikacija ne ustvarja.</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
          Potrdil sem dejansko odločitev stranke o naročilu popravila.</label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !attested} onClick={() => submit("repair_ordered")}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50">Popravilo naročeno</button>
          <button type="button" disabled={pending || !attested} onClick={() => submit("repair_not_ordered")}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50">Popravilo ni naročeno</button>
        </div>
      </>}
      {repairDecision === "ordered" && <p className="text-sm text-green-800">Popravilo je naročeno: predhodni pregled je brezplačen.</p>}
      {repairDecision === "not_ordered" && <p className="text-sm text-amber-800">Popravilo ni naročeno: predhodni pregled je plačljiv. Znesek in izdajo računa uredite po potrjenih pravilih v Quibiju.</p>}
    </>}
    {message && <p role={message.includes("shranjen") ? "status" : "alert"} className="text-sm">{message}</p>}
  </section>;
}
