"use client";

import Link from "next/link";
import {defaultDashboardGroup, matchesDashboardSearch, dashboardStatusLabel, uniqueDashboardOrders, dashboardQueue, isSyntheticOrder, shortNextAction, filterDashboardQueue, DASHBOARD_GROUPS, type DashboardGroup} from "@/lib/dashboard/intake-queue";
import {useRouter} from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardPeriodId, DashboardSnapshot, WorkflowStatusId } from "@/lib/dashboard/types";
import {
  isDateInPeriod,
} from "@/lib/dashboard/period";
import { useDashboardNow } from "@/lib/dashboard/useDashboardNow";
import { WORKFLOW_STATUSES, getStatusBadgeClass } from "@/lib/dashboard/statuses";
import { DashboardPeriodFilter } from "@/components/dashboard/DashboardPeriodFilter";
import { WorkflowStatusSummary } from "@/components/dashboard/WorkflowStatusSummary";
import { AppointmentList } from "@/components/dashboard/AppointmentList";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { useManualEntry } from "@/components/dashboard/ManualEntryContext";

interface DashboardPageClientProps {
  initialData: DashboardSnapshot;
}

export function DashboardPageClient({ initialData }: DashboardPageClientProps) {
  const { setOpen: setManualOpen } = useManualEntry();
  const router=useRouter();const [refreshing,startRefresh]=useTransition();
  useEffect(()=>{let lastRefresh=Date.now();const refresh=()=>{const active=document.activeElement;if(document.visibilityState!=='visible'||active?.matches('input,textarea,select,[contenteditable="true"]')||Date.now()-lastRefresh<15000)return;lastRefresh=Date.now();startRefresh(()=>router.refresh());};const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[router]);
  const [queueGroup,setQueueGroup]=useState<DashboardGroup>(()=>defaultDashboardGroup(initialData.ok?initialData.orders:[]));
  const [queueSearch,setQueueSearch]=useState('');
  const testOrders=useMemo(()=>initialData.ok?uniqueDashboardOrders(initialData.orders).filter(isSyntheticOrder):[],[initialData]);
  const testIds=new Set(testOrders.map(order=>order.serviceRequestId));
  const queue=useMemo(()=>initialData.ok?dashboardQueue(initialData.orders.filter(order=>!isSyntheticOrder(order))):[],[initialData]);
  const visibleQueue=queueSearch.trim()?queue.filter(row=>matchesDashboardSearch(row.order,queueSearch)):filterDashboardQueue(queue,queueGroup,'');
  const visibleTests=testOrders.filter(order=>matchesDashboardSearch(order,queueSearch));
  const [period, setPeriod] = useState<DashboardPeriodId>("vsi");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusId | "all">(
    "all",
  );
  const now = useDashboardNow(initialData.generatedAt);

  const orders = useMemo(() => {
    if (!initialData.ok) return [];
    return initialData.orders.filter((o) => !isSyntheticOrder(o)&&
      isDateInPeriod(o.updatedAt, period, now),
    );
  }, [period, now, initialData]);

  const workflowCounts = useMemo(() => {
    return WORKFLOW_STATUSES.map((status) => {
      const count = orders.filter((o) => o.status === status.id).length;
      return { ...status, count };
    });
  }, [orders]);

  const attention = initialData.ok ? initialData.attention.filter(item=>!testIds.has(item.id)) : [];

  const appointments = initialData.ok ? initialData.appointments.filter(item=>!item.simulated&&!testIds.has(item.id)&&!/^(?:QA-SIM(?:\b|[-_])|TEST(?:[-_\s:]|$))/i.test(item.customerName.trim())) : [];

  const activity = useMemo(() => {
    if (!initialData.ok) return [];
    return initialData.activity.filter((a) =>
      isDateInPeriod(a.occurredAt, period, now),
    );
  }, [initialData, period, now]);

  if (!initialData.ok) {
    return (
      <div className="space-y-4 lg:space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Dnevno delo
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Primeri in naslednje opravilo na enem mestu.
          </p>
        </div>
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800"
          role="alert"
        >
          {initialData.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Dnevno delo
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Primeri in naslednje opravilo na enem mestu.
          </p>
        </div>
        <button type="button" onClick={() => setManualOpen(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">+ Novo povpraševanje</button>
      </div>

      <section aria-label="Pregled primerov" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="sr-only">Poišči primer</span>
              <input type="search" value={queueSearch} onChange={event=>setQueueSearch(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Poišči stranko, registracijo ali delo …" />
            </label>
            {queueSearch&&<button type="button" onClick={()=>setQueueSearch('')} className="min-h-11 rounded-lg px-4 text-sm text-slate-600" aria-label="Počisti iskanje">Počisti</button>}

          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Skupine primerov">
            {DASHBOARD_GROUPS.map(group=><button key={group.id} type="button" aria-pressed={queueGroup===group.id} onClick={()=>setQueueGroup(group.id)} className={'flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-4 '+(queueGroup===group.id?'border-blue-600 bg-blue-50 text-blue-900':'border-slate-200 text-slate-600 hover:bg-slate-50')}><span>{group.label}</span><span className="text-lg tabular-nums">{queue.filter(row=>row.group===group.id).length}</span></button>)}
          </div>
        </div>
        <p role="status" className="px-5 py-3 text-xs text-slate-500">{visibleQueue.length} primerov{queueSearch.trim()?' za iskanje »'+queueSearch.trim()+'«':''}</p>
        {visibleQueue.length ? <ul className="divide-y divide-slate-100 border-t border-slate-100">{visibleQueue.map(item=>{const {order:o,href}=item;return <li key={o.serviceRequestId} className="px-5 py-3 transition-colors hover:bg-slate-50/70">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-6">
            <div className="min-w-0"><p className="font-semibold text-slate-900">{o.customerName}</p><p className="mt-1 text-sm text-slate-600">{o.vehicleMakeModel}{o.registration&&<span className="ml-2 font-medium text-slate-800">{o.registration}</span>}</p></div>
            <div className="min-w-0">{(o.mechanicName||o.mechanicEmail)&&<p className="mb-1 text-sm font-medium text-slate-700">{o.mechanicName||o.mechanicEmail}</p>}<span className={'mt-2 inline-block rounded-md px-2 py-1 text-xs font-medium '+getStatusBadgeClass(o.status)}>{dashboardStatusLabel(o)}</span></div>
            <Link href={href} className="group flex min-h-11 items-center justify-between gap-3 rounded-lg py-2 text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"><span>{shortNextAction(item)}</span><span aria-hidden="true" className="text-xl transition-transform group-hover:translate-x-1">→</span></Link>
          </div>
        </li>})}</ul> : <div className="border-t border-slate-100 px-5 py-12 text-center"><p className="font-medium text-slate-700">{queueSearch.trim()?(visibleTests.length?'Testni zadetki so v ločenem razdelku spodaj.':'Ni zadetkov za to iskanje.'):'V tej skupini trenutno ni primerov.'}</p><p className="mt-1 text-sm text-slate-500">{queueSearch.trim()?'Poskusite drugo ime, registracijo ali opis dela.':'Izberite drugo skupino ali dodajte novo povpraševanje.'}</p></div>}
      </section>
      {testOrders.length>0&&<details key={queueSearch.trim()?'search:'+queueSearch:'all-tests'} open={!!queueSearch.trim()&&visibleTests.length>0} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Testni primeri ({visibleTests.length})</summary><ul className="mt-3 divide-y divide-slate-100">{visibleTests.map(order=><li key={order.serviceRequestId??order.id} className="py-3 text-sm"><Link className="inline-flex min-h-11 items-center text-blue-700 underline" href={'/dashboard/primeri/'+order.serviceRequestId}>#{order.id} · {order.customerName} · {order.vehicleMakeModel}{order.registration?' · '+order.registration:''}</Link><p className="text-xs text-slate-500">{dashboardStatusLabel(order)}</p></li>)}</ul></details>}
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-800">Vsi primeri in zgodovina</summary>
        <p className="my-3 text-sm text-slate-600">Dodatni pregled po obdobju in statusu, vključno z zaključenimi primeri. Skupine zgoraj prikazujejo primere iz vseh obdobij.</p>
        <button type="button" disabled={refreshing} onClick={()=>startRefresh(()=>router.refresh())} className="min-h-11 rounded-lg px-4 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">{refreshing?'Osvežujem…':'Osveži'}</button>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
        <div className="mt-4 space-y-4">
      <WorkflowStatusSummary
        items={workflowCounts}
        attentionCount={attention.length}
        activeStatus={statusFilter}
        onSelectStatus={(status) => setStatusFilter(statusFilter === status ? "all" : status)}
        onSelectAttention={() => {
          const panel = document.getElementById("dashboard-attention")?.closest("details");
          if (panel) panel.open = true;
          document.getElementById("dashboard-attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("dashboard-attention")?.focus({ preventScroll: true });
        }}
      />

      <p className="text-sm text-slate-500">Vsi primeri so prikazani enkrat v zgornjih skupinah. Zaključene najdete pod »Zaključeno«.</p>
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-800">Termini, opozorila in aktivnost</summary><div className="mt-4 grid gap-4 lg:grid-cols-2">
        <aside className="contents">
          <AppointmentList appointments={appointments} />
          <div id="dashboard-attention" tabIndex={-1}><AttentionList items={attention} /></div>
          {activity.length > 0 && <RecentActivity items={activity} />}
        </aside>
      </div></details>
    </div>
  );
}
