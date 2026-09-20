"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { ManualEntryProvider, useManualEntry } from "@/components/dashboard/ManualEntryContext";
import { ManualServiceOrderEntry } from "@/components/dashboard/ManualServiceOrderEntry";
import type { DashboardShellUser } from "@/lib/auth/shellUser";

function AppShellInner({
  children,
  user,
}: {
  children: React.ReactNode;
  user: DashboardShellUser;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { setOpen: setManualOpen } = useManualEntry();

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <AppSidebar
        user={user}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={user}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenManualEntry={() => setManualOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      <ManualServiceOrderEntry />
    </div>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: DashboardShellUser;
}) {
  return (
    <ManualEntryProvider>
      <AppShellInner user={user}>{children}</AppShellInner>
    </ManualEntryProvider>
  );
}
