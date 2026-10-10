"use client";
import {sendPresentation} from "@/lib/quibi/send-outcome";
import {useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {approveAndSendQuibiEstimate,pollQuibiEstimateSend} from "@/lib/quibi/unified-actions";
import {reviewManualQuibiEstimate} from "@/lib/quibi/manual-estimate-action";
type Props={serviceRequestId:string;quoteId:string;documentId:string;reviewStatus:string;sha256:string;
 amount?:string;lines:{description:string;quantity:string;grossPrice:string}[];recipient:string|null;dev:boolean;
 operationId?:string;attemptedAt?:string|null;operationState?:string;sendId?:string|null;sendStatus?:string|null;manualIdentityRequired:boolean;qaIdentityExceptionAvailable?:boolean;alreadyDelivered:boolean};
export function QuibiEstimateWorkflowPanel(p:Props){
 const router=useRouter(),lock=useRef(false),polling=useRef(false);
 const [pending,startTransition]=useTransition(),[attempted,setAttempted]=useState(false),[message,setMessage]=useState("");
 const [status,setStatus]=useState(p.sendStatus),[pollCount,setPollCount]=useState(0);
 const formIds=()=>{const f=new FormData();f.set("serviceRequestId",p.serviceRequestId);f.set("quoteId",p.quoteId);return f};
 async function poll(){
  if(polling.current)return;polling.current=true;
  try{const r=await pollQuibiEstimateSend(formIds());setMessage(r.ok?r.detail:r.message);if(r.ok)setStatus(r.status);router.refresh()}
  catch{setMessage("Status ni znan. Pošiljanja ne ponavljajte.")}
  finally{polling.current=false;setPollCount(n=>n+1)}
 }
 // Status polling is read-only at Quibi. It never invokes the send action.
 useEffect(()=>{
  if(!p.sendId||status==="sent"||status==="failed"||pollCount>=6)return;
  const timer=setTimeout(()=>{void poll()},5000);return()=>clearTimeout(timer);
 // poll uses immutable scope props; counter provides bounded polling without a resend effect.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[p.sendId,status,pollCount,p.serviceRequestId,p.quoteId]);
 const outcome=sendPresentation(p.operationState?{state:p.operationState,sendId:p.sendId??null,sendStatus:status??null}:null);
 const sendAllowed=!!p.recipient&&!!p.amount&&p.lines.length>0&&!p.operationState&&!attempted&&!p.alreadyDelivered;
 return <section className="space-y-3 border-t pt-3">
  <h3 className="font-medium">Predračun #{p.documentId}</h3>
  {p.dev&&<p className="text-sm text-amber-800">DEV: isti postopek pošlje samo na testni naslov. Stranki se ne pošlje in dostava stranki se ne evidentira.</p>}
  {p.amount&&<p className="font-medium">Znesek: {Number(p.amount).toLocaleString("sl-SI",{style:"currency",currency:"EUR"})}</p>}
  <ul className="space-y-1 text-sm">{p.lines.map((line,i)=><li key={i}>{line.description} · količina {line.quantity} · cena {line.grossPrice} €</li>)}</ul>
  <p className="text-sm">Prejemnik: {p.recipient??"pošiljanje ni konfigurirano ali naslov ni potrjen"}</p>
  {sendAllowed&&<form className="space-y-3" onSubmit={e=>{
   e.preventDefault();if(lock.current)return;lock.current=true;setAttempted(true);
   const f=new FormData(e.currentTarget);f.set("serviceRequestId",p.serviceRequestId);f.set("quoteId",p.quoteId);
   f.set("displayedSha256",p.sha256);f.set("displayedAmount",p.amount!);
   startTransition(async()=>{try{const r=await approveAndSendQuibiEstimate(f);setMessage(r.ok?r.detail:r.message);if(r.ok)setStatus(r.status)}
    catch{setMessage("Izid ni znan. Ne ponavljajte pošiljanja; preverite dnevnik.")}finally{lock.current=false;router.refresh()}})
  }}>
   {p.manualIdentityRequired&&!p.qaIdentityExceptionAvailable&&<label className="block text-sm">Dokaz ujemanja vozila in storitve s tem primerom
    <textarea name="manualReference" required minLength={12} maxLength={1000} className="mt-1 block w-full rounded border px-3 py-2" />
   </label>}
   {p.manualIdentityRequired&&p.qaIdentityExceptionAvailable&&<label className="flex gap-2 text-sm text-amber-800"><input name="qaIdentityLimitationConfirmed" type="checkbox" value="yes" required />
    Izrecna QA izjema samo za sintetični lokalni DEV primer #9D40C42F, predračun #2176888, 122 EUR in online.gold100@gmail.com: API ne vrača ID-ja vozila. Povezava dokumenta z vozilom in storitvijo ni neodvisno dokazana. Potrjujem to omejitev; zapis ni dokaz ujemanja.
   </label>}
   <label className="flex gap-2 text-sm"><input name="reviewConfirmed" type="checkbox" value="yes" required />
    Pregledal sem postavke, znesek, stranko, vozilo in storitev. Potrjujem enkratno pošiljanje na prikazani naslov.
   </label>
   <button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
    {pending?"Preverjam in pošiljam…":p.reviewStatus==="approved_for_send"?"Pošlji stranki":"Odobri in pošlji stranki"}
   </button>
  </form>}
  {!sendAllowed&&!p.operationState&&!p.alreadyDelivered&&<p className="text-sm text-amber-800">Za pošiljanje sta potrebna potrjena vsebina in varna konfiguracija. Ob neznanem izidu preverite dnevnik.</p>}
  {p.reviewStatus==="unreviewed"&&!p.operationState&&<button type="button" disabled={pending} className="rounded border px-3 py-2 text-sm" onClick={()=>startTransition(async()=>{const r=await reviewManualQuibiEstimate(p.quoteId,"reject");setMessage(r.ok?"Predračun je zavrnjen za popravek.":r.message);router.refresh()})}>Zavrni za popravek</button>}
  {p.operationState&&<div role="status" className="space-y-2 text-sm"><p>{outcome.outcome}: {outcome.message}</p>
   <p>Čas poskusa (UTC): {p.attemptedAt??"ni zabeležen"}</p><p>Referenca dnevnika: {p.operationId}</p>
   {p.sendId&&<p>Quibi send_id: {p.sendId}</p>}
   <button type="button" disabled className="rounded border px-3 py-2">Ponovno pošiljanje ustavljeno</button>
  </div>}
  {p.sendId&&<button type="button" disabled={pending} onClick={()=>{void poll()}} className="rounded border px-3 py-2 text-sm">Preveri status</button>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>
}
