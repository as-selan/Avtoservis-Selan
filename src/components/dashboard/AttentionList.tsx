"use client";

import { AlertTriangle } from "lucide-react";
import type { AttentionItemDemo } from "@/lib/dashboard/types";

interface AttentionListProps {
  items: AttentionItemDemo[];
}

export function AttentionList({ items }: AttentionListProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">
            Potrebna pozornost
          </h2>
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Prikaži vse
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  item.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {item.primaryAction}
                  </button>
                  {item.secondaryAction ? (
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {item.secondaryAction}
                    </button>
                  ) : null}
                  <span className="ml-auto text-[11px] text-slate-400">
                    {item.timeLabel}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
