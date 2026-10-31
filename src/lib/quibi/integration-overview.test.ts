import assert from 'node:assert/strict';import test from 'node:test';import {readIntegrationOverview} from './integration-overview.ts';
 const customer={id:'405957',name:'TEST-SELAN-AI',phone:'',email:'test-selan-ai@example.test'};
 const vehicle={id:'2388',customerId:'405957',vin:'TESTSELANAX202601',registration:'QA SELAN AI',make:'TEST',model:'SELAN AI',disabled:false};
 function fixture(){return {customer:async()=>customer,vehicles:async()=>[vehicle],estimates:async()=>[],workOrders:async()=>[],invoices:async()=>[]};}
 test('overview uses actual reader results and successful empty documents are distinct from failure',async()=>{const r=fixture();r.invoices=async()=>{throw Error('UPSTREAM_FAILED')};const result=await readIntegrationOverview(r,'405957');assert.equal(result.customer.id,'405957');assert.equal(result.vehicles.status,'fulfilled');assert.deepEqual(result.estimates,{status:'fulfilled',value:[]});assert.equal(result.invoices.status,'rejected');});
 test('overview rejects invalid identity before reading and mixed customer results',async()=>{const r=fixture();let calls=0;r.customer=async()=>{calls++;return customer};await assert.rejects(readIntegrationOverview(r,'../405957'),/INVALID/);assert.equal(calls,0);await assert.rejects(readIntegrationOverview({...r,customer:async()=>({...customer,id:'999'})},'405957'),/MISMATCH/);r.vehicles=async()=>[{...vehicle,customerId:'999'}];assert.equal((await readIntegrationOverview(r,'405957')).vehicles.status,'rejected');});
 test('failed estimate listing does not block work orders or invoices; mixed document customer is rejected',async()=>{
  const doc={id:'123',customerId:'405957',numberingId:'2061',status:'Odprt',amount:'122'};
  const read={...fixture(),estimates:async()=>{throw Error('QUIBI_HTTP_500')},workOrders:async()=>[doc],invoices:async()=>[{...doc,customerId:'999'}]};
  const result=await readIntegrationOverview(read,'405957');
  assert.equal(result.estimates.status,'rejected');
  assert.deepEqual(result.workOrders,{status:'fulfilled',value:[doc]});
  assert.equal(result.invoices.status,'rejected');
 });
