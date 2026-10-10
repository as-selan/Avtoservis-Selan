"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {quibiLinkEnvironment,workflowRecipient} from './workflow-config';
import {configuredQuibiWorkflowWriteClient,configuredQuibiWorkflowStatusClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {loadQuibiDocument} from './document-read';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {sendBusinessDocument,businessSendKey} from './business-send-workflow';
import {sendPresentation} from './send-outcome';
export async function sendLinkedQuibiBusinessDocument(form:FormData):Promise<{ok:boolean;message:string;sendId?:string;status?:string;locked?:boolean}>{
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Pošiljanje lahko potrdi skrbnik.'};
 const orderId=String(form.get('orderId')??''),documentId=String(form.get('documentId')??''),kind=String(form.get('kind')??''),sha=String(form.get('sha')??'');
 if(!/^[a-f0-9-]{36}$/i.test(orderId)||!/^\d+$/.test(documentId)||documentId==='2176888'||!['work_order','invoice'].includes(kind)||!/^[a-f0-9]{64}$/.test(sha))return {ok:false,message:'Dokument ni dovoljen za ta postopek.'};
 try{
  const db=await createClient(),environment=quibiLinkEnvironment(process.env);
  const {data:order,error:oe}=await db.from('work_orders').select('*').eq('organization_id',access.organizationId).eq('id',orderId).single();
  if(oe||!order||order.service_request_id==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('FORBIDDEN');
  const {data:reference,error:re}=await db.from('work_order_quibi_documents').select('*').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind',kind).eq('quibi_document_id',documentId).eq('quibi_environment',environment).single();
  if(re||!reference||reference.content_sha256!==sha)throw Error('CONTENT_CHANGED');
  const journal=quibiWorkflowJournal(access.organizationId,access.userId),key=businessSendKey(order.service_request_id,documentId,sha);
  if(form.get('poll')==='yes'){
   const op=await journal.get('send',key);
   if(!op||op.serviceRequestId!==order.service_request_id||op.quibiId!==documentId||!op.sendId)return {ok:false,message:'Brez potrjenega send_id izida ni mogoče razrešiti. Ponovno pošiljanje je ustavljeno.',locked:true};
   const status=await configuredQuibiWorkflowStatusClient().getSendStatus(documentId,op.sendId);
   const updated=await journal.patch(op.id,op.state,{sendStatus:status.status});
   return {ok:true,message:sendPresentation(updated).message,sendId:updated.sendId!,status:updated.sendStatus!,locked:true};
  }
  const {data:previous,error:previousError}=await db.from(environment==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal').select('local_entity_id,state,request_body').eq('organization_id',access.organizationId).eq('service_request_id',order.service_request_id).eq('kind','send');
  if(previousError||previous?.some(row=>{try{return row.local_entity_id!==key&&['uncertain','dispatching'].includes(row.state)&&(JSON.parse(row.request_body) as {documentId?:string}).documentId===documentId}catch{return true}}))throw Error('PREVIOUS_SEND_UNRESOLVED');
  if(form.get('confirmed')!=='yes')throw Error('CONFIRMATION_REQUIRED');
  const [{data:customer,error:ce},{data:link,error:le},{data:vehicle,error:ve},{data:vl,error:vle}]=await Promise.all([
   db.from('customers').select('display_name,email,phone').eq('organization_id',access.organizationId).eq('id',order.customer_id).is('archived_at',null).single(),
   db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_type','customer').eq('provider','quibi').eq('entity_id',order.customer_id).single(),
   db.from('vehicles').select('customer_id,vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',order.vehicle_id).is('archived_at',null).single(),
   db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('vehicle_id',order.vehicle_id).eq('customer_id',order.customer_id).single()
  ]);
  if(ce||le||ve||vle||!customer||!link||!vehicle||!vl||vehicle.customer_id!==order.customer_id||link.external_id!==reference.quibi_customer_id||vl.quibi_vehicle_id!==reference.quibi_vehicle_id||vl.quibi_customer_id!==link.external_id||link.quibi_environment!==environment||vl.quibi_environment!==environment||link.sync_status!=='ok'||vl.sync_status!=='ok')throw Error('IDENTITY_UNVERIFIED');
  const read=configuredQuibiReadClient();
  const [remoteCustomer,remoteVehicle,doc]=await Promise.all([read.customer(link.external_id),read.vehicle(vl.quibi_vehicle_id,link.external_id),loadQuibiDocument(read,kind as 'work_order'|'invoice',documentId,link.external_id)]);
  if(remoteVehicle.disabled||doc.vehicleId!==vl.quibi_vehicle_id||doc.contentSha256!==sha||doc.amount!==String(form.get('amount')??'')||!doc.lines.length||customerFingerprint({name:customer.display_name,email:customer.email??'',phone:customer.phone??''})!==link.local_fingerprint||customerFingerprint(remoteCustomer)!==link.external_fingerprint||vehicleFingerprint({vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''})!==vl.local_fingerprint||vehicleFingerprint(remoteVehicle)!==vl.external_fingerprint)throw Error('IDENTITY_CHANGED');
  const recipient=workflowRecipient(process.env,customer.email,remoteCustomer.email);
  if(recipient!==form.get('recipient'))throw Error('RECIPIENT_CHANGED');
  const op=await sendBusinessDocument({caseId:order.service_request_id,documentId,sha,amount:doc.amount,recipient,journal,write:configuredQuibiWorkflowWriteClient()});
  return {ok:op.state==='verified',message:sendPresentation(op).message,sendId:op.sendId??undefined,status:op.sendStatus??undefined,locked:op.state!=='prepared'};
 }catch{return {ok:false,message:'Pošiljanje ni potrjeno. Preverite dnevnik, dokument, prejemnika in dovoljenje. Ne ponavljajte pošiljanja ob neznanem izidu.',locked:true}}
}
