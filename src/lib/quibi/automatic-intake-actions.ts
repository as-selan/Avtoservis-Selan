"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {customerFingerprint} from './contracts';
import {hostedQuibiEnvironment} from './deployment-policy';
import {createClient as privileged} from '@supabase/supabase-js';
import {processIntakeSynchronization} from './automatic-intake-sync';
import {revalidatePath} from 'next/cache';
export async function retryIntakeSynchronization(caseId:string){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Povezavo lahko preveri skrbnik.'};
 const db=await createClient();
 const {data,error}=await db.from('service_requests').select('id').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single();
 if(error||!data)return {ok:false,message:'Servisni primer ni dostopen.'};
 const result=await processIntakeSynchronization(data.id);
 revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+data.id);
 if(result?.customerId&&result.vehicleId)return {ok:true,message:'Stranka in vozilo sta preverjeno povezana. Preglejte podatke primera in nadaljujte pripravo predračuna.'};
 if(result?.customerId)return {ok:false,message:'Stranka je povezana. Za vozilo dopolnite manjkajoče podatke istega primera; nov poslovni dokument ni ustvarjen.'};
 return {ok:false,message:'Povezava še ni potrjena. Preverite prikazani razlog in identiteto v tem primeru. Neznani zahtevki niso ponovno poslani.'};
}

/** The visible selection is the user's decision; fresh identity and org scope remain server-side. */
export async function chooseIntakeCustomer(caseId:string,remoteId:string,expected:string){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role)||!/^\d+$/.test(remoteId)||!/^[a-f0-9]{64}$/.test(expected))return {ok:false,message:'Izbira ni dovoljena.'};
 const db=await createClient(),environment=hostedQuibiEnvironment(process.env);
 const request=await db.from('service_requests').select('customer_id,vehicle_id,status,updated_at').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single();
 if(request.error||!request.data||!['new','needs_data','preparing_offer'].includes(request.data.status))return {ok:false,message:'Primer ni na voljo za povezovanje.'};
 const customer=await db.from('customers').select('display_name,phone,email,updated_at').eq('organization_id',access.organizationId).eq('id',request.data.customer_id).is('archived_at',null).single();
 if(customer.error||!customer.data)return {ok:false,message:'Stranka ni dostopna.'};
 const remote=await configuredQuibiReadClient().customer(remoteId);
 const norm=(s:string)=>s.trim().toLocaleLowerCase('sl-SI'),phone=(s:string)=>s.replace(/[^0-9]/g,'');
 const local={name:customer.data.display_name,phone:customer.data.phone??'',email:customer.data.email??''};
 if(customerFingerprint(remote)!==expected||!(norm(local.name)===norm(remote.name)||local.phone&&phone(local.phone)===phone(remote.phone)||local.email&&norm(local.email)===norm(remote.email)))return {ok:false,message:'Podatki so se spremenili. Izberite pravilen zapis iz trenutnega seznama.'};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return {ok:false,message:'Povezave trenutno ni mogoče shraniti.'};
 const store=privileged(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const row={organization_id:access.organizationId,entity_id:request.data.customer_id,entity_type:'customer',provider:'quibi',external_id:remoteId,local_fingerprint:customerFingerprint(local),external_fingerprint:customerFingerprint(remote),sync_status:'ok',quibi_environment:environment,confirmed_by:access.userId,last_checked_at:new Date().toISOString()};
 const saved=await store.from('integration_links').insert(row);
 if(saved.error){const occupied=await db.from('integration_links').select('entity_id,quibi_environment,sync_status,local_fingerprint,external_fingerprint').eq('organization_id',access.organizationId).eq('external_id',remoteId).eq('entity_type','customer').eq('provider','quibi').maybeSingle();
 if(occupied.data&&occupied.data.entity_id!==request.data.customer_id){
  const canonical=await db.from('customers').select('display_name,phone,email,updated_at').eq('organization_id',access.organizationId).eq('id',occupied.data.entity_id).is('archived_at',null).single();
  const vehicle=await db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('customer_id',request.data.customer_id).eq('id',request.data.vehicle_id).is('archived_at',null).single();
  if(canonical.error||vehicle.error||!canonical.data||!vehicle.data||occupied.data.quibi_environment!==environment||occupied.data.sync_status!=='ok'||occupied.data.external_fingerprint!==expected||occupied.data.local_fingerprint!==customerFingerprint({name:canonical.data.display_name,phone:canonical.data.phone??'',email:canonical.data.email??''}))return {ok:false,message:'Obstoječi zapis se je spremenil. Izberite pravilno stranko ali uporabite novo.'};
  const resolved=await store.rpc('resolve_case_vehicle',{p_case:caseId,p_actor:access.userId,p_action:'correct',p_revision:crypto.randomUUID(),p_expected:request.data.updated_at,p_fields:{vin:vehicle.data.vin,registration:vehicle.data.registration_current,make:vehicle.data.make,model:vehicle.data.model},p_remote:{kind:'customer',id:remoteId,localCustomerId:occupied.data.entity_id,fingerprint:expected,canonicalFingerprint:occupied.data.local_fingerprint,canonicalUpdatedAt:canonical.data.updated_at,sourceUpdatedAt:customer.data.updated_at}});
  if(resolved.error||!resolved.data?.ok)return {ok:false,message:'Obstoječe povezave ni varno zamenjati. Podatki in dokumenti so ohranjeni.'};
 }else {const current=await db.from('integration_links').select('external_id,local_fingerprint,external_fingerprint,quibi_environment,sync_status').eq('organization_id',access.organizationId).eq('entity_id',request.data.customer_id).eq('entity_type','customer').eq('provider','quibi').maybeSingle();if(current.error||current.data?.external_id!==remoteId||current.data.local_fingerprint!==row.local_fingerprint||current.data.external_fingerprint!==expected||current.data.quibi_environment!==environment||current.data.sync_status!=='ok')return {ok:false,message:'Stranka ima drugo povezavo. Podatki niso prepisani.'};}}
 await processIntakeSynchronization(caseId,0,'saved');
 revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);
 return {ok:true,message:'Stranka je povezana. Selan nadaljuje pripravo.'};
}

/** Explicit new-customer choice, using only the saved case data and existing CREATE journal. */
export async function selectNewIntakeCustomer(caseId:string){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Izbira ni dovoljena.'};
 const db=await createClient();
 const request=await db.from('service_requests').select('customer_id,vehicle_id,status,updated_at').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single();
 if(request.error||!request.data||!['new','needs_data','preparing_offer'].includes(request.data.status))return {ok:false,message:'Primer ni na voljo za povezovanje.'};
 const current=await db.from('integration_links').select('external_id').eq('organization_id',access.organizationId).eq('entity_id',request.data.customer_id).eq('entity_type','customer').eq('provider','quibi').maybeSingle();
 if(current.error)return {ok:false,message:'Povezave trenutno ni mogoče preveriti.'};
 const result=await processIntakeSynchronization(caseId,0,current.data?'saved':'distinct');
 revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);
 return result?.customerId&&result.vehicleId?{ok:true,message:'Stranka in vozilo sta povezana. Selan nadaljuje pripravo.'}:{ok:false,message:'Povpraševanje je shranjeno. Preverite prikazano stanje povezave.'};
}
