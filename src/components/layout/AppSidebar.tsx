"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, ChevronDown, X } from "lucide-react";
import { APP_NAV_ITEMS, CURRENT_USER } from "@/lib/dashboard/navigation";

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname();

  const nav = (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Car className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            Avtoservis Selan
          </p>
          <p className="truncate text-[11px] text-slate-400">Operativni sistem</p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={onMobileClose}
          aria-label="Zapri meni"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Glavna navigacija">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            item.available && item.href
              ? pathname === item.href || pathname.startsWith(`${item.href}/`)
              : false;

          if (!item.available || !item.href) {
            return (
              <div
                key={item.id}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-500"
                title="Kmalu na voljo"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                  Kmalu
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onMobileClose}
              className={[
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-blue-600/90 font-medium text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
            {CURRENT_USER.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {CURRENT_USER.name}
            </span>
            <span className="block truncate text-xs text-slate-400">
              {CURRENT_USER.role}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-[240px] shrink-0 flex-col bg-slate-900 lg:flex">
        {nav}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Zapri ozadje"
            onClick={onMobileClose}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(280px,88vw)] flex-col bg-slate-900 shadow-xl">
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
