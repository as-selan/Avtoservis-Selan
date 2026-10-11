import { AppShell } from "@/components/layout/AppShell";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadDashboardShellUser } from "@/lib/auth/loadDashboardShellUser";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requirePhase1OperationalAccess();
  const user = await loadDashboardShellUser(access.userId, access.role);

  return <AppShell user={user} simulatedQuibi={process.env.QUIBI_E2E_WRITE_ENABLED === "1" && process.env.SELAN_ISOLATED_E2E === "1"}>{children}</AppShell>;
}
