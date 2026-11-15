import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';import test from 'node:test';import assert from 'node:assert/strict';
import {createBusinessFixture} from './quibi-business-fixture.mjs';
import {createQuibiReadClient} from '../../src/lib/quibi/client.ts';
import {createQuibiWorkflowWriteClient,QuibiValidationError} from '../../src/lib/quibi/write-http.ts';
import {customerRemoteId} from '../../src/lib/quibi/customer-remote-id.ts';
import {buildEstimateBody,withDocumentId} from '../../src/lib/quibi/write-contract.ts';
import {businessDocumentBody,confirmBusinessContent} from '../../src/lib/quibi/business-document-workflow.ts';
test('existing HTTP clients simulate customer, vehicle, estimate, work order and invoice without a live write',async()=>{
 const customers=[];const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))};const directory=mkdtempSync(join(tmpdir(),'selan-fixture-'));const stateFile=join(directory,'state.json');let business=createBusinessFixture(customers,send,stateFile);
 const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(await business(req,res,url))return;if(url.pathname==='/api2/stranka'){send(res,200,{error:false,data:{Stranke:customers.map(Stranka=>({Stranka}))}});return}const id=url.pathname.split('/').at(-1);send(res,200,{error:false,data:{Stranke:{Stranka:customers.find(c=>c.id===id)}}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const env={APP_ENV:'local',CI:'true',SELAN_ISOLATED_E2E:'1',QUIBI_E2E_WRITE_ENABLED:'1',QUIBI_E2E_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55421',PUBLIC_APP_ORIGIN:'http://127.0.0.1:3003',QUIBI_DEV_USERNAME:'selan-isolated-fixture',QUIBI_DEV_PASSWORD:'selan-isolated-fixture',QUIBI_DEV_WRITE_ENABLED:'0'};
  const write=createQuibiWorkflowWriteClient({username:env.QUIBI_DEV_USERNAME,password:env.QUIBI_DEV_PASSWORD,environment:env});const read=createQuibiReadClient({username:env.QUIBI_DEV_USERNAME,password:env.QUIBI_DEV_PASSWORD,origin});
  const customer={remote_id:customerRemoteId('11111111-1111-4111-8111-111111111111'),naziv:'TEST-SELAN-AI',emajl:'test-selan-ai@example.test'};
  await write.createCustomer(customer);await write.createCustomer(customer);assert.equal((await read.customers()).length,1);const c=(await read.customers())[0];assert.equal((await read.customer(c.id)).remoteId,customer.remote_id);
  const v=await write.createVehicle({stranka_id:c.id,registrskastevilka:'QA SELAN AI',internastevilka:'TESTSELANAI2026011',proizvajalec:'TEST',model:'QA AI'});assert.equal((await read.vehicle(v,c.id)).customerId,c.id);
  await write.updateVehicle(v,{internastevilka:'TESTSELANAI202601',registrskastevilka:'QA SELAN AI',proizvajalec:'TEST',model:'QA AI'});assert.equal((await read.vehicle(v,c.id)).vin,'TESTSELANAI202601');assert.equal((await read.vehicles(c.id)).length,1);assert.equal((await read.allVehicles()).length,1);assert.equal((await read.catalog('vat')).find(v=>v.id==='5').label,'22 %');
  await assert.rejects(write.updateVehicle(v,{internastevilka:'INVALID'}),error=>error instanceof QuibiValidationError&&error.message==='QUIBI_API_REJECTED');
  assert.equal((await read.vehicle(v,c.id)).vin,'TESTSELANAI202601');
  const input={serviceRequestId:'11111111-1111-4111-8111-111111111112',customerId:c.id,vehicleId:v,numberingId:'2061',saleTypeId:'1',lines:[{opis:'QA storitev',enota_id:'1',ddv_id:'5',kolicina:1,cenaZDDV:100,popust:0}]};
  const bodies=[buildEstimateBody(input),businessDocumentBody('work_order','11111111-1111-4111-8111-111111111113',{...input,numberingId:'6483'}),businessDocumentBody('invoice','11111111-1111-4111-8111-111111111113',{...input,numberingId:'2060'},'2026-10-11')];
  for(const body of bodies){const result=await write.createEstimate(body),again=await write.createEstimate(body);assert.equal(again.id,result.id);const doc=await read.documentDetail(result.id,c.id);confirmBusinessContent(doc,body);assert.equal(doc.amount,'122.00');assert.ok(doc.number.startsWith('QA-SIM-'));const pdf=await read.documentPdf(result.id);assert.equal(new TextDecoder().decode(pdf.slice(0,5)),'%PDF-');assert.match(new TextDecoder().decode(pdf),/QA-SIM/);await assert.rejects(write.createEstimate({...body,Postavkedokumenta:{0:{...body.Postavkedokumenta[0],cenaZDDV:123}}}),/HTTP_409/)}
  assert.equal((await read.estimates(c.id)).length,1);assert.equal((await read.workOrders(c.id)).length,1);assert.equal((await read.invoices(c.id)).length,1);
  const workOrder=(await read.workOrders(c.id))[0],before=await read.documentDetail(workOrder.id,c.id);const update=withDocumentId({...bodies[1],Postavkedokumenta:{...bodies[1].Postavkedokumenta,'2':{opis:'QA dodatno delo',enota_id:'1',ddv_id:'5',kolicina:1,cenaZDDV:10,popust:0}}},workOrder.id);
  assert.equal((await write.updateEstimate(workOrder.id,update)).id,workOrder.id);const after=await read.documentDetail(workOrder.id,c.id);assert.equal(after.number,before.number);assert.equal(after.amount,'134.20');assert.equal(after.lines.length,2);assert.equal(after.lines[0].description,'QA storitev');assert.equal(after.lines[1].description,'QA dodatno delo');
  business=createBusinessFixture(customers,send,stateFile);assert.equal((await read.vehicle(v,c.id)).vin,'TESTSELANAI202601');assert.equal((await read.invoices(c.id)).length,1);assert.equal((await write.createEstimate(bodies[0])).id,(await read.estimates(c.id))[0].id);
  await assert.rejects(write.sendDocument('4101','test-selan-ai@example.test'),/DISABLED/);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true})}
});
