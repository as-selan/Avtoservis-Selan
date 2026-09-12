"use client";

import { Clock3 } from "lucide-react";
import type { ActivityItemDemo } from "@/lib/dashboard/types";

interface RecentActivityProps {
  items: ActivityItemDemo[];
}

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">
            Nedavna aktivnost
          </h2>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Prikaži vse
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            Ni aktivnosti za izbrano obdobje.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex gap-3 px-4 py-3">
              <span className="w-10 shrink-0 text-xs font-semibold text-slate-600">
                {item.time}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{item.description}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.actor} · {item.timeAgo}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
