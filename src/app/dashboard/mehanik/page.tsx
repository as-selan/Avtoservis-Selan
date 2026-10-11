import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {scopedMechanicOrders} from '@/lib/work-orders/mechanic-access';
import {workOrderLabels} from '@/lib/work-orders/policy';
export const dynamic='force-dynamic';
export default async function MechanicOrders(){
 const access=await requireWorkshopAccess();if(access.role!=='mechanic')redirect('/dashboard/nalogi');const db=await createClient();const {data,error}=await db.rpc('mechanic_work_orders');
 if(error)return <p role="alert">Dodeljenih nalogov ni mogoče preveriti. Preverite povezavo z bazo in namestitev migracije za dodelitve.</p>;
 const orders=scopedMechanicOrders(data,access);return <section className="space-y-4"><h1 className="text-2xl font-semibold">Moji servisni nalogi</h1><p>Prikazani so samo vam dodeljeni nalogi. Poslovne dokumente in zaključek ureja skrbnik.</p>{!orders.length&&<p>Trenutno nimate dodeljenega naloga.</p>}<ul className="grid gap-3 sm:grid-cols-2">{orders.map(o=><li key={o.id}><Link className="block rounded border bg-white p-4" href={`/dashboard/mehanik/${o.id}`}><p className="font-semibold">Nalog #{o.id.slice(0,8).toUpperCase()} · {workOrderLabels[o.status]}</p><p>{o.vehicle.make} {o.vehicle.model} · {o.vehicle.registration}</p></Link></li>)}</ul></section>;
}
