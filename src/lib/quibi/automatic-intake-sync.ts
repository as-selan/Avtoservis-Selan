import 'server-only';
import {after} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {quibiWorkflowConfig} from './workflow-config';
import {createQuibiReadClient} from './client';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiDevOperationJournal} from './write-journal';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {synchronizeIntakeParties} from './automatic-intake-workflow';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function scheduleIntakeSynchronization(caseId:string){
 if(process.env.APP_ENV==='preproduction'&&process.env.QUIBI_MODE==='dev'&&process.env.VERCEL_ENV==='preview'&&uuid.test(caseId))after(async()=>{await processIntakeSynchronization(caseId)});
}
export async function processIntakeSynchronization(caseId:string){
 if(!uuid.test(caseId)||process.env.APP_ENV!=='preproduction'||process.env.QUIBI_MODE!=='dev'||process.env.VERCEL_ENV!=='preview')return;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)return;
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:org,error:orgError}=await db.from('organizations').select('id').eq('slug','avtoservis-selan').single();
 if(orgError||!org)return;
 const {data:request,error}=await db.from('service_requests').select('id,customer_id,vehicle_id,attention_reason').eq('organization_id',org.id).eq('id',caseId).is('archived_at',null).single();
 if(error||!request?.customer_id)return;
 async function status(message:string|null){
  // Do not clear or replace attention raised by other business steps.
  if(request!.attention_reason&&!request!.attention_reason.startsWith('Quibi povezava:'))return;
  const {error}=await db.from('service_requests').update({attention_needed:!!message,attention_reason:message?'Quibi povezava: '+message:null}).eq('organization_id',org!.id).eq('id',caseId).eq('customer_id',request!.customer_id);
  if(error)throw Error('INTAKE_STATUS_STORAGE_FAILED');
 }
 for(let attempt=0;attempt<3;attempt++)try{
  if(process.env.QUIBI_DEV_INTAKE_SYNC_ENABLED!=='1'||process.env.VERCEL_ENV!=='preview'||process.env.APP_ENV!=='preproduction'||process.env.QUIBI_MODE!=='dev'||process.env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'||process.env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1')throw Error('INTAKE_SYNC_DISABLED');
  const config=quibiWorkflowConfig(process.env,'write');if(config.mode!=='dev'||config.origin!=='https://dev.quibi.net')throw Error('INTAKE_SYNC_DISABLED');
  const actor=process.env.QUIBI_INTAKE_SYNC_ACTOR_ID;
  if(!actor||!uuid.test(actor))throw Error('INTAKE_SYNC_DISABLED');
  const {data:membership,error:membershipError}=await db.from('organization_memberships').select('role').eq('organization_id',org.id).eq('profile_id',actor).eq('is_active',true).single();
  if(membershipError||!membership||!['owner','admin'].includes(membership.role))throw Error('INTAKE_SYNC_DISABLED');
  const [{data:customer,error:ce},{data:vehicle,error:ve},{data:link,error:le},{data:vehicleLink,error:vle}]=await Promise.all([
   db.from('customers').select('display_name,phone,email').eq('organization_id',org.id).eq('id',request.customer_id).is('archived_at',null).single(),
   request.vehicle_id?db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',org.id).eq('customer_id',request.customer_id).eq('id',request.vehicle_id).is('archived_at',null).single():Promise.resolve({data:null,error:null}),
   db.from('integration_links').select('*').eq('organization_id',org.id).eq('entity_type','customer').eq('provider','quibi').eq('entity_id',request.customer_id).maybeSingle(),
   request.vehicle_id?db.from('quibi_vehicle_links').select('*').eq('organization_id',org.id).eq('vehicle_id',request.vehicle_id).maybeSingle():Promise.resolve({data:null,error:null})]);
  if(ce||ve||le||vle||!customer)throw Error('INTAKE_READ_FAILED');
  if(link&&(link.quibi_environment!=='dev'||link.sync_status!=='ok')||vehicleLink&&(vehicleLink.quibi_environment!=='dev'||vehicleLink.sync_status!=='ok'||vehicleLink.customer_id!==request.customer_id))throw Error('INTAKE_IDENTITY_REVIEW');
  const localCustomer={name:customer.display_name,phone:customer.phone??'',email:customer.email??''};
  const localVehicle=vehicle?{vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''}:null;
  if(link&&(link.local_fingerprint!==customerFingerprint(localCustomer)||link.external_fingerprint!==customerFingerprint(localCustomer))||vehicleLink&&localVehicle&&(vehicleLink.local_fingerprint!==vehicleFingerprint(localVehicle)||vehicleLink.external_fingerprint!==vehicleFingerprint(localVehicle)||vehicleLink.quibi_customer_id!==link?.external_id))throw Error('INTAKE_IDENTITY_REVIEW');
  const result=await synchronizeIntakeParties({caseId,customerId:request.customer_id,vehicleId:request.vehicle_id,customer:localCustomer,vehicle:localVehicle,read:createQuibiReadClient(config),write:configuredQuibiWorkflowWriteClient(),journal:quibiDevOperationJournal(org.id,actor),linkedCustomerId:link?.external_id??null,linkedVehicleId:vehicleLink?.quibi_vehicle_id??null,
   saveCustomer:async remote=>{
    if(link)return;
    const row={organization_id:org.id,provider:'quibi',entity_type:'customer',entity_id:request.customer_id,external_id:remote.id,quibi_environment:'dev',local_fingerprint:customerFingerprint(localCustomer),external_fingerprint:customerFingerprint(remote),confirmed_by:actor,sync_status:'ok',last_checked_at:new Date().toISOString()};
    const {error}=await db.from('integration_links').insert(row);
    if(error){const {data:existing,error:readError}=await db.from('integration_links').select('external_id,local_fingerprint,external_fingerprint,quibi_environment').eq('organization_id',org.id).eq('provider','quibi').eq('entity_type','customer').eq('entity_id',request.customer_id).single();if(readError||!existing||existing.external_id!==row.external_id||existing.local_fingerprint!==row.local_fingerprint||existing.external_fingerprint!==row.external_fingerprint||existing.quibi_environment!=='dev')throw Error('INTAKE_LINK_STORAGE_FAILED')}
   },saveVehicle:async remote=>{
    if(vehicleLink)return;
    const row={organization_id:org.id,customer_id:request.customer_id,vehicle_id:request.vehicle_id,quibi_customer_id:remote.customerId,quibi_vehicle_id:remote.id,quibi_environment:'dev',local_fingerprint:vehicleFingerprint(localVehicle!),external_fingerprint:vehicleFingerprint(remote),confirmed_by:actor,sync_status:'ok',last_checked_at:new Date().toISOString()};
    const {error}=await db.from('quibi_vehicle_links').insert(row);
    if(error){const {data:existing,error:readError}=await db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,local_fingerprint,external_fingerprint,quibi_environment').eq('organization_id',org.id).eq('vehicle_id',request.vehicle_id).single();if(readError||!existing||existing.quibi_vehicle_id!==row.quibi_vehicle_id||existing.quibi_customer_id!==row.quibi_customer_id||existing.local_fingerprint!==row.local_fingerprint||existing.external_fingerprint!==row.external_fingerprint||existing.quibi_environment!=='dev')throw Error('INTAKE_LINK_STORAGE_FAILED')}
   }});
  await status(result.vehicleId?null:'Stranka je povezana. Za povezavo vozila dopolnite VIN, registracijo, znamko in model.');return result;
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const review=/REVIEW|MISMATCH|CHANGED|REJECTED/.test(code);
  await status(code==='INTAKE_SYNC_DISABLED'?'Samodejna povezava še ni omogočena za strežniškega uporabnika.':review?'Identiteta ali zahtevek zahteva ročni pregled. Nov zapis ni dovoljen.':'Povezava še ni potrjena. Varna ponovna obdelava preveri obstoječi zahtevek; neznan CREATE se ne ponovi.');
  if(review||code==='INTAKE_SYNC_DISABLED')return;
 }
}

/** Called only after successful token-authorized completion, never from raw browser IDs. */
export function scheduleCompletedIntakeSynchronization(tokenHash:string){
 if(process.env.APP_ENV!=='preproduction'||process.env.QUIBI_MODE!=='dev'||process.env.VERCEL_ENV!=='preview'||!/^[a-f0-9]{64}$/.test(tokenHash))return;
 after(async()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!secret)return;
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from('service_request_completion_links').select('service_request_id').eq('token_hash',tokenHash).is('revoked_at',null).not('last_used_at','is',null).single();
 if(!error&&data)await processIntakeSynchronization(data.service_request_id);
 });
}
