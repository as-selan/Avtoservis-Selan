"use server";
import {revalidatePath} from 'next/cache';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {quibiLinkEnvironment} from './workflow-config';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {loadQuibiDocument} from './document-read';
import {assertBusinessStage,businessDocumentBody,createBusinessDocument,type BusinessKind} from './business-document-workflow';
import {stableEstimatePayload} from './write-contract';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {linkWorkOrderQuibiDocument} from './work-order-document-actions';
export type BusinessPreparationResult={ok:boolean;message:string;sha?:string;sourceId?:string;sourceSha?:string;amount?:string;documentId?:string};
export async function prepareQuibiBusinessDocument(form:FormData):Promise<BusinessPreparationResult>{
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Pripravo poslovnih dokumentov lahko potrdi skrbnik.'};
 const orderId=String(form.get('orderId')??''),kind=String(form.get('kind')??'') as BusinessKind;
 if(!/^[a-f0-9-]{36}$/i.test(orderId)||!['work_order','invoice'].includes(kind)||form.get('confirmed')!=='yes')return {ok:false,message:'Izrecno potrdite pripravo dokumenta za ta nalog.'};
 try{
  const db=await createClient(),environment=quibiLinkEnvironment(process.env);
  const {data:order,error:orderError}=await db.from('work_orders').select('id,service_request_id,customer_id,vehicle_id,status').eq('organization_id',access.organizationId).eq('id',orderId).single();
  if(orderError||!order||order.service_request_id==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('CASE_BLOCKED');
  assertBusinessStage(kind,order.status);
  const [{data:link,error:le},{data:vehicleLink,error:ve},{data:customer,error:ce},{data:vehicle,error:vre},{data:existing,error:ee}]=await Promise.all([
   db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_id',order.customer_id).eq('entity_type','customer').eq('provider','quibi').single(),
   db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('vehicle_id',order.vehicle_id).eq('customer_id',order.customer_id).single(),
   db.from('customers').select('display_name,phone,email').eq('organization_id',access.organizationId).eq('id',order.customer_id).is('archived_at',null).single(),
   db.from('vehicles').select('customer_id,vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',order.vehicle_id).is('archived_at',null).single(),
   db.from('work_order_quibi_documents').select('quibi_document_id').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind',kind).maybeSingle()
  ]);
  if(le||ve||ce||vre||ee||!link||!vehicleLink||!customer||!vehicle||vehicle.customer_id!==order.customer_id||link.quibi_environment!==environment||vehicleLink.quibi_environment!==environment||vehicleLink.quibi_customer_id!==link.external_id||link.sync_status!=='ok'||vehicleLink.sync_status!=='ok')throw Error('IDENTITY_UNVERIFIED');
  if(existing)return {ok:false,message:`Dokument #${existing.quibi_document_id} je že povezan. Odprite obstoječi dokument; novega ne ustvarjajte.`,documentId:existing.quibi_document_id};
  const read=configuredQuibiReadClient();
  const [remoteCustomer,remoteVehicle,numberings,saleTypes,units,vat]=await Promise.all([read.customer(link.external_id),read.vehicle(vehicleLink.quibi_vehicle_id,link.external_id),read.catalog('numberings'),read.catalog('saleTypes'),read.catalog('units'),read.catalog('vat')]);
  if(remoteVehicle.disabled||customerFingerprint({name:customer.display_name,phone:customer.phone??'',email:customer.email??''})!==link.local_fingerprint||customerFingerprint(remoteCustomer)!==link.external_fingerprint||vehicleFingerprint({vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''})!==vehicleLink.local_fingerprint||vehicleFingerprint(remoteVehicle)!==vehicleLink.external_fingerprint)throw Error('IDENTITY_CHANGED');
  const numberingId=String(form.get('numberingId')??''),saleTypeId=String(form.get('saleTypeId')??''),unitId=String(form.get('unitId')??''),vatId=String(form.get('vatId')??'');
  const expectedLabel=kind==='invoice'?'račun':'delovni nalog';
  if(!numberings.some(n=>n.id===numberingId&&n.label.trim().toLocaleLowerCase('sl-SI')===expectedLabel)||!saleTypes.some(n=>n.id===saleTypeId)||!units.some(n=>n.id===unitId)||!vat.some(n=>n.id===vatId))throw Error('CATALOG_INVALID');
  let source;
  if(kind==='work_order'){
   const {data:quote,error}=await db.from('quotes').select('id,evidence_kind,evidence_payload,content_sha256,internal_review_status').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('quibi_environment',environment).order('version_no',{ascending:false}).limit(1).maybeSingle();
   const evidence=quote?.evidence_payload as {external_id?:string;customer_external_id?:string}|null;
   if(error||!quote||quote.internal_review_status!=='approved_for_send'||quote.evidence_kind!=='quibi_manual_estimate'||!evidence?.external_id||evidence.customer_external_id!==link.external_id||evidence.external_id==='2176888')throw Error('APPROVAL_REQUIRED');
   const {data:approval,error:ae}=await db.from('customer_approvals').select('id').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('quote_id',quote.id).eq('content_sha256',quote.content_sha256).eq('customer_decision','approved').eq('delivery_status','delivered').is('revoked_at',null).limit(1).maybeSingle();
   if(ae||!approval)throw Error('APPROVAL_REQUIRED');
   source=await loadQuibiDocument(read,'estimate',evidence!.external_id!,link.external_id);
   if(source.contentSha256!==quote.content_sha256)throw Error('SOURCE_CHANGED');
  }else{
   const {data:reference,error}=await db.from('work_order_quibi_documents').select('quibi_document_id,content_sha256').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind','work_order').eq('quibi_environment',environment).single();
   if(error||!reference)throw Error('WORK_ORDER_REQUIRED');
   source=await loadQuibiDocument(read,'work_order',reference.quibi_document_id,link.external_id);
   if(source.contentSha256!==reference.content_sha256)throw Error('SOURCE_CHANGED');
  }
  if(source.lines.some(line=>!line.unitId||!line.vatId||line.unitId!==unitId||line.vatId!==vatId||line.discount==null||Number(line.discount)!==0))throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  if(source.vehicleId!==vehicleLink.quibi_vehicle_id||!source.lines.length)throw Error('IDENTITY_UNVERIFIED');
  const body=businessDocumentBody(kind,orderId,{serviceRequestId:order.service_request_id,numberingId,saleTypeId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,lines:source.lines.map(line=>({opis:line.description,enota_id:unitId,ddv_id:vatId,kolicina:Number(line.quantity),cenaZDDV:Number(line.grossPrice),popust:0})),note:`Selan ${order.service_request_id}; vir ${source.id}; SHA ${source.contentSha256}`},String(form.get('serviceDate')??''));
  const payload=stableEstimatePayload(body);
  if(form.get('dispatch')!=='yes')return {ok:true,message:'Priprava preverjena. Ni bilo Quibi zapisa ali pošiljanja. Preverite postavke, enoto in DDV v izvirnem dokumentu pred potrditvijo.',sha:payload.sha256,sourceId:source.id,sourceSha:source.contentSha256,amount:source.amount};
  if(form.get('expectedSha')!==payload.sha256)throw Error('SOURCE_CHANGED');
  const write=configuredQuibiWorkflowWriteClient();
  const op=await createBusinessDocument({kind,orderId,caseId:order.service_request_id,expectedAmount:source.amount,body,read,write,journal:quibiWorkflowJournal(access.organizationId,access.userId)});
  if(!op.quibiId||!op.quibiContentSha256)throw Error('DOCUMENT_UNVERIFIED');
  const linkForm=new FormData();for(const [key,value] of Object.entries({orderId,documentId:op.quibiId,kind,sha:op.quibiContentSha256,confirmed:'yes'}))linkForm.set(key,value);
  const linked=await linkWorkOrderQuibiDocument(linkForm);
  revalidatePath(`/dashboard/nalogi/${orderId}`);
  return {ok:linked.ok,message:linked.ok?`Quibi dokument #${op.quibiId} je ponovno prebran in povezan.`:`Quibi dokument #${op.quibiId} obstaja; lokalna povezava zahteva pregled. Ne ustvarjajte novega.`,documentId:op.quibiId};
 }catch(error){const code=error instanceof Error?error.message:'';return {ok:false,message:code==='SOURCE_CHANGED'?'Izvirni dokument ali priprava se je spremenila. Potreben je nov pregled.':code==='APPROVAL_REQUIRED'?'Manjka veljavna odobritev stranke za zadnji predračun.':code==='SOURCE_LINE_METADATA_UNSUPPORTED'?'Izvirne postavke nimajo potrjene enote/DDV ali vsebujejo popust. Samodejen prenos je ustavljen; izberite ustrezne šifrante oziroma uporabite Quibi za ta dokument.':code==='WORK_ORDER_REQUIRED'?'Račun zahteva preverjeno povezan Quibi delovni nalog.':code==='QUIBI_BUSINESS_STAGE_NOT_READY'?'Račun je na voljo šele, ko je popravilo pripravljeno za prevzem.':code==='QUIBI_WORKFLOW_DISABLED'?'Quibi WRITE je izključen. Pripravo lahko preverite brez zapisa.':'Operacija ni zanesljivo potrjena. Preverite identiteto, šifrante, izvirni dokument in dnevnik. Po neznanem izidu ne ustvarjajte novega dokumenta.'}}
}
