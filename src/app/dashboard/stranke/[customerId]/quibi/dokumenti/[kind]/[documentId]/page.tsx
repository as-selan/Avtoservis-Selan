import {QuibiBusinessSend} from '@/components/dashboard/QuibiBusinessSend';
import {businessSendKey} from '@/lib/quibi/business-send-workflow';
import {quibiWorkflowConfig,actualCustomerEmail} from '@/lib/quibi/workflow-config';
import {quibiDevTestRecipient} from '@/lib/quibi/write-contract';
import {documentReferenceState} from '@/lib/quibi/document-reference-state';
import {DocumentCommunicationDraft} from "@/components/dashboard/DocumentCommunicationDraft";
import Link from 'next/link';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {canQueryCustomerId} from '@/lib/customers/present';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {quibiLinkEnvironment} from '@/lib/quibi/workflow-config';
import {documentKindLabels,loadQuibiDocument,type QuibiDocumentKind} from '@/lib/quibi/document-read';
import {quibiDocumentStatusLabel} from '@/lib/quibi/contracts';
import {QuibiWorkOrderLink} from '@/components/dashboard/QuibiWorkOrderLink';
export const dynamic='force-dynamic';
export default async function QuibiDocument({params,searchParams}:{params:Promise<{customerId:string;kind:string;documentId:string}>;searchParams:Promise<{orderId?:string}>}){
 const access=await requirePhase1OperationalAccess(),{customerId,kind,documentId}=await params,{orderId}=await searchParams;
 if(!canQueryCustomerId(customerId)||!Object.hasOwn(documentKindLabels,kind)||!/^\d+$/.test(documentId))return <p role="alert">Dokument ni na voljo.</p>;
 const db=await createClient(),environment=quibiLinkEnvironment(process.env);
 const {data:link,error}=await db.from('integration_links').select('external_id,sync_status,quibi_environment').eq('organization_id',access.organizationId).eq('entity_id',customerId).eq('entity_type','customer').eq('provider','quibi').single();
 if(error||!link||link.quibi_environment!==environment)return <p role="alert">Potrjena povezava stranke s tem okoljem Quibi manjka.</p>;
 let doc;try{doc=await loadQuibiDocument(configuredQuibiReadClient(),kind as QuibiDocumentKind,documentId,link.external_id)}catch{return <p role="alert">Dokumenta ni mogoče preverjeno prebrati za to stranko in vrsto dokumenta. Podatki niso bili spremenjeni.</p>}
 const {data:order}=orderId&&/^[a-f0-9-]{36}$/i.test(orderId)?await db.from('work_orders').select('id,status,vehicle_id,service_request_id').eq('organization_id',access.organizationId).eq('customer_id',customerId).eq('id',orderId).maybeSingle():{data:null};
 const {data:reference,error:referenceError}=order?await db.from('work_order_quibi_documents').select('content_sha256,confirmed_at').eq('organization_id',access.organizationId).eq('work_order_id',order.id).eq('document_kind',kind).eq('quibi_document_id',documentId).eq('quibi_environment',environment).maybeSingle():{data:null,error:null};
 const referenceState=reference?documentReferenceState(reference.content_sha256,doc.contentSha256):null;
 let recipient='',sendEnabled=false,storedSend=null,sendAmount=doc.amount;
 if(order&&reference&&kind!=='estimate'&&['owner','admin'].includes(access.role)){
  try{const [{data:customer},remote]=await Promise.all([db.from('customers').select('email').eq('organization_id',access.organizationId).eq('id',customerId).single(),configuredQuibiReadClient().customer(link.external_id)]);recipient=environment==='dev'?quibiDevTestRecipient(process.env,customer?.email):actualCustomerEmail(customer?.email??null,remote.email)}catch{}
  const {data:attempt,error:attemptError}=await db.from(environment==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal').select('state,send_id,send_status,attempted_at,request_body').eq('organization_id',access.organizationId).eq('kind','send').eq('local_entity_id',businessSendKey(order.service_request_id,documentId,reference.content_sha256)).maybeSingle();
  storedSend=attempt;
  if(attempt){try{const body=JSON.parse(attempt.request_body) as {recipient?:string;amount?:string};if(typeof body.recipient==='string')recipient=body.recipient;if(typeof body.amount==='string')sendAmount=body.amount}catch{}}
  try{quibiWorkflowConfig(process.env,'send');sendEnabled=!attemptError&&!!recipient&&referenceState==='unchanged'&&process.env.QUIBI_DEV_LOCAL_SEND_ENABLED!=='1'}catch{}
 }
 return <div className="space-y-5"><Link className="text-blue-700" href={order?`/dashboard/nalogi/${order.id}`:`/dashboard/stranke/${customerId}/quibi`}>← Nazaj</Link>
 <header><h1 className="text-2xl font-semibold">Quibi · {documentKindLabels[kind as QuibiDocumentKind]} #{doc.id}</h1><p className="text-sm">Svež bralni prikaz iz okolja {environment==='dev'?'DEV':'produkcija'}. Dokument ostaja v Quibiju.</p></header>
 {link.sync_status!=='ok'&&<p role="alert">Povezava stranke zahteva ponoven pregled; povezovanje in druge spremembe niso potrjene.</p>}
 {referenceError&&<p role="alert">Potrjene povezave v tej bazi ni mogoče preveriti.</p>}
 {referenceState==='changed'&&<p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4">Vsebina Quibi dokumenta se je po potrditvi povezave spremenila. Prejšnja potrditev ne velja kot pregled trenutne vsebine. Ponovno preglejte dokument; zgodovinska povezava ostaja ohranjena.</p>}
 {referenceState==='unchanged'&&<p className="text-sm text-green-800">SHA trenutne vsebine se ujema z vsebino ob potrditvi povezave tega naloga.</p>}
 <a className="inline-block rounded border bg-white px-4 py-2 text-blue-700" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${customerId}/${kind}/${documentId}/pdf`}>Odpri dejanski PDF iz Quibija</a>
 <section className="space-y-2 rounded-xl border bg-white p-4"><p>Številka: {doc.number??'API je ne vrača'}</p><p>Status: {quibiDocumentStatusLabel(doc.status)}</p><p>Znesek po Quibiju: {doc.amount}</p><p>Quibi stranka: {doc.customerId}</p><p>Quibi vozilo: {doc.vehicleId??'API ga ne vrača; povezava z vozilom ni neodvisno dokazana.'}</p><p className="break-all text-xs">SHA-256 vsebine: {doc.contentSha256}</p>
 <h2 className="font-semibold">Postavke dokumenta</h2><ul className="space-y-2 text-sm">{doc.lines.map((line,i)=><li key={i} className="border-t pt-2">{line.description||'Postavka brez opisa'} · količina {line.quantity||'ni navedena'} · cena po Quibiju {line.grossPrice||'ni navedena'} · enota ID {line.unitId??'API je ne vrača'} · DDV ID {line.vatId??'API ga ne vrača'} · popust {line.discount??'API ga ne vrača'}</li>)}</ul>{!doc.lines.length&&<p>API ne vrača postavk.</p>}</section>
 <p className="text-sm text-amber-800">Ista stranka in vozilo še ne dokazujeta istega naročila. Povezavo s servisnim primerom mora potrditi skrbnik po pregledu postavk. Lokalno stanje dela ne spreminja poslovnega statusa dokumenta v Quibiju.</p>
 {order&&order.status!=='closed'&&kind!=='estimate'&&['owner','admin'].includes(access.role)&&(doc.vehicleId?<QuibiWorkOrderLink orderId={order.id} documentId={doc.id} kind={kind} sha={doc.contentSha256}/>:<p role="alert">Povezovanje je ustavljeno, ker Quibi ne vrača vozila dokumenta. Sintetična izjema predračuna tukaj ne velja.</p>)}
 {order&&reference&&kind!=='estimate'&&['owner','admin'].includes(access.role)&&<QuibiBusinessSend orderId={order.id} documentId={doc.id} kind={kind} sha={reference.content_sha256} amount={sendAmount} recipient={recipient} enabled={sendEnabled} initialState={storedSend?{state:storedSend.state,sendId:storedSend.send_id,sendStatus:storedSend.send_status,attemptedAt:storedSend.attempted_at}:null}/>}
 <DocumentCommunicationDraft kind={documentKindLabels[kind as QuibiDocumentKind]} id={doc.id} amount={doc.amount}/>
 </div>;

}
