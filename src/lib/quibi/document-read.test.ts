import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadQuibiDocument} from './document-read.ts';
test('document detail must belong to selected kind and customer',async()=>{
 const doc={id:'42',customerId:'7',amount:'122',status:'Odprt',lines:[],contentSha256:'a'.repeat(64)};
 const client={workOrders:async()=>[{id:'42'}],invoices:async()=>[],estimates:async()=>[],documentDetail:async()=>doc};
 assert.equal((await loadQuibiDocument(client,'work_order','42','7')).id,'42');
 await assert.rejects(loadQuibiDocument(client,'invoice','42','7'),/NOT_LISTED/);
 await assert.rejects(loadQuibiDocument({...client,documentDetail:async()=>({...doc,customerId:'8'})},'work_order','42','7'),/CUSTOMER/);
});
test('work order linkage requires exact vehicle and unchanged displayed content',async()=>{
 const {verifyWorkOrderDocument}=await import('./document-read.ts');
 const doc={id:'42',customerId:'7',vehicleId:'9',amount:'122',status:'',lines:[],contentSha256:'a'.repeat(64)};
 assert.doesNotThrow(()=>verifyWorkOrderDocument(doc,'7','9','a'.repeat(64)));
 assert.throws(()=>verifyWorkOrderDocument({...doc,vehicleId:undefined},'7','9','a'.repeat(64)),/VEHICLE/);
 assert.throws(()=>verifyWorkOrderDocument(doc,'7','10','a'.repeat(64)),/VEHICLE/);
 assert.throws(()=>verifyWorkOrderDocument(doc,'7','9','b'.repeat(64)),/CONTENT/);
});
