import {QuibiWorkOrderDocuments} from "@/components/dashboard/QuibiWorkOrderDocuments";
import Image from "next/image";
import {WorkOrderPhotoUpload} from "@/components/dashboard/WorkOrderPhotoUpload";
import Link from "next/link";
import {notFound} from "next/navigation";
import {requirePhase1OperationalAccess} from "@/lib/auth/requireWorkshopAccess";
import {createClient} from "@/lib/supabase/server";
import {WorkOrderEditor} from "@/components/dashboard/WorkOrderEditor";
import {workOrderLabels} from "@/lib/work-orders/policy";
export const dynamic="force-dynamic";
export default async function WorkOrder({params}:{params:Promise<{orderId:string}>}){
 const access=await requirePhase1OperationalAccess(),{orderId}=await params;if(!/^[0-9a-f-]{36}$/i.test(orderId))notFound();const db=await createClient();
 const {data:order,error}=await db.from("work_orders").select("*").eq("organization_id",access.organizationId).eq("id",orderId).maybeSingle();if(error||!order)notFound();
 const [{data:customer},{data:vehicle},{data:events}]=await Promise.all([db.from("customers").select("display_name").eq("organization_id",access.organizationId).eq("id",order.customer_id).maybeSingle(),db.from("vehicles").select("make,model,registration_current,vin").eq("organization_id",access.organizationId).eq("id",order.vehicle_id).maybeSingle(),db.from("work_order_events").select("id,kind,body,created_at,payload").eq("organization_id",access.organizationId).eq("work_order_id",orderId).order("created_at",{ascending:false})]);
 const {data:photoRows}=await db.from("work_order_photos").select("id,caption,storage_path").eq("organization_id",access.organizationId).eq("work_order_id",orderId).order("created_at",{ascending:false});
 const photos=await Promise.all((photoRows??[]).map(async photo=>({...photo,url:(await db.storage.from("selan-work-order-photos").createSignedUrl(photo.storage_path,300)).data?.signedUrl})));
 return <section className="space-y-5 p-4 sm:p-6"><Link href="/dashboard/nalogi" className="text-blue-700">← Servisni nalogi</Link><header><h1 className="text-2xl font-semibold">Nalog #{order.id.slice(0,8).toUpperCase()}</h1><p>{workOrderLabels[order.status]}</p></header>
 <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">{customer?.display_name}</h2><p>{vehicle?.make} {vehicle?.model} · {vehicle?.registration_current}</p><p className="break-all text-sm">VIN: {vehicle?.vin}</p><Link className="text-blue-700" href={`/dashboard/primeri/${order.service_request_id}`}>Povezani servisni primer →</Link><p className="mt-3 text-sm">{order.inspection_charge_policy==="waived"?"Predhodni pregled je brezplačen, ker je popravilo naročeno.":"Predhodni pregled za ta nalog ni zabeležen."}</p></section>
 {order.status==="closed"&&<section className="rounded border bg-green-50 p-4"><p>Račun: {order.invoice_reference}</p><p>Prevzem in plačilo: {order.handover_reference}</p><p className="text-sm">Ročna potrditev zaposlenega. Quibi API teh dejanj ni izvedel ali potrdil.</p></section>}
 <QuibiWorkOrderDocuments organizationId={access.organizationId} orderId={orderId} customerId={order.customer_id} status={order.status} canWrite={["owner","admin"].includes(access.role)}/>
 <WorkOrderEditor id={orderId} status={order.status} canClose={["owner","admin"].includes(access.role)}/>
 {order.status!=="closed"&&<WorkOrderPhotoUpload id={orderId}/>}
 {photos.length>0&&<section><h2 className="font-semibold">Fotografije</h2><ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map(photo=><li key={photo.id} className="rounded border bg-white p-3">{photo.url?<a href={photo.url} target="_blank" rel="noreferrer"><Image src={photo.url} unoptimized width={400} height={300} className="h-48 w-full rounded object-contain" alt={photo.caption}/></a>:<p>Fotografija trenutno ni dostopna.</p>}<p className="mt-2 break-words text-sm">{photo.caption}</p></li>)}</ul></section>}
 <section className="space-y-3"><h2 className="font-semibold">Dnevnik dela</h2>{events?.length?<ol className="space-y-3">{events.map(event=><li className="rounded border bg-white p-3" key={event.id}><p className="text-xs text-slate-500">{new Intl.DateTimeFormat("sl-SI",{timeZone:"Europe/Ljubljana",dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))} · {event.kind==="transition"?workOrderLabels[event.payload.next]:"Opomba"}</p><p className="whitespace-pre-wrap break-words">{event.body}</p></li>)}</ol>:<p>Delo in ugotovitve zabeležite v nalog.</p>}</section>
 </section>;
}
