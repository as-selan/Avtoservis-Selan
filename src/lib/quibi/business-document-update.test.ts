
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {businessDocumentBody,businessUpdatePayload,updateBusinessDocument,type BusinessKind} from './business-document-workflow.ts';
import {withDocumentId} from './write-contract.ts';
import type {Operation,OperationJournal} from './write-workflow.ts';
const id='00000000-0000-4000-8000-000000000001';
function fixture(kind:BusinessKind='work_order'){
 const body=withDocumentId(businessDocumentBody(kind,id,{numberingId:'2',saleTypeId:'1',customerId:'7',vehicleId:'8',serviceRequestId:id,lines:[{opis:'Novo popravilo',enota_id:'1',ddv_id:'5',kolicina:1,cenaZDDV:122,popust:0}]},'2026-10-11'),'42');
 const baselineSha='a'.repeat(64),payload=businessUpdatePayload(body,baselineSha);
 let row:Operation|null=null,count=0;
 let doc={id:'42',customerId:'7',vehicleId:'8',number:'DOC-1',numberingId:'2',externalId:body.Glavadokumenta.external_id,amount:'122',status:'',contentSha256:baselineSha,lines:[{description:'Staro popravilo',quantity:'1',grossPrice:'100',unitId:'1',vatId:'5',discount:'0'}]};
 const journal:OperationJournal={get:async()=>row,insertOnce:async entry=>row?{...row}:(row={...entry,id:'op',state:'prepared',quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null}),claim:async(_,state)=>{if(row?.state!==state)return false;row={...row,state:'dispatching'};return true},patch:async(_,state,patch)=>{if(!row||row.state!==state)throw Error('CONCURRENT');row={...row,...patch};return {...row}}};
 const read={workOrders:async()=>[{id:'42'}],invoices:async()=>[{id:'42'}],estimates:async()=>[],documentDetail:async()=>({...doc})};
 const write={updateEstimate:async(target:string,value:typeof body)=>{count++;assert.equal(target,'42');assert.equal(value.Glavadokumenta.id,42);doc={...doc,contentSha256:'b'.repeat(64),lines:[{...doc.lines[0],description:'Novo popravilo',grossPrice:'122'}]};return {id:'42',number:'DOC-1'}}};
 return {args:{kind,orderId:id,caseId:id,documentId:'42',baselineSha,expectedSha:payload.sha256,expectedAmount:'122',body,journal,read,write},count:()=>count,state:()=>row?.state,change:(patch:Partial<typeof doc>)=>{doc={...doc,...patch}}};
}
for(const kind of ['work_order','invoice'] as const){
 test(kind+' UPDATE preserves ID and number; exact reread and repeated key dispatch once',async()=>{const f=fixture(kind);const op=await updateBusinessDocument(f.args);assert.equal(op.kind,kind+'_update');assert.equal(op.state,'verified');assert.equal(op.quibiId,'42');await updateBusinessDocument(f.args);assert.equal(f.count(),1)});
}
test('changed prepared SHA or missing ID cannot dispatch or clone',async()=>{const f=fixture();await assert.rejects(updateBusinessDocument({...f.args,expectedSha:'c'.repeat(64)}),/PAYLOAD/);await assert.rejects(updateBusinessDocument({...f.args,body:{...f.args.body,Glavadokumenta:{...f.args.body.Glavadokumenta,id:undefined}}}),/INVALID/);assert.equal(f.count(),0)});
test('fresh baseline, customer and vehicle are checked before UPDATE',async()=>{for(const patch of [{contentSha256:'c'.repeat(64)},{customerId:'9'},{vehicleId:'9'},{numberingId:'9'}]){const f=fixture();f.change(patch);await assert.rejects(updateBusinessDocument(f.args),/CHANGED|CUSTOMER/);assert.equal(f.count(),0)}});
test('timeout keeps target and UNKNOWN, retry performs no dispatch',async()=>{const f=fixture();f.args.write.updateEstimate=async()=>{throw Error('TIMEOUT')};await assert.rejects(updateBusinessDocument(f.args),/TIMEOUT/);assert.equal(f.state(),'uncertain');await assert.rejects(updateBusinessDocument(f.args),/REREAD|LINES_MISMATCH/);assert.equal(f.count(),0)});
test('a read can resolve timeout only when requested changed content is present',async()=>{const f=fixture();let sends=0;f.args.write.updateEstimate=async()=>{sends++;f.change({contentSha256:'b'.repeat(64),lines:[{description:'Novo popravilo',quantity:'1',grossPrice:'122',unitId:'1',vatId:'5',discount:'0'}]});throw Error('TIMEOUT')};await assert.rejects(updateBusinessDocument(f.args),/TIMEOUT/);const op=await updateBusinessDocument(f.args);assert.equal(op.state,'verified');assert.equal(sends,1)});
test('double click claims one request only',async()=>{const f=fixture();const results=await Promise.allSettled([updateBusinessDocument(f.args),updateBusinessDocument(f.args)]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.count(),1)});
test('unchanged reread is not evidence of a successful UPDATE',async()=>{const f=fixture();f.args.write.updateEstimate=async()=>({id:'42',number:'DOC-1'});await assert.rejects(updateBusinessDocument(f.args),/REREAD|LINES_MISMATCH/);assert.equal(f.state(),'uncertain')});
test('provider returning a different document cannot be accepted',async()=>{const f=fixture();f.args.write.updateEstimate=async()=>({id:'99',number:'DOC-1'});await assert.rejects(updateBusinessDocument(f.args),/REREAD|LINES_MISMATCH/);assert.equal(f.state(),'uncertain')});

test('already matching business lines do not justify a WRITE',async()=>{const f=fixture();f.change({lines:[{description:'Novo popravilo',quantity:'1',grossPrice:'122',unitId:'1',vatId:'5',discount:'0'}]});await assert.rejects(updateBusinessDocument(f.args),/NO_BUSINESS_CHANGES/);assert.equal(f.count(),0)});
