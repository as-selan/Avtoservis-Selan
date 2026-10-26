"use client";

import {InspectionChecklist} from './InspectionChecklist';
import {inspectionFindings, type InspectionChecks} from '@/lib/inspections/checklist';
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPreliminaryInspection } from "@/lib/inspections/actions";
import { canAdvancePreliminaryInspection } from "@/lib/inspections/eligibility";

export function PreliminaryInspection({ serviceRequestId, caseStatus, status, findings, repairDecision, realDevWrite = false }: {
  serviceRequestId: string;
  caseStatus: string;
  status: "requested" | "completed" | null;
  findings: string | null;
  repairDecision: "pending" | "ordered" | "not_ordered" | null;
  realDevWrite?: boolean;
}) {
  const router = useRouter();
  const demo = !realDevWrite && (process.env.NEXT_PUBLIC_SELAN_REMOTE_DEMO === "1" || process.env.NEXT_PUBLIC_SELAN_LOCAL_REVIEW === "1");
  const [text, setText] = useState("");
  const [checks, setChecks] = useState<InspectionChecks>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(action: "request" | "complete" | "repair_ordered" | "repair_not_ordered") {
    if (pending) return;
    startTransition(async () => {
      const result = await recordPreliminaryInspection(serviceRequestId, action, inspectionFindings(checks, text));
      setMessage(result.ok ? "Korak predhodnega pregleda je shranjen." : result.message);
      if (result.ok) { setChecks({}); setText(""); router.refresh(); }
    });
  }
  return <section className="rounded-xl border bg-white p-4 space-y-2">
    <h2 className="font-semibold">Predhodni pregled vozila</h2>
    {!status && canAdvancePreliminaryInspection(caseStatus, "request") && <><p className="text-sm text-slate-600">Če stranka naroči popravilo, je pregled brezplačen. Sicer se zaračuna.</p>
      <button type="button" disabled={pending} onClick={() => submit("request")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Označi potreben predhodni pregled</button></>}
    {status === "requested" && canAdvancePreliminaryInspection(caseStatus, "complete") && <>
      <InspectionChecklist value={checks} onChange={setChecks} disabled={pending}/>
      <label className="block text-sm">Opomba (neobvezno)
        <textarea className="mt-1 block w-full rounded border px-2 py-1" value={text} maxLength={1600}
          onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="button" disabled={pending || inspectionFindings(checks, text).length < 4} onClick={() => submit("complete")}
        className="min-h-12 rounded-lg bg-blue-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">Zabeleži opravljen pregled</button>
    </>}
    {status === "completed" && <>
      <p className="text-sm">Ugotovitve: {findings}</p>{demo&&<span data-test-case-badge className="text-xs text-slate-600">Testni primer</span>}
      {repairDecision === "pending" && canAdvancePreliminaryInspection(caseStatus, "repair_ordered") && <>
        <p className="text-sm text-amber-800">Je stranka naročila popravilo? Ob naročilu je pregled brezplačen.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => submit("repair_ordered")}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50">Popravilo naročeno</button>
          <button type="button" disabled={pending} onClick={() => submit("repair_not_ordered")}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50">Popravilo ni naročeno</button>
        </div>
      </>}
      {repairDecision === "ordered" && <p className="text-sm text-green-800">Odločitev: popravilo je naročeno. Obračun: predhodni pregled je brezplačen; ločen račun pregleda ni potreben.</p>}
      {repairDecision === "not_ordered" && <p className="text-sm text-amber-800">Odločitev: popravilo ni naročeno. Obračun: predhodni pregled je plačljiv. Spodaj preverite storitev, količino, ceno in DDV pred nadaljevanjem v Quibiju.</p>}
    </>}
    {status === "requested" && !canAdvancePreliminaryInspection(caseStatus, "complete") && <p className="text-sm text-amber-800">Stanje primera se je spremenilo. Pred nadaljevanjem pregleda je potreben skrbniški pregled.</p>}
    {status === "completed" && repairDecision === "pending" && !canAdvancePreliminaryInspection(caseStatus, "repair_ordered") && <p className="text-sm text-amber-800">Odločitev o popravilu ni zabeležena; stanje primera zahteva skrbniški pregled.</p>}
    {message && <p role={message.includes("shranjen") ? "status" : "alert"} className="text-sm">{message}</p>}
  </section>;
}
