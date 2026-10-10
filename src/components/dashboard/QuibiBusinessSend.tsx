"use client";
import {useRef,useState,useTransition} from 'react';
import {sendPresentation} from '@/lib/quibi/send-outcome';
import {sendLinkedQuibiBusinessDocument} from '@/lib/quibi/business-send-actions';
export function QuibiBusinessSend({orderId,documentId,kind,sha,amount,recipient,enabled,initialState}:{orderId:string;documentId:string;kind:string;sha:string;amount:string;recipient:string;enabled:boolean;initialState:{state:string;sendId:string|null;sendStatus:string|null;attemptedAt:string|null}|null}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(sendPresentation(initialState).message),[locked,setLocked]=useState(initialState?initialState.state!=='prepared':false),[sendId,setSendId]=useState<string|null>(initialState?.sendId??null),lock=useRef(false);
 return <form className="space-y-3 rounded border p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;const f=new FormData(e.currentTarget);for(const [key,value] of Object.entries({orderId,documentId,kind,sha,amount,recipient}))f.set(key,value);if(sendId)f.set('poll','yes');start(async()=>{try{const result=await sendLinkedQuibiBusinessDocument(f);setMessage(result.message);setLocked(result.locked??true);if(result.sendId)setSendId(result.sendId)}catch{setLocked(true);setMessage('Izid ni znan. Ponovno pošiljanje je ustavljeno.')}finally{lock.current=false}})}}>
 <h2 className="font-semibold">Pošlji dokument prek Quibija</h2><p>Končni prejemnik: {recipient||'Dovoljen prejemnik v tem okolju ni nastavljen'} · znesek {amount} EUR</p>
 <p className="text-sm">DEV uporablja izključno konfiguriran testni naslov. »Sent« pomeni predajo poštnemu strežniku; prejem in odgovor stranke nista potrjena.</p>
 {!sendId&&<label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" required value="yes"/>Pregledal sem dokument, znesek in prejemnika. Potrjujem enkratno pošiljanje te vsebine.</label>}
 <button disabled={pending||(!sendId&&(!enabled||locked))} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{pending?'Preverjam…':sendId?'Preveri status brez ponovnega pošiljanja':'Pošlji dokument'}</button>
 {initialState?.attemptedAt&&<p className="text-xs">Zabeležen poskus: {initialState.attemptedAt}</p>}
 {!enabled&&<p className="text-sm">Dejansko pošiljanje je izključeno; potrebuje ločeno odobritev in konfiguracijo.</p>}{sendId&&<p className="break-all text-xs">send_id: {sendId}</p>}{message&&<p role="status">{message}</p>}
 </form>;
}
