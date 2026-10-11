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
  if(access.role==='mechanic')return <div className="min-h-screen bg-slate-100 text-slate-900"><header className="flex items-center justify-between gap-3 border-b bg-white p-4"><Link href="/dashboard/mehanik" className="font-semibold">Avtoservis Selan · Moji nalogi</Link><form action="/auth/signout" method="post"><button className="rounded border px-3 py-2">Odjava</button></form></header><main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main></div>;
  const user = await loadDashboardShellUser(access.userId, access.role);

  return <AppShell user={user} simulatedQuibi={process.env.QUIBI_E2E_WRITE_ENABLED === "1" && process.env.SELAN_ISOLATED_E2E === "1"}>{children}</AppShell>;
}
