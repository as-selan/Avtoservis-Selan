"use client";
import {CasePrimaryAction} from './CasePrimaryAction';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {reconcileQuibiEstimate} from '@/lib/quibi/dev-write-actions';
import {approveCaseEstimate} from '@/lib/quibi/manual-estimate-action';
export function ApproveCaseEstimate({caseId,documentId,backgroundRead=true,syntheticQa=false}:{caseId:string;documentId?:string;backgroundRead?:boolean;syntheticQa?:boolean}){
 const router=useRouter(),lock=useRef(false);const [pending,start]=useTransition();const [message,setMessage]=useState('');
 const autoChecked=useRef(false);
 // Read and link only. Customer/internal approval still runs exclusively on the button click.
 useEffect(()=>{if(!backgroundRead||autoChecked.current)return;autoChecked.current=true;start(async()=>{try{const result=await reconcileQuibiEstimate(caseId);if(result.ok)router.refresh();else setMessage('Predračun je ustvarjen. Pred nadaljevanjem preverite prikazani znesek.');}catch{setMessage('Podatkov predračuna trenutno ni mogoče osvežiti. Poskusite znova.');}});},[backgroundRead,caseId,router]);
 return <section className="space-y-3"><h3 className="font-semibold">Predračun {documentId?'#'+documentId:''}</h3><p>Čaka odobritev stranke.</p><details className="text-xs text-slate-500"><summary>Več podrobnosti</summary><p> {syntheticQa?"To je sintetični preizkus; evidentira se samo simulirana QA odobritev.":"Če ste prejeli odobritev stranke, jo evidentirajte tukaj."} Selan preveri in uporabi isti dokument.</p></details><CasePrimaryAction><button type="button" disabled={pending} className="min-h-12 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={()=>{if(lock.current)return;lock.current=true;start(async()=>{try{const result=await approveCaseEstimate(caseId);setMessage(result.message);if(result.ok)router.refresh();}catch{setMessage('Izid ni potrjen. Osvežite primer; novega dokumenta ne ustvarjajte.');}finally{lock.current=false;}})}}>{pending?'Osvežujem predračun…':'Stranka je odobrila'}</button></CasePrimaryAction>{message&&<p role="status">{message}</p>}</section>;
}
