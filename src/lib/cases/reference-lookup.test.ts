import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';import * as reference from './reference.ts';
test('actual short-link lookup retains authenticated RLS, explicit organization and archived filter, and refuses ambiguity',async()=>{
 const filters:unknown[][]=[];let rows=[{id:'a73db6be-7216-4677-bc0a-26e97693ad75'}];
 const q={select:(v:string)=>{filters.push(['select',v]);return q},eq:(...v:unknown[])=>{filters.push(['eq',...v]);return q},is:(...v:unknown[])=>{filters.push(['is',...v]);return q},gte:()=>q,lte:()=>q,limit:async(n:number)=>{filters.push(['limit',n]);return {data:rows,error:null}}};
 const db={from:(name:string)=>{assert.equal(name,'service_requests');return q}},exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync(new URL('./reference-lookup.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,require:(name:string)=>{if(name==='server-only')return {};assert.equal(name,'./reference');return reference}});
 const lookup=exports.lookupCaseReference as (db:unknown,org:string,ref:string)=>Promise<string|null>;
 assert.equal(await lookup(db,'authorized-org','A73DB6BE'),rows[0].id);assert.ok(filters.some(f=>JSON.stringify(f)==='["eq","organization_id","authorized-org"]'));assert.ok(filters.some(f=>JSON.stringify(f)==='["is","archived_at",null]'));assert.ok(filters.some(f=>JSON.stringify(f)==='["limit",2]'));
 rows=[...rows,{id:'a73db6be-ffff-ffff-ffff-ffffffffffff'}];assert.equal(await lookup(db,'authorized-org','A73DB6BE'),null);rows=[];assert.equal(await lookup(db,'other-org','A73DB6BE'),null);
});
