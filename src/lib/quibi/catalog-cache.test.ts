import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {createHash} from 'node:crypto';import ts from 'typescript';
test('cache isolates origin/account, coalesces concurrent reads and retains no failed snapshot',async()=>{
 let reads=0,fail=false;const stored=new Map<string,unknown>(),policies:Array<{keys:string[];revalidate:number}>=[],exports:Record<string,unknown>={};
 const modules={'server-only':{},'node:crypto':{createHash},'./client':{createQuibiReadClient:()=>({catalogSnapshot:async()=>{reads++;if(fail)throw Error('PAGE_FAILURE');await Promise.resolve();return {articles:[],lists:[],issues:[]}}})},'next/cache':{unstable_cache:(fn:()=>Promise<unknown>,keys:string[],options:{revalidate:number})=>{policies.push({keys,revalidate:options.revalidate});return async()=>{const key=keys.join(':');if(stored.has(key))return stored.get(key);const value=await fn();stored.set(key,value);return value}}}};
 runInNewContext(ts.transpileModule(readFileSync(new URL('./catalog-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:keyof typeof modules)=>modules[name],Map,Promise});
 const load=exports.cachedCatalogSnapshot as (config:{username:string;password:string;origin?:string})=>Promise<unknown>,config={username:'fixture-account',password:'fixture-password'};
 await Promise.all([load(config),load(config)]);assert.equal(reads,1);await load(config);assert.equal(reads,1);await load({...config,origin:'https://other.fixture'});assert.equal(reads,2);
 assert.ok(policies.every(p=>p.revalidate===900&&!p.keys.join().includes(config.username)&&!p.keys.join().includes(config.password)));
 fail=true;await assert.rejects(load({...config,password:'fixture-failure'}));fail=false;await load({...config,password:'fixture-failure'});assert.equal(reads,4);
});
