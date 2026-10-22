import { WorkshopRealtime } from "@/components/dashboard/WorkshopRealtime";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { requireWorkshopAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadDashboardShellUser } from "@/lib/auth/loadDashboardShellUser";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireWorkshopAccess();
  if(access.role==='mechanic')return <div className="mechanic-workspace min-h-screen bg-slate-50 text-slate-900"><WorkshopRealtime organizationId={access.organizationId} /><header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6"><Link href="/dashboard/mehanik" className="font-semibold">Avtoservis Selan · Moje delo</Link><form action="/auth/signout" method="post"><button className="min-h-11 rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Odjava</button></form></header><main className="mx-auto max-w-4xl p-4 sm:p-8">{children}</main></div>;
  const user = await loadDashboardShellUser(access.userId, access.role);

  return <AppShell user={user} simulatedQuibi={process.env.QUIBI_E2E_WRITE_ENABLED === "1" && process.env.SELAN_ISOLATED_E2E === "1"}><WorkshopRealtime organizationId={access.organizationId} />{children}</AppShell>;
}
