"use client";

import { MoreVertical } from "lucide-react";
import Link from "next/link";
import type { ServiceOrderDemo } from "@/lib/dashboard/types";
import {
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/dashboard/statuses";
import { CreateCompletionLinkButton } from "@/components/dashboard/CreateCompletionLinkButton";
import { PrepareOfferButton } from "@/components/dashboard/PrepareOfferButton";

interface ServiceOrderTableProps {
  orders: ServiceOrderDemo[];
}

export function ServiceOrderTable({ orders }: ServiceOrderTableProps) {
  if (orders.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Ni nalogov za izbrano obdobje/status.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <th className="px-4 py-2.5 font-semibold">ID naloga</th>
            <th className="px-3 py-2.5 font-semibold">Stranka</th>
            <th className="px-3 py-2.5 font-semibold">Vozilo</th>
            <th className="px-3 py-2.5 font-semibold">Zahteva / opis</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-3 py-2.5 font-semibold">
              Kje je avto · naslednji korak
            </th>
            <th className="px-3 py-2.5 font-semibold">Termin</th>
            <th className="px-3 py-2.5 font-semibold">Posodobljeno</th>
            <th className="px-3 py-2.5 font-semibold">
              <span className="sr-only">Dejanja</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.serviceRequestId ?? order.id}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
            >
              <td className="px-4 py-3 font-medium text-slate-800">
                #{order.id}
              </td>
              <td className="px-3 py-3">
                <div className="font-medium text-slate-800">
                  {order.customerName}
                </div>
                {order.customerPhone ? (
                  <div className="text-xs text-slate-500">
                    {order.customerPhone}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <div className="font-medium text-slate-800">
                  {order.vehicleMakeModel}
                </div>
                {order.registration ? (
                  <div className="text-xs text-slate-500">
                    {order.registration}
                  </div>
                ) : null}
              </td>
              <td className="max-w-[180px] truncate px-3 py-3 text-slate-700">
                {order.requestSummary}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(order.status)}`}
                >
                  {getStatusLabel(order.status)}
                </span>
              </td>
              <td className="px-3 py-3">
                {order.serviceRequestId ? <Link
                  href={`/dashboard/primeri/${order.serviceRequestId}`}
                  className="text-left text-sm font-semibold text-blue-600 hover:text-blue-700"
                >{order.nextActionLabel} →</Link> : <span>{order.nextActionLabel}</span>}
                {order.locationLabel ? (
                  <div className="mt-0.5 text-xs text-slate-500">
                    {order.locationLabel}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3 text-slate-600">
                {order.appointmentTime ?? "—"}
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                {order.updatedLabel}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-end gap-2">
                  {order.status === "manjkajo_podatki" && order.serviceRequestId ? (
                    <CreateCompletionLinkButton
                      serviceRequestId={order.serviceRequestId}
                    />
                  ) : null}
                  {order.status === "priprava_ponudbe" && order.serviceRequestId ? (
                    <PrepareOfferButton
                      serviceRequestId={order.serviceRequestId}
                      alreadyPrepared={order.offerPreparationReady === true}
                    />
                  ) : null}
                  {order.serviceRequestId ? <Link
                    href={`/dashboard/primeri/${order.serviceRequestId}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={`Dejanja za nalog ${order.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Link> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
