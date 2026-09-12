"use client";

import { useMemo, useState } from "react";
import type { DashboardPeriodId, WorkflowStatusId } from "@/lib/dashboard/types";
import {
  DEMO_ATTENTION_ITEMS,
  DEMO_WORKFLOW_BASE_COUNTS,
  buildDemoActivity,
  buildDemoAppointments,
  buildDemoServiceOrders,
} from "@/lib/dashboard/demo-data";
import {
  isDateInPeriod,
  workshopDateToNoonIso,
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

export function DashboardPageClient() {
  const { setOpen: setManualOpen } = useManualEntry();
  const [period, setPeriod] = useState<DashboardPeriodId>("danes");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusId | "all">(
    "all",
  );
  const now = useDashboardNow();

  const demoOrders = useMemo(() => buildDemoServiceOrders(now), [now]);
  const demoAppointments = useMemo(() => buildDemoAppointments(now), [now]);
  const demoActivity = useMemo(() => buildDemoActivity(now), [now]);

  const orders = useMemo(() => {
    return demoOrders.filter((o) => isDateInPeriod(o.updatedAt, period, now));
  }, [period, now, demoOrders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const workflowCounts = useMemo(() => {
    const scale = period === "vsi" ? 1 : period === "danes" ? 0.55 : 0.75;
    return WORKFLOW_STATUSES.map((status) => {
      const base = DEMO_WORKFLOW_BASE_COUNTS[status.id] ?? 0;
      const fromRows = orders.filter((o) => o.status === status.id).length;
      const display =
        period === "vsi"
          ? Math.max(base, fromRows)
          : Math.max(fromRows, Math.round(base * scale));
      return { ...status, count: display };
    });
  }, [orders, period]);

  const appointments = useMemo(
    () =>
      demoAppointments.filter((a) =>
        isDateInPeriod(workshopDateToNoonIso(a.date), period, now),
      ),
    [period, now, demoAppointments],
  );

  const attention = DEMO_ATTENTION_ITEMS;
  const activity = useMemo(
    () =>
      demoActivity.filter((a) => isDateInPeriod(a.occurredAt, period, now)),
    [period, now, demoActivity],
  );

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

      <WorkflowStatusSummary
        items={workflowCounts}
        attentionCount={attention.length}
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
          <AttentionList items={attention} />
          <RecentActivity items={activity} />
        </aside>
      </div>
    </div>
  );
}
