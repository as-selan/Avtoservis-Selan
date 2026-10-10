import Link from "next/link";
import {requirePhase1OperationalAccess} from "@/lib/auth/requireWorkshopAccess";
import {createClient} from "@/lib/supabase/server";
import {workOrderLabels} from "@/lib/work-orders/policy";
export const dynamic="force-dynamic";
export default async function WorkOrders(){
 const access=await requirePhase1OperationalAccess(),db=await createClient();const {data,error}=await db.from("work_orders").select("id,status,service_request_id,updated_at,customers(display_name),vehicles(make,model,registration_current)").eq("organization_id",access.organizationId).order("updated_at",{ascending:false}).limit(100);
 return <section className="space-y-5 p-4 sm:p-6"><h1 className="text-2xl font-semibold">Servisni nalogi</h1><p className="text-sm text-slate-600">Od odobrenega primera do opravljenega popravila, računa in prevzema.</p>
 {error?<p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4">Delovni nalogi v tej bazi še niso omogočeni. Nova migracija je pripravljena; hosted namestitev zahteva odobritev. Obstoječi primeri ostanejo na nadzorni plošči.</p>:!data?.length?<p>Nalogov še ni. Odprite potrjen primer na nadzorni plošči in ga pretvorite v delovni nalog.</p>:<ul className="grid gap-3 lg:grid-cols-2">{data.map(order=>{const customer=Array.isArray(order.customers)?order.customers[0]:order.customers,vehicle=Array.isArray(order.vehicles)?order.vehicles[0]:order.vehicles;return <li key={order.id}><Link href={`/dashboard/nalogi/${order.id}`} className="block rounded-xl border bg-white p-4 hover:border-blue-500"><p className="font-semibold">Nalog #{order.id.slice(0,8).toUpperCase()} · {workOrderLabels[order.status]}</p><p>{customer?.display_name}</p><p className="text-sm text-slate-600">{vehicle?.make} {vehicle?.model} · {vehicle?.registration_current}</p></Link></li>})}</ul>}
 </section>;
}
