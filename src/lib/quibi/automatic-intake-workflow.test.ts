import assert from 'node:assert/strict';
import {test} from 'node:test';
import {automaticCustomerMatch,automaticVehicleMatch,synchronizeIntakeParties} from './automatic-intake-workflow.ts';
import type {Operation,OperationJournal} from './write-workflow.ts';
const customer={name:'TEST AUTO',phone:'+386000000000',email:'test-auto@example.test'},vehicle={vin:'TESTAUTX20261011A',registration:'QA AUTO',make:'TEST',model:'AUTO'};
const ids={caseId:'00000000-0000-4000-8000-000000000001',customerId:'00000000-0000-4000-8000-000000000002',vehicleId:'00000000-0000-4000-8000-000000000003'};
function fixture(){
 const customers:Array<typeof customer&{id:string;remoteId?:string}>=[],vehicles:Array<typeof vehicle&{id:string;customerId:string;disabled:boolean}>=[],rows=new Map<string,Operation>();let writes=0;
 const journal:OperationJournal={get:async(k,id)=>rows.get(k+id)??null,insertOnce:async e=>{const key=e.kind+e.localEntityId;const row=rows.get(key)??{...e,id:key,state:'prepared' as const,quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null};rows.set(key,row);return row},claim:async(id,state)=>{const r=rows.get(id);if(!r||r.state!==state)return false;r.state='dispatching';return true},patch:async(id,state,p)=>{const r=rows.get(id)!;if(r.state!==state)throw Error('CONCURRENT');Object.assign(r,p);return r}};
 const read={customers:async()=>customers,customer:async(id:string)=>customers.find(c=>c.id===id)!,vehicles:async(id:string)=>vehicles.filter(v=>v.customerId===id),allVehicles:async()=>vehicles,vehicle:async(id:string)=>vehicles.find(v=>v.id===id)!};
 const write={createCustomer:async(body:{remote_id:string})=>{writes++;customers.push({...customer,id:'91',remoteId:body.remote_id})},createVehicle:async()=>{writes++;vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});return '92'}};
 const saved:string[]=[];
 const args={...ids,customer,vehicle,read,write,journal,linkedCustomerId:null,linkedVehicleId:null,saveCustomer:async(c:{id:string})=>{saved.push(c.id)},saveVehicle:async(v:{id:string})=>{saved.push(v.id)}};
 return {args,customers,vehicles,saved,count:()=>writes};
}
test('automatic intake creates both parties, rereads, persists IDs and never duplicates replay',async()=>{
 const f=fixture();assert.deepEqual(await synchronizeIntakeParties(f.args),{customerId:'91',vehicleId:'92'});assert.equal(f.count(),2);
 assert.deepEqual(await synchronizeIntakeParties(f.args),{customerId:'91',vehicleId:'92'});assert.equal(f.count(),2);assert.deepEqual(f.saved,['91','92','91','92']);
});
test('exact existing identities link with zero writes; partial and duplicate contacts require review',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});await synchronizeIntakeParties(f.args);assert.equal(f.count(),0);
 assert.throws(()=>automaticCustomerMatch(customer,[{...customer,id:'1',name:'Other'}]),/REVIEW/);
 assert.throws(()=>automaticCustomerMatch(customer,[{...customer,id:'1'},{...customer,id:'2'}]),/REVIEW/);
 assert.throws(()=>automaticVehicleMatch('91',vehicle,[{...vehicle,id:'1',customerId:'other',disabled:false}]),/REVIEW/);
});
test('timeout reconciles by READ and never repeats customer POST',async()=>{
 const f=fixture();let dispatches=0;f.args.write.createCustomer=async()=>{dispatches++;throw Error('TIMEOUT')};
 await assert.rejects(synchronizeIntakeParties(f.args),/UNCERTAIN/);await assert.rejects(synchronizeIntakeParties(f.args),/UNCERTAIN/);assert.equal(dispatches,1);assert.equal(f.vehicles.length,0);
});
test('missing vehicle data preserves linked customer without inventing vehicle',async()=>{
 const f=fixture();const result=await synchronizeIntakeParties({...f.args,vehicleId:null,vehicle:null});assert.deepEqual(result,{customerId:'91',vehicleId:null});assert.equal(f.count(),1);
});
test('storage failure after verified customer create recovers without another customer write',async()=>{
 const f=fixture();await assert.rejects(synchronizeIntakeParties({...f.args,saveCustomer:async()=>{throw Error('STORAGE_UNAVAILABLE')}}),/STORAGE_UNAVAILABLE/);assert.equal(f.count(),1);
 await synchronizeIntakeParties(f.args);assert.equal(f.count(),2);
 await synchronizeIntakeParties(f.args);assert.equal(f.count(),2);
});

test('partial vehicle is filled from a uniquely identified owned Quibi vehicle without CREATE',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});
 let enriched=false;const partial={...vehicle,make:'',model:'',vin:''};
 const result=await synchronizeIntakeParties({...f.args,vehicle:partial,enrichVehicle:async remote=>{enriched=true;Object.assign(partial,remote)}});
 assert.deepEqual(result,{customerId:'91',vehicleId:'92'});assert.equal(enriched,true);assert.equal(f.count(),0);assert.equal(partial.vin,vehicle.vin);
});
test('empty identifiers never select a vehicle and incomplete unmatched intake never creates one',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});
 const empty={vin:'',registration:'',make:'',model:''};assert.equal(automaticVehicleMatch('91',empty,f.vehicles),null);
 assert.deepEqual(await synchronizeIntakeParties({...f.args,vehicle:empty}),{customerId:'91',vehicleId:null});assert.equal(f.count(),0);
});
test('conflicting or ambiguous partial vehicles require review; failed enrichment never saves a link',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});
 assert.throws(()=>automaticVehicleMatch('91',{...vehicle,model:'OTHER'},f.vehicles),/REVIEW/);
 assert.throws(()=>automaticVehicleMatch('91',{...vehicle,model:''},[...f.vehicles,{...f.vehicles[0],id:'93'}]),/REVIEW/);
 await assert.rejects(synchronizeIntakeParties({...f.args,vehicle:{...vehicle,model:''},enrichVehicle:async()=>{throw Error('INTAKE_VEHICLE_CHANGED')}}),/CHANGED/);
 assert.deepEqual(f.saved,['91']);assert.equal(f.count(),0);
});

test('missing contact is recovered from fresh unique identity without a customer CREATE',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});
 const partial={...customer,phone:''};let enriched=false;
 await synchronizeIntakeParties({...f.args,customer:partial,enrichCustomer:async remote=>{enriched=true;Object.assign(partial,remote)}});
 assert.equal(enriched,true);assert.equal(partial.phone,customer.phone);assert.equal(f.count(),0);
});
test('name alone and conflicting supplied contacts are never automatic identity proof',()=>{
 const remote={...customer,id:'91'};
 assert.throws(()=>automaticCustomerMatch({...customer,phone:'',email:''},[remote]),/REVIEW/);
 assert.throws(()=>automaticCustomerMatch({...customer,phone:'OTHER'},[remote]),/REVIEW/);
});

test('registration formatting identifies the same owned vehicle but fresh data must be persisted before linking',async()=>{
 const f=fixture();f.customers.push({...customer,id:'91'});f.vehicles.push({...vehicle,id:'92',customerId:'91',disabled:false});
 const local={...vehicle,registration:'QA-AUTO'};let persisted=false;
 await synchronizeIntakeParties({...f.args,vehicle:local,enrichVehicle:async remote=>{persisted=true;local.registration=remote.registration}});
 assert.equal(persisted,true);assert.equal(local.registration,vehicle.registration);assert.equal(f.count(),0);
});
