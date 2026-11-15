"use client";
import type { DashboardPeriodId } from "@/lib/dashboard/types";
import { DASHBOARD_PERIOD_OPTIONS } from "@/lib/dashboard/period";
export function DashboardPeriodFilter({value,onChange,from,to,onFromChange,onToChange}:{value:DashboardPeriodId;onChange:(value:DashboardPeriodId)=>void;from:string;to:string;onFromChange:(value:string)=>void;onToChange:(value:string)=>void}) {
 return <div className="flex flex-wrap items-end gap-3">
  <label className="block text-sm font-medium text-slate-700">Obdobje<select id="dashboard-period" value={value} onChange={e=>onChange(e.target.value as DashboardPeriodId)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{DASHBOARD_PERIOD_OPTIONS.map(opt=><option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></label>
  {value==='po_zelji'&&<><label className="block text-sm font-medium text-slate-700">Od<input type="date" value={from} max={to||undefined} onChange={e=>onFromChange(e.target.value)} className="mt-1 block min-h-11 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label><label className="block text-sm font-medium text-slate-700">Do<input type="date" value={to} min={from||undefined} onChange={e=>onToChange(e.target.value)} className="mt-1 block min-h-11 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label></>}
 </div>;
}
