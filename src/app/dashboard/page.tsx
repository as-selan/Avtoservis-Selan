import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardSnapshot } from "@/lib/dashboard/load-dashboard-snapshot";

export default async function DashboardPage() {
  const snapshot = await loadDashboardSnapshot();
  return <DashboardPageClient initialData={snapshot} />;
}
