"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuibiDevCustomer, createQuibiDevVehicle } from "@/lib/quibi/party-write-actions";

export function QuibiDevPartyCreate({ customerId, vehicleId }: { customerId: string; vehicleId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const lock=useRef(false);
  const [stopped,setStopped]=useState(false);
  const vehicle = Boolean(vehicleId);
  return <form className="space-y-2 rounded border border-blue-200 p-3 text-sm" onSubmit={(event) => {
    event.preventDefault();
    if (pending || stopped || lock.current) return;
    lock.current=true;
    const form = new FormData(event.currentTarget);
    form.set("customerId", customerId);
    if (vehicleId) form.set("vehicleId", vehicleId);
    startTransition(async () => {
      try{const result = vehicle ? await createQuibiDevVehicle(form) : await createQuibiDevCustomer(form);
      setMessage(result.ok ? result.detail : result.message);
      setStopped(true);
      if (result.ok) router.refresh();
      }catch{setStopped(true);setMessage('Izid ni znan. Ne ustvarjajte ponovno; preverite dnevnik in obstoječe Quibi zapise.')}finally{lock.current=false}
    });
  }}>
    <p>{vehicle
      ? "Pred ustvarjanjem bo Quibi ponovno preverjen za isto stranko, registracijo in številko šasije."
      : "Pred ustvarjanjem bo Quibi ponovno preiskan po Selanovem ID-ju, imenu in kontaktih."}</p>
    <label className="flex gap-2"><input type="checkbox" name="confirmed" value="yes" required />
      Preveril sem prikazane zapise in potrjujem, da ustreznega zapisa še ni.</label>
    <button disabled={pending||stopped} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">
      {pending ? "Preverjam…" : stopped ? "Zahteva zaključena ali ustavljena" : vehicle ? "Ustvari vozilo v Quibiju" : "Ustvari stranko v Quibiju"}
    </button>
    {message && <p role="status">{message}</p>}
  </form>;
}
