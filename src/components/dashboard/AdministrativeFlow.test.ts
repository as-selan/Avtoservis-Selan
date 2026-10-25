/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic React JSX and hook fixture; no application data or external operations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {canAdvancePreliminaryInspection} from '../../lib/inspections/eligibility.ts';
import {manualSlotDraft,slotProposalMessage,manualOfferExpired} from '../../lib/appointments/manual-slot-draft.ts';
import {ljubljanaWallTimeToIso} from '../../lib/appointments/ljubljana-time.ts';
import {sendPresentation} from '../../lib/quibi/send-outcome.ts';

type Node={type:unknown;props:Record<string,any>};
function nodes(tree:any):Node[]{if(Array.isArray(tree))return tree.flatMap(nodes);if(tree&&typeof tree==='object'&&'props' in tree)return [tree,...nodes(tree.props.children)];return []}
function text(tree:any):string{if(Array.isArray(tree))return tree.map(text).join(' ');if(tree&&typeof tree==='object'&&'props' in tree)return text(tree.props.children);return typeof tree==='string'||typeof tree==='number'?String(tree):''}
function fixture(file:string,component:string,initialProps:Record<string,unknown>){
 const state:any[]=[],calls:{name:string;args:any[]}[]=[],pending:Promise<unknown>[]=[];let index=0,refreshes=0;
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const actions=Object.fromEntries(['caseReviewAction','reviewServiceRequestIntake','approveCaseEstimate','recordManualEstimateDecision','recordManualEstimateDelivery','reviewManualQuibiEstimate','proposeManualSlots','advanceManualSlotOffer','recordPreliminaryInspection'].map(name=>[name,async(...args:any[])=>{calls.push({name,args});return {ok:true}}]));
 const exports:Record<string,any>={};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(name:string)=>name==='react'?{useState:(value:any)=>{const slot=index++;if(!(slot in state))state[slot]=typeof value==='function'?value():value;return [state[slot],(next:any)=>{state[slot]=typeof next==='function'?next(state[slot]):next}]},useRef:(value:any)=>({current:value}),useEffect:()=>{},useTransition:()=>[false,(fn:()=>Promise<unknown>)=>pending.push(fn())]}:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='next/navigation'?{useRouter:()=>({refresh:()=>refreshes++})}:name.includes('eligibility')?{canAdvancePreliminaryInspection}:name.includes('manual-slot-draft')?{manualSlotDraft,slotProposalMessage,manualOfferExpired}:name.includes('ljubljana-time')?{ljubljanaWallTimeToIso}:name.includes('send-outcome')?{sendPresentation}:actions,process:{env:{}},FormData,crypto,Date,Number,JSON,Set,setTimeout,clearTimeout});
 let props=initialProps;
 const render=(changes:Record<string,unknown>={})=>{props={...props,...changes};index=0;return exports[component](props)};
 return {render,calls,refreshes:()=>refreshes,flush:async()=>{await Promise.all(pending.splice(0))}};
}
function button(tree:any,label:string){const node=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(node,'Missing button '+label);return node}
function fillLabel(tree:any,label:string,value:string){const parent=nodes(tree).find(n=>n.type==='label'&&text(n).includes(label));assert.ok(parent,label);const input=nodes(parent).find(n=>n.type==='input'||n.type==='textarea');assert.ok(input);input.props.onChange({target:{value}})}
function attest(tree:any){const input=nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.ok(input);input.props.onChange({target:{checked:true}})}

test('customer approval and rejection work without delivery, stay explicitly synthetic and refresh the case',async()=>{
 for(const decision of ['approved','rejected']){
  const f=fixture('./ManualEstimateHandoff.tsx','ManualEstimateHandoff',{quoteId:'qa-quote',delivered:false,decision:null,syntheticQa:true,realDevWrite:true});
  const label=decision==='approved'?'Evidentiraj simulirano QA odobritev':'Evidentiraj simulirano QA zavrnitev';
  const submit=button(f.render(),label);assert.equal(submit.props.disabled,false);submit.props.onClick();await f.flush();
  assert.deepEqual(f.calls,[{name:'recordManualEstimateDecision',args:['qa-quote',decision,'QA-SIM-OPERATOR-'+decision]}]);assert.equal(f.refreshes(),1);
  assert.match(text(f.render({decision})),decision==='approved'?/odobreno/:/zavrnjeno/);
 }
});
test('synthetic decision cannot be mistaken for real customer evidence',async()=>{
 const f=fixture('./ManualEstimateHandoff.tsx','ManualEstimateHandoff',{quoteId:'qa',delivered:false,decision:null,syntheticQa:true});
 assert.ok(!nodes(f.render()).some(n=>n.type==='input'));button(f.render(),'Evidentiraj simulirano QA odobritev').props.onClick();await f.flush();assert.equal(f.calls[0].args[2],'QA-SIM-OPERATOR-approved');assert.match(text(f.render()),/simulirano/i);
});
test('manual appointment UI progresses proposal, actual choice and booking evidence as separate actions',async()=>{
 const f=fixture('./ManualSlotOffer.tsx','ManualSlotOffer',{serviceRequestId:'case',appointmentType:'service',offer:null,realDevWrite:true});
 const dates=['2030-06-10T09:00','2030-06-11T09:00','2030-06-12T09:00'];
 nodes(f.render()).filter(n=>n.type==='input'&&n.props.type==='datetime-local').forEach((n,i)=>n.props.onChange({target:{value:dates[i]}}));
 fillLabel(f.render(),'Kje in kdaj ste preverili razpoložljivost','isolated-only calendar check');attest(f.render());button(f.render(),'Shrani tri možnosti').props.onClick();await f.flush();
 assert.equal(f.calls[0].name,'proposeManualSlots');assert.equal(f.calls[0].args[2][0],'2030-06-10T07:00:00.000Z');
 const offer={id:'offer',status:'proposed',slot_1:'2030-06-10T07:00:00Z',slot_2:'2030-06-11T07:00:00Z',slot_3:'2030-06-12T07:00:00Z',selected_slot:null,booking_reference:null};
 for(const [status,label,reference,action] of [['proposed','Evidentiraj dejansko pošiljanje','Referenca dejansko poslanih možnosti','send'],['offered','Evidentiraj strankino izbiro','Referenca strankine izbire','select'],['selected','Potrdi ročno rezerviran termin','Referenca dejanske ročne rezervacije','confirm']]){
  f.render({offer:{...offer,status,selected_slot:status==='selected'?1:null}});fillLabel(f.render(),reference,'isolated-only evidence');attest(f.render());button(f.render(),label).props.onClick();await f.flush();assert.equal(f.calls.at(-1)?.args[1],action);
 }
 const confirmed=f.render({offer:{...offer,status:'confirmed',booking_reference:'QA-SIM-isolated',selected_slot:1}});assert.match(text(confirmed),/To NI rezervacija/);assert.ok(!nodes(confirmed).some(n=>n.type==='button'&&text(n)==='Potrdi ročno rezerviran termin'));
});
test('preliminary inspection explicitly distinguishes free ordered repair from payable declined repair',async()=>{
 const f=fixture('./PreliminaryInspection.tsx','PreliminaryInspection',{serviceRequestId:'case',caseStatus:'preparing_offer',status:null,findings:null,repairDecision:null});
 button(f.render(),'Označi potreben predhodni pregled').props.onClick();await f.flush();assert.equal(f.calls.at(-1)?.args[1],'request');
 f.render({status:'requested'});fillLabel(f.render(),'Dejanske ugotovitve po opravljenem pregledu','QA-SIM isolated findings');attest(f.render());button(f.render(),'Zabeleži opravljen pregled').props.onClick();await f.flush();assert.equal(f.calls.at(-1)?.args[1],'complete');
 for(const decision of ['ordered','not_ordered']){
  f.render({status:'completed',repairDecision:'pending'});attest(f.render());button(f.render(),decision==='ordered'?'Popravilo naročeno':'Popravilo ni naročeno').props.onClick();await f.flush();assert.equal(f.calls.at(-1)?.args[1],decision==='ordered'?'repair_ordered':'repair_not_ordered');
  assert.match(text(f.render({repairDecision:decision})),decision==='ordered'?/pregled je brezplačen/:/pregled je plačljiv/);
 }
});
test('disabled new send never contradicts preserved historical delivery outcomes',()=>{
 const f=fixture('./QuibiBusinessSend.tsx','QuibiBusinessSend',{orderId:'order',documentId:'doc',kind:'invoice',sha:'a'.repeat(64),amount:'45.99',recipient:'online.gold100@gmail.com',enabled:false,dev:true,initialState:{state:'verified',sendId:'277125',sendStatus:'sent',attemptedAt:'2026-10-14'}});
 assert.match(text(f.render()),/Predano poštnemu strežniku/);assert.doesNotMatch(text(f.render()),/Dokument ni poslan/);assert.match(text(f.render()),/Nova pošiljanja so izključena/);
});
test('dashboard preparation control does not invent WRITE configuration when readiness was not checked',()=>{
 const f=fixture('./PrepareOfferButton.tsx','PrepareOfferButton',{serviceRequestId:'case',alreadyPrepared:true});assert.doesNotMatch(text(f.render()),/Ustvarjanje dokumenta trenutno ni omogočeno/);assert.match(text(f.render({providerReady:false})),/Ustvarjanje dokumenta trenutno ni omogočeno/);
});


test('expired or obsolete slot offers never present an actionable booking confirmation',()=>{
 const offer={id:'offer',status:'selected',slot_1:'2020-01-01T09:00:00Z',slot_2:'2020-01-02T09:00:00Z',slot_3:'2020-01-03T09:00:00Z',selected_slot:1,booking_reference:null};
 const f=fixture('./ManualSlotOffer.tsx','ManualSlotOffer',{serviceRequestId:'case',appointmentType:'diagnosis',offer,realDevWrite:true});
 assert.match(text(f.render()),/Termini so potekli/);assert.ok(!nodes(f.render()).some(n=>n.type==='button'&&text(n)==='Potrdi ročno rezerviran termin'));
 assert.ok(button(f.render(),'Umakni ponudbo in pripravi nove možnosti'));
 assert.match(text(f.render({inactiveReason:'Pregled je že opravljen.'})),/Pregled je že opravljen/);
});

test('real customer approval needs one click and no reference field; source remains Selan',async()=>{
 const f=fixture('./ManualEstimateHandoff.tsx','ManualEstimateHandoff',{quoteId:'qa',delivered:true,decision:null});
 assert.ok(!nodes(f.render()).some(n=>n.type==='input'));
 button(f.render(),'Stranka je odobrila').props.onClick();await f.flush();
 assert.deepEqual(f.calls,[{name:'recordManualEstimateDecision',args:['qa','approved','']}]);
 assert.match(text(f.render({decision:'approved'})),/ni prevzeta iz Quibija/);
});

test('existing uncertain estimate uses one locked approval click, never a create action',async()=>{
 const f=fixture('./ApproveCaseEstimate.tsx','ApproveCaseEstimate',{caseId:'qa-case'});
 const submit=button(f.render(),'Stranka je odobrila');submit.props.onClick();submit.props.onClick();await f.flush();
 assert.deepEqual(f.calls,[{name:'approveCaseEstimate',args:['qa-case']}]);assert.equal(f.refreshes(),1);
 assert.ok(!nodes(f.render()).some(n=>n.type==='input'));
});

test('intake and price review are explicit single clicks without a duplicate checkbox',async()=>{
 for(const [file,component,props,label,action] of [
 ['./ReviewIntakeButton.tsx','ReviewIntakeButton',{serviceRequestId:'case'},'Sprejmi primer za pripravo ponudbe','reviewServiceRequestIntake'],
 ['./ReviewManualEstimate.tsx','ReviewManualEstimate',{quoteId:'quote'},'Odobri predračun','reviewManualQuibiEstimate']
 ] as const){const f=fixture(file,component,props);assert.ok(!nodes(f.render()).some(n=>n.type==='input'&&n.props.type==='checkbox'));const submit=button(f.render(),label);assert.equal(submit.props.disabled,false);submit.props.onClick();submit.props.onClick();await f.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,action);}
});
test('invoice verification and closure keep an explicit submit but no duplicate checkbox',()=>{
 for(const action of ['invoice_checked','closed']){const f=fixture('./CaseReviewForm.tsx','CaseReviewForm',{caseId:'case',action,sha:'a'.repeat(64),enabled:true,simulated:false});assert.ok(!nodes(f.render()).some(n=>n.type==='input'&&n.props.type==='checkbox'));assert.equal(f.calls.length,0,'rendering never records approval, review or closure');}
});
