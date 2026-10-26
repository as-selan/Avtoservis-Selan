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
  const customer=await read.customer(id);
  if(customer.id!==id)throw Error('QUIBI_CUSTOMER_ID_MISMATCH');
  const list=await read.vehicles(id);
  return {customerId:'quibi:'+id,displayName:customer.name,phone:customer.phone||null,email:customer.email||null,vehicles:list.filter(v=>v.customerId===id&&!v.disabled).map(v=>({vehicleId:'quibi:'+v.id,make:v.make,model:v.model,registrationCurrent:v.registration,vin:v.vin,...(v.year!==undefined?{year:v.year}:{})}))};
 }));
}
export function mergeIntakeCandidates(local:IntakeCustomerCandidate[],remote:IntakeCustomerCandidate[]) {
 // Prefer persisted local identity, but retain additional vehicles for the same customer.
 const rows=local.map(c=>({...c,vehicles:c.vehicles.map(v=>({...v}))}));
 const contactMatch=(c:IntakeCustomerCandidate,r:IntakeCustomerCandidate)=>!c.quibiCustomerId&&intakeSearchKey(c.displayName)===intakeSearchKey(r.displayName)&&!!((c.phone&&r.phone&&intakeSearchKey(c.phone)===intakeSearchKey(r.phone))||(c.email&&r.email&&c.email.toLowerCase()===r.email.toLowerCase()));
 for(const candidate of remote){const linked=rows.find(c=>c.quibiCustomerId===candidate.customerId.replace(/^quibi:/,''));const possible=local.filter(c=>contactMatch(c,candidate));const unique=possible.length===1&&remote.filter(r=>contactMatch(possible[0],r)).length===1;const same=linked??(unique?rows.find(c=>c.customerId===possible[0].customerId):undefined);
  if(!same){rows.push(candidate);continue;}
  if(!same.phone&&candidate.phone)same.phone=candidate.phone;if(!same.email&&candidate.email)same.email=candidate.email;
  for(const vehicle of candidate.vehicles){const existing=same.vehicles.find(v=>!(v.vin&&vehicle.vin&&intakeSearchKey(v.vin)!==intakeSearchKey(vehicle.vin))&&(v.quibiVehicleId===vehicle.vehicleId.replace(/^quibi:/,'')||(v.vin&&vehicle.vin&&intakeSearchKey(v.vin)===intakeSearchKey(vehicle.vin))||(v.registrationCurrent&&vehicle.registrationCurrent&&intakeSearchKey(v.registrationCurrent)===intakeSearchKey(vehicle.registrationCurrent))));if(existing){for(const key of ['year','mileage','powerKw','engine','engineType','fuel','vin','make','model','registrationCurrent'] as const)if((existing[key]==null||existing[key]==='')&&vehicle[key]!=null&&vehicle[key]!=='')Object.assign(existing,{[key]:vehicle[key]});}else same.vehicles.push(vehicle);}
 }
 return rows;
}
