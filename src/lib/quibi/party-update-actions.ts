"use server";
import {headers} from 'next/headers';
import {assertLocalPartyWriteRequest} from './local-write-policy';
import {revalidatePath} from 'next/cache';
import {createClient as privileged} from '@supabase/supabase-js';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {quibiLinkEnvironment} from './workflow-config';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {updatePartyAndVerify} from './party-update-workflow';
export async function updateLinkedQuibiParty(form:FormData):Promise<{ok:boolean;message:string}>{
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Spremembo lahko potrdi skrbnik.'};
 const customerId=String(form.get('customerId')??''),vehicleId=String(form.get('vehicleId')??''),revisionId=String(form.get('revisionId')??''),baseline=String(form.get('baseline')??'');
 if(!/^[a-f0-9-]{36}$/i.test(customerId)||!(/^[a-f0-9-]{36}$/i.test(revisionId))||form.get('confirmed')!=='yes'||(vehicleId&&!/^[a-f0-9-]{36}$/i.test(vehicleId)))return {ok:false,message:'Potrdite pregled prikazanih lokalnih in Quibi podatkov.'};
 try{
  assertLocalPartyWriteRequest(process.env,await headers());
  const write=configuredQuibiWorkflowWriteClient(),read=configuredQuibiReadClient(),db=await createClient(),environment=quibiLinkEnvironment(process.env);
  let caseQuery=db.from('service_requests').select('id').eq('organization_id',access.organizationId).eq('customer_id',customerId).is('archived_at',null);if(vehicleId)caseQuery=caseQuery.eq('vehicle_id',vehicleId);
  const [{data:customer,error:ce},{data:link,error:le},{data:serviceCase,error:se}]=await Promise.all([
   db.from('customers').select('display_name,phone,email').eq('organization_id',access.organizationId).eq('id',customerId).is('archived_at',null).single(),
   db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_id',customerId).eq('entity_type','customer').eq('provider','quibi').single(),
   caseQuery.order('created_at',{ascending:true}).limit(1).single()
  ]);
  if(ce||le||se||!customer||!link||!serviceCase||link.quibi_environment!==environment||serviceCase.id==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('IDENTITY_UNVERIFIED');
  const journal=quibiWorkflowJournal(access.organizationId,access.userId);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('LINK_STORAGE_UNAVAILABLE');
  const store=privileged(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  async function rejectUnresolvedRevision(kind:'customer_update'|'vehicle_update',quibiId:string){
   const {data:pending,error}=await db.from(environment==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal').select('local_entity_id,request_body').eq('organization_id',access.organizationId).eq('kind',kind).in('state',['dispatching','uncertain']);
   if(error||pending?.some(row=>{try{return row.local_entity_id!==revisionId&&(JSON.parse(row.request_body) as {quibiId?:string}).quibiId===quibiId}catch{return true}}))throw Error('UNRESOLVED_PARTY_UPDATE');
  }
  if(!vehicleId){
   await rejectUnresolvedRevision('customer_update',link.external_id);
   const body={naziv:customer.display_name,emajl:customer.email??'',telst:customer.phone??''};
   if(!body.naziv.trim()||(!body.emajl.trim()&&!body.telst.trim()))throw Error('CONTACT_REQUIRED');
   await updatePartyAndVerify({kind:'customer_update',revisionId,caseId:serviceCase.id,quibiId:link.external_id,baseline,target:customerFingerprint({name:body.naziv,email:body.emajl,phone:body.telst}),body,journal,readFingerprint:async()=>customerFingerprint(await read.customer(link.external_id)),write:()=>write.updateCustomer(link.external_id,body)});
   const target=customerFingerprint({name:body.naziv,email:body.emajl,phone:body.telst});
   const {data:freshLocal,error:freshError}=await db.from('customers').select('display_name,email,phone').eq('organization_id',access.organizationId).eq('id',customerId).single();
   if(freshError||!freshLocal||customerFingerprint({name:freshLocal.display_name,email:freshLocal.email??'',phone:freshLocal.phone??''})!==target)throw Error('LOCAL_CHANGED');
   const {error:linkError}=await store.from('integration_links').update({local_fingerprint:target,external_fingerprint:target,last_seen_fingerprint:target,sync_status:'ok',last_error_code:null,last_checked_at:new Date().toISOString(),confirmed_at:new Date().toISOString(),confirmed_by:access.userId}).eq('organization_id',access.organizationId).eq('entity_id',customerId).eq('entity_type','customer').eq('provider','quibi').eq('external_id',link.external_id).eq('quibi_environment',environment).eq('external_fingerprint',link.external_fingerprint).select('id').single();if(linkError)throw Error('LINK_UPDATE_FAILED');
  }else{
   const [{data:vehicle,error:ve},{data:vl,error:vle}]=await Promise.all([db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('customer_id',customerId).eq('id',vehicleId).is('archived_at',null).single(),db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('customer_id',customerId).eq('vehicle_id',vehicleId).single()]);
   if(ve||vle||!vehicle||!vl||vl.quibi_environment!==environment||vl.quibi_customer_id!==link.external_id||!vehicle.vin?.trim()||!vehicle.registration_current?.trim()||customerFingerprint(await read.customer(link.external_id))!==link.external_fingerprint)throw Error('IDENTITY_UNVERIFIED');
   await rejectUnresolvedRevision('vehicle_update',vl.quibi_vehicle_id);
   const body={registrskastevilka:vehicle.registration_current,internastevilka:vehicle.vin,proizvajalec:vehicle.make??'',model:vehicle.model??''};
   await updatePartyAndVerify({kind:'vehicle_update',revisionId,caseId:serviceCase.id,quibiId:vl.quibi_vehicle_id,baseline,target:vehicleFingerprint({vin:body.internastevilka,registration:body.registrskastevilka,make:body.proizvajalec,model:body.model}),body,journal,readFingerprint:async()=>{const remote=await read.vehicle(vl.quibi_vehicle_id,link.external_id);if(remote.disabled)throw Error('VEHICLE_DISABLED');return vehicleFingerprint(remote)},write:()=>write.updateVehicle(vl.quibi_vehicle_id,body)});
   const target=vehicleFingerprint({vin:body.internastevilka,registration:body.registrskastevilka,make:body.proizvajalec,model:body.model});
   const {data:freshLocal,error:freshError}=await db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',vehicleId).eq('customer_id',customerId).single();
   if(freshError||!freshLocal||vehicleFingerprint({vin:freshLocal.vin??'',registration:freshLocal.registration_current??'',make:freshLocal.make??'',model:freshLocal.model??''})!==target)throw Error('LOCAL_CHANGED');
   const {error:linkError}=await store.from('quibi_vehicle_links').update({local_fingerprint:target,external_fingerprint:target,last_seen_fingerprint:target,sync_status:'ok',last_error_code:null,last_checked_at:new Date().toISOString(),confirmed_at:new Date().toISOString(),confirmed_by:access.userId}).eq('organization_id',access.organizationId).eq('vehicle_id',vehicleId).eq('customer_id',customerId).eq('quibi_vehicle_id',vl.quibi_vehicle_id).eq('quibi_environment',environment).eq('external_fingerprint',vl.external_fingerprint).select('vehicle_id').single();if(linkError)throw Error('LINK_UPDATE_FAILED');
  }
  revalidatePath(`/dashboard/stranke/${customerId}/quibi`);
  return {ok:true,message:'Sprememba je ponovno prebrana; povezava je potrjena za nove podatke. Prejšnji in novi podatkovni prstni odtis ostajata v dnevniku operacije.'};
 }catch{return {ok:false,message:'Sprememba ni potrjena. WRITE mora biti posebej dovoljen; podatki se od pregleda ne smejo spremeniti. Ob neznanem izidu ne pošiljajte nove zahteve.'}}
}
