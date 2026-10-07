"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuibiDevCustomer, createQuibiDevVehicle } from "@/lib/quibi/party-write-actions";

export function QuibiDevPartyCreate({ customerId, vehicleId }: { customerId: string; vehicleId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const vehicle = Boolean(vehicleId);
  return <form className="space-y-2 rounded border border-blue-200 p-3 text-sm" onSubmit={(event) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    form.set("customerId", customerId);
    if (vehicleId) form.set("vehicleId", vehicleId);
    startTransition(async () => {
      const result = vehicle ? await createQuibiDevVehicle(form) : await createQuibiDevCustomer(form);
      setMessage(result.ok ? result.detail : result.message);
      if (result.ok) router.refresh();
    });
  }}>
    <p>{vehicle
      ? "Pred ustvarjanjem bo Quibi ponovno preverjen za isto stranko, registracijo in številko šasije."
      : "Pred ustvarjanjem bo Quibi ponovno preiskan po Selanovem ID-ju, imenu in kontaktih."}</p>
    <label className="flex gap-2"><input type="checkbox" name="confirmed" value="yes" required />
      Preveril sem prikazane zapise in potrjujem, da ustreznega zapisa še ni.</label>
    <button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">
      {pending ? "Preverjam…" : vehicle ? "Ustvari vozilo v Quibiju" : "Ustvari stranko v Quibiju"}
    </button>
    {message && <p role={message.startsWith("Quibi DEV") ? "status" : "alert"}>{message}</p>}
  </form>;
}
