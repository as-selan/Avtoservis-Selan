"use client";

import { Bell, Menu, Plus, Search } from "lucide-react";
import { CURRENT_USER } from "@/lib/dashboard/navigation";

interface AppHeaderProps {
  onOpenMobileNav: () => void;
  onOpenManualEntry: () => void;
}

export function AppHeader({
  onOpenMobileNav,
  onOpenManualEntry,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 lg:px-6">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Odpri meni"
        >
          <Menu className="h-5 w-5" />
        </button>

        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Globalno iskanje</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Išči stranko, telefon, registracijo, VIN, nalog..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        <button
          type="button"
          onClick={onOpenManualEntry}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ročni vnos</span>
        </button>

        <button
          type="button"
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          aria-label="Obvestila (3 neprebrana)"
        >
          <Bell className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            3
          </span>
        </button>

        <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 md:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
            {CURRENT_USER.initials}
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-medium text-slate-800">
              {CURRENT_USER.shortName}
            </span>
            <span className="block text-[11px] text-slate-500">
              {CURRENT_USER.role}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
