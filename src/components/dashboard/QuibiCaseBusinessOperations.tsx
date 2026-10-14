import {hasRecordedCustomerApproval} from '@/lib/quibi/business-form-state';
import {quibiCaseProcessStage} from '@/lib/quibi/case-process-stage';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {quibiWorkflowConfig,workflowRecipient} from '@/lib/quibi/workflow-config';
import {assertBusinessCreationNamespace,caseBusinessReference,type JournalReferenceRow} from '@/lib/quibi/case-business-policy';
import {loadQuibiDocument} from '@/lib/quibi/document-read';
import {quibiWorkflowJournal} from '@/lib/quibi/write-journal';
import {businessSendKey} from '@/lib/quibi/business-send-workflow';
import {QuibiBusinessDocumentForm,QuibiBusinessReadReconcile} from './QuibiBusinessDocumentForm';
import {QuibiBusinessSend} from './QuibiBusinessSend';
export async function QuibiCaseBusinessOperations({organizationId,userId,caseId,customerId,status,syntheticQa=false}:{organizationId:string;userId:string;caseId:string;customerId:string;status:string;syntheticQa?:boolean}){
 if(process.env.APP_ENV!=='preproduction'||process.env.QUIBI_MODE!=='dev'||process.env.VERCEL_ENV!=='preview')return null;
 const db=await createClient();
 const phase=quibiCaseProcessStage(status);if(!phase)return null;
 if(!phase.businessReady){
  const {data:quote,error}=await db.from('quotes').select('id,evidence_kind,evidence_payload,content_sha256,internal_review_status').eq('organization_id',organizationId).eq('service_request_id',caseId).eq('quibi_environment','dev').order('version_no',{ascending:false}).limit(1).maybeSingle();
  const evidence=quote?.evidence_payload as {external_id?:string}|null;
  let approved=false;
  if(!error&&quote?.internal_review_status==='approved_for_send'&&quote.evidence_kind==='quibi_manual_estimate'&&evidence?.external_id&&evidence.external_id!=='2176888'){
   const {data:decision,error:de}=await db.from('customer_approvals').select('customer_decision,decided_at,decision_evidence_reference,revoked_at,content_sha256').eq('organization_id',organizationId).eq('service_request_id',caseId).eq('quote_id',quote.id).eq('content_sha256',quote.content_sha256).eq('customer_decision','approved').is('revoked_at',null).limit(1).maybeSingle();
   approved=!de&&!!decision&&hasRecordedCustomerApproval(decision,quote.content_sha256);
  }
  if(!quibiCaseProcessStage(status,approved)?.businessReady)return <section className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">Nadaljevanje Quibi poslovnega postopka</h2><p>{phase.label}</p><p className="text-sm">Naloga in račun nastaneta v Quibiju po veljavni odobritvi stranke; termin ni pogoj.</p></section>;
 }
 const [{data:link,error:le},{data:customer,error:ce},{data:operations,error:oe}]=await Promise.all([
 db.from('integration_links').select('external_id,sync_status,quibi_environment').eq('organization_id',organizationId).eq('entity_id',customerId).eq('entity_type','customer').eq('provider','quibi').single(),
 db.from('customers').select('email').eq('organization_id',organizationId).eq('id',customerId).is('archived_at',null).single(),
 db.from('quibi_dev_operation_journal').select('id,kind,state,quibi_id,quibi_content_sha256,request_body,created_at,local_entity_id').eq('organization_id',organizationId).eq('service_request_id',caseId).in('kind',['work_order','invoice','work_order_update','invoice_update'])]);
 if(le||ce||oe||!link||!customer||link.sync_status!=='ok'||link.quibi_environment!=='dev')return <p role="alert">Poslovne operacije zahtevajo preverjeno povezavo stranke in dostopen journal.</p>;
 const quibiCustomerId=link.external_id,localEmail=customer.email;
 const pendingInvoice=operations?.find(r=>r.kind==='invoice'&&r.state==='uncertain'&&r.quibi_id);
 if(pendingInvoice)return <section className="space-y-3 rounded-xl border border-amber-300 bg-white p-4"><h2 className="font-semibold">Preveri že ustvarjeni račun</h2><p>Quibi je vrnil račun #{pendingInvoice.quibi_id}. Končno preverjanje zahteva pregled; nov CREATE in SEND sta ustavljena.</p><QuibiBusinessReadReconcile caseId={caseId} operationId={pendingInvoice.id}/></section>;
 async function prepare(){
 const read=configuredQuibiReadClient(),rows=(operations??[]) as JournalReferenceRow[];
 for(const kind of ['work_order','invoice'])assertBusinessCreationNamespace(operations??[],caseId,kind);
 const references=(['work_order','invoice'] as const).flatMap(kind=>{const ref=caseBusinessReference(rows,kind);return ref?[{...ref,document_kind:kind}]:[]});
 const [numberings,saleTypes,units,vat]=await Promise.all([read.catalog('numberings'),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat')]);
 let writeEnabled=false;try{quibiWorkflowConfig(process.env,'write');writeEnabled=process.env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1'&&process.env.QUIBI_DEV_LOCAL_SEND_ENABLED!=='1'}catch{}
 const remoteCustomer=await read.customer(quibiCustomerId);let recipient='';try{recipient=workflowRecipient(process.env,localEmail,remoteCustomer.email)}catch{}
 const docs=await Promise.all(references.map(async ref=>{try{const doc=await loadQuibiDocument(read,ref.document_kind,ref.quibi_document_id,quibiCustomerId);if(doc.contentSha256!==ref.content_sha256||doc.vehicleId!==ref.quibi_vehicle_id||doc.customerId!==ref.quibi_customer_id)throw Error('CASE_DOCUMENT_CHANGED');const op=await quibiWorkflowJournal(organizationId,userId).get('send',businessSendKey(caseId,doc.id,doc.contentSha256));return {ref,doc,op,error:false as const}}catch{return {ref,error:true as const}}}));
 return {numberings,saleTypes,units,vat,references,docs,recipient,writeEnabled};
 }
 let data;try{data=await prepare()}catch{return <p role="alert">Quibi poslovni postopek ni zanesljivo pripravljen. Preverite šifrante, dokumente in journal. Neznan izid blokira nov zapis.</p>}
 const {numberings,saleTypes,units,vat,references,docs,recipient,writeEnabled}=data;
 return <section className="space-y-4 rounded-xl border bg-white p-4"><h2 className="font-semibold">Quibi poslovni postopek tega primera</h2><p className="text-sm">Poslovni nalog in račun nastaneta v Quibiju. Za njuno pripravo ni treba ustvariti interne naloge mehanika. Predračun in odobritev stranke se preverita pred vsakim zapisom.</p>
 {references.some(r=>r.document_kind==='invoice')?<details className="space-y-3"><summary className="cursor-pointer text-sm">Preglej pripravo popravka povezanega dokumenta</summary><QuibiBusinessDocumentForm syntheticQa={syntheticQa} key={references.map(r=>r.document_kind+":"+r.quibi_document_id+":"+r.content_sha256).join("|")} orderId={caseId} caseId={caseId} customerId={customerId} status="open" choices={{numberings,saleTypes,units,vat}} writeEnabled={writeEnabled} references={references}/></details>:<QuibiBusinessDocumentForm syntheticQa={syntheticQa} key={references.map(r=>r.document_kind+":"+r.quibi_document_id+":"+r.content_sha256).join("|")} orderId={caseId} caseId={caseId} customerId={customerId} status="open" choices={{numberings,saleTypes,units,vat}} writeEnabled={writeEnabled} references={references}/>}

 {docs.map(item=>item.error?<section key={item.ref.quibi_document_id} className="rounded border border-amber-300 p-3"><p role="alert">Povezanega dokumenta #{item.ref.quibi_document_id} trenutno ni mogoče varno preveriti. Zapisovanje in pošiljanje tega dokumenta sta ustavljena.</p><Link className="text-blue-700 underline" href={"/dashboard/quibi/stranke/"+quibiCustomerId+"/dokumenti/"+item.ref.document_kind+"/"+item.ref.quibi_document_id}>Odpri dokument in preveri podatke</Link></section>:<section key={item.doc.id} className="space-y-2"><Link className="text-blue-700 underline" href={'/dashboard/quibi/stranke/'+quibiCustomerId+'/dokumenti/'+item.ref.document_kind+'/'+item.doc.id}>Quibi {item.ref.document_kind==='invoice'?'račun':'delovni nalog'} #{item.doc.id} · pregled in PDF</Link><p className="text-sm">Znesek po Quibiju: {item.doc.amount} EUR · status: {item.doc.status || 'Quibi ni vrnil statusa'}</p><a className="block text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={'/api/quibi/stranke/'+quibiCustomerId+'/dokumenti/'+item.ref.document_kind+'/'+item.doc.id+'/pdf'}>Odpri PDF iz Quibija</a><QuibiBusinessSend orderId={caseId} caseId={caseId} documentId={item.doc.id} kind={item.ref.document_kind} sha={item.doc.contentSha256} amount={item.doc.amount} recipient={recipient} enabled={writeEnabled&&!!recipient} initialState={item.op?{state:item.op.state,sendId:item.op.sendId,sendStatus:item.op.sendStatus,attemptedAt:item.op.attemptedAt??null}:null}/></section>)}
 </section>;
}
