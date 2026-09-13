"use client";

import { useMemo, useState } from "react";
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
  const [period, setPeriod] = useState<DashboardPeriodId>("danes");
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
