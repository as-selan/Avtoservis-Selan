import {canConfirmQuibiVehicleCreate} from './vehicle-create-permission';
import {inspectionRepairServices} from '../inspections/checklist';
import {buildAutomaticEstimateDraft} from './automatic-estimate-draft';
import {isHostedQuibiEnvironment,caseWorkQuibiEnvironment} from './deployment-policy';
function isIntakeEnvironment(env:Record<string,string|undefined>){if(isHostedQuibiEnvironment(env))return true;try{return env.QUIBI_E2E_WRITE_ENABLED==='1'&&caseWorkQuibiEnvironment(env)==='dev'}catch{return false}}
import {requiresResolvedVehicleConfirmation} from './vehicle-identity';
import {savedIntakeCanResumeCreate,intakeSyncConfigurationProblem,INTAKE_ACTOR_ACCESS_PROBLEM} from './intake-sync-configuration';
import 'server-only';
import {revalidatePath} from 'next/cache';
import {currentIntakeCompleteness} from '../intake/completeness';
import {after} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {quibiWorkflowConfig} from './workflow-config';
import {createQuibiReadClient,configuredQuibiReadClient} from './client';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {quibiWorkflowJournal} from './write-journal';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {synchronizeIntakeParties} from './automatic-intake-workflow';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function scheduleIntakeSynchronization(caseId:string,mode:'read'|'saved'='read'){
 if(isIntakeEnvironment(process.env)&&uuid.test(caseId))after(async()=>{await processIntakeSynchronization(caseId,0,mode)});
}
export async function processIntakeSynchronization(caseId:string,restarts=0,mode:'read'|'saved'|'resume'|'distinct'='read'){
 if(!uuid.test(caseId)||!isIntakeEnvironment(process.env))return;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)return;
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:org,error:orgError}=await db.from('organizations').select('id').eq('slug','avtoservis-selan').single();
 if(orgError||!org)return;
 const {data:request,error}=await db.from('service_requests').select('id,customer_id,vehicle_id,attention_reason,status,source,channel,intake_request_id,missing_fields,created_at').eq('organization_id',org.id).eq('id',caseId).is('archived_at',null).single();
 if(error||!request?.customer_id)return;
 if(!['new','needs_data','preparing_offer'].includes(request.status))return;
 const actor=process.env.QUIBI_INTAKE_SYNC_ACTOR_ID; if(!actor||!uuid.test(actor))return;
 const claim=await db.rpc('automatic_offer_job',{p_case:caseId,p_actor:actor,p_action:'claim'});
 if(claim.error||!claim.data?.run)return;
 const run=claim.data.run;
 async function finish(state:string,draft:unknown=null){const saved=await db.rpc('automatic_offer_job',{p_case:caseId,p_actor:actor,p_action:'finish',p_run:run,p_state:state,p_draft:draft});if(saved.error)throw Error('AUTOMATIC_DRAFT_STORAGE_FAILED');revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);return saved.data?.saved===true;}
 async function status(message:string|null){
  // Do not clear or replace attention raised by other business steps.
  if(request!.attention_reason&&!request!.attention_reason.startsWith('Quibi povezava:'))return;
  const {error}=await db.from('service_requests').update({attention_needed:!!message,attention_reason:message?'Quibi povezava: '+message:null}).eq('organization_id',org!.id).eq('id',caseId).eq('customer_id',request!.customer_id);
  if(error)throw Error('INTAKE_STATUS_STORAGE_FAILED');
  revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);
 }
 for(let attempt=0;attempt<3;attempt++)try{
  const configurationProblem=intakeSyncConfigurationProblem(process.env,'read');if(configurationProblem)throw Error('INTAKE_CONFIG:'+configurationProblem);
  const config=quibiWorkflowConfig(process.env,'read');
  const journal=quibiWorkflowJournal(org.id,actor);
  const prior=mode==='resume'?await journal.get('customer',request.customer_id):null;
  const resumedChoice=!!prior&&prior.serviceRequestId===caseId&&['prepared','verified','uncertain'].includes(prior.state);

  const {data:membership,error:membershipError}=await db.from('organization_memberships').select('role').eq('organization_id',org.id).eq('profile_id',actor).eq('is_active',true).single();
  if(membershipError||!membership||!['owner','admin'].includes(membership.role))throw Error('INTAKE_CONFIG:'+INTAKE_ACTOR_ACCESS_PROBLEM);
  const [{data:customer,error:ce},{data:vehicle,error:ve},{data:link,error:le},{data:vehicleLink,error:vle}]=await Promise.all([
   db.from('customers').select('display_name,phone,email').eq('organization_id',org.id).eq('id',request.customer_id).is('archived_at',null).single(),
   request.vehicle_id?db.from('vehicles').select('vin,registration_current,make,model,year').eq('organization_id',org.id).eq('customer_id',request.customer_id).eq('id',request.vehicle_id).is('archived_at',null).single():Promise.resolve({data:null,error:null}),
   db.from('integration_links').select('*').eq('organization_id',org.id).eq('entity_type','customer').eq('provider','quibi').eq('entity_id',request.customer_id).maybeSingle(),
   request.vehicle_id?db.from('quibi_vehicle_links').select('*').eq('organization_id',org.id).eq('vehicle_id',request.vehicle_id).maybeSingle():Promise.resolve({data:null,error:null})]);
  if(ce||ve||le||vle||!customer)throw Error('INTAKE_READ_FAILED');
  const resolution=await db.from('case_vehicle_resolution_events').select('id,after_state').eq('organization_id',org.id).eq('case_id',caseId);
  if(resolution.error&&!['42P01','PGRST205'].includes(resolution.error.code))throw Error('INTAKE_READ_FAILED');
  const canonicalChoice=!!resolution.data?.some(e=>e.after_state?.remote?.kind==='customer'&&e.after_state?.customerId===request.customer_id&&e.after_state?.vehicleId===request.vehicle_id);
  const allowCreate=(mode==='saved'||mode==='distinct'||mode==='resume'&&(savedIntakeCanResumeCreate(request)||resumedChoice||canonicalChoice))&&!intakeSyncConfigurationProblem(process.env,'write');
  if(requiresResolvedVehicleConfirmation(!!resolution.data?.some(e=>e.after_state?.remote?.kind!=='customer'),vehicleLink?.sync_status))throw Error('INTAKE_RESOLUTION_REVIEW_REQUIRED');
  if(link&&(link.quibi_environment!==config.mode||link.sync_status!=='ok')||vehicleLink&&(vehicleLink.quibi_environment!==config.mode||vehicleLink.sync_status!=='ok'||vehicleLink.customer_id!==request.customer_id))throw Error('INTAKE_IDENTITY_REVIEW');
  const localCustomer={name:customer.display_name,phone:customer.phone??'',email:customer.email??''};
  const localVehicle=vehicle?{vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??'',...(vehicle.year?{year:vehicle.year}:{})}:null;
  if(link&&(link.local_fingerprint!==customerFingerprint(localCustomer))||vehicleLink&&localVehicle&&(vehicleLink.local_fingerprint!==vehicleFingerprint(localVehicle)||vehicleLink.quibi_customer_id!==link?.external_id))throw Error('INTAKE_IDENTITY_REVIEW');
  const result=await synchronizeIntakeParties({distinctCustomer:mode==='distinct'&&!link,allowCustomerCreate:allowCreate,customerExpectedFingerprint:link?.external_fingerprint,allowVehicleCreate:allowCreate&&canConfirmQuibiVehicleCreate(membership.role,process.env),caseId,customerId:request.customer_id,vehicleId:request.vehicle_id,customer:localCustomer,vehicle:localVehicle,read:createQuibiReadClient(config),write:{createCustomer:async body=>{if(!allowCreate)throw Error('INTAKE_CREATE_NOT_REQUESTED');return configuredQuibiWorkflowWriteClient().createCustomer(body)},createVehicle:async body=>{if(!allowCreate)throw Error('INTAKE_CREATE_NOT_REQUESTED');return configuredQuibiWorkflowWriteClient().createVehicle(body)}},journal,linkedCustomerId:link?.external_id??null,linkedVehicleId:vehicleLink?.quibi_vehicle_id??null,
   enrichCustomer:async remote=>{
    if(link)throw Error('INTAKE_IDENTITY_REVIEW');
    let update=db.from('customers').update({display_name:localCustomer.name||remote.name,phone:remote.phone||localCustomer.phone||null,email:remote.email||localCustomer.email||null}).eq('organization_id',org.id).eq('id',request.customer_id).is('archived_at',null);
    for(const key of ['display_name','phone','email'] as const)update=customer[key]===null?update.is(key,null):update.eq(key,customer[key]);
    const {data,error}=await update.select('id').single();
    if(error||!data)throw Error('INTAKE_CUSTOMER_CHANGED');
    Object.assign(localCustomer,{name:localCustomer.name||remote.name,phone:remote.phone||localCustomer.phone,email:remote.email||localCustomer.email});
   },enrichVehicle:async remote=>{
    if(!vehicle||!localVehicle||vehicleLink)throw Error('INTAKE_IDENTITY_REVIEW');
    // Compare the original row before filling blanks; a concurrent edit requires a new review.
    let update=db.from('vehicles').update({vin:localVehicle.vin||remote.vin,registration_current:remote.registration,make:localVehicle.make||remote.make,model:localVehicle.model||remote.model,year:vehicle.year??remote.year??null}).eq('organization_id',org.id).eq('customer_id',request.customer_id).eq('id',request.vehicle_id).is('archived_at',null);
    for(const key of ['vin','registration_current','make','model'] as const)update=vehicle[key]===null?update.is(key,null):update.eq(key,vehicle[key]);
    const {data,error}=await update.select('id').single();
    if(error||!data)throw Error('INTAKE_VEHICLE_CHANGED');
    Object.assign(localVehicle,{vin:localVehicle.vin||remote.vin,registration:remote.registration,make:localVehicle.make||remote.make,model:localVehicle.model||remote.model});
   },saveCustomer:async remote=>{
    if(link)return;
    const row={organization_id:org.id,provider:'quibi',entity_type:'customer',entity_id:request.customer_id,external_id:remote.id,quibi_environment:config.mode,local_fingerprint:customerFingerprint(localCustomer),external_fingerprint:customerFingerprint(remote),confirmed_by:actor,sync_status:'ok',last_checked_at:new Date().toISOString()};
    const {error}=await db.from('integration_links').insert(row);
    if(error){const {data:existing,error:readError}=await db.from('integration_links').select('external_id,local_fingerprint,external_fingerprint,quibi_environment').eq('organization_id',org.id).eq('provider','quibi').eq('entity_type','customer').eq('entity_id',request.customer_id).single();if(readError||!existing||existing.external_id!==row.external_id||existing.local_fingerprint!==row.local_fingerprint||existing.external_fingerprint!==row.external_fingerprint||existing.quibi_environment!==config.mode)throw Error('INTAKE_LINK_STORAGE_FAILED')}
   },saveVehicle:async remote=>{
    if(vehicleLink)return;
    const row={organization_id:org.id,customer_id:request.customer_id,vehicle_id:request.vehicle_id,quibi_customer_id:remote.customerId,quibi_vehicle_id:remote.id,quibi_environment:config.mode,local_fingerprint:vehicleFingerprint(localVehicle!),external_fingerprint:vehicleFingerprint(remote),confirmed_by:actor,sync_status:'ok',last_checked_at:new Date().toISOString()};
    const {error}=await db.from('quibi_vehicle_links').insert(row);
    if(error){const {data:existing,error:readError}=await db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,local_fingerprint,external_fingerprint,quibi_environment').eq('organization_id',org.id).eq('vehicle_id',request.vehicle_id).single();if(readError||!existing||existing.quibi_vehicle_id!==row.quibi_vehicle_id||existing.quibi_customer_id!==row.quibi_customer_id||existing.local_fingerprint!==row.local_fingerprint||existing.external_fingerprint!==row.external_fingerprint||existing.quibi_environment!==config.mode)throw Error('INTAKE_LINK_STORAGE_FAILED')}
   }});
  if(request.status==='needs_data'&&result.vehicleId&&localVehicle){
   const completeness=currentIntakeCompleteness({phone:localCustomer.phone,email:localCustomer.email,...localVehicle},{source:request.source,channel:request.channel,intakeRequestId:request.intake_request_id,identityConfirmed:!!result.customerId&&!!result.vehicleId},Array.isArray(request.missing_fields)?request.missing_fields:[]);
   if(completeness.status==='new'){
    // Filling data does not approve the intake: the existing owner/admin review is still required.
    const {error}=await db.from('service_requests').update(completeness).eq('organization_id',org.id).eq('id',caseId).eq('customer_id',request.customer_id).eq('vehicle_id',request.vehicle_id).eq('status','needs_data').is('archived_at',null);
    if(error)throw Error('INTAKE_COMPLETENESS_STORAGE_FAILED');
   }
  }
  await status(result.vehicleId?null:'Stranka je povezana. Za povezavo vozila dopolnite VIN, registracijo, znamko in model.');
  if(!result.vehicleId){await finish('needs_data');return result;}
  const inspected=await db.from('preliminary_inspections').select('findings').eq('organization_id',org.id).eq('service_request_id',caseId).eq('status','completed').maybeSingle();
  const wanted=[claim.data.input.wanted,...inspectionRepairServices(inspected.data?.findings).map(item=>item+' – potrebno popravilo')].filter(Boolean).join('\n');
  const preparation=await buildAutomaticEstimateDraft({wanted,description:claim.data.input.description,customerId:result.customerId,vehicleId:result.vehicleId,allowOrganizationHistory:true},configuredQuibiReadClient());
  const saved=await finish(preparation.state,preparation.draft);if(!saved&&restarts<1)return processIntakeSynchronization(caseId,restarts+1,mode);return result;
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const review=/REVIEW|MISMATCH|CHANGED|REJECTED/.test(code);
  await status(code.startsWith('INTAKE_CONFIG:')?code.slice('INTAKE_CONFIG:'.length):code==='INTAKE_CUSTOMER_CREATE_REQUIRED'?'Stranke še ni mogoče samodejno povezati. Izberite obstoječo stranko ali uporabite ustvarjanje nove stranke.':code==='INTAKE_VEHICLE_CREATE_APPROVAL_REVIEW_REQUIRED'?'Vozila v Quibiju ni mogoče potrditi. V tem primeru pripravite novo vozilo in pridobite izrecno potrditev lastnika. Samodejni CREATE ni dovoljen.':code==='INTAKE_RESOLUTION_REVIEW_REQUIRED'?'Po popravku povpraševanja izberite in potrdite pravo Quibi vozilo v tem primeru. Če ga ni, novo vozilo izrecno potrdi lastnik; samodejni CREATE je ustavljen.':review?'Identiteta ali zahtevek zahteva ročni pregled. Nov zapis ni dovoljen.':'Povezava še ni potrjena. Varna ponovna obdelava preveri obstoječi zahtevek; neznan CREATE se ne ponovi.');
  if(review||code.startsWith('INTAKE_CONFIG:')){const saved=await finish('blocked');if(!saved&&restarts<1)return processIntakeSynchronization(caseId,restarts+1,mode);return;}
  if(attempt===2)await finish('failed');
 }
}

/** Called only after successful token-authorized completion, never from raw browser IDs. */
export function scheduleCompletedIntakeSynchronization(tokenHash:string){
 if(!isIntakeEnvironment(process.env)||!/^[a-f0-9]{64}$/.test(tokenHash))return;
 after(async()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!secret)return;
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from('service_request_completion_links').select('service_request_id').eq('token_hash',tokenHash).is('revoked_at',null).not('last_used_at','is',null).single();
 if(!error&&data)await processIntakeSynchronization(data.service_request_id,0,'resume');
 });
}

/** Hosted web RPC intentionally returns no IDs. Resolve only the just-persisted server-authorized request. */
export function schedulePersistedWebIntakeSynchronization(clientRequestId:string){
 if(!isIntakeEnvironment(process.env)||!uuid.test(clientRequestId))return;
 after(async()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!secret)return;
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:org,error:orgError}=await db.from('organizations').select('id').eq('slug','avtoservis-selan').single();if(orgError||!org)return;
 const {data,error}=await db.from('service_requests').select('id').eq('organization_id',org.id).eq('source','web_form').eq('intake_request_id',clientRequestId).is('archived_at',null).single();
 if(!error&&data)await processIntakeSynchronization(data.id,0,'saved');
 });
}

export function schedulePendingIntakePreparations(){
 if(!isIntakeEnvironment(process.env))return;
 after(async()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!secret)return;
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const actor=process.env.QUIBI_INTAKE_SYNC_ACTOR_ID;if(!actor||!uuid.test(actor))return;
  const pending=await db.rpc('pending_automatic_offers',{p_actor:actor});
  if(!pending.error&&Array.isArray(pending.data))for(const id of pending.data)if(typeof id==='string')await processIntakeSynchronization(id,0,'resume');
 });
}
