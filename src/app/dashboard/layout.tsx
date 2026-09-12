import { AppShell } from "@/components/layout/AppShell";
import { requireWorkshopAccess } from "@/lib/auth/requireWorkshopAccess";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWorkshopAccess();

  return <AppShell>{children}</AppShell>;
}
