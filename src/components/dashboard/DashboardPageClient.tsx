"use client";

import Link from "next/link";
import {intakeQueue, filterIntakeQueue, INTAKE_QUEUE_GROUPS, type IntakeQueueGroup} from "@/lib/dashboard/intake-queue";
import {useRouter} from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardPeriodId, DashboardSnapshot, WorkflowStatusId } from "@/lib/dashboard/types";
import {
  isDateInPeriod,
} from "@/lib/dashboard/period";
import { useDashboardNow } from "@/lib/dashboard/useDashboardNow";
import { WORKFLOW_STATUSES } from "@/lib/dashboard/statuses";
import { DashboardPeriodFilter } from "@/components/dashboard/DashboardPeriodFilter";
import { WorkflowStatusSummary } from "@/components/dashboard/WorkflowStatusSummary";
import { ActiveServiceOrders } from "@/components/dashboard/ActiveServiceOrders";
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
  const [queueGroup,setQueueGroup]=useState<IntakeQueueGroup>('all');
  const [queueSearch,setQueueSearch]=useState('');
  const queue=useMemo(()=>initialData.ok?intakeQueue(initialData.orders):[],[initialData]);
  const visibleQueue=filterIntakeQueue(queue,queueGroup,queueSearch);
  const [period, setPeriod] = useState<DashboardPeriodId>("vsi");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusId | "all">(
    "all",
  );
  const now = useDashboardNow(initialData.generatedAt);

  const orders = useMemo(() => {
    if (!initialData.ok) return [];
    return initialData.orders.filter((o) =>
      isDateInPeriod(o.updatedAt, period, now),
    );
  }, [period, now, initialData]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const workflowCounts = useMemo(() => {
    return WORKFLOW_STATUSES.map((status) => {
      const count = orders.filter((o) => o.status === status.id).length;
      return { ...status, count };
    });
  }, [orders]);

  const attention = useMemo(() => {
    if (!initialData.ok) return [];
    return initialData.attention.filter((item) => {
      if (!item.occurredAt) return true;
      return isDateInPeriod(item.occurredAt, period, now);
    });
  }, [initialData, period, now]);

  const appointments = initialData.ok ? initialData.appointments : [];

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
            Nadzorna plošča
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pregled servisnih nalogov, terminov in naslednjih korakov.
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
            Nadzorna plošča
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pregled servisnih nalogov, terminov in naslednjih korakov.
          </p>
        </div>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </div>

      <section aria-labelledby="incoming-heading" className="rounded-xl border border-blue-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="incoming-heading" className="font-semibold">Čakalna vrsta povpraševanj · {queue.length}</h2><button disabled={refreshing} onClick={()=>startRefresh(()=>router.refresh())} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{refreshing?'Osvežujem…':'Osveži povpraševanja'}</button></div>
        <p className="mt-1 text-sm text-slate-600">Vsi odprti primeri, ne glede na spodnji filter obdobja. Najnovejša aktivnost je na vrhu; vsak primer je prikazan enkrat. Poslovne odločitve potrdi Tadej.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Vrsta naslednjega koraka">
          {INTAKE_QUEUE_GROUPS.map(group=><button key={group.id} type="button" aria-pressed={queueGroup===group.id} onClick={()=>setQueueGroup(group.id)} className={'min-h-11 rounded border px-3 py-2 text-sm '+(queueGroup===group.id?'border-blue-700 bg-blue-50 font-semibold text-blue-900':'border-slate-200 text-slate-700')}>{group.label} · {group.id==='all'?queue.length:queue.filter(row=>row.group===group.id).length}</button>)}
        </div>
        <label className="mt-3 block text-sm">Poišči v čakalni vrsti<input value={queueSearch} onChange={event=>setQueueSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" placeholder="Stranka, registracija, številka primera ali storitev"/></label>
        <p role="status" className="mt-2 text-xs text-slate-500">Prikazano {visibleQueue.length} od {queue.length} odprtih primerov.</p>
        {visibleQueue.length?<ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">{visibleQueue.map(({order:o,group,label,href})=><li key={o.serviceRequestId} className="rounded border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{o.customerName} · {o.vehicleMakeModel}{o.registration?' · '+o.registration:''}</p><span className="text-xs text-slate-500">#{o.id} · {o.updatedLabel}</span></div><p className="mt-1 text-xs font-semibold text-blue-800">{INTAKE_QUEUE_GROUPS.find(item=>item.id===group)?.label}</p><p className="text-sm text-slate-600">{o.requestSummary}</p>{o.intakeConnectionLabel&&<p className="text-xs text-slate-600">{o.intakeConnectionLabel}</p>}<Link className="mt-2 inline-block min-h-11 py-2 font-medium text-blue-700" href={href}>{label} →</Link></li>)}</ul>:<p className="mt-3 text-sm text-slate-600">{queue.length?'Ni primerov za izbrani filter ali iskanje.':'Ni odprtih povpraševanj za obravnavo.'}</p>}
      </section>
      <WorkflowStatusSummary
        items={workflowCounts}
        attentionCount={attention.length}
        activeStatus={statusFilter}
        onSelectStatus={(status) => setStatusFilter(statusFilter === status ? "all" : status)}
        onSelectAttention={() => {
          document.getElementById("dashboard-attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("dashboard-attention")?.focus({ preventScroll: true });
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <ActiveServiceOrders
            orders={filteredOrders}
            totalCount={orders.length}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onOpenManualEntry={() => setManualOpen(true)}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <AppointmentList appointments={appointments} />
          <div id="dashboard-attention" tabIndex={-1}><AttentionList items={attention} /></div>
          <RecentActivity items={activity} />
        </aside>
      </div>
    </div>
  );
}
