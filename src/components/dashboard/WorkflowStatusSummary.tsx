"use client";

import { AlertTriangle } from "lucide-react";
import type { WorkflowStatusConfig } from "@/lib/dashboard/statuses";

interface WorkflowStatusSummaryProps {
  items: Array<WorkflowStatusConfig & { count: number }>;
  attentionCount: number;
}

export function WorkflowStatusSummary({
  items,
  attentionCount,
}: WorkflowStatusSummaryProps) {
  return (
    <section aria-label="Povzetek workflow statusov">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex min-w-[96px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${item.counterClass}`}
            >
              {item.count}
            </span>
            <span className="min-w-0 text-xs leading-snug font-medium text-slate-700">
              {item.label}
            </span>
          </div>
        ))}

        <div className="flex min-w-[140px] shrink-0 items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-red-700">
              {attentionCount}
            </span>
            <span className="block text-xs font-medium text-red-700/90">
              Potrebna pozornost
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
