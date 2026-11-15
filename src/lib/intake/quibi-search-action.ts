"use server";
import {searchManualIntakeCandidatesAction} from './actions';
import {mergeIntakeCandidates} from './quibi-search';
import {createClient} from '@/lib/supabase/server';
import {requireManualIntakeAccess} from './access';
import {configuredQuibiReadClient,type createQuibiReadClient} from '@/lib/quibi/client';
import {hostedQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {searchQuibiIntake} from './quibi-search';
import type {IntakeCustomerCandidate} from './types';
const cache=new Map<string,{until:number;read:ReturnType<typeof createQuibiReadClient>;customers:ReturnType<ReturnType<typeof createQuibiReadClient>['customers']>;vehicles:ReturnType<ReturnType<typeof createQuibiReadClient>['allVehicles']>}>();
export async function searchQuibiIntakeAction(query:string):Promise<{candidates:IntakeCustomerCandidate[];unavailable?:boolean}> {
 const gate=await requireManualIntakeAccess();if(!gate.ok||typeof query!=='string'||query.trim().length<3||query.length>100)return {candidates:[]};
 try{
  const environment=hostedQuibiEnvironment(process.env),key=gate.access.organizationId+':'+environment;
  let entry=cache.get(key);
  if(!entry||entry.until<Date.now()){const read=configuredQuibiReadClient();if(!('lookupVehicle' in read))return {candidates:[]};entry={until:Date.now()+300000,read,customers:read.customers(),vehicles:read.allVehicles()};cache.set(key,entry);if(cache.size>8)cache.delete(cache.keys().next().value!);}
  const {read,customers,vehicles}=entry;
  // Both promises are consumed together, including when either list is unavailable.
  await Promise.all([customers,vehicles]);
  if(!('lookupVehicle' in read))return {candidates:[]};
  const candidates=await searchQuibiIntake({...read,customers:()=>customers,allVehicles:()=>vehicles,lookupVehicle:read.lookupVehicle},query);
  return {candidates};
 }catch{cache.clear();return {candidates:[],unavailable:true};}
}

export async function searchIntakeAction(query:string){
 if(typeof query!=='string'||query.trim().length<3||query.length>100)return {ok:true as const,candidates:[] as IntakeCustomerCandidate[],unavailable:false};
 const gate=await requireManualIntakeAccess();if(!gate.ok)return {ok:false as const,candidates:[] as IntakeCustomerCandidate[],unavailable:true};
 const [local,remote]=await Promise.all([searchManualIntakeCandidatesAction(query),searchQuibiIntakeAction(query)]);
 if(!local.ok)return {ok:false as const,candidates:[] as IntakeCustomerCandidate[],unavailable:true};
 const db=await createClient();
 if(local.candidates.length){
  const links=await db.from('integration_links').select('entity_id,external_id').eq('organization_id',gate.access.organizationId).eq('provider','quibi').eq('entity_type','customer').eq('quibi_environment',process.env.QUIBI_MODE??'dev').in('entity_id',local.candidates.map(c=>c.customerId));
  for(const c of local.candidates)c.quibiCustomerId=links.data?.find(l=>l.entity_id===c.customerId)?.external_id;
 }
 const candidates=mergeIntakeCandidates(local.candidates,remote.candidates);
 return {ok:true as const,candidates,unavailable:remote.unavailable===true};
}

export async function searchDashboardAction(query:string){
 const result=await searchIntakeAction(query),caseIds:string[]=[];
 if(!result.ok||query.length>100||!/[0-9]{3}/.test(query))return {...result,caseIds};
 const gate=await requireManualIntakeAccess();if(!gate.ok||!['owner','admin'].includes(gate.access.role))return {...result,caseIds};
 try{
  const environment=hostedQuibiEnvironment(process.env),db=await createClient();
  const refs=await db.from(quibiJournalTable(environment)).select('service_request_id,quibi_id,request_body').eq('organization_id',gate.access.organizationId).eq('state','verified').in('kind',['estimate','work_order','invoice']);
  if(refs.error||!refs.data?.length)return {...result,caseIds};
  const read=configuredQuibiReadClient();if(!('historyDocuments' in read))return {...result,caseIds};const lists=await Promise.all((['work_order','estimate','invoice'] as const).map(kind=>read.historyDocuments(kind)));
  const key=query.toLowerCase().replace(/^quibi\s*#?\s*/,'').replace(/[^a-z0-9]/g,'');
  for(const doc of lists.flat().filter(d=>[d.id,d.number??''].some(v=>v.toLowerCase().replace(/[^a-z0-9]/g,'').includes(key)))){
   for(const ref of refs.data.filter(r=>r.quibi_id===doc.id&&r.service_request_id)){
    try{const payload=JSON.parse(ref.request_body),header=(payload.body??payload).Glavadokumenta;if(String(header.stranka_id)===doc.customerId&&(!doc.vehicleId||String(header.vozila_id)===doc.vehicleId))caseIds.push(ref.service_request_id!);}catch{/* Unverified reference never selects a case. */}
   }
  }
 }catch{/* Existing local matches and party discovery remain available. */}
 return {...result,caseIds:[...new Set(caseIds)]};
}
