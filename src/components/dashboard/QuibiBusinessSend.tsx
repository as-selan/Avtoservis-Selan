"use client";
import {useRef,useState,useTransition} from 'react';
import {sendPresentation} from '@/lib/quibi/send-outcome';
import {sendLinkedQuibiBusinessDocument} from '@/lib/quibi/business-send-actions';
export function QuibiBusinessSend({orderId,caseId,documentId,kind,sha,amount,recipient,allowedRecipients=[],enabled,initialState,dev=true}:{dev?:boolean;orderId:string;caseId?:string;documentId:string;kind:string;sha:string;amount:string;recipient:string;allowedRecipients?:string[];enabled:boolean;initialState:{state:string;sendId:string|null;sendStatus:string|null;attemptedAt:string|null}|null}){
 const [selectedRecipient,setRecipient]=useState(recipient),[confirmed,setConfirmed]=useState(false);
 const [pending,start]=useTransition(),[message,setMessage]=useState(sendPresentation(initialState).message),[locked,setLocked]=useState(initialState?initialState.state!=='prepared':false),[sendId,setSendId]=useState<string|null>(initialState?.sendId??null),lock=useRef(false);
 const pollOnly=!!sendId||locked;const canDispatch=enabled&&!dev;
 return <form className="space-y-3 rounded border p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;const f=new FormData(e.currentTarget);for(const [key,value] of Object.entries({orderId,documentId,kind,sha,amount,recipient:selectedRecipient}))f.set(key,value);if(caseId)f.set('caseId',caseId);if(pollOnly)f.set('poll','yes');start(async()=>{try{const result=await sendLinkedQuibiBusinessDocument(f);setMessage(result.message);setLocked(result.locked??true);if(result.sendId)setSendId(result.sendId)}catch{setLocked(true);setMessage('Izid ni znan. Ponovno pošiljanje je ustavljeno.')}finally{lock.current=false}})}}>
 <h2 className="font-semibold">{kind==='invoice'?'Pošiljanje računa prek Quibija':'Pošlji dokument prek Quibija'}</h2><p>Končni prejemnik: {selectedRecipient||'Dovoljen prejemnik v tem okolju ni nastavljen'} · znesek {amount} EUR</p>
 <p className="text-sm">DEV uporablja izključno konfiguriran testni naslov. »Sent« pomeni predajo poštnemu strežniku; prejem in odgovor stranke nista potrjena.</p>
 {!pollOnly&&allowedRecipients.length>0&&<label className="block">Dovoljeni testni prejemnik<select className="block w-full rounded border p-2" value={selectedRecipient} onChange={e=>{setRecipient(e.target.value);setConfirmed(false)}}>{allowedRecipients.map(email=><option key={email} value={email}>{email}</option>)}</select></label>}
 {!pollOnly&&canDispatch&&<label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required value="yes"/>Pregledal sem dokument, znesek in prejemnika. Potrjujem enkratno pošiljanje te vsebine.</label>}
 <button disabled={pending||(!pollOnly&&!canDispatch)} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{pending?'Preverjam…':pollOnly?'Preveri status brez ponovnega pošiljanja':kind==='invoice'?'Pošlji račun':'Pošlji dokument'}</button>
 {initialState?.attemptedAt&&<p className="text-xs">Zabeležen poskus: {initialState.attemptedAt}</p>}
 {!canDispatch&&<p className="text-sm">Nova pošiljanja so izključena. Prejemnika in vsebino lahko pregledate; stanje morebitnega prejšnjega poskusa je prikazano spodaj.</p>}{sendId&&<p className="break-all text-xs">send_id: {sendId}</p>}{message&&<p role="status">{message}</p>}
 </form>;
}
