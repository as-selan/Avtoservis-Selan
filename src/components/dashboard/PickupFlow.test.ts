import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
test('pickup view shows issued invoice first, restores the direct pickup bookmark, and returns without any business write',()=>{
 let state=false;const effects:(()=>unknown)[]=[],revealed:string[]=[],listeners=new Map<string,()=>void>();const location={hash:''};
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});const exports:Record<string,unknown>={};
 const imports:Record<string,unknown>={'react/jsx-runtime':{jsx,jsxs:jsx},'react':{useState:()=>[state,(next:boolean)=>{state=next;}],useEffect:(effect:()=>unknown)=>effects.push(effect)},'@/lib/cases/navigation':{revealCaseSection:(hash:string)=>revealed.push(hash)}};
 runInNewContext(ts.transpileModule(readFileSync(new URL('./CasePickupFlow.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:(id:string)=>{assert.ok(id in imports,id);return imports[id];},window:{location,addEventListener:(event:string,fn:()=>void)=>listeners.set(event,fn),removeEventListener:(event:string)=>listeners.delete(event)}});
 type Tree={props:{children:{props:{hidden:boolean}}[]}};const render=()=>{const tree=(exports.CasePickupFlow as(p:unknown)=>Tree)({summary:'Invoice',children:'Pickup'});while(effects.length)effects.shift()!();return tree;};
 let tree=render();assert.equal(tree.props.children[0].props.hidden,false);assert.equal(tree.props.children[1].props.hidden,true);assert.equal(revealed.length,0);
 location.hash='#prevzem';listeners.get('hashchange')!();tree=render();assert.equal(tree.props.children[0].props.hidden,true);assert.equal(tree.props.children[1].props.hidden,false);assert.deepEqual(revealed,['#prevzem']);
 location.hash='';listeners.get('hashchange')!();tree=render();assert.equal(tree.props.children[0].props.hidden,false);assert.equal(tree.props.children[1].props.hidden,true);
});
