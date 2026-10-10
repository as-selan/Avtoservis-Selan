"use client";
import {useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {createWorkOrder,recordWorkOrder} from "@/lib/work-orders/actions";
import {canTransitionWorkOrder,workOrderLabels} from "@/lib/work-orders/policy";
export function CreateWorkOrder({caseId}:{caseId:string}){
 const [pending,start]=useTransition(),[message,setMessage]=useState("");const lock=useRef(false),router=useRouter();
 return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Delovni nalog</h3><p className="text-sm text-slate-600">Naloga lahko ustvarite po odobritvi stranke in potrjenem servisnem terminu. Primer ostane povezan s stranko, vozilom in ponudbo.</p>
 <button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={()=>{if(lock.current)return;lock.current=true;start(async()=>{try{const r=await createWorkOrder(caseId);if(r.ok)router.push(`/dashboard/nalogi/${r.id}`);else setMessage(r.message)}catch{setMessage("Izid ni potrjen. Osvežite primer pred nadaljevanjem.")}finally{lock.current=false}})}}>{pending?"Ustvarjam nalog…":"Pretvori v delovni nalog"}</button>{message&&<p role="status">{message}</p>}</section>;
}
export function WorkOrderEditor({id,status,canClose}:{id:string;status:string;canClose:boolean}){
 const [next,setNext]=useState(""),[message,setMessage]=useState(""),[pending,start]=useTransition(),router=useRouter(),lock=useRef(false),command=useRef<string|null>(null);
 if(status==="closed")return <p className="rounded bg-green-50 p-4">Nalog je zaključen. Zapisov ne prepisujemo.</p>;
 return <form className="space-y-4 rounded-xl border bg-white p-4" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;command.current??=crypto.randomUUID();const f=new FormData(e.currentTarget);f.set("orderId",id);f.set("expectedStatus",status);f.set("commandId",command.current);start(async()=>{try{const r=await recordWorkOrder(f);if(r.ok){command.current=null;setMessage("Sprememba je shranjena.");router.refresh()}else setMessage(r.message)}catch{setMessage("Izid ni potrjen. Pred ponovitvijo preverite dnevnik.")}finally{lock.current=false}})}}>
 <h2 className="font-semibold">Potek dela in opomba</h2><label className="block text-sm">Naslednje stanje<select name="nextStatus" value={next} onChange={e=>setNext(e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">Samo dodaj opombo</option>{Object.entries(workOrderLabels).filter(([s])=>canTransitionWorkOrder(status,s)&&(s!=="closed"||canClose)).map(([s,l])=><option key={s} value={s}>{l}</option>)}</select></label>
 <label className="block text-sm">Opomba oziroma povzetek opravljenega dela<textarea name="note" required minLength={4} maxLength={4000} className="mt-1 w-full rounded border p-2" rows={4}/></label>
 {next==="closed"&&<fieldset className="space-y-3 rounded border p-3"><legend>Dejanski račun in prevzem</legend><p className="text-sm">Račun pripravite v Quibiju. Ta obrazec evidentira vašo ročno potrditev; računa ne ustvarja in ne potrjuje prek API-ja.</p><label className="block text-sm">Referenca dejanskega računa v Quibiju<input name="invoiceReference" required minLength={4} maxLength={200} className="mt-1 w-full rounded border p-2"/></label><label className="block text-sm">Referenca prevzema in urejenega plačila<input name="handoverReference" required minLength={4} maxLength={200} className="mt-1 w-full rounded border p-2"/></label><label className="flex gap-2 text-sm"><input type="checkbox" name="closeConfirmed" value="yes" required/>Račun sem dejansko preveril v Quibiju; prevzem in plačilo sta urejena. Potrjujem zaključek.</label></fieldset>}
 <button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{pending?"Shranjujem…":"Shrani v nalog"}</button>{message&&<p role="status">{message}</p>}
 </form>;
}
