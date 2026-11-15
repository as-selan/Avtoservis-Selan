"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {updateLinkedQuibiParty} from '@/lib/quibi/party-update-actions';
export function QuibiPartyUpdate({customerId,vehicleId,baseline,enabled}:{customerId:string;vehicleId?:string;baseline:string;enabled:boolean}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),[completed,setCompleted]=useState(false),[stopped,setStopped]=useState(false),lock=useRef(false),revision=useRef<string|null>(null),router=useRouter();
 return <form className="space-y-2 rounded border p-3 text-sm" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;revision.current??=crypto.randomUUID();const f=new FormData(e.currentTarget);f.set('customerId',customerId);if(vehicleId)f.set('vehicleId',vehicleId);f.set('baseline',baseline);f.set('revisionId',revision.current);start(async()=>{try{const result=await updateLinkedQuibiParty(f);setMessage(result.message);if(result.state==='unknown'||result.state==='rejected')setStopped(true);if(result.ok){setCompleted(true);router.refresh()}}catch{setStopped(true);setMessage('Izid ni potrjen. Ponovno zapisovanje je ustavljeno; preverite dnevnik.')}finally{lock.current=false}})}}>
 <p>Posodobi obstoječo Quibi {vehicleId?'vozilo':'stranko'} z zgoraj prikazanimi lokalnimi podatki. Nov zapis ne bo ustvarjen.</p>
 <label className="flex gap-2"><input type="checkbox" name="confirmed" value="yes" required/>Pregledal sem oba zapisa in potrjujem prenos lokalnih podatkov v obstoječi Quibi zapis.</label>
 <button disabled={pending||!enabled||completed||stopped} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{pending?'Preverjam spremembo…':completed?'Posodobitev preverjena':stopped?'Nova zahteva ustavljena':'Posodobi in ponovno preberi Quibi'}</button>
 {!enabled&&<p>Spreminjanje podatkov trenutno ni omogočeno.</p>}{message&&<p role="status">{message}</p>}
 </form>;
}
