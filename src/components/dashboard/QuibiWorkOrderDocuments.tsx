import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {quibiLinkEnvironment} from '@/lib/quibi/workflow-config';
import {quibiDocumentStatusLabel} from '@/lib/quibi/contracts';
export async function QuibiWorkOrderDocuments({organizationId,orderId,customerId}:{organizationId:string;orderId:string;customerId:string}){
 const db=await createClient(),environment=quibiLinkEnvironment(process.env);
 const [{data:link},{data:references,error}]=await Promise.all([
 db.from('integration_links').select('external_id,quibi_environment,sync_status').eq('organization_id',organizationId).eq('entity_id',customerId).eq('entity_type','customer').eq('provider','quibi').maybeSingle(),
 db.from('work_order_quibi_documents').select('document_kind,quibi_document_id,quibi_environment,confirmed_at').eq('organization_id',organizationId).eq('work_order_id',orderId)]);
 if(!link||link.quibi_environment!==environment)return <section className="space-y-2 rounded border bg-white p-4"><h2 className="font-semibold">Poslovni dokumenti v Quibiju</h2><p>Najprej povežite obstoječo stranko in vozilo. Lokalni nalog je evidenca poteka dela; poslovnega naloga ne ustvarja.</p><Link className="text-blue-700" href={`/dashboard/stranke/${customerId}/quibi`}>Preveri povezavo stranke in vozila →</Link></section>;
 let client;try{client=configuredQuibiReadClient()}catch{return <p role="alert">Quibi branje v tem okolju ni nastavljeno. Lokalni nalog ostaja nespremenjen.</p>}
 const results=await Promise.allSettled([client.workOrders(link.external_id),client.invoices(link.external_id)]);
 return <section className="space-y-3 rounded border bg-white p-4"><h2 className="font-semibold">Poslovni dokumenti v Quibiju</h2><p className="text-sm">Quibi je vir poslovnih dokumentov. Spodaj so dokumenti iste stranke; pripadnost temu servisnemu primeru zahteva dodaten pregled in izrecno povezavo. Statusov ne sinhroniziramo samodejno.</p>
 {error&&<p role="alert">Trajne povezave dokumentov še niso omogočene v tej bazi. Nova migracija zahteva odobreno namestitev.</p>}{link.sync_status!=='ok'&&<p role="alert">Identiteta stranke zahteva ponovni pregled pred povezovanjem.</p>}
 {results.map((result,index)=>{const kind=index===0?'work_order':'invoice',label=index===0?'Delovni nalogi':'Računi';return <div key={kind}><h3 className="font-medium">{label}</h3>{result.status==='rejected'?<p role="alert">Branje ni uspelo. To ne pomeni, da dokumentov ni.</p>:<ul className="space-y-2 text-sm">{result.value.map(doc=>{const linked=references?.some(r=>r.document_kind===kind&&r.quibi_document_id===doc.id&&r.quibi_environment===environment);return <li key={doc.id}><Link className="text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/dokumenti/${kind}/${doc.id}?orderId=${orderId}`}>#{doc.id} · {quibiDocumentStatusLabel(doc.status)} · preglej vsebino</Link><p>{linked?'Izrecno povezan s tem nalogom.':'Dokument iste stranke; s tem nalogom še ni povezan.'}</p></li>})}{!result.value.length&&<li>Quibi za to stranko ni vrnil dokumentov te vrste.</li>}</ul>}</div>})}
 </section>;
}
