"use server";
import {inspectionBillingReview} from "./inspection-billing-review";
import {caseBusinessReference} from "./case-business-policy";
import {loadCaseWork} from '@/lib/case-work/read';import {reviewDecision} from '@/lib/case-work/review-policy';

import {estimateCatalogSource} from './estimate-catalog-source';
import {quibiJournalTable} from './deployment-policy';
import {invoiceSourceChanges,verifyInvoiceSourceTotal,invoiceDates,quibiToday,assertInvoiceEditable} from './invoice-review';
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
import {quibiWorkflowConfig,quibiLinkEnvironment} from './workflow-config';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {loadQuibiDocument} from './document-read';
import {assertBusinessStage,businessDocumentBody,createBusinessDocument,assertBusinessUpdateChanges,updateBusinessDocument,businessUpdatePayload,type BusinessKind,confirmBusinessContent} from './business-document-workflow';
import {businessSourceLines,quibiSourceNotes} from './business-source-lines';
import {stableEstimatePayload,withDocumentId} from './write-contract';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {linkWorkOrderQuibiDocument} from './work-order-document-actions';
export type BusinessPreparationResult={manualQuibiUrl?:string;inspectionReview?:{sha:string;reference:string;confirmed:boolean;serviceCode:string};manualCustomerId?:string;ok:boolean;message:string;sha?:string;sourceId?:string;sourceSha?:string;amount?:string;documentId?:string;baselineSha?:string;dispatchStarted?:boolean;lines?:{description:string;quantity:string;unit:string;vat:string;unitGrossPrice:string;discount:string}[];notes?:string[];headerSelectionRequired?:boolean;invoiceHeader?:Awaited<ReturnType<typeof verifiedInvoiceHeader>>;invoiceDates?:{serviceDate:string;issueDate:string;dueDate:string};billingChanges?:string[];customer?:string;vehicle?:string;issuer?:string;taxTotals?:{base:string;vat:string;total:string;vatId:string}[]};
export async function prepareQuibiBusinessDocument(form:FormData):Promise<BusinessPreparationResult>{
 let dispatchStarted=false;
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Pripravo poslovnih dokumentov lahko potrdi skrbnik.'};
 const reconciling=form.get('reconcile')==='yes';
 if(reconciling&&form.get('dispatch')==='yes')return {ok:false,message:'Razrešitev uporablja samo READ. CREATE in SEND nista dovoljena.'};
 const updating=form.get('operation')==='update';
 const directCase=typeof form.get('caseId')==='string';
 const orderId=String(form.get(directCase?'caseId':'orderId')??''),kind=String(form.get('kind')??'') as BusinessKind;
 if(!/^[a-f0-9-]{36}$/i.test(orderId)||!['work_order','invoice'].includes(kind)||(form.get('dispatch')==='yes'&&form.get('confirmed')!=='yes'))return {ok:false,message:'Izrecno potrdite pripravo dokumenta za ta nalog.'};
 try{
  const db=await createClient(),environment=quibiLinkEnvironment(process.env);
  const caseContext=directCase?await loadCaseBusinessContext(db,access.organizationId,orderId,kind,form.get('repairCompleted')==='yes',form.get('dispatch')!=='yes',reconciling):null;
  const {data:order,error:orderError}=caseContext?{data:caseContext.order,error:null}:await db.from('work_orders').select('id,service_request_id,customer_id,vehicle_id,status').eq('organization_id',access.organizationId).eq('id',orderId).single();
  if(orderError||!order||order.service_request_id==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('CASE_BLOCKED');
  assertBusinessStage(kind,order.status);
  {const {data:prior,error}=await db.from(quibiJournalTable(environment)).select('id,local_entity_id,kind,state,quibi_id,request_body').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('kind',kind);if(error)throw Error('QUIBI_JOURNAL_READ_FAILED');assertBusinessCreationNamespace(prior??[],orderId,kind);}
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
  const review:BusinessPreparationResult={ok:true,message:'',issuer:source.issuerName,taxTotals:source.taxTotals,customer:remoteCustomer.name,vehicle:[remoteVehicle.registration,remoteVehicle.make,remoteVehicle.model].filter(Boolean).join(' · '),sourceId:source.id,sourceSha:source.contentSha256,amount:source.amount,lines:source.lines.filter(line=>!quibiSourceNotes(source).includes(line)).map(line=>({description:line.description,quantity:line.quantity,unit:units.find(u=>u.id===line.unitId)!.label,vat:vat.find(v=>v.id===line.vatId)!.label,unitGrossPrice:line.unitGrossPrice!,discount:line.discount!})),notes:quibiSourceNotes(source).map(line=>line.description)};
  if(!header.ready&&!reconciling){
   if(form.get('dispatch')==='yes')throw Error('CATALOG_INVALID');
   return {...review,ok:true,headerSelectionRequired:true,message:'Postavke so prebrane iz preverjenega Quibi dokumenta. Izberite veljavno številčenje in vrsto prodaje; priprava se nato samodejno preveri.'};
  }
  if(!reconciling&&kind==='invoice'&&form.get('dispatch')!=='yes'&&((directCase&&form.get('repairCompleted')!=='yes')||!String(form.get('serviceDate')??'')))return {...review,ok:true,message:'Postavke računa so pridobljene iz preverjenega Quibi naloga. Potrdite opravljeno popravilo in dejanski datum; Selan nato samodejno preveri pripravo za CREATE.'};
  if(reconciling){
   if(!directCase||kind!=='invoice')throw Error('RECONCILIATION_FORBIDDEN');
   const opId=String(form.get('operationId')??'');
   const {data:row,error:oe}=await db.from('quibi_dev_operation_journal').select('id,local_entity_id').eq('organization_id',access.organizationId).eq('service_request_id',orderId).eq('kind','invoice').eq('state','uncertain').eq('id',opId).not('quibi_id','is',null).single();
   if(oe||!row)throw Error('RECONCILIATION_UNVERIFIED');
   const journal=quibiWorkflowJournal(access.organizationId,access.userId),op=await journal.get('invoice',row.local_entity_id);
   if(!op||op.id!==opId||op.state!=='uncertain'||!op.quibiId)throw Error('RECONCILIATION_UNVERIFIED');
   const body=JSON.parse(op.requestBody);
   if(stableEstimatePayload(body).sha256!==op.requestSha256||String(body.Glavadokumenta.stranka_id)!==link.external_id||String(body.Glavadokumenta.vozila_id)!==vehicleLink.quibi_vehicle_id||body.Glavadokumenta.external_id!=='selan-work-order:'+row.local_entity_id+':invoice')throw Error('RECONCILIATION_UNVERIFIED');
   const doc=await loadQuibiDocument(read,'invoice',op.quibiId,link.external_id);
   confirmBusinessContent(doc,body,expectedUnitNetPrices,expectedUnitIds);
   if(Number(doc.amount)!==Number(source.amount)||!doc.number||doc.number==='Osnutek'||(op.documentNumber!==doc.number&&op.documentNumber!=='Osnutek'))throw Error('QUIBI_DOCUMENT_NUMBER_MISMATCH');
   await journal.patch(op.id,'uncertain',{state:'verified',documentNumber:doc.number,quibiContentSha256:doc.contentSha256});
   console.info(JSON.stringify({event:'quibi_invoice_read_reconciled',operationId:op.id,documentId:doc.id,previousNumber:op.documentNumber,number:doc.number}));
   revalidatePath('/dashboard/primeri/'+orderId);
   return {ok:true,message:'Račun je ponovno prebran in preverjen. CREATE in SEND nista ponovljena.',documentId:doc.id};
  }
  let changes:string[]=[];
  if(kind==='invoice'){
   verifyInvoiceSourceTotal(source);
   const {data:quote,error:qe}=await db.from('quotes').select('id,evidence_payload,content_sha256,internal_review_status').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('quibi_environment',environment).order('version_no',{ascending:false}).limit(1).maybeSingle();
   const evidence=quote?.evidence_payload as {external_id?:string}|null;
   if(qe||!quote||quote.internal_review_status!=='approved_for_send'||!evidence?.external_id)throw Error('APPROVAL_REQUIRED');
   const {data:approval,error:ae}=await db.from('customer_approvals').select('customer_decision,decided_at,decision_evidence_reference,revoked_at,content_sha256').eq('organization_id',access.organizationId).eq('quote_id',quote.id).is('revoked_at',null).limit(1).maybeSingle();
   if(ae||!approval||!hasRecordedCustomerApproval(approval,quote.content_sha256))throw Error('APPROVAL_REQUIRED');
   const approved=await loadQuibiDocument(read,'estimate',evidence.external_id,link.external_id);
   if(approved.contentSha256!==quote.content_sha256)throw Error('SOURCE_CHANGED');
   changes=invoiceSourceChanges(approved,source);review.billingChanges=changes;
   if(changes.length&&(String(form.get('billingChangeReference')??'').trim().length<12||String(form.get('billingChangeReference')??'').length>500)){
    if(form.get('dispatch')==='yes')throw Error('QUIBI_BILLING_CHANGE_APPROVAL_REQUIRED');
    return {...review,message:'Nalog se razlikuje od odobrenega predračuna. Navedite sledljivo podlago odobritve dodatnih del ali spremenjene cene; nato ponovno preglejte račun.'};
   }
  }
  const invoiceHeader=kind==='invoice'?await verifiedInvoiceHeader(read,numberingId,{spaceId:String(form.get('spaceId')??''),paymentMethod:String(form.get('paymentMethod')??'')}):undefined;
  if(invoiceHeader){review.invoiceHeader=invoiceHeader;if(!invoiceHeader.ready){if(form.get('dispatch')==='yes')throw Error('QUIBI_INVOICE_CONFIGURATION_UNVERIFIED');return {...review,message:'Izberite način plačila in poslovni prostor iz aktualnih Quibi šifrantov. Podatkov ne kopiramo iz drugih računov.'};}}
  if(kind==='invoice')review.invoiceDates=invoiceDates(String(form.get('serviceDate')??''),String(form.get('issueDate')||quibiToday()),String(form.get('dueDate')||form.get('issueDate')||quibiToday()));
  const journalForRetry=quibiWorkflowJournal(access.organizationId,access.userId);
  const rejected=directCase&&!updating?await journalForRetry.get(kind,orderId):null;
  const retryOperationId=kind==='invoice'&&rejected?.state==='failed'&&!rejected.quibiId?rejected.id:undefined;
  const syntheticQa=syntheticCaseEvidenceAllowed(process.env,{description:caseContext?.order.problem_description,name:customer.display_name,email:customer.email,vin:vehicle.vin});
  const warehouses=await read.catalog('warehouses');
  if(warehouses.length&&!warehouses.some(w=>w.id===source.warehouseId))throw Error('WAREHOUSE_UNVERIFIED');
  let body=businessDocumentBody(kind,orderId,{spaceId:invoiceHeader?.spaceId,paymentMethod:invoiceHeader?.paymentMethod,warehouseId:source.warehouseId,serviceRequestId:order.service_request_id,numberingId,saleTypeId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,lines,note:`${syntheticQa?'QA-SIM ':''}Selan ${order.service_request_id}; vir ${source.id}; SHA ${source.contentSha256}${directCase&&kind==='invoice'?(syntheticQa?'; QA-SIM: simulirani zaključek, dejanskega popravila ni; potrjeno: ':'; popravilo opravljeno, potrjeno: ')+access.userId:''}`},String(form.get('serviceDate')??''));
  if(review.invoiceDates){body.Glavadokumenta.datIzdRac=review.invoiceDates.issueDate;body.Glavadokumenta.datValute=review.invoiceDates.dueDate;}
  if(changes.length)body.Glavadokumenta.opomba=(body.Glavadokumenta.opomba??'')+'; odobritev spremembe: '+String(form.get('billingChangeReference')).trim();
  if(retryOperationId)body.Glavadokumenta.external_id='selan-work-order:'+retryOperationId+':'+kind;
  let baselineSha:string|undefined;
  if(updating){
   const {data:sendAttempt,error:sendError}=await db.from(environment==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal').select('quibi_id,request_body').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('kind','send').not('attempted_at','is',null);
   if(sendError||sendAttempt?.some(row=>{try{return row.quibi_id===existing!.quibi_document_id||JSON.parse(row.request_body).documentId===existing!.quibi_document_id}catch{return true}}))throw Error('SEND_HISTORY_BLOCKED');
   const current=await loadQuibiDocument(read,kind,existing!.quibi_document_id,link.external_id);if(kind==='invoice')assertInvoiceEditable(current);
   if(current.vehicleId!==vehicleLink.quibi_vehicle_id||current.numberingId!==numberingId||current.externalId!==body.Glavadokumenta.external_id)throw Error('IDENTITY_CHANGED');
   baselineSha=existing!.content_sha256;
   if(form.get('dispatch')!=='yes'&&current.contentSha256!==baselineSha)throw Error('SOURCE_CHANGED');
   body=withDocumentId(body,existing!.quibi_document_id);
   if(form.get('dispatch')!=='yes')assertBusinessUpdateChanges(current,body,expectedUnitNetPrices,expectedUnitIds);
  }
  if(retryOperationId){const listed=await (kind==='invoice'?read.invoices(link.external_id):read.workOrders(link.external_id));for(const item of listed){const current=await read.documentDetail(item.id,link.external_id);if(current.externalId===body.Glavadokumenta.external_id||current.externalId?.startsWith('selan-work-order:'+orderId+':'+kind))throw Error('QUIBI_RETRY_DOCUMENT_EXISTS')}}
  const payload=updating?businessUpdatePayload(body,baselineSha!):stableEstimatePayload(body);
  if(form.get('dispatch')!=='yes')return {...review,ok:true,message:'Priprava preverjena. Ni bilo Quibi zapisa ali pošiljanja.'+(invoiceHeader?' Način plačila: '+invoiceHeader.paymentMethod+'; poslovni prostor #'+invoiceHeader.spaceId+'; sveži Quibi šifranti.':'')+(retryOperationId?' Prejšnji zahtevek je dokončno zavrnjen. Potrditev ustvari ločen popravljen poskus; zavrnjeni zapis ostane ohranjen.':''),sha:payload.sha256,baselineSha};
  if(form.get('expectedSha')!==payload.sha256)throw Error('SOURCE_CHANGED');
  if(kind==='invoice'){const repair=await loadCaseWork(order.service_request_id);if(repair.error)throw Error('MANAGER_REVIEW_REQUIRED');const assigned=repair.rows[0];if(assigned&&(assigned.status!=='work_completed'||!assigned.review?.ready||reviewDecision(assigned.review)?.action!=='accepted'||assigned.review.workLocked))throw Error('MANAGER_REVIEW_REQUIRED');}
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
 }catch(error){const code=error instanceof Error?error.message:'';if(code==='MANAGER_REVIEW_REQUIRED')return {ok:false,message:'Najprej mora vodja pregledati in potrditi opravljeno delo ter trenutna dokazila. Informativni predogled računa ostaja na voljo.'};if(code==='QUIBI_CASE_CREATE_RETRY_SCHEMA_REQUIRED'||code==='QUIBI_JOURNAL_INSERT_FAILED')dispatchStarted=false;return {ok:false,dispatchStarted,message:code==='QUIBI_CASE_CREATE_RETRY_SCHEMA_REQUIRED'?'Popravljeni račun ni poslan Quibiju. Podatkovna varovalka trenutno dovoljuje samo en CREATE na primer tudi po dokončni zavrnitvi. Potrebna je odobritev ciljnega popravka DEV indeksa; uspešnih in negotovih poskusov ne bomo ponovili.':error instanceof QuibiValidationError?'Quibi je zavrnil dokument: '+error.validation.summary+' Ne ponavljajte CREATE.':code==='QUIBI_ISSUED_INVOICE_READ_ONLY'?'Izdani račun je na voljo za pregled. Popravke in morebitni dobropis uredite po pravilih Quibija; Selan izdanega računa ne prepisuje.':code==='QUIBI_INVOICE_DATES_REQUIRED'?'Preverite datum storitve, izdaje in zapadlosti. Datum storitve ne sme biti po izdaji, zapadlost pa ne pred izdajo.':code==='QUIBI_INVOICE_TOTAL_MISMATCH'?'Znesek Quibi naloga se ne ujema s preverjenimi postavkami. Pred računom preverite izvirni nalog.':code==='QUIBI_BILLING_CHANGE_APPROVAL_REQUIRED'?'Navedite sledljivo odobritev dodatnih del oziroma spremenjene cene. Račun ni ustvarjen.':code.startsWith('QUIBI_INVOICE_CONFIGURATION')?'Quibi ni enolično potrdil načina plačila in poslovnega prostora za to številčenje. Dokument ni ustvarjen; preverite konfiguracijo v Quibiju.':code==='WAREHOUSE_UNVERIFIED'?'Skladišče izvirnega Quibi dokumenta ni potrjeno. Preverite izvirni dokument; zapis ni izveden.':code==='SEND_HISTORY_BLOCKED'?'Dokument ima poskus pošiljanja ali dnevnika ni mogoče preveriti. Posodobitev je ustavljena; najprej razrešite dostavo in nadaljnji poslovni postopek.':code==='QUIBI_NO_BUSINESS_CHANGES'?'Postavke povezanega dokumenta že ustrezajo odobrenemu viru. Quibi zapis ni potreben.':code==='SOURCE_CHANGED'?'Izvirni dokument ali priprava se je spremenila. Potreben je nov pregled.':code==='APPROVAL_REQUIRED'?'Manjka veljavna odobritev stranke za zadnji predračun.':['SOURCE_LINE_METADATA_UNSUPPORTED','SOURCE_ARTICLE_CHANGED','SOURCE_STOCK_PRICE_CHANGED'].includes(code)?'Izvirne postavke nimajo veljavnih podatkov ali njihove enote/DDV niso v svežih Quibi šifrantih. Prenos je ustavljen; preverite izvirni dokument v Quibiju.':code==='WORK_ORDER_REQUIRED'?'Račun zahteva preverjeno povezan Quibi delovni nalog.':code==='QUIBI_BUSINESS_STAGE_NOT_READY'?'Za račun potrdite dejansko opravljeno popravilo; za nalog je potrebna veljavna odobritev stranke.':code==='QUIBI_WORKFLOW_DISABLED'?'Quibi WRITE je izključen. Pripravo lahko preverite brez zapisa.':'Operacija ni zanesljivo potrjena. Preverite identiteto, šifrante, izvirni dokument in dnevnik. Po neznanem izidu ne ustvarjajte novega dokumenta.'}}
}

/** READ-only billing basis for a completed inspection without ordered repair; never creates a repair order. */
export async function prepareInspectionBillingBasis(form:FormData):Promise<BusinessPreparationResult>{
 const access=await requirePhase1OperationalAccess();if(!['owner','admin'].includes(access.role))return {ok:false,message:'Pripravo računa pregleda lahko preveri skrbnik.'};
 const caseId=String(form.get('caseId')??'');if(!/^[a-f0-9-]{36}$/i.test(caseId)||form.get('dispatch')==='yes')return {ok:false,message:'To je samo pregled podlage, brez ustvarjanja ali pošiljanja.'};
 try{
  const db=await createClient(),environment=quibiLinkEnvironment(process.env);
  const [{data:request,error:re},{data:inspection,error:ie}]=await Promise.all([db.from('service_requests').select('customer_id,vehicle_id').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single(),db.from('preliminary_inspections').select('status,repair_decision,findings').eq('organization_id',access.organizationId).eq('service_request_id',caseId).single()]);
  if(re||ie||!request?.customer_id||!request.vehicle_id||inspection?.status!=='completed'||inspection.repair_decision!=='not_ordered')throw Error('INSPECTION_NOT_BILLABLE');
  const [{data:customer,error:ce},{data:link,error:le},{data:vehicle,error:ve},{data:vlink,error:vle}]=await Promise.all([db.from('customers').select('display_name,phone,email').eq('organization_id',access.organizationId).eq('id',request.customer_id).is('archived_at',null).single(),db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_type','customer').eq('provider','quibi').eq('entity_id',request.customer_id).single(),db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',request.vehicle_id).eq('customer_id',request.customer_id).is('archived_at',null).single(),db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('vehicle_id',request.vehicle_id).eq('customer_id',request.customer_id).single()]);
  if(ce||le||ve||vle||!customer||!vehicle||!link||!vlink||link.sync_status!=='ok'||vlink.sync_status!=='ok'||link.quibi_environment!==environment||vlink.quibi_environment!==environment||vlink.quibi_customer_id!==link.external_id)throw Error('IDENTITY_UNVERIFIED');
  const journalResult=await db.from(quibiJournalTable(environment)).select('id,kind,state,quibi_id,quibi_content_sha256,request_body,created_at').eq('organization_id',access.organizationId).eq('service_request_id',caseId).in('kind',['invoice','invoice_update']);
  if(journalResult.error)throw Error('INSPECTION_HISTORY_UNAVAILABLE');
  let existing;try{existing=caseBusinessReference(journalResult.data??[],'invoice',environment)}catch{throw Error('INSPECTION_INVOICE_UNRESOLVED')}
  const read=configuredQuibiReadClient(),remote=await read.customer(link.external_id),remoteVehicle=await read.vehicle(vlink.quibi_vehicle_id,link.external_id);
  if(remoteVehicle.disabled||customerFingerprint({name:customer.display_name,email:customer.email??'',phone:customer.phone??''})!==link.local_fingerprint||customerFingerprint(remote)!==link.external_fingerprint||vehicleFingerprint({vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''})!==vlink.local_fingerprint||vehicleFingerprint(remoteVehicle)!==vlink.external_fingerprint)throw Error('IDENTITY_UNVERIFIED');
  if(existing){const invoice=await loadQuibiDocument(read,'invoice',existing.quibi_document_id,link.external_id);if(invoice.vehicleId!==vlink.quibi_vehicle_id||invoice.contentSha256!==existing.content_sha256)throw Error('INSPECTION_INVOICE_UNRESOLVED');return {ok:false,documentId:invoice.id,manualCustomerId:request.customer_id,message:'Za ta primer je račun že povezan. Preglejte obstoječi račun in PDF; novega obračuna pregleda ne pripravljamo.'};}
  const units=await read.catalog('units'),vatRates=await read.catalog('vat');
  const source=await estimateCatalogSource(form,read,{units,vatRates},remote);if(!source||source.option.stockManaged!==false)throw Error('INSPECTION_SERVICE_REQUIRED');
  const review=inspectionBillingReview({caseId,customerId:link.external_id,vehicleId:vlink.quibi_vehicle_id,findings:inspection.findings??'',sourceSha:source.option.sourceSha,quantity:source.reviewedLine.quantity,total:source.total});
  const confirming=form.get('reviewInspection')==='yes';
  if(confirming&&(form.get('inspectionServiceConfirmed')!=='yes'||form.get('expectedReviewSha')!==review.sha))throw Error('INSPECTION_REVIEW_CHANGED');
  return {ok:true,manualQuibiUrl:confirming?quibiWorkflowConfig(process.env,'read').origin:undefined,inspectionReview:{...review,confirmed:confirming,serviceCode:source.option.code},manualCustomerId:request.customer_id,message:confirming?'Podatki so ponovno preverjeni in izbira storitve je potrjena za nadaljevanje v Quibiju. Račun še ni izdan. Potrditev velja za ta prikaz in ni shranjena kot izdaja ali plačilo.':'Podlaga računa je pripravljena. Preglejte storitev in potrdite nadaljevanje; račun ni ustvarjen ali poslan.',customer:remote.name,vehicle:[remoteVehicle.registration,remoteVehicle.make,remoteVehicle.model].join(' · '),amount:source.total.toFixed(2),notes:inspection.findings?[inspection.findings]:[],lines:[{description:source.option.name,quantity:String(source.reviewedLine.quantity),unit:source.reviewedLine.unit,vat:source.reviewedLine.vat,discount:String(source.reviewedLine.discount),unitGrossPrice:String(source.reviewedLine.unitPrice)}]};
 }catch(error){return {ok:false,message:error instanceof Error&&error.message==='INSPECTION_REVIEW_CHANGED'?'Storitev, cena ali podatki so se spremenili oziroma izbira ni potrjena. Ponovno odprite predogled in potrdite aktualne podatke.':error instanceof Error&&['INSPECTION_HISTORY_UNAVAILABLE','INSPECTION_INVOICE_UNRESOLVED'].includes(error.message)?'Račun oziroma njegov prejšnji poskus zahteva preverjanje. Novega obračuna ne pripravljamo; preverite obstoječe dokumente primera v Quibiju.':error instanceof Error&&error.message==='INSPECTION_NOT_BILLABLE'?'Pregled je brezplačen ob naročenem popravilu ali še ni zaključen. Računa pregleda ne pripravljamo.':error instanceof Error&&error.message==='INSPECTION_SERVICE_REQUIRED'?'Izberite potrjeno Quibijevo storitev predhodnega pregleda. Artikla, ki vodi zalogo, ne obravnavamo kot storitev pregleda.':'Podlage pregleda ni mogoče preveriti. Preverite povezavo stranke in vozila ter pravo Quibijevo postavko in cenik.'};}
}
