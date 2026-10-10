import assert from "node:assert/strict";
import {test} from "node:test";
import {quibiWorkflowConfig,workflowRecipient} from "./workflow-config.ts";
import {createQuibiWorkflowWriteClient} from "./write-http.ts";
const env={APP_ENV:"production",QUIBI_MODE:"production",VERCEL_ENV:"production",QUIBI_PRODUCTION_READ_ENABLED:"1",QUIBI_PRODUCTION_WRITE_ENABLED:"1",QUIBI_PRODUCTION_SEND_ENABLED:"1",QUIBI_PRODUCTION_USERNAME:"fixture-user",QUIBI_PRODUCTION_PASSWORD:"fixture-password"};
test("production transport uses only exact documented origin and send/send_status",async()=>{
 const requests:{url:string;body:unknown}[]=[];
 const client=createQuibiWorkflowWriteClient({username:env.QUIBI_PRODUCTION_USERNAME,password:env.QUIBI_PRODUCTION_PASSWORD,environment:env,
  fetcher:async(url,init)=>{requests.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):null});return new Response(JSON.stringify({error:false,data:String(url).includes("send_status")?{status:"sent"}:{send_id:"fixture-id",status:"queued"}}),{status:200})}});
 await client.sendDocument("2176888","customer@fixture.mail");await client.getSendStatus("2176888","fixture-id");
 assert.deepEqual(requests.map(r=>r.url),["https://si.quibi.net/api2/glavadokumenta/send/2176888","https://si.quibi.net/api2/glavadokumenta/send_status/2176888?send_id=fixture-id"]);
 assert.equal((requests[0].body as {email:string}).email,"customer@fixture.mail");
 assert.throws(()=>createQuibiWorkflowWriteClient({username:env.QUIBI_PRODUCTION_USERNAME,password:env.QUIBI_PRODUCTION_PASSWORD,environment:env,origin:"https://dev.quibi.net"}),/QUIBI_WORKFLOW_DISABLED/);
});
test("production recipient cannot be spoofed and reserved/missing actual address fails",()=>{
 for(const [local,remote] of [["customer@fixture.mail","other@fixture.mail"],["qa@example.test","qa@example.test"],["",""],["qa@example.invalid","qa@example.invalid"]])assert.throws(()=>workflowRecipient(env,local,remote));
 assert.equal(workflowRecipient({...env,QUIBI_DEV_TEST_RECIPIENT:"other@fixture.mail"},"customer@fixture.mail","customer@fixture.mail"),"customer@fixture.mail");
});
test("transport fails closed if send opt-in is removed after client construction",async()=>{
 let calls=0;const mutable={...env};const client=createQuibiWorkflowWriteClient({username:env.QUIBI_PRODUCTION_USERNAME,password:env.QUIBI_PRODUCTION_PASSWORD,environment:mutable,
 fetcher:async()=>{calls++;throw Error("unexpected")}});mutable.QUIBI_PRODUCTION_SEND_ENABLED="0";
 await assert.rejects(client.sendDocument("2176888","customer@fixture.mail"),/QUIBI_WORKFLOW_DISABLED/);assert.equal(calls,0);
 assert.equal(quibiWorkflowConfig({...env,QUIBI_PRODUCTION_SEND_ENABLED:"0",QUIBI_PRODUCTION_WRITE_ENABLED:"0"},"read").mode,"production");
});

const dev={APP_ENV:"preproduction",QUIBI_MODE:"dev",VERCEL_ENV:"preview",QUIBI_DEV_WRITE_ENABLED:"1",QUIBI_DEV_USERNAME:"fixture-dev",QUIBI_DEV_PASSWORD:"fixture-dev",QUIBI_DEV_TEST_RECIPIENT:"online.gold100@gmail.com"};
test("DEV synthetic matching customer email selects only configured test recipient",()=>{
 assert.equal(workflowRecipient(dev," QA@example.test ","qa@EXAMPLE.TEST"),dev.QUIBI_DEV_TEST_RECIPIENT);
 assert.throws(()=>workflowRecipient(dev,"qa@example.test","other@example.test"));
 for(const email of [null,"","broken","qa@","qa@example.test\nBcc:other@mail.test"])assert.throws(()=>workflowRecipient(dev,email,email??""));
});
test("DEV rejects missing/reserved test recipient and any customer mailbox as recipient",()=>{
 for(const recipient of ["","qa@example.test","qa@example.com","customer@fixture.mail","CUSTOMER@fixture.mail"]){
  assert.throws(()=>workflowRecipient({...dev,QUIBI_DEV_TEST_RECIPIENT:recipient},"customer@fixture.mail","customer@fixture.mail"));
 }
});
test("DEV transport rejects customer address even when synthetically matched",async()=>{
 const requests:{url:string;email:string}[]=[];
 const client=createQuibiWorkflowWriteClient({username:dev.QUIBI_DEV_USERNAME,password:dev.QUIBI_DEV_PASSWORD,environment:dev,
 fetcher:async(url,init)=>{requests.push({url:String(url),email:JSON.parse(String(init?.body)).email});return new Response(JSON.stringify({error:false,data:{send_id:"fixture-synthetic",status:"queued"}}),{status:200})}});
 await assert.rejects(client.sendDocument("2176888","qa@example.test"));
 await assert.rejects(client.sendDocument("2176888","customer@fixture.mail"));
 await client.sendDocument("2176888",workflowRecipient(dev,"qa@example.test","qa@example.test"));
 assert.deepEqual(requests,[{url:"https://dev.quibi.net/api2/glavadokumenta/send/2176888",email:dev.QUIBI_DEV_TEST_RECIPIENT}]);
});
