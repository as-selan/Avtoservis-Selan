import {isIntakeFuelDb} from './fuel.ts';
import type {IntakeCustomerCandidate} from './types.ts';
const key = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
export function intakeVehicleSelection(customer: IntakeCustomerCandidate, query: string) {
 const exact = customer.vehicles.filter(v => key(query) && [v.registrationCurrent, v.vin].some(value => value && key(value) === key(query)));
 return exact.length === 1 ? exact[0] : customer.vehicles.length === 1 ? customer.vehicles[0] : null;
}

export function automaticIntakeSelection(candidates:IntakeCustomerCandidate[],query:string){
 const exact=candidates.flatMap(customer=>customer.vehicles.filter(v=>key(query)&&[v.registrationCurrent,v.vin].some(value=>value&&key(value)===key(query))).map(vehicle=>({customer,vehicle})));
 if(exact.length===1)return exact[0];
 if(candidates.length!==1)return null;
 const customer=candidates[0],vehicle=intakeVehicleSelection(customer,query);
 return vehicle?{customer,vehicle}:customer.vehicles.length===0?{customer,vehicle:null}:null;
}
export function intakeAutofill(customer:IntakeCustomerCandidate,vehicle:IntakeCustomerCandidate['vehicles'][number]|null){
 const fuel=({petrol:'bencin',diesel:'dizel',hybrid:'hibrid',electric:'elektrika',lpg:'plin'} as Record<string,string>)[vehicle?.fuel??'']??(vehicle?.fuel&&isIntakeFuelDb(vehicle.fuel)?vehicle.fuel:'');
 const number=(v:number|null|undefined)=>v==null?'':String(v);
 return {fullName:customer.displayName,phone:customer.phone??'',email:customer.email??'',make:vehicle?.make??'',model:vehicle?.model??'',registration:vehicle?.registrationCurrent??'',vin:vehicle?.vin??'',year:number(vehicle?.year),mileage:number(vehicle?.mileage),powerKw:number(vehicle?.powerKw),engineDisplacement:vehicle?.engine??'',engineCode:vehicle?.engineType??'',fuel};
}
export function preserveEditedFields<T extends object>(current:T,values:Partial<T>,edited:Set<keyof T>):T {
 return {...current,...Object.fromEntries(Object.entries(values).filter(([key])=>!edited.has(key as keyof T)))};
}
