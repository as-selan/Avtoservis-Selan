"use client";

import type { DashboardPeriodId } from "@/lib/dashboard/types";
import {
  DASHBOARD_PERIOD_HELP,
  DASHBOARD_PERIOD_OPTIONS,
} from "@/lib/dashboard/period";

interface DashboardPeriodFilterProps {
  value: DashboardPeriodId;
  onChange: (value: DashboardPeriodId) => void;
}

export function DashboardPeriodFilter({
  value,
  onChange,
}: DashboardPeriodFilterProps) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-3 sm:max-w-md">
      <label
        htmlFor="dashboard-period"
        className="block text-xs font-semibold tracking-wide text-slate-700 uppercase"
      >
        Obdobje nadzorne plošče
      </label>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        {DASHBOARD_PERIOD_HELP}
      </p>
      <select
        id="dashboard-period"
        value={value}
        onChange={(e) => onChange(e.target.value as DashboardPeriodId)}
        className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      >
        {DASHBOARD_PERIOD_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
