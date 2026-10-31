"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, LogOut, X } from "lucide-react";
import { isAvailableNavActive } from "@/lib/dashboard/nav-active";
import { APP_NAV_ITEMS } from "@/lib/dashboard/navigation";
import type { DashboardShellUser } from "@/lib/auth/shellUser";

interface AppSidebarProps {
  user: DashboardShellUser;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ user, mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname();

  const nav = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Car className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            Avtoservis Selan
          </p>
          <p className="truncate text-[11px] text-slate-500">Operativni sistem</p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          onClick={onMobileClose}
          aria-label="Zapri meni"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Glavna navigacija">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isAvailableNavActive(pathname, item);

          if (!item.available || !item.href) {
            return (
              <div
                key={item.id}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-500"
                title="Kmalu na voljo"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
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
                "flex items-center gap-2.5 rounded-lg min-h-11 px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-slate-100 font-semibold text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      {['Lastnik','Administrator'].includes(user.role)&&<Link href="/dashboard/nastavitve/ekipa" onClick={onMobileClose} className="block rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Nastavitve · Ekipa</Link>}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
            {user.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">
              {user.displayName}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {user.role}
            </span>
          </span>
        </div>
        <form action="/auth/signout" method="post" className="mt-1">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span>Odjava</span>
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen">
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
          <aside className="absolute inset-y-0 left-0 flex w-[min(280px,88vw)] flex-col bg-white shadow-xl">
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
