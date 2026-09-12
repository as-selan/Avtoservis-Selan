"use client";

import { MoreVertical } from "lucide-react";
import type { ServiceOrderDemo } from "@/lib/dashboard/types";
import {
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/dashboard/statuses";

interface ServiceOrderMobileCardProps {
  order: ServiceOrderDemo;
}

export function ServiceOrderMobileCard({ order }: ServiceOrderMobileCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {order.customerName}
          </p>
          <p className="truncate text-sm text-slate-600">
            {order.vehicleMakeModel}
            {order.registration ? ` · ${order.registration}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-slate-500">#{order.id}</span>
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label={`Dejanja za nalog ${order.id}`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(order.status)}`}
        >
          {getStatusLabel(order.status)}
        </span>
        {order.appointmentTime ? (
          <span className="text-xs font-medium text-slate-600">
            Termin {order.appointmentTime}
          </span>
        ) : null}
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-slate-600">
        {order.requestSummary}
      </p>

      <button
        type="button"
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
      >
        {order.nextActionLabel} →
      </button>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{order.locationLabel ?? "Lokacija ni znana"}</span>
        <span>{order.updatedLabel}</span>
      </div>
    </article>
  );
}
