"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {linkWorkOrderQuibiDocument} from '@/lib/quibi/work-order-document-actions';
export function QuibiWorkOrderLink({orderId,documentId,kind,sha}:{orderId:string;documentId:string;kind:string;sha:string}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),lock=useRef(false),router=useRouter();
 return <form className="space-y-3 rounded border p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;const f=new FormData(e.currentTarget);start(async()=>{try{const result=await linkWorkOrderQuibiDocument(f);setMessage(result.message);if(result.ok)router.refresh()}catch{setMessage('Izid shranjevanja ni potrjen. Osvežite nalog pred ponovitvijo.')}finally{lock.current=false}})}}>
 <input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="documentId" value={documentId}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="sha" value={sha}/>
 <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required/>Preveril sem postavke in potrjujem, da dokument pripada temu servisnemu primeru. Stranko, vozilo in SHA mora dodatno potrditi svež API pregled.</label>
 <button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{pending?'Preverjam in povezujem…':'Poveži obstoječi dokument'}</button>{message&&<p role="status">{message}</p>}
 </form>;
}
