import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuibiDevWriteClient} from './write-http.ts';
const env={APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview',QUIBI_DEV_WRITE_ENABLED:'1',QUIBI_DEV_USERNAME:'test',QUIBI_DEV_PASSWORD:'test'};
const input={url:'https://selan.example/dashboard/primeri/00000000-0000-4000-8000-000000000001',naziv:'Fotografije in priloge vozila',zunanji_id:'selan-case:00000000-0000-4000-8000-000000000001'};
test('URL link uses documented request and validates the response',async()=>{
 const calls:unknown[]=[];
 const client=createQuibiDevWriteClient({username:'test',password:'test',environment:env,fetcher:async(url,opts)=>{calls.push([String(url),opts?.method,JSON.parse(String(opts?.body))]);return Response.json({error:false,data:{obstaja:false,Povezava:{id:15,...input}}});}});
 assert.deepEqual(await client.addCaseUrl('42',input,'https://selan.example'),{id:'15',obstaja:false});
 assert.deepEqual(calls,[['https://dev.quibi.net/api2/urlpovezave/add/42','POST',input]]);
 await assert.rejects(client.addCaseUrl('bad',input,'https://selan.example'));
 await assert.rejects(client.addCaseUrl('42',{...input,url:'https://evil.example/a'},'https://selan.example'));
});
test('URL link rejects malformed or rejected provider envelopes',async()=>{
 for(const payload of [{error:false,data:{obstaja:false}},{error:false,data:{obstaja:'false',Povezava:{id:15}}},{error:true}]){
 const client=createQuibiDevWriteClient({username:'test',password:'test',environment:env,fetcher:async()=>Response.json(payload)});
 await assert.rejects(client.addCaseUrl('42',input,'https://selan.example'));
 }
});
