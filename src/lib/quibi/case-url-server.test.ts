import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
test('verified link schedules bounded retry without blocking the document response',async()=>{
 let scheduled:(()=>Promise<void>)|undefined; const calls:unknown[]=[];
 const modules:Record<string,unknown>={'server-only':{},'next/server':{after:(fn:()=>Promise<void>)=>{scheduled=fn}},'./write-client':{configuredQuibiWorkflowWriteClient:()=>({})},'./case-url-sync':{retryQuibiCaseUrl:async(...args:unknown[])=>{calls.push(args);return true}}};
 const code=ts.transpileModule(readFileSync(new URL('./case-url-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports:Record<string,unknown>={};runInNewContext(code,{exports,require:(name:string)=>modules[name],process:{env:{PUBLIC_APP_ORIGIN:'https://selan.example'}},console});
 await (exports.syncVerifiedCaseUrl as (documentId:string,caseId:string)=>Promise<void>)('42','00000000-0000-4000-8000-000000000001');
 assert.equal(calls.length,0);assert.ok(scheduled);await scheduled();assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),[{documentId:'42',caseId:'00000000-0000-4000-8000-000000000001',origin:'https://selan.example',verified:true,production:false},{}]);
});
