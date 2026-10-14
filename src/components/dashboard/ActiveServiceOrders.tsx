"use client";

import { Plus } from "lucide-react";
import type { ServiceOrderDemo, WorkflowStatusId } from "@/lib/dashboard/types";
import { WORKFLOW_STATUSES } from "@/lib/dashboard/statuses";
import { ServiceOrderTable } from "@/components/dashboard/ServiceOrderTable";
import { ServiceOrderMobileCard } from "@/components/dashboard/ServiceOrderMobileCard";

interface ActiveServiceOrdersProps {
  orders: ServiceOrderDemo[];
  totalCount: number;
  statusFilter: WorkflowStatusId | "all";
  onStatusFilterChange: (value: WorkflowStatusId | "all") => void;
  onOpenManualEntry: () => void;
}

export function ActiveServiceOrders({
  orders,
  totalCount,
  statusFilter,
  onStatusFilterChange,
  onOpenManualEntry,
}: ActiveServiceOrdersProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Servisni primeri
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Povpraševanja in potek popravila z naslednjim potrebnim dejanjem.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="status-filter">
            Filtriraj po statusu
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as WorkflowStatusId | "all")
            }
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Vsi statusi</option>
            {WORKFLOW_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onOpenManualEntry}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-sm font-medium text-white hover:bg-blue-700 sm:hidden"
          >
            <Plus className="h-4 w-4" />
            Ročni vnos
          </button>
        </div>
      </div>

      <div className="hidden md:block">
        <ServiceOrderTable orders={orders} />
      </div>

      <div className="space-y-2 p-3 md:hidden">
        {orders.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            Ni nalogov za izbrano obdobje/status.
          </p>
        ) : (
          orders.map((order) => (
            <ServiceOrderMobileCard
              key={order.serviceRequestId ?? order.id}
              order={order}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onStatusFilterChange("all")}
          className="text-left font-medium text-blue-600 hover:text-blue-700"
        >
          Prikaži vse statuse
        </button>
        <p>
          {orders.length ? "1–" + orders.length : "0"} od {Math.max(totalCount, orders.length)}
        </p>
      </div>
    </section>
  );
}
