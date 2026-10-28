import {schedulePendingIntakePreparations} from '@/lib/quibi/automatic-intake-sync';
export const maxDuration=300;
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {requireWorkshopAccess} from "@/lib/auth/requireWorkshopAccess";
import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { loadDashboardSnapshot } from "@/lib/dashboard/load-dashboard-snapshot";

export default async function DashboardPage() {
  const access=await requireWorkshopAccess();
  if(access.role==="mechanic")redirect("/dashboard/mehanik");
  const db=await createClient();
  const findings=["owner","admin"].includes(access.role)?await db.from("case_repair_findings").select("id,case_id,description,created_at").eq("state","recorded").order("created_at",{ascending:false}).limit(100):{data:[]};
  schedulePendingIntakePreparations();
  const snapshot = await loadDashboardSnapshot();
  return <>
    {process.env.SELAN_LOCAL_REVIEW === "1" && process.env.QUIBI_DEV_WRITE_ENABLED !== "1" && <div role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <details><summary>Podrobnosti povezave</summary>Lokalni QA: primeri in reference QA-SIM so sintetični. Aplikacija ne pošilja sporočil in ne rezervira terminov v MyPlanlyju.</details>
    </div>}
    {(findings.data??[]).length>0&&<section aria-label="Nove ugotovljene napake" className="mb-4 space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">Nove ugotovljene napake</h2>{findings.data?.map(f=><Link key={f.id} href={"/dashboard/primeri/"+f.case_id+"#ugotovitev-"+f.id} className="block rounded border p-3"><span className="font-medium">Nova ugotovljena napaka – potreben pregled</span><span className="block text-sm">{f.description}</span></Link>)}</section>}
    <DashboardPageClient initialData={snapshot} />
  </>;
}
