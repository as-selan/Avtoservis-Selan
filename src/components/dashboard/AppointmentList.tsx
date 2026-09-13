"use client";

import { CalendarDays } from "lucide-react";
import type { AppointmentDemo, AppointmentType } from "@/lib/dashboard/types";
import { DASHBOARD_APPOINTMENT_WINDOW_DAYS } from "@/lib/dashboard/appointment-window";

const TYPE_STYLES: Record<
  AppointmentType,
  { label: string; className: string }
> = {
  sprejem: {
    label: "Sprejem",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  servis: {
    label: "Servis",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  diagnoza: {
    label: "Diagnoza",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
  },
};

interface AppointmentListProps {
  appointments: AppointmentDemo[];
}

export function AppointmentList({ appointments }: AppointmentListProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Termini</h2>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Prikaži vse termine
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {appointments.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            {`Ni potrjenih terminov v naslednjih ${DASHBOARD_APPOINTMENT_WINDOW_DAYS} dneh.`}
          </li>
        ) : (
          appointments.map((item) => {
            const type = TYPE_STYLES[item.type];
            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-14 shrink-0 leading-tight text-slate-800">
                  <span className="block text-[11px] font-medium text-slate-500">
                    {item.dateLabel}
                  </span>
                  <span className="block text-sm font-semibold">{item.time}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.customerName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.vehicleLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${type.className}`}
                >
                  {type.label}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
