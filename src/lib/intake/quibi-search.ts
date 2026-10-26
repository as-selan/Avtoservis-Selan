import type {QuibiCustomer, QuibiVehicle} from '../quibi/contracts.ts';
import type {IntakeCustomerCandidate} from './types.ts';
export const intakeSearchKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
type Read={customers:()=>Promise<QuibiCustomer[]>;allVehicles:()=>Promise<Pick<QuibiVehicle,'id'|'registration'|'vin'>[]>;lookupVehicle:(id:string)=>Promise<QuibiVehicle>;customer:(id:string)=>Promise<QuibiCustomer>;vehicles:(id:string)=>Promise<QuibiVehicle[]>};
/** READ only; remote references are never passed as local UUIDs or proof of identity. */
export async function searchQuibiIntake(read:Read,query:string):Promise<IntakeCustomerCandidate[]> {
 const key=intakeSearchKey(query);if(key.length<3||query.length>100)return [];
 const [customers,vehicles]=await Promise.all([read.customers(),read.allVehicles()]);
 const matched=customers.filter(c=>[c.name,c.phone,c.email].some(value=>intakeSearchKey(value).includes(key))).slice(0,10);
 const vehicleMatches=vehicles.filter(v=>[v.registration,v.vin].some(value=>intakeSearchKey(value).includes(key))).slice(0,10);
 const resolved=await Promise.all(vehicleMatches.map(v=>read.lookupVehicle(v.id)));
 const ids=[...new Set([...matched.map(c=>c.id),...resolved.filter(v=>!v.disabled).map(v=>v.customerId)])].slice(0,15);
 return Promise.all(ids.map(async id=>{
  const customer=matched.find(c=>c.id===id)??await read.customer(id);
  if(customer.id!==id)throw Error('QUIBI_CUSTOMER_ID_MISMATCH');
  const list=await read.vehicles(id);
  return {customerId:'quibi:'+id,displayName:customer.name,phone:customer.phone||null,email:customer.email||null,vehicles:list.filter(v=>v.customerId===id&&!v.disabled).map(v=>({vehicleId:'quibi:'+v.id,make:v.make,model:v.model,registrationCurrent:v.registration,vin:v.vin}))};
 }));
}
export function mergeIntakeCandidates(local:IntakeCustomerCandidate[],remote:IntakeCustomerCandidate[]) {
 // Prefer persisted local identity, but retain additional vehicles for the same customer.
 const rows=local.map(c=>({...c,vehicles:[...c.vehicles]}));
 for(const candidate of remote){const same=rows.find(c=>intakeSearchKey(c.displayName)===intakeSearchKey(candidate.displayName)&&((c.phone&&candidate.phone&&intakeSearchKey(c.phone)===intakeSearchKey(candidate.phone))||(c.email&&candidate.email&&c.email.toLowerCase()===candidate.email.toLowerCase())));
  if(!same){rows.push(candidate);continue;}
  for(const vehicle of candidate.vehicles)if(!same.vehicles.some(v=>(v.vin&&vehicle.vin&&intakeSearchKey(v.vin)===intakeSearchKey(vehicle.vin))||(v.registrationCurrent&&vehicle.registrationCurrent&&intakeSearchKey(v.registrationCurrent)===intakeSearchKey(vehicle.registrationCurrent))))same.vehicles.push(vehicle);
 }
 return rows;
}
