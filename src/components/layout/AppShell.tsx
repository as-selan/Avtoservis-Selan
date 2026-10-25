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
  simulatedQuibi,
}: {
  children: React.ReactNode;
  user: DashboardShellUser;
  simulatedQuibi?: boolean;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { setOpen: setManualOpen } = useManualEntry();

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
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
          <div className="mx-auto w-full max-w-[1440px]">{simulatedQuibi && <div role="note" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><details><summary>Podrobnosti povezave</summary>Simuliran Quibi API: dokumenti in statusi QA-SIM niso dejanski Quibi zapisi. Nobeno sporočilo ni poslano.</details></div>}{children}</div>
        </main>
      </div>

      <ManualServiceOrderEntry />
    </div>
  );
}

export function AppShell({
  children,
  user,
  simulatedQuibi,
}: {
  children: React.ReactNode;
  user: DashboardShellUser;
  simulatedQuibi?: boolean;
}) {
  return (
    <ManualEntryProvider>
      <AppShellInner user={user} simulatedQuibi={simulatedQuibi}>{children}</AppShellInner>
    </ManualEntryProvider>
  );
}
