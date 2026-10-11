"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {retryIntakeSynchronization} from '@/lib/quibi/automatic-intake-actions';
export function AutomaticIntakeSync({caseId,customerId,vehicleId,reason}:{caseId:string;customerId:string|null;vehicleId:string|null;reason:string|null}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),lock=useRef(false),router=useRouter();
 return <section className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">Povezava s Quibijem</h2><p className="text-sm">{customerId?'Stranka #'+customerId:'Stranka še ni potrjeno povezana'} · {vehicleId?'vozilo #'+vehicleId:'vozilo še ni potrjeno povezano'}</p>{reason?.startsWith('Quibi povezava:')&&<p role="status" className="text-sm">{reason}</p>}{(!customerId||!vehicleId||reason?.startsWith('Quibi povezava:'))&&<button className="rounded border px-3 py-2 disabled:opacity-50" disabled={pending} onClick={()=>{if(lock.current)return;lock.current=true;start(async()=>{try{const result=await retryIntakeSynchronization(caseId);setMessage(result.message);router.refresh()}catch{setMessage('Povezave trenutno ni mogoče preveriti. Povpraševanje ostaja shranjeno.')}finally{lock.current=false}})}}>{pending?'Preverjam povezavo…':'Varno ponovno preveri povezavo'}</button>}{message&&<p role="status" className="text-sm">{message}</p>}</section>;
}
