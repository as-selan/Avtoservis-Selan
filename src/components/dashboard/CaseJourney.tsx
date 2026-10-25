"use client";
import {useEffect,useState,useRef} from 'react';
import {automaticDraftPresentation} from '@/lib/quibi/automatic-draft-state';
import {caseJourney,type JourneyInput} from '@/lib/cases/journey';

export function CaseJourney({input,explanation,inlineAction=false}:{input:JourneyInput;explanation:string;inlineAction?:boolean}){
 const actionSlot=useRef<HTMLDivElement>(null),[businessAction,setBusinessAction]=useState(false);
 useEffect(()=>{const node=actionSlot.current;if(!node)return;const update=()=>setBusinessAction(node.childElementCount>0);const observer=new MutationObserver(update);observer.observe(node,{childList:true});update();return()=>observer.disconnect();},[]);
 const [previewReady,setPreviewReady]=useState(false);
 useEffect(()=>{const update=(e:Event)=>setPreviewReady((e as CustomEvent<{ready:boolean}>).detail.ready);window.addEventListener('selan-estimate-review',update);return()=>window.removeEventListener('selan-estimate-review',update);},[]);
 const inlinePreparation=input.automaticPreparation&&input.identityReady&&['ready','ambiguous','missing_price'].includes(input.automaticDraftState??'');
 const journey=caseJourney(input);
 const nextExplanation=inlineAction?'Predračun je ustvarjen. Zabeležite prejeto odobritev stranke.':input.newVehicleRequired?'Novo vozilo – potrebna potrditev':input.automaticPreparation?automaticDraftPresentation(input.automaticDraftState).label:input.syntheticQa&&input.quoteReviewed&&!input.customerApproved&&!input.hasWorkOrder?"Predračun je pregledan. Evidentirajte simulirano QA odločitev.":input.devNoEmail&&input.quoteReviewed&&!input.customerApproved&&!input.hasWorkOrder?"Predračun je pregledan. Zabeležite odgovor stranke.":explanation;
 return <section aria-label="Naslednje opravilo" className="sticky top-0 z-20 scroll-mt-20 rounded-xl bg-slate-100 p-4 sm:p-5" id="naslednji-korak">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
   <div className="min-w-0"><h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">{journey.terminal?'Primer je zaključen':'Naslednje opravilo'}</h2>{!businessAction&&<p className="mt-1 font-semibold text-slate-950">{previewReady?'Predračun je pregledan. Ustvarjanje potrdite v pregledu spodaj.':nextExplanation}</p>}</div>
   <div ref={actionSlot} id="case-primary-action"/>
   {!businessAction&&!inlineAction&&!previewReady&&!inlinePreparation&&!input.newVehicleRequired&&<a data-case-primary href={journey.action.href} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-5 py-3 text-center font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{journey.action.label} →</a>}
  </div>
  {!inlineAction&&!previewReady&&journey.blocker&&<p role="status" className="mt-3 text-sm text-amber-950">{journey.blocker}</p>}
 </section>;
}
