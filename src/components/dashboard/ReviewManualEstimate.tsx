"use client";
import {CasePrimaryAction} from './CasePrimaryAction';

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewManualQuibiEstimate } from "@/lib/quibi/manual-estimate-action";

export function ReviewManualEstimate({ quoteId }: { quoteId: string; realDevWrite?: boolean }) {
  const router = useRouter();
  const lock=useRef(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function decide(decision: "approve" | "reject") {
    if (lock.current || pending) return;
    lock.current=true;
    startTransition(async () => {
      try{const result = await reviewManualQuibiEstimate(quoteId, decision);
      setMessage(result.ok ? (decision === "approve" ? "Predračun je odobren. Dokument ni poslan." : "Različica je zavrnjena za popravek.") : result.message);
      if (result.ok || (!result.ok && result.refreshed)) router.refresh();
      }catch{setMessage('Predračuna trenutno ni mogoče potrditi. Poskusite znova.');}finally{lock.current=false;}
    });
  }
  return <div className="space-y-2 border-t pt-3">
    <h3 className="font-medium">Tadejev pregled dejanske vsebine</h3>
    <div className="flex flex-wrap gap-2">
      <CasePrimaryAction><button type="button" disabled={pending} onClick={() => decide("approve")}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Odobri predračun</button></CasePrimaryAction>
      <button type="button" disabled={pending} onClick={() => decide("reject")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Zavrni za popravek</button>
    </div>
    {message && <p role={message.startsWith("Predračun je") || message.startsWith("Različica je") ? "status" : "alert"} className="text-sm">{message}</p>}
  </div>;
}
