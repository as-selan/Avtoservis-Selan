"use server";
import {verifiedInvoiceHeader} from './invoice-header';
import {QuibiValidationError} from './write-http';
import {syntheticCaseEvidenceAllowed} from './synthetic-case-evidence';
import {hasRecordedCustomerApproval,businessHeaderSelection} from './business-form-state';
import {assertBusinessCreationNamespace} from './case-business-policy';
import {loadCaseBusinessContext} from './case-business-context';
import {revalidatePath} from 'next/cache';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {quibiLinkEnvironment} from './workflow-config';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {loadQuibiDocument} from './document-read';
import {assertBusinessStage,businessDocumentBody,createBusinessDocument,assertBusinessUpdateChanges,updateBusinessDocument,businessUpdatePayload,type BusinessKind} from './business-document-workflow';
import {businessSourceLines,quibiSourceNotes} from './business-source-lines';
import {stableEstimatePayload,withDocumentId} from './write-contract';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {linkWorkOrderQuibiDocument} from './work-order-document-actions';
export type BusinessPreparationResult={ok:boolean;message:string;sha?:string;sourceId?:string;sourceSha?:string;amount?:string;documentId?:string;baselineSha?:string;dispatchStarted?:boolean;lines?:{description:string;quantity:string;unit:string;vat:string;unitGrossPrice:string;discount:string}[];notes?:string[];headerSelectionRequired?:boolean};
export async function prepareQuibiBusinessDocument(form:FormData):Promise<BusinessPreparationResult>{
 let dispatchStarted=false;
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Pripravo poslovnih dokumentov lahko potrdi skrbnik.'};
 const updating=form.get('operation')==='update';
 const directCase=typeof form.get('caseId')==='string';
 const orderId=String(form.get(directCase?'caseId':'orderId')??''),kind=String(form.get('kind')??'') as BusinessKind;
 if(!/^[a-f0-9-]{36}$/i.test(orderId)||!['work_order','invoice'].includes(kind)||(form.get('dispatch')==='yes'&&form.get('confirmed')!=='yes'))return {ok:false,message:'Izrecno potrdite pripravo dokumenta za ta nalog.'};
 try{
  const db=await createClient(),environment=quibiLinkEnvironment(process.env);
  const caseContext=directCase?await loadCaseBusinessContext(db,access.organizationId,orderId,kind,form.get('repairCompleted')==='yes',form.get('dispatch')!=='yes'):null;
  const {data:order,error:orderError}=caseContext?{data:caseContext.order,error:null}:await db.from('work_orders').select('id,service_request_id,customer_id,vehicle_id,status').eq('organization_id',access.organizationId).eq('id',orderId).single();
  if(orderError||!order||order.service_request_id==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('CASE_BLOCKED');
  assertBusinessStage(kind,order.status);
  if(environment==='dev'){const {data:prior,error}=await db.from('quibi_dev_operation_journal').select('id,local_entity_id,kind,state,quibi_id,request_body').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('kind',kind);if(error)throw Error('QUIBI_JOURNAL_READ_FAILED');assertBusinessCreationNamespace(prior??[],orderId,kind);}
  const [{data:link,error:le},{data:vehicleLink,error:ve},{data:customer,error:ce},{data:vehicle,error:vre},{data:existing,error:ee}]=await Promise.all([
   db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_id',order.customer_id).eq('entity_type','customer').eq('provider','quibi').single(),
   db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('vehicle_id',order.vehicle_id).eq('customer_id',order.customer_id).single(),
   db.from('customers').select('display_name,phone,email').eq('organization_id',access.organizationId).eq('id',order.customer_id).is('archived_at',null).single(),
   db.from('vehicles').select('customer_id,vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',order.vehicle_id).is('archived_at',null).single(),
   caseContext?Promise.resolve({data:caseContext.reference,error:null}):db.from('work_order_quibi_documents').select('id,quibi_document_id,content_sha256,quibi_environment').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind',kind).maybeSingle()
  ]);
  if(le||ve||ce||vre||ee||!link||!vehicleLink||!customer||!vehicle||vehicle.customer_id!==order.customer_id||link.quibi_environment!==environment||vehicleLink.quibi_environment!==environment||vehicleLink.quibi_customer_id!==link.external_id||link.sync_status!=='ok'||vehicleLink.sync_status!=='ok')throw Error('IDENTITY_UNVERIFIED');
  if(updating&&(!existing||existing.quibi_environment!==environment))throw Error('UPDATE_REFERENCE_REQUIRED');
  if(existing&&!updating)return {ok:false,message:`Dokument #${existing.quibi_document_id} je že povezan. Odprite obstoječi dokument; novega ne ustvarjajte.`,documentId:existing.quibi_document_id};
  const read=configuredQuibiReadClient();
  const [remoteCustomer,remoteVehicle,numberings,saleTypes,units,vat]=await Promise.all([read.customer(link.external_id),read.vehicle(vehicleLink.quibi_vehicle_id,link.external_id),read.catalog('numberings'),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat')]);
  if(remoteVehicle.disabled||customerFingerprint({name:customer.display_name,phone:customer.phone??'',email:customer.email??''})!==link.local_fingerprint||customerFingerprint(remoteCustomer)!==link.external_fingerprint||vehicleFingerprint({vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''})!==vehicleLink.local_fingerprint||vehicleFingerprint(remoteVehicle)!==vehicleLink.external_fingerprint)throw Error('IDENTITY_CHANGED');
  let numberingId=String(form.get('numberingId')??''),saleTypeId=String(form.get('saleTypeId')??'');


  let source;
  if(kind==='work_order'){
   const {data:quote,error}=await db.from('quotes').select('id,evidence_kind,evidence_payload,content_sha256,internal_review_status').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('quibi_environment',environment).order('version_no',{ascending:false}).limit(1).maybeSingle();
   const evidence=quote?.evidence_payload as {external_id?:string;customer_external_id?:string}|null;
   if(error||!quote||quote.internal_review_status!=='approved_for_send'||quote.evidence_kind!=='quibi_manual_estimate'||!evidence?.external_id||evidence.customer_external_id!==link.external_id||evidence.external_id==='2176888')throw Error('APPROVAL_REQUIRED');
   const {data:approval,error:ae}=await db.from('customer_approvals').select('customer_decision,decided_at,decision_evidence_reference,revoked_at,content_sha256').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('quote_id',quote.id).eq('content_sha256',quote.content_sha256).eq('customer_decision','approved').is('revoked_at',null).limit(1).maybeSingle();
   if(ae||!approval||!hasRecordedCustomerApproval(approval,quote.content_sha256))throw Error('APPROVAL_REQUIRED');
   source=await loadQuibiDocument(read,'estimate',evidence!.external_id!,link.external_id);
   if(source.contentSha256!==quote.content_sha256)throw Error('SOURCE_CHANGED');
  }else{
   const {data:reference,error}=caseContext?{data:caseContext.workOrderReference,error:null}:await db.from('work_order_quibi_documents').select('quibi_document_id,content_sha256').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind','work_order').eq('quibi_environment',environment).single();
   if(error||!reference)throw Error('WORK_ORDER_REQUIRED');
   source=await loadQuibiDocument(read,'work_order',reference.quibi_document_id,link.external_id);
   if(source.contentSha256!==reference.content_sha256)throw Error('SOURCE_CHANGED');
  }
  const header=businessHeaderSelection(kind,numberings,saleTypes,{numberingId,saleTypeId,sourceSaleTypeId:source.saleTypeId});
  ({numberingId,saleTypeId}=header);
  const articleIds=[...new Set(source.lines.flatMap(line=>line.articleId?[line.articleId]:[]))];
  const articles=await Promise.all(articleIds.map(id=>read.article(id)));
  const lines=businessSourceLines(source,units,vat,articles);
  const expectedUnitIds=source.lines.filter(line=>!quibiSourceNotes(source).includes(line)).map(line=>line.unitId!);
  const expectedUnitNetPrices=source.lines.filter(line=>!quibiSourceNotes(source).includes(line)).map(line=>Number(line.unitNetPrice));
  if(source.vehicleId!==vehicleLink.quibi_vehicle_id||!source.lines.length)throw Error('IDENTITY_UNVERIFIED');
  const review={sourceId:source.id,sourceSha:source.contentSha256,amount:source.amount,lines:source.lines.filter(line=>!quibiSourceNotes(source).includes(line)).map(line=>({description:line.description,quantity:line.quantity,unit:units.find(u=>u.id===line.unitId)!.label,vat:vat.find(v=>v.id===line.vatId)!.label,unitGrossPrice:line.unitGrossPrice!,discount:line.discount!})),notes:quibiSourceNotes(source).map(line=>line.description)};
  if(!header.ready){
   if(form.get('dispatch')==='yes')throw Error('CATALOG_INVALID');
   return {...review,ok:true,headerSelectionRequired:true,message:'Postavke so prebrane iz preverjenega Quibi dokumenta. Izberite veljavno številčenje in vrsto prodaje; priprava se nato samodejno preveri.'};
  }
  if(kind==='invoice'&&form.get('dispatch')!=='yes'&&((directCase&&form.get('repairCompleted')!=='yes')||!String(form.get('serviceDate')??'')))return {...review,ok:true,message:'Postavke računa so pridobljene iz preverjenega Quibi naloga. Potrdite opravljeno popravilo in dejanski datum; Selan nato samodejno preveri pripravo za CREATE.'};
  const invoiceHeader=kind==='invoice'?await verifiedInvoiceHeader(read,numberingId):undefined;
  const journalForRetry=quibiWorkflowJournal(access.organizationId,access.userId);
  const rejected=directCase&&!updating?await journalForRetry.get(kind,orderId):null;
  const retryOperationId=kind==='invoice'&&rejected?.state==='failed'&&!rejected.quibiId?rejected.id:undefined;
  const syntheticQa=syntheticCaseEvidenceAllowed(process.env,{description:caseContext?.order.problem_description,name:customer.display_name,email:customer.email,vin:vehicle.vin});
  const warehouses=await read.catalog('warehouses');
  if(warehouses.length&&!warehouses.some(w=>w.id===source.warehouseId))throw Error('WAREHOUSE_UNVERIFIED');
  let body=businessDocumentBody(kind,orderId,{spaceId:invoiceHeader?.spaceId,paymentMethod:invoiceHeader?.paymentMethod,warehouseId:source.warehouseId,serviceRequestId:order.service_request_id,numberingId,saleTypeId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,lines,note:`${syntheticQa?'QA-SIM ':''}Selan ${order.service_request_id}; vir ${source.id}; SHA ${source.contentSha256}${directCase&&kind==='invoice'?(syntheticQa?'; QA-SIM: simulirani zaključek, dejanskega popravila ni; potrjeno: ':'; popravilo opravljeno, potrjeno: ')+access.userId:''}`},String(form.get('serviceDate')??''));
  if(retryOperationId)body.Glavadokumenta.external_id='selan-work-order:'+retryOperationId+':'+kind;
  let baselineSha:string|undefined;
  if(updating){
   const {data:sendAttempt,error:sendError}=await db.from(environment==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal').select('quibi_id,request_body').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('kind','send').not('attempted_at','is',null);
   if(sendError||sendAttempt?.some(row=>{try{return row.quibi_id===existing!.quibi_document_id||JSON.parse(row.request_body).documentId===existing!.quibi_document_id}catch{return true}}))throw Error('SEND_HISTORY_BLOCKED');
   const current=await loadQuibiDocument(read,kind,existing!.quibi_document_id,link.external_id);
   if(current.vehicleId!==vehicleLink.quibi_vehicle_id||current.numberingId!==numberingId||current.externalId!==body.Glavadokumenta.external_id)throw Error('IDENTITY_CHANGED');
   baselineSha=existing!.content_sha256;
   if(form.get('dispatch')!=='yes'&&current.contentSha256!==baselineSha)throw Error('SOURCE_CHANGED');
   body=withDocumentId(body,existing!.quibi_document_id);
   if(form.get('dispatch')!=='yes')assertBusinessUpdateChanges(current,body,expectedUnitNetPrices,expectedUnitIds);
  }
  if(retryOperationId){const listed=await (kind==='invoice'?read.invoices(link.external_id):read.workOrders(link.external_id));for(const item of listed){const current=await read.documentDetail(item.id,link.external_id);if(current.externalId===body.Glavadokumenta.external_id||current.externalId?.startsWith('selan-work-order:'+orderId+':'+kind))throw Error('QUIBI_RETRY_DOCUMENT_EXISTS')}}
  const payload=updating?businessUpdatePayload(body,baselineSha!):stableEstimatePayload(body);
  if(form.get('dispatch')!=='yes')return {ok:true,message:'Priprava preverjena. Ni bilo Quibi zapisa ali pošiljanja.'+(invoiceHeader?' Način plačila: '+invoiceHeader.paymentMethod+'; poslovni prostor #'+invoiceHeader.spaceId+'; konfiguracija iz Quibi računa #'+invoiceHeader.sourceDocumentId+'.':'')+(retryOperationId?' Prejšnji zahtevek je dokončno zavrnjen. Potrditev ustvari ločen popravljen poskus; zavrnjeni zapis ostane ohranjen.':''),sha:payload.sha256,baselineSha,...review};
  if(form.get('expectedSha')!==payload.sha256)throw Error('SOURCE_CHANGED');
  const write=configuredQuibiWorkflowWriteClient();
  const journal=quibiWorkflowJournal(access.organizationId,access.userId);
  dispatchStarted=true;
  const op=updating?await updateBusinessDocument({kind,orderId,caseId:order.service_request_id,documentId:existing!.quibi_document_id,baselineSha:baselineSha!,expectedSha:payload.sha256,expectedAmount:source.amount,body,read,write,journal,expectedUnitNetPrices,expectedUnitIds}):await createBusinessDocument({kind,orderId,retryOperationId,caseId:order.service_request_id,expectedAmount:source.amount,body,read,write,journal,expectedUnitNetPrices,expectedUnitIds});
  if(!op.quibiId||!op.quibiContentSha256)throw Error('DOCUMENT_UNVERIFIED');
  if(directCase){revalidatePath('/dashboard/primeri/'+order.service_request_id);return {ok:true,message:'Quibi dokument je ponovno prebran. ID in SHA sta shranjena v journalu servisnega primera.',documentId:op.quibiId};}
  if(updating){
   const {error}=await db.rpc('confirm_work_order_quibi_document_revision',{p_reference_id:existing!.id,p_operation_id:op.id});
   revalidatePath('/dashboard/nalogi/'+orderId);
   return {ok:!error,message:error?'Quibi sprememba je preverjena, shranjevanje nove reference pa zahteva pregled. Ne ponavljajte zapisa.':'Quibi dokument je posodobljen in ponovno prebran. Prejšnji SHA je ohranjen v revizijski sledi.',documentId:op.quibiId};
  }
  const linkForm=new FormData();for(const [key,value] of Object.entries({orderId,documentId:op.quibiId,kind,sha:op.quibiContentSha256,confirmed:'yes'}))linkForm.set(key,value);
  const linked=await linkWorkOrderQuibiDocument(linkForm);
  revalidatePath(`/dashboard/nalogi/${orderId}`);
  return {ok:linked.ok,message:linked.ok?`Quibi dokument #${op.quibiId} je ponovno prebran in povezan.`:`Quibi dokument #${op.quibiId} obstaja; lokalna povezava zahteva pregled. Ne ustvarjajte novega.`,documentId:op.quibiId};
 }catch(error){const code=error instanceof Error?error.message:'';if(code==='QUIBI_CASE_CREATE_RETRY_SCHEMA_REQUIRED'||code==='QUIBI_JOURNAL_INSERT_FAILED')dispatchStarted=false;return {ok:false,dispatchStarted,message:code==='QUIBI_CASE_CREATE_RETRY_SCHEMA_REQUIRED'?'Popravljeni račun ni poslan Quibiju. Podatkovna varovalka trenutno dovoljuje samo en CREATE na primer tudi po dokončni zavrnitvi. Potrebna je odobritev ciljnega popravka DEV indeksa; uspešnih in negotovih poskusov ne bomo ponovili.':error instanceof QuibiValidationError?'Quibi je zavrnil dokument: '+error.validation.summary+' Ne ponavljajte CREATE.':code.startsWith('QUIBI_INVOICE_CONFIGURATION')?'Quibi ni enolično potrdil načina plačila in poslovnega prostora za to številčenje. Dokument ni ustvarjen; preverite konfiguracijo v Quibiju.':code==='WAREHOUSE_UNVERIFIED'?'Skladišče izvirnega Quibi dokumenta ni potrjeno. Preverite izvirni dokument; zapis ni izveden.':code==='SEND_HISTORY_BLOCKED'?'Dokument ima poskus pošiljanja ali dnevnika ni mogoče preveriti. Posodobitev je ustavljena; najprej razrešite dostavo in nadaljnji poslovni postopek.':code==='QUIBI_NO_BUSINESS_CHANGES'?'Postavke povezanega dokumenta že ustrezajo odobrenemu viru. Quibi zapis ni potreben.':code==='SOURCE_CHANGED'?'Izvirni dokument ali priprava se je spremenila. Potreben je nov pregled.':code==='APPROVAL_REQUIRED'?'Manjka veljavna odobritev stranke za zadnji predračun.':['SOURCE_LINE_METADATA_UNSUPPORTED','SOURCE_ARTICLE_CHANGED','SOURCE_STOCK_PRICE_CHANGED'].includes(code)?'Izvirne postavke nimajo veljavnih podatkov ali njihove enote/DDV niso v svežih Quibi šifrantih. Prenos je ustavljen; preverite izvirni dokument v Quibiju.':code==='WORK_ORDER_REQUIRED'?'Račun zahteva preverjeno povezan Quibi delovni nalog.':code==='QUIBI_BUSINESS_STAGE_NOT_READY'?'Za račun potrdite dejansko opravljeno popravilo; za nalog je potrebna veljavna odobritev stranke.':code==='QUIBI_WORKFLOW_DISABLED'?'Quibi WRITE je izključen. Pripravo lahko preverite brez zapisa.':'Operacija ni zanesljivo potrjena. Preverite identiteto, šifrante, izvirni dokument in dnevnik. Po neznanem izidu ne ustvarjajte novega dokumenta.'}}
}
