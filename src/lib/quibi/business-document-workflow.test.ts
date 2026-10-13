import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertBusinessStage,businessDocumentBody,createBusinessDocument} from './business-document-workflow.ts';
import type {Operation,OperationJournal} from './write-workflow.ts';
const id='00000000-0000-4000-8000-000000000001';
const input={numberingId:'6483',saleTypeId:'1',customerId:'7',vehicleId:'8',serviceRequestId:id,lines:[{opis:'Servis',enota_id:'1',ddv_id:'1',kolicina:1,cenaZDDV:100,popust:0}]};
function fixture(){
 let row:Operation|null=null,dispatches=0;
 const body=businessDocumentBody('work_order',id,input);
 let doc={id:'42',customerId:'7',vehicleId:'8',number:'DN-1',numberingId:'6483',externalId:body.Glavadokumenta.external_id,amount:'122',status:'',contentSha256:'a'.repeat(64),lines:[{description:'Servis',quantity:'1',grossPrice:'100',unitNetPrice:'100',pricingVerified:true,unitId:'1',vatId:'1',discount:'0'}]};
 const journal:OperationJournal={get:async()=>row,insertOnce:async entry=>row??(row={...entry,id:'journal',state:'prepared',quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null}),claim:async(_,expected)=>{if(!row||row.state!==expected)return false;row={...row,state:'dispatching'};return true},patch:async(_,expected,patch)=>{if(!row||row.state!==expected)throw Error('CONCURRENT');return row={...row,...patch}}};
 const read={workOrders:async()=>[{id:'42'}],invoices:async()=>[],estimates:async()=>[],documentDetail:async()=>doc};
 const write={createEstimate:async()=>{dispatches++;return {id:'42',number:'DN-1'}}};
 return {args:{kind:'work_order' as const,orderId:id,caseId:id,expectedAmount:'122',body,journal,read,write},count:()=>dispatches,state:()=>row?.state,change:()=>{doc={...doc,vehicleId:'9'}}};
}
test('business kinds use separate stable external IDs; invoice needs actual service date',()=>{
 assert.notEqual(businessDocumentBody('work_order',id,input).Glavadokumenta.external_id,businessDocumentBody('invoice',id,input,'2026-10-11').Glavadokumenta.external_id);
 assert.throws(()=>businessDocumentBody('invoice',id,input),/DATE/);
 assert.throws(()=>businessDocumentBody('invoice',id,input,'2026-02-30'),/DATE/);
 assert.throws(()=>assertBusinessStage('invoice','in_progress'),/STAGE/);
 assert.throws(()=>assertBusinessStage('work_order','closed'),/STAGE/);
});
test('durable create, exact reread, double click and changed request never duplicate',async()=>{
 const f=fixture();const [first,second]=await Promise.allSettled([createBusinessDocument(f.args),createBusinessDocument(f.args)]);
 assert.ok([first,second].some(r=>r.status==='fulfilled'));assert.equal(f.count(),1);assert.equal(f.state(),'verified');
 await createBusinessDocument(f.args);assert.equal(f.count(),1);
 await assert.rejects(createBusinessDocument({...f.args,body:{...f.args.body,Postavkedokumenta:{'1':{...input.lines[0],cenaZDDV:101}}}}),/CHANGED/);
});
test('timeout remains unknown and does not POST on retry',async()=>{
 const f=fixture();f.args.write.createEstimate=async()=>{throw Error('TIMEOUT')};
 await assert.rejects(createBusinessDocument(f.args),/TIMEOUT/);assert.equal(f.state(),'uncertain');
 await assert.rejects(createBusinessDocument(f.args),/RECONCILIATION/);
});
test('wrong vehicle reread retains document ID and uncertain state',async()=>{
 const f=fixture();f.change();await assert.rejects(createBusinessDocument(f.args),/REREAD/);assert.equal(f.state(),'uncertain');
 await assert.rejects(createBusinessDocument(f.args),/REREAD/);assert.equal(f.count(),1);
});
import {confirmBusinessContent} from './business-document-workflow.ts';
test('reread rejects changed units, VAT, discount or amount',async()=>{
 const f=fixture();
 const doc={id:'42',customerId:'7',vehicleId:'8',number:'DN-1',numberingId:'6483',externalId:f.args.body.Glavadokumenta.external_id,amount:'122',status:'',contentSha256:'a'.repeat(64),lines:[{description:'Servis',quantity:'1',grossPrice:'100',unitNetPrice:'100',pricingVerified:true,unitId:'1',vatId:'1',discount:'0'}]};
 assert.throws(()=>confirmBusinessContent({...doc,lines:[{...doc.lines[0],vatId:'9'}]},f.args.body),/LINES/);
 assert.throws(()=>confirmBusinessContent({...doc,lines:[{...doc.lines[0],discount:'5'}]},f.args.body),/LINES/);
 await assert.rejects(createBusinessDocument({...f.args,expectedAmount:'123'}),/AMOUNT/);
 assert.equal(f.count(),1);assert.equal(f.state(),'uncertain');
});

test('definitive business CREATE rejection is failed, locked and never redispatched',async()=>{const f=fixture();let posts=0;f.args.write.createEstimate=async()=>{posts++;throw Error('QUIBI_API_REJECTED')};await assert.rejects(createBusinessDocument(f.args),/API_REJECTED/);assert.equal(f.state(),'failed');await assert.rejects(createBusinessDocument(f.args),/RECONCILIATION/);assert.equal(posts,1);});

test('PDF issuance is finalized before capturing business SHA; one CREATE only',async()=>{const f=fixture();let printed=false;const original=f.args.read.documentDetail;const read={...f.args.read,documentPdf:async()=>{printed=true},documentDetail:async()=>({...await original(),contentSha256:(printed?'b':'a').repeat(64)})};const op=await createBusinessDocument({...f.args,read});assert.equal(op.quibiContentSha256,'b'.repeat(64));assert.equal(f.count(),1);await createBusinessDocument({...f.args,read});assert.equal(f.count(),1)});
test('failed PDF keeps accepted document uncertain and never repeats CREATE',async()=>{const f=fixture();const read={...f.args.read,documentPdf:async()=>{throw Error('PDF_UNAVAILABLE')}};await assert.rejects(createBusinessDocument({...f.args,read}),/PDF_UNAVAILABLE/);assert.equal(f.state(),'uncertain');assert.equal(f.count(),1)});
