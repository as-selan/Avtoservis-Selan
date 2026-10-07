"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewManualQuibiEstimate } from "@/lib/quibi/manual-estimate-action";

export function ReviewManualEstimate({ quoteId, realDevWrite = false }: { quoteId: string; realDevWrite?: boolean }) {
  const router = useRouter();
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function decide(decision: "approve" | "reject") {
    if (!attested || pending) return;
    startTransition(async () => {
      const result = await reviewManualQuibiEstimate(quoteId, decision);
      setMessage(result.ok ? (decision === "approve" ? realDevWrite ? "Cena je odobrena za preverjeno pošiljanje." : "Cena je odobrena za ročno pošiljanje." : "Različica je zavrnjena za popravek.") : result.message);
      if (result.ok) router.refresh();
    });
  }
  return <div className="space-y-2 border-t pt-3">
    <h3 className="font-medium">Tadejev pregled dejanske vsebine</h3>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
      Odprl sem Quibijev dokument in pregledal postavke ter ceno.
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!attested || pending} onClick={() => decide("approve")}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Odobri ceno za pošiljanje</button>
      <button type="button" disabled={!attested || pending} onClick={() => decide("reject")}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Zavrni za popravek</button>
    </div>
    {message && <p role={message.startsWith("Cena je") || message.startsWith("Različica je") ? "status" : "alert"} className="text-sm">{message}</p>}
  </div>;
}
