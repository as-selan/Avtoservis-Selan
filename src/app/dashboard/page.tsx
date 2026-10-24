import {schedulePendingIntakePreparations} from '@/lib/quibi/automatic-intake-sync';
export const maxDuration=300;
import {redirect} from "next/navigation";
import {requireWorkshopAccess} from "@/lib/auth/requireWorkshopAccess";
import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardSnapshot } from "@/lib/dashboard/load-dashboard-snapshot";

export default async function DashboardPage() {
  if((await requireWorkshopAccess()).role==="mechanic")redirect("/dashboard/mehanik");
  schedulePendingIntakePreparations();
  const snapshot = await loadDashboardSnapshot();
  return <>
    {process.env.SELAN_LOCAL_REVIEW === "1" && process.env.QUIBI_DEV_WRITE_ENABLED !== "1" && <p role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      Lokalni QA: primeri in reference QA-SIM so sintetični. Aplikacija ne pošilja sporočil in ne rezervira terminov v MyPlanlyju.
    </p>}
    <DashboardPageClient initialData={snapshot} />
  </>;
}
