"use client";

import { AlertTriangle } from "lucide-react";
import type { WorkflowStatusConfig } from "@/lib/dashboard/statuses";

interface WorkflowStatusSummaryProps {
  items: Array<WorkflowStatusConfig & { count: number }>;
  attentionCount: number;
  activeStatus: string;
  onSelectStatus: (status: WorkflowStatusConfig["id"]) => void;
  onSelectAttention: () => void;
}

export function WorkflowStatusSummary({
  items,
  attentionCount,
  activeStatus,
  onSelectStatus,
  onSelectAttention,
}: WorkflowStatusSummaryProps) {
  return (
    <section aria-label="Povzetek workflow statusov">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <button
            type="button"
            aria-pressed={activeStatus === item.id}
            onClick={() => onSelectStatus(item.id)}
            key={item.id}
            className={`flex min-w-[96px] flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${activeStatus === item.id ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-400"}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${item.counterClass}`}
            >
              {item.count}
            </span>
            <span className="min-w-0 text-xs leading-snug font-medium text-slate-700">
              {item.label}
            </span>
          </button>
        ))}

        <button type="button" onClick={onSelectAttention} className="flex min-w-[140px] shrink-0 items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left shadow-sm hover:border-red-500 focus-visible:outline-2 focus-visible:outline-red-600">
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
        </button>
      </div>
    </section>
  );
}
