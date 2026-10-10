import {createQuibiWorkflowWriteClient} from "./write-http.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {assertApprovedLocalDevSendConfiguration,assertLocalQuibiRequest,assertLocalQuibiSendTarget} from "./local-send-policy.ts";
import {quibiWorkflowConfig} from "./workflow-config.ts";
import {assertPreproductionQuibiConfiguration} from "../demo/config.ts";
const env={APP_ENV:"preproduction",QUIBI_MODE:"dev",SELAN_APPROVED_LOCAL_DEV:"1",QUIBI_DEV_LOCAL_SEND_ENABLED:"1",QUIBI_DEV_WRITE_ENABLED:"1",QUIBI_DEV_USERNAME:"fixture",QUIBI_DEV_PASSWORD:"fixture",QUIBI_DEV_TEST_RECIPIENT:"online.gold100@gmail.com",PUBLIC_APP_ORIGIN:"http://127.0.0.1:3002",COMPLETION_PUBLIC_ORIGIN:"http://127.0.0.1:3002",NEXT_PUBLIC_SUPABASE_URL:"https://verxxsjbewmkgoxwqvxo.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"fixture",SUPABASE_SERVICE_ROLE_KEY:"fixture",SELAN_FIXED_PRICE_V1:"1"};
test("explicit approved loopback permits unified config and preproduction app without Vercel spoofing",()=>{assert.doesNotThrow(()=>assertApprovedLocalDevSendConfiguration(env));assert.equal(quibiWorkflowConfig(env).origin,"https://dev.quibi.net");assert.doesNotThrow(()=>assertPreproductionQuibiConfiguration(env));});
test("local send rejects missing opt-ins, hosted modes, wrong origin and other recipients",()=>{for(const change of [{QUIBI_DEV_LOCAL_SEND_ENABLED:"0"},{SELAN_APPROVED_LOCAL_DEV:"0"},{QUIBI_DEV_WRITE_ENABLED:"0"},{APP_ENV:"production"},{QUIBI_MODE:"production"},{VERCEL_ENV:"preview"},{VERCEL_ENV:"production"},{PUBLIC_APP_ORIGIN:"http://localhost:3002"},{PUBLIC_APP_ORIGIN:"http://127.0.0.1.evil.test:3002"},{PUBLIC_APP_ORIGIN:"https://127.0.0.1:3002"},{PUBLIC_APP_ORIGIN:"http://127.0.0.1:3002/path"},{QUIBI_DEV_TEST_RECIPIENT:"other@gmail.com"},{QUIBI_E2E_ORIGIN:"http://127.0.0.1:47862"},{SELAN_REMOTE_DEMO:"1"},{SELAN_LOCAL_REVIEW:"1"},{QUIBI_DEV_PASSWORD:""}])assert.throws(()=>assertApprovedLocalDevSendConfiguration({...env,...change}));assert.throws(()=>assertApprovedLocalDevSendConfiguration(env,"https://si.quibi.net"));});
test("request must use exact configured loopback host and send Origin",()=>{
 const headers=new Headers({host:"127.0.0.1:3002",origin:env.PUBLIC_APP_ORIGIN});
 assert.doesNotThrow(()=>assertLocalQuibiRequest(env,headers,true));
 for(const change of [{host:"localhost:3002"},{host:"127.0.0.1:3003"},{origin:"https://evil.test"},{"x-forwarded-host":"evil.test"},{"x-forwarded-for":"192.168.1.1"}]){
  const bad=new Headers(headers);for(const [key,value] of Object.entries(change))if(typeof value==="string")bad.set(key,value);
  assert.throws(()=>assertLocalQuibiRequest(env,bad,true));
 }
 assert.throws(()=>assertLocalQuibiRequest(env,new Headers({host:"127.0.0.1:3002"}),true));
 assert.doesNotThrow(()=>assertLocalQuibiRequest(env,new Headers({host:"127.0.0.1:3002"}),false));
});
const target={caseId:"9d40c42f-b6a8-473b-983f-f9620df97d10",quoteId:"ab9f75b2-e6f3-45c7-82de-e36c82faab7b",customerId:"405956",vehicleId:"2387",documentId:"2176888",reviewStatus:"approved_for_send",detail:{amount:"122.00"}};
test("local permission is scoped to one existing approved case/quote/document and 122 EUR",()=>{assert.doesNotThrow(()=>assertLocalQuibiSendTarget(env,target));for(const change of [{caseId:"other"},{quoteId:"other"},{documentId:"99"},{customerId:"99"},{vehicleId:"99"},{reviewStatus:"unreviewed"},{detail:{amount:"123"}}])assert.throws(()=>assertLocalQuibiSendTarget(env,{...target,...change}));});

test("local transport permits only send/status; customer/document writes never reach network",async()=>{
 const requests:string[]=[];const client=createQuibiWorkflowWriteClient({username:env.QUIBI_DEV_USERNAME,password:env.QUIBI_DEV_PASSWORD,environment:env,
 fetcher:async(url)=>{requests.push(String(url));return new Response(JSON.stringify({error:false,data:String(url).includes("send_status")?{status:"sent"}:{send_id:"fixture-local",status:"queued"}}),{status:200})}});
 await assert.rejects(client.createCustomer({remote_id:"9d40c42f-b6a8-473b-983f-f9620df97d10",naziv:"Fixture"}),/QUIBI_LOCAL_SEND_ONLY/);
 await assert.rejects(client.sendDocument("99","online.gold100@gmail.com"),/QUIBI_LOCAL_SEND_ONLY/);
 await assert.rejects(client.sendDocument("2176888","other@gmail.com"));assert.equal(requests.length,0);
 await client.sendDocument("2176888","online.gold100@gmail.com");await client.getSendStatus("2176888","fixture-local");assert.equal(requests.length,2);
});
