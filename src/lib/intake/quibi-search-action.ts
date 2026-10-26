"use server";
import {requireManualIntakeAccess} from './access';
import {configuredQuibiReadClient,type createQuibiReadClient} from '@/lib/quibi/client';
import {hostedQuibiEnvironment} from '@/lib/quibi/deployment-policy';
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
