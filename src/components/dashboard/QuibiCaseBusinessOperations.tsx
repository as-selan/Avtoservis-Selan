import {QuibiIssuedInvoice} from './QuibiIssuedInvoice';
import {invoiceDevCreateAllowed} from '@/lib/quibi/invoice-review';
import {prepareQuibiBusinessDocument} from '@/lib/quibi/business-document-actions';
import {loadEstimateCatalog} from '@/lib/quibi/estimate-catalog';
import {InspectionBillingBasisForm} from './QuibiBusinessDocumentForm';
import {QuibiDocumentPayments} from './QuibiDocumentPayments';
import {isHostedQuibiEnvironment,hostedQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {sendPresentation} from '@/lib/quibi/send-outcome';
import {quibiDevTestRecipients} from '@/lib/quibi/write-contract';
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
export async function QuibiCaseBusinessOperations({organizationId,userId,caseId,customerId,status,syntheticQa=false,repairReviewed=false}:{organizationId:string;userId:string;caseId:string;customerId:string;status:string;syntheticQa?:boolean;repairReviewed?:boolean}){
 if(!isHostedQuibiEnvironment(process.env))return null;
 const environment=hostedQuibiEnvironment(process.env);
 const db=await createClient();
 const phase=quibiCaseProcessStage(status);if(!phase)return null;
 if(!phase.businessReady){
  const {data:quote,error}=await db.from('quotes').select('id,evidence_kind,evidence_payload,content_sha256,internal_review_status').eq('organization_id',organizationId).eq('service_request_id',caseId).eq('quibi_environment',environment).order('version_no',{ascending:false}).limit(1).maybeSingle();
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
 db.from(quibiJournalTable(environment)).select('id,kind,state,quibi_id,quibi_content_sha256,request_body,created_at,local_entity_id,send_id,send_status,attempted_at,send_status_checked_at').eq('organization_id',organizationId).eq('service_request_id',caseId).in('kind',['work_order','invoice','work_order_update','invoice_update','send'])]);
 if(le||ce||oe||!link||!customer||link.sync_status!=='ok'||link.quibi_environment!==environment)return <p role="alert">Poslovne operacije zahtevajo preverjeno povezavo stranke in dostopen journal.</p>;
 const quibiCustomerId=link.external_id,localEmail=customer.email;
 const pendingInvoice=operations?.find(r=>r.kind==='invoice'&&r.state==='uncertain');
 if(pendingInvoice&&environment==='dev'){
  const form=new FormData();for(const [key,value] of Object.entries({caseId,operationId:pendingInvoice.id,kind:'invoice',reconcile:'yes',renderRead:'yes'}))form.set(key,value);
  const checked=await prepareQuibiBusinessDocument(form);
  if(checked.ok&&checked.documentId&&checked.documentSha){Object.assign(pendingInvoice,{state:'verified',quibi_id:checked.documentId,quibi_content_sha256:checked.documentSha});}
  else return <section className="space-y-2 rounded-xl border p-4"><h2 className="font-semibold">Preverjanje izdanega računa</h2><p role="status">Izid izdaje še ni potrjen. Selan je preveril obstoječe dokumente; novega računa ne ustvarjajte. Poskusite osvežiti stran pozneje.</p><details><summary>Več podrobnosti</summary><p>{checked.message}</p></details></section>;
 }else if(pendingInvoice)return <QuibiBusinessReadReconcile caseId={caseId} operationId={pendingInvoice.id}/>;
 async function prepare(){
 const read=configuredQuibiReadClient(),rows=(operations??[]) as JournalReferenceRow[];
 for(const kind of ['work_order','invoice'])assertBusinessCreationNamespace(operations??[],caseId,kind);
 const references=(['work_order','invoice'] as const).flatMap(kind=>{const ref=caseBusinessReference(rows,kind,environment);return ref?[{...ref,document_kind:kind}]:[]});
 const [numberings,saleTypes,units,vat]=await Promise.all([read.catalog('numberings'),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat')]);
 let writeEnabled=false;try{quibiWorkflowConfig(process.env,'write');writeEnabled=process.env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1'&&process.env.QUIBI_DEV_LOCAL_SEND_ENABLED!=='1'}catch{}
 let sendEnabled=false;try{quibiWorkflowConfig(process.env,'send');sendEnabled=true}catch{}
 const remoteCustomer=await read.customer(quibiCustomerId);let recipient='',allowedRecipients:string[]=[];try{recipient=workflowRecipient(process.env,localEmail,remoteCustomer.email);allowedRecipients=(environment==='dev'?quibiDevTestRecipients(process.env):[]).filter(email=>email!==localEmail?.toLowerCase()&&email!==remoteCustomer.email.toLowerCase())}catch{}
 const docs=await Promise.all(references.map(async ref=>{try{const doc=await loadQuibiDocument(read,ref.document_kind,ref.quibi_document_id,quibiCustomerId);if(doc.contentSha256!==ref.content_sha256||doc.vehicleId!==ref.quibi_vehicle_id||doc.customerId!==ref.quibi_customer_id)throw Error('CASE_DOCUMENT_CHANGED');const op=await quibiWorkflowJournal(organizationId,userId).get('send',businessSendKey(caseId,doc.id,doc.contentSha256));const storedRecipient=op?JSON.parse(op.requestBody).recipient:recipient;if(typeof storedRecipient!=="string")throw Error("SEND_RECIPIENT_UNVERIFIED");return {ref,doc,op,recipient:storedRecipient,error:false as const}}catch{return {ref,error:true as const}}}));
 return {numberings,saleTypes,units,vat,references,docs,recipient,allowedRecipients,writeEnabled,sendEnabled};
 }
 let data;try{data=await prepare()}catch{return <section className="space-y-3 rounded-xl border border-amber-300 bg-white p-4"><h2 className="font-semibold">Quibi trenutno ni mogoče zanesljivo preveriti</h2><p role="alert">Podatkov in priprave dokumentov ni mogoče osvežiti. Osveži stran pozneje; ne ponavljaj ustvarjanja ali pošiljanja dokumentov.</p>{(operations??[]).filter(op=>op.kind==='send'&&op.attempted_at).map(op=><div key={op.id} className="rounded border p-3 text-sm"><p>Dokument #{op.quibi_id} · zadnje shranjeno stanje, ne sveža potrditev</p><p>{sendPresentation({state:op.state,sendId:op.send_id,sendStatus:op.send_status}).message}</p>{op.send_id&&<p>send_id: {op.send_id}</p>}<p>Zabeležen poskus: {op.attempted_at}</p></div>)}</section>}

 const {numberings,saleTypes,units,vat,references,docs,recipient,allowedRecipients,writeEnabled,sendEnabled}=data;
 return <section className="space-y-4 rounded-xl border bg-white p-4">
 {!references.some(r=>r.document_kind==='invoice')&&(!references.some(r=>r.document_kind==='work_order')||repairReviewed)&&<QuibiBusinessDocumentForm repairReviewed={repairReviewed} syntheticQa={syntheticQa} key={references.map(r=>r.document_kind+":"+r.quibi_document_id+":"+r.content_sha256).join("|")} orderId={caseId} caseId={caseId} customerId={customerId} status="open" choices={{numberings,saleTypes,units,vat}} writeEnabled={writeEnabled} invoiceWriteEnabled={writeEnabled&&invoiceDevCreateAllowed(process.env,caseId)} references={references}/>}

 {docs.map(item=>item.error?<section key={item.ref.quibi_document_id} className="rounded border border-amber-300 p-3"><p role="alert">Povezanega dokumenta #{item.ref.quibi_document_id} trenutno ni mogoče varno preveriti. Zapisovanje in pošiljanje tega dokumenta sta ustavljena.</p><Link className="text-blue-700 underline" href={"/dashboard/quibi/stranke/"+quibiCustomerId+"/dokumenti/"+item.ref.document_kind+"/"+item.ref.quibi_document_id}>Odpri dokument in preveri podatke</Link></section>:<div key={item.doc.id} className="space-y-3">
 {item.ref.document_kind==='invoice'&&<QuibiIssuedInvoice caseId={caseId} customerId={quibiCustomerId} invoice={item.doc}/>}
 <details open={item.ref.document_kind!=='invoice'&&!references.some(r=>r.document_kind==='invoice')}><summary>{item.ref.document_kind==='invoice'?'Več podrobnosti računa':'Delovni nalog'}</summary><div className="space-y-3 pt-3">
 <Link className="text-blue-700 underline" href={'/dashboard/quibi/stranke/'+quibiCustomerId+'/dokumenti/'+item.ref.document_kind+'/'+item.doc.id}>Quibi {item.ref.document_kind==='invoice'?'račun':'delovni nalog'} #{item.doc.id}</Link><p className="text-sm">Status: {item.doc.status || 'Quibi ni vrnil statusa'}</p>
 {item.ref.document_kind!=='invoice'&&<a className="block text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={'/api/quibi/stranke/'+quibiCustomerId+'/dokumenti/'+item.ref.document_kind+'/'+item.doc.id+'/pdf'}>Odpri PDF iz Quibija</a>}
 {item.ref.document_kind==='invoice'&&<QuibiDocumentPayments documentId={item.doc.id} amount={item.doc.amount} dueDate={item.doc.dueDate}/>}
 <QuibiBusinessSend dev={environment==='dev'} orderId={caseId} caseId={caseId} documentId={item.doc.id} kind={item.ref.document_kind} sha={item.doc.contentSha256} amount={item.doc.amount} recipient={item.recipient} allowedRecipients={allowedRecipients} enabled={sendEnabled&&!!recipient} initialState={item.op?{state:item.op.state,sendId:item.op.sendId,sendStatus:item.op.sendStatus,attemptedAt:item.op.attemptedAt??null}:null}/>
 </div></details></div>)}
 </section>;
}


export async function QuibiInspectionInvoicePreparation({caseId}:{caseId:string}){
 let catalog;try{catalog=await loadEstimateCatalog(configuredQuibiReadClient())}
 catch{return <p role="alert">Quibijevih storitev za podlago računa pregleda trenutno ni mogoče prebrati. Delovni nalog za popravilo ni potreben; cene ne ugibamo.</p>}
 return <InspectionBillingBasisForm caseId={caseId} options={catalog.options.filter(o=>o.stockManaged===false&&/pregled|diagnost|kontrol.*vozil/i.test(o.name))}/>;
}
