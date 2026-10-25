"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {approveCaseEstimate} from '@/lib/quibi/manual-estimate-action';
export function ApproveCaseEstimate({caseId,syntheticQa=false}:{caseId:string;syntheticQa?:boolean}){
 const router=useRouter(),lock=useRef(false);const [pending,start]=useTransition();const [message,setMessage]=useState('');
 return <section className="space-y-3"><p>Predračun je ustvarjen. {syntheticQa?"To je sintetični preizkus; evidentira se samo simulirana QA odobritev.":"Če ste prejeli odobritev stranke, jo evidentirajte tukaj."} Selan preveri in uporabi isti dokument.</p><button type="button" disabled={pending} className="min-h-12 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={()=>{if(lock.current)return;lock.current=true;start(async()=>{try{const result=await approveCaseEstimate(caseId);setMessage(result.message);if(result.ok)router.refresh();}catch{setMessage('Izid ni potrjen. Osvežite primer; novega dokumenta ne ustvarjajte.');}finally{lock.current=false;}})}}>{pending?'Preverjam…':syntheticQa?'Evidentiraj simulirano QA odobritev':'Stranka je odobrila'}</button>{message&&<p role="status">{message}</p>}</section>;
}
