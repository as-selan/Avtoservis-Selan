"use client";
import {CasePrimaryAction} from './CasePrimaryAction';

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewServiceRequestIntake } from "@/lib/cases/review-intake-action";

export function ReviewIntakeButton({ serviceRequestId, blockedReason }: { serviceRequestId: string; blockedReason?:string|null }) {
  const router = useRouter();
  const lock=useRef(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function review() {
    if (lock.current || pending || blockedReason) return;
    lock.current=true;
    startTransition(async () => {
      try{const result = await reviewServiceRequestIntake(serviceRequestId);
      setMessage(result.message);
      if (result.ok) router.refresh();}catch{setMessage("Sprejem ni potrjen. Podatki povpraševanja ostajajo shranjeni; osvežite stran in preverite stanje.")}finally{lock.current=false}
    });
  }

  if(blockedReason)return null;
  return <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
    <p className="font-semibold">Tadejev pregled sprejema</p>
    <p>Pred nadaljevanjem preverite kontaktne podatke, stranko, vozilo in opis storitve. Sprejem ne ustvari predračuna.</p>
    <CasePrimaryAction>    <button type="button" disabled={pending || !!blockedReason} onClick={review}
      className="rounded bg-blue-700 px-3 py-2 font-medium text-white disabled:opacity-50">
      Sprejmi primer za pripravo ponudbe
    </button></CasePrimaryAction>
    {blockedReason&&<p role="status">{blockedReason}</p>}
    {message && <p role={message.startsWith("Primer je sprejet") ? "status" : "alert"}>{message}</p>}
  </div>;
}
