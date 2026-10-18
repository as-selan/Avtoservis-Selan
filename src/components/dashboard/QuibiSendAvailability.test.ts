import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {sendPresentation} from '../../lib/quibi/send-outcome.ts';
type Element={type:unknown;props:Record<string,unknown>};
function render(name:string,props:Record<string,unknown>){
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const react={useState:(value:unknown)=>[value,()=>{}],useRef:(value:unknown)=>({current:value}),useEffect:()=>{},useTransition:()=>[false,()=>{throw Error('Rendering must never dispatch')} ]};
 const exports:Record<string,unknown>={};const code=ts.transpileModule(readFileSync(new URL(`./${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(id:string)=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:id==='next/navigation'?{useRouter:()=>({refresh(){}})}:id==='@/lib/quibi/send-outcome'?{sendPresentation}:{},FormData,Number});
 return (exports[name] as (p:unknown)=>Element)(props);
}
function find(value:unknown,predicate:(n:Element)=>boolean):Element|undefined{if(Array.isArray(value)){for(const child of value){const found=find(child,predicate);if(found)return found}}else if(value&&typeof value==='object'&&'props' in value){const node=value as Element;return predicate(node)?node:find(node.props.children,predicate)}}
for(const dev of [true,false]){
 test(`server-authorized ${dev?'DEV':'production'} SEND uses the same existing form`,()=>{
  for(const enabled of [true,false]){
   const business=render('QuibiBusinessSend',{dev,enabled,orderId:'case',documentId:'doc',kind:'invoice',sha:'sha',amount:'45.99',recipient:'qa@example.test',initialState:null});
   assert.equal(find(business,n=>n.type==='button')?.props.disabled,!enabled);
   const estimate=render('QuibiEstimateWorkflowPanel',{dev,sendEnabled:enabled,serviceRequestId:'case',quoteId:'quote',documentId:'doc',reviewStatus:'approved_for_send',sha256:'sha',amount:'45.99',lines:[{description:'QA',quantity:'1',grossPrice:'45.99'}],recipient:'qa@example.test',manualIdentityRequired:false,alreadyDelivered:false});
   assert.equal(!!find(estimate,n=>n.type==='form'),enabled);
  }
 });
}
test('existing uncertain SEND stays status-only even when DEV dispatch is configured',()=>{
 const business=render('QuibiBusinessSend',{dev:true,enabled:true,documentId:'doc',kind:'invoice',sha:'sha',amount:'45.99',recipient:'qa@example.test',initialState:{state:'uncertain',sendId:null,sendStatus:null,attemptedAt:null}});
 assert.equal(find(business,n=>n.type==='button')?.props.children,'Preveri status brez ponovnega pošiljanja');
 const estimate=render('QuibiEstimateWorkflowPanel',{dev:true,sendEnabled:true,documentId:'doc',reviewStatus:'approved_for_send',amount:'45.99',lines:[{description:'QA',quantity:'1',grossPrice:'45.99'}],recipient:'qa@example.test',operationState:'uncertain',alreadyDelivered:false});
 assert.equal(!!find(estimate,n=>n.type==='form'),false);
});
