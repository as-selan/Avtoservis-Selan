import assert from "node:assert/strict";
import { test } from "node:test";
import * as w from "./unified-workflow.ts";
import type { Operation, OperationJournal } from "./write-workflow.ts";
const caseId="9d40c42f-b6a8-473b-983f-f9620df97d10",quoteId="ab9f75b2-e6f3-45c7-82de-e36c82faab7b";
const dev={APP_ENV:"preproduction",QUIBI_MODE:"dev",VERCEL_ENV:"preview",QUIBI_DEV_WRITE_ENABLED:"1",QUIBI_DEV_USERNAME:"fixture",QUIBI_DEV_PASSWORD:"fixture",QUIBI_DEV_TEST_RECIPIENT:"qa@fixture.mail"};
const production={APP_ENV:"production",QUIBI_MODE:"production",VERCEL_ENV:"production",QUIBI_PRODUCTION_READ_ENABLED:"1",QUIBI_PRODUCTION_WRITE_ENABLED:"1",QUIBI_PRODUCTION_SEND_ENABLED:"1",QUIBI_PRODUCTION_USERNAME:"fixture-production",QUIBI_PRODUCTION_PASSWORD:"fixture-production"};
function fixture(reviewStatus="unreviewed") {
 const events:string[]=[];let op:Operation|null=null;
 let snapshot:w.SendSnapshot={actorId:caseId,organizationId:quoteId,role:"owner",caseId,quoteId,latestQuoteId:quoteId,caseStatus:"preparing_offer",reviewStatus,
   customerId:"405956",vehicleId:"2387",documentId:"2176888",serviceWanted:"QA service",customerEmail:"customer@fixture.mail",remoteEmail:"customer@fixture.mail",sha256:"a".repeat(64),
   detail:{id:"2176888",customerId:"405956",vehicleId:"2387",externalId:"selan-service-request:"+caseId,amount:"122.00",contentSha256:"a".repeat(64),lines:[{description:"QA service",quantity:"1",grossPrice:"122"}]} };
 const journal:OperationJournal={async get(){return op},async insertOnce(n){return op??=( {...n,id:quoteId,state:"prepared",quibiId:null,quibiContentSha256:null,documentNumber:null,sendId:null,sendStatus:null})},async claim(id,state){if(op?.id!==id||op.state!==state)return false;op={...op,state:"dispatching"};return true},async patch(id,state,change){assert.equal(op?.state,state);return op={...op!,...change}}};
 return {events,journal,authorize:async()=>{events.push("verify");return snapshot},approve:async()=>{events.push("approve");snapshot={...snapshot,reviewStatus:"approved_for_send"}},
   write:{sendDocument:async(id:string,email:string)=>{events.push("send:"+email);return {sendId:"fixture-send",status:"queued" as const}},getSendStatus:async()=>({status:"sent" as "sent"|"queued"|"failed"})},
   recordAcceptance:async()=>{events.push("acceptance")},set:(change:Partial<typeof snapshot>)=>{snapshot={...snapshot,...change}},state:()=>op };
}
function send(f:ReturnType<typeof fixture>,env:Record<string,string|undefined>=dev,extra:Record<string,unknown>={}) {
 assert.equal(typeof w.approveAndSendEstimate,"function");
 return w.approveAndSendEstimate({...f,environment:env,caseId,quoteId,reviewConfirmed:true,displayedSha256:"a".repeat(64),displayedAmount:"122",manualReference:"QA verified vehicle and service",...extra});
}
test("one click approves and queues; DEV sends exclusively to test mailbox",async()=>{const f=fixture();const op=await send(f);assert.equal(op.sendStatus,"queued");assert.equal(f.events.filter(x=>x==="approve").length,1);assert.ok(f.events.includes("send:"+dev.QUIBI_DEV_TEST_RECIPIENT));assert.equal(f.events.includes("acceptance"),false)});
test("already approved quote sends without approving again",async()=>{const f=fixture("approved_for_send");await send(f);assert.equal(f.events.includes("approve"),false)});
test("production dispatch uses verified actual address and independently enabled config",async()=>{const f=fixture();await send(f,production);assert.ok(f.events.includes("send:customer@fixture.mail"))});
test("wrong environments and missing production opt-ins reject before authorize",async()=>{for(const env of [{...dev,VERCEL_ENV:"production"},{...dev,QUIBI_MODE:"production"},{...production,QUIBI_PRODUCTION_SEND_ENABLED:"0"},{...production,QUIBI_PRODUCTION_WRITE_ENABLED:"0"},{...production,VERCEL_ENV:"preview"}]){const f=fixture();await assert.rejects(send(f,env),/QUIBI_WORKFLOW_DISABLED/);assert.equal(f.events.length,0)}});
test("unreviewed body cannot be changed between displayed review and dispatch",async()=>{for(const extra of [{displayedSha256:"b".repeat(64)},{displayedAmount:"123"},{reviewConfirmed:false}]){const f=fixture();await assert.rejects(send(f,dev,extra));assert.equal(f.events.includes("approve"),false)}});
test("customer, vehicle, amount and stale quote are rejected",async()=>{for(const change of [{remoteEmail:"other@fixture.mail"},{latestQuoteId:caseId},{role:"reception"},{reviewStatus:"rejected_for_revision"},{customerEmail:"x@example.test"}]){const f=fixture();f.set(change);await assert.rejects(send(f));assert.equal(f.events.some(x=>x.startsWith("send:")),false)}});
test("concurrent clicks dispatch once; same quote retry never sends again",async()=>{const f=fixture("approved_for_send");await Promise.allSettled([send(f),send(f)]);assert.equal(f.events.filter(x=>x.startsWith("send:")).length,1);await assert.rejects(send(f),/QUIBI_SEND_ALREADY_ATTEMPTED/)});
test("timeout blocks retry with no duplicate dispatch",async()=>{const f=fixture();f.write.sendDocument=async()=>{f.events.push("send:timeout");throw Error("TIMEOUT")};await assert.rejects(send(f),/TIMEOUT/);assert.equal(f.state()?.state,"uncertain");await assert.rejects(send(f),/QUIBI_SEND_ALREADY_ATTEMPTED/);assert.equal(f.events.filter(x=>x.startsWith("send:")).length,1)});
test("status-only polling records production acceptance without claiming receipt",async()=>{const f=fixture();await send(f,production);assert.equal(typeof w.pollEstimateSend,"function");const op=await w.pollEstimateSend({...f,environment:production,quoteId,caseId});assert.equal(op.sendStatus,"sent");assert.ok(f.events.includes("acceptance"));assert.equal(f.events.filter(x=>x.startsWith("send:")).length,1)});
test("DEV status sent never creates production delivery evidence",async()=>{const f=fixture();await send(f);await w.pollEstimateSend({...f,environment:dev,caseId,quoteId});assert.equal(f.events.includes("acceptance"),false)});

test("document mismatch and missing identity require strict persisted manual proof",async()=>{
 for(const change of [{id:"99"},{customerId:"99"},{vehicleId:"99"},{contentSha256:"b".repeat(64)},{amount:"999999999999999999999999999999999999999999"},{lines:[]}]){
 const f=fixture(),current=await f.authorize();f.set({detail:{...current.detail,...change}});await assert.rejects(send(f));assert.equal(f.events.includes("approve"),false);
 }
 const f=fixture(),current=await f.authorize();f.set({detail:{...current.detail,vehicleId:undefined,externalId:undefined}});
 await assert.rejects(send(f,dev,{manualReference:""}),/QUIBI_MANUAL_IDENTITY_PROOF_REQUIRED/);
 const op=await send(f);const body=JSON.parse(op.requestBody);assert.equal(body.vehicleId,"2387");assert.ok(body.confirmation.reference.length>=12);assert.ok(body.confirmation.actorId);
});
test("fresh final check blocks changed email after approval and before external dispatch",async()=>{
 const f=fixture(),authorize=f.authorize;let checks=0;f.authorize=async()=>{const s=await authorize();return ++checks===3?{...s,remoteEmail:"changed@fixture.mail"}:s};
 await assert.rejects(send(f),/QUIBI_APPROVAL_CHANGED/);assert.equal(f.state()?.state,"failed");assert.equal(f.events.some(e=>e.startsWith("send:")),false);
});
test("failed status never becomes customer acceptance and cannot retry",async()=>{
 const f=fixture();await send(f,production);f.write.getSendStatus=async()=>({status:"failed"});
 assert.equal((await w.pollEstimateSend({...f,environment:production,caseId,quoteId})).sendStatus,"failed");assert.equal(f.events.includes("acceptance"),false);
 await assert.rejects(send(f,production),/QUIBI_SEND_ALREADY_ATTEMPTED/);
});
test("local acceptance failure reconciles without sending twice",async()=>{
 const f=fixture();await send(f,production);let records=0;f.recordAcceptance=async()=>{if(++records===1)throw Error("LOCAL_STORAGE_UNAVAILABLE");f.events.push("acceptance")};
 await assert.rejects(w.pollEstimateSend({...f,environment:production,caseId,quoteId}),/LOCAL_STORAGE_UNAVAILABLE/);
 assert.equal(f.state()?.sendStatus,"sent");await w.pollEstimateSend({...f,environment:production,caseId,quoteId});
 assert.ok(f.events.includes("acceptance"));assert.equal(f.events.filter(e=>e.startsWith("send:")).length,1);
});

test("case #9D40C42F synthetic DEV customer: document 2176888, approved 122 EUR, test mailbox only",async()=>{
 const f=fixture("approved_for_send");f.set({customerEmail:"qa@example.test",remoteEmail:"qa@example.test"});
 const op=await send(f);const body=JSON.parse(op.requestBody);
 assert.equal(body.caseId,caseId);assert.equal(body.documentId,"2176888");assert.equal(body.customerId,"405956");assert.equal(body.vehicleId,"2387");assert.equal(body.amount,122);
 assert.equal(body.customerEmail,"qa@example.test");assert.equal(body.recipient,dev.QUIBI_DEV_TEST_RECIPIENT);
 assert.equal(f.events.includes("approve"),false);assert.equal(f.events.includes("send:qa@example.test"),false);
 await w.pollEstimateSend({...f,environment:dev,caseId,quoteId});assert.equal(f.events.includes("acceptance"),false);
 await assert.rejects(send(f),/QUIBI_SEND_ALREADY_ATTEMPTED/);assert.equal(f.events.filter(e=>e.startsWith("send:")).length,1);
});
test("synthetic email does not bypass DEV remote identity or document mismatch",async()=>{
 for(const change of [{remoteEmail:"other@example.test"},{customerId:"99"},{vehicleId:"99"}]){
  const f=fixture();f.set({customerEmail:"qa@example.test",remoteEmail:"qa@example.test",...change});await assert.rejects(send(f));assert.equal(f.events.some(e=>e.startsWith("send:")),false);
 }
});
test("production synthetic matching customer email remains rejected before approval or dispatch",async()=>{
 const f=fixture();f.set({customerEmail:"qa@example.test",remoteEmail:"qa@example.test"});await assert.rejects(send(f,production),/QUIBI_CUSTOMER_EMAIL_UNVERIFIED/);
 assert.equal(f.events.includes("approve"),false);assert.equal(f.events.some(e=>e.startsWith("send:")),false);assert.equal(f.state(),null);
});

test("approved local permission sends this existing quote once to the exact authorized mailbox",async()=>{
 const local={...dev,VERCEL_ENV:undefined,SELAN_APPROVED_LOCAL_DEV:"1",QUIBI_DEV_LOCAL_SEND_ENABLED:"1",QUIBI_DEV_TEST_RECIPIENT:"online.gold100@gmail.com",PUBLIC_APP_ORIGIN:"http://127.0.0.1:3002",COMPLETION_PUBLIC_ORIGIN:"http://127.0.0.1:3002"};
 const f=fixture("approved_for_send");await send(f,local);assert.equal(f.events.includes("send:online.gold100@gmail.com"),true);assert.equal(f.events.includes("approve"),false);
 await assert.rejects(send(f,local),/QUIBI_SEND_ALREADY_ATTEMPTED/);assert.equal(f.events.filter(e=>e.startsWith("send:")).length,1);
 const wrong=fixture("approved_for_send");wrong.set({documentId:"99"});await assert.rejects(send(wrong,local));assert.equal(wrong.events.some(e=>e.startsWith("send:")),false);
 const unreviewed=fixture();await assert.rejects(send(unreviewed,local),/QUIBI_LOCAL_SEND_SCOPE_MISMATCH/);assert.equal(unreviewed.events.includes("approve"),false);
});
