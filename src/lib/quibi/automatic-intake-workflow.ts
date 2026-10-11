import {customerFingerprint,vehicleFingerprint,type QuibiCustomer,type QuibiVehicle} from './contracts.ts';
import {createOrReconcileCustomer,createOrReconcileVehicle,type CustomerCreateRead,type CustomerCreateWrite,type VehicleCreateRead,type VehicleCreateWrite} from './party-write-workflow.ts';
import type {OperationJournal} from './write-workflow.ts';
const norm=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('sl-SI');
export function automaticCustomerMatch(local:Pick<QuibiCustomer,'name'|'phone'|'email'>,rows:QuibiCustomer[]){
 const candidates=rows.filter(r=>norm(r.name)===norm(local.name)||!!local.phone&&norm(r.phone)===norm(local.phone)||!!local.email&&norm(r.email)===norm(local.email));
 if(!candidates.length)return null;
 if(candidates.length!==1||customerFingerprint(candidates[0])!==customerFingerprint(local))throw Error('INTAKE_IDENTITY_REVIEW');
 return candidates[0].id;
}
export function automaticVehicleMatch(customerId:string,local:Pick<QuibiVehicle,'vin'|'registration'|'make'|'model'>,rows:QuibiVehicle[]){
 const candidates=rows.filter(r=>norm(r.vin)===norm(local.vin)||r.registration.replace(/[^a-z0-9]/gi,'').toLowerCase()===local.registration.replace(/[^a-z0-9]/gi,'').toLowerCase());
 if(!candidates.length)return null;
 if(candidates.length!==1||candidates[0].disabled||candidates[0].customerId!==customerId||vehicleFingerprint(candidates[0])!==vehicleFingerprint(local))throw Error('INTAKE_IDENTITY_REVIEW');
 return candidates[0].id;
}
export async function synchronizeIntakeParties(args:{caseId:string;customerId:string;vehicleId:string|null;customer:Pick<QuibiCustomer,'name'|'phone'|'email'>;vehicle:Pick<QuibiVehicle,'vin'|'registration'|'make'|'model'>|null;read:CustomerCreateRead&VehicleCreateRead;write:CustomerCreateWrite&VehicleCreateWrite;journal:OperationJournal;linkedCustomerId:string|null;linkedVehicleId:string|null;saveCustomer:(remote:QuibiCustomer)=>Promise<void>;saveVehicle:(remote:QuibiVehicle)=>Promise<void>}){
 const {read,write,journal}=args;
 let customerId=args.linkedCustomerId;
 // An existing operation always goes through its immutable request and reconciliation.
 if(!customerId){
  const prior=await journal.get('customer',args.customerId);
  if(prior)customerId=(await createOrReconcileCustomer({read,write,journal,input:{serviceRequestId:args.caseId,customerId:args.customerId,...args.customer}})).quibiId;
  else customerId=automaticCustomerMatch(args.customer,await read.customers());
  if(!customerId)customerId=(await createOrReconcileCustomer({read,write,journal,input:{serviceRequestId:args.caseId,customerId:args.customerId,...args.customer}})).quibiId;
 }
 if(!customerId)throw Error('INTAKE_UNCERTAIN');
 const customer=await read.customer(customerId);
 if(customer.id!==customerId||customerFingerprint(customer)!==customerFingerprint(args.customer))throw Error('INTAKE_IDENTITY_REVIEW');
 await args.saveCustomer(customer);
 if(!args.vehicleId||!args.vehicle||!args.vehicle.vin||!args.vehicle.registration||!args.vehicle.make||!args.vehicle.model)return {customerId,vehicleId:null};
 let vehicleId=args.linkedVehicleId;
 const input={serviceRequestId:args.caseId,vehicleId:args.vehicleId,quibiCustomerId:customerId,...args.vehicle};
 if(!vehicleId){
  const prior=await journal.get('vehicle',args.vehicleId);
  if(prior)vehicleId=(await createOrReconcileVehicle({read,write,journal,input})).quibiId;
  else vehicleId=automaticVehicleMatch(customerId,args.vehicle,await read.vehicles(customerId));
  if(!vehicleId)vehicleId=(await createOrReconcileVehicle({read,write,journal,input})).quibiId;
 }
 if(!vehicleId)throw Error('INTAKE_UNCERTAIN');
 const vehicle=await read.vehicle(vehicleId,customerId);
 if(vehicle.id!==vehicleId||vehicle.disabled||vehicle.customerId!==customerId||vehicleFingerprint(vehicle)!==vehicleFingerprint(args.vehicle))throw Error('INTAKE_IDENTITY_REVIEW');
 await args.saveVehicle(vehicle);
 return {customerId,vehicleId};
}
