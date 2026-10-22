"use client";

import {usePathname} from "next/navigation";
import { Menu, Plus } from "lucide-react";
import type { DashboardShellUser } from "@/lib/auth/shellUser";
import { shortNameFromDisplayName } from "@/lib/auth/shellUser";

interface AppHeaderProps {
  user: DashboardShellUser;
  onOpenMobileNav: () => void;
  onOpenManualEntry: () => void;
}

export function AppHeader({
  user,
  onOpenMobileNav,
  onOpenManualEntry,
}: AppHeaderProps) {
  const showManualEntry=usePathname()!=="/dashboard";
  const shortName = shortNameFromDisplayName(user.displayName);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 lg:px-6">
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Odpri meni"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">Servisni primeri</p><p className="hidden text-xs text-slate-500 sm:block">Avtoservis Selan</p></div>

        {showManualEntry&&<button
          type="button"
          onClick={onOpenManualEntry}
          aria-label="Ročni vnos"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ročni vnos</span>
        </button>}

        <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 md:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
            {user.initials}
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-medium text-slate-800">
              {shortName}
            </span>
            <span className="block text-[11px] text-slate-500">{user.role}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
