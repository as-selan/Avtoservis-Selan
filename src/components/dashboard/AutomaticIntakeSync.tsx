"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {chooseIntakeCustomer,retryIntakeSynchronization} from '@/lib/quibi/automatic-intake-actions';
export type IntakeCustomerChoice={id:string;name:string;phone:string;email:string;fingerprint:string};
export function AutomaticIntakeSync({caseId,customerId,vehicleId,reason,configurationProblem,reviewHref,identityReviewRequired=false,identityConfirmed=false,choices=[]}:{caseId:string;customerId:string|null;vehicleId:string|null;reason:string|null;configurationProblem?:string|null;reviewHref?:string;identityReviewRequired?:boolean;identityConfirmed?:boolean;choices?:IntakeCustomerChoice[]}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),lock=useRef(false),router=useRouter();
 const connected=identityConfirmed&&!!customerId&&!!vehicleId&&!identityReviewRequired;
 function select(choice:IntakeCustomerChoice){if(lock.current)return;lock.current=true;start(async()=>{try{const result=await chooseIntakeCustomer(caseId,choice.id,choice.fingerprint);setMessage(result.message);router.refresh();}catch{setMessage('Izbire trenutno ni mogoče shraniti. Povpraševanje ostaja shranjeno.');}finally{lock.current=false;}});}
 return <section aria-label="Povezava stranke in vozila" className="space-y-3">
  {connected?<p>Stranka in vozilo sta povezana.</p>:choices.length?<><h2 className="font-semibold">Izberi pravo stranko</h2><p className="text-sm text-slate-600">Podatki se razlikujejo ali je zadetkov več. Izberite pravi zapis.</p><ul className="divide-y">{choices.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{c.name}</p><p className="break-all text-sm">{[c.phone,c.email].filter(Boolean).join(' · ')}</p></div><button type="button" disabled={pending} onClick={()=>select(c)} className="min-h-12 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Izberi</button></li>)}</ul></>:<p role="status">{configurationProblem?'Povezava trenutno ni na voljo. Povpraševanje je shranjeno.':identityReviewRequired?'Podatki povezave so se spremenili. Izberite pravo vozilo spodaj.':customerId&&!vehicleId?'Stranka je povezana. Selan preverja vozilo.':'Selan povezuje stranko in vozilo.'}</p>}
  {message&&<p role="status">{message}</p>}
  {!connected&&!choices.length&&reviewHref&&<a href={reviewHref} className="inline-flex min-h-11 items-center text-sm text-blue-700">{customerId?'Uredi povezavo vozila':'Izberi obstoječo ali ustvari novo stranko'}</a>}
  <details className="text-xs text-slate-500"><summary className="min-h-11 cursor-pointer py-3">Več podrobnosti</summary><p>{configurationProblem||reason||'Sinhronizacija uporablja shranjene podatke povpraševanja.'}</p>{!connected&&<button type="button" disabled={pending||!!configurationProblem||identityReviewRequired} className="min-h-11 py-2 text-blue-700 disabled:opacity-50" onClick={()=>start(async()=>{const result=await retryIntakeSynchronization(caseId);setMessage(result.message);router.refresh();})}>Ponovno preveri povezavo</button>}</details>
 </section>;
}
