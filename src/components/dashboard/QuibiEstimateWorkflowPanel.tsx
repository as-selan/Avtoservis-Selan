"use client";
import {CasePrimaryAction} from './CasePrimaryAction';
import {sendPresentation} from "@/lib/quibi/send-outcome";
import {useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {approveAndSendQuibiEstimate,pollQuibiEstimateSend} from "@/lib/quibi/unified-actions";
type Props={serviceRequestId:string;quoteId:string;documentId:string;reviewStatus:string;sha256:string;
 sendEnabled?:boolean;allowedRecipients?:string[];amount?:string;lines:{description:string;quantity:string;grossPrice:string;unitGrossPrice?:string;pricingVerified?:boolean}[];recipient:string|null;dev:boolean;
 operationId?:string;attemptedAt?:string|null;operationState?:string;sendId?:string|null;sendStatus?:string|null;manualIdentityRequired:boolean;qaIdentityExceptionAvailable?:boolean;alreadyDelivered:boolean};
export function QuibiEstimateWorkflowPanel(p:Props){
 const router=useRouter(),lock=useRef(false),polling=useRef(false);
 const [pending,startTransition]=useTransition(),[attempted,setAttempted]=useState(false),[message,setMessage]=useState("");
 const [recipient,setRecipient]=useState(p.recipient??"");
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
 const sendAllowed=p.reviewStatus==="approved_for_send"&&p.sendEnabled===true&&!!p.recipient&&!!p.amount&&p.lines.length>0&&!p.operationState&&!attempted&&!p.alreadyDelivered;
 return <section className="space-y-3 border-t pt-3">
  <h3 className="font-medium">Predračun #{p.documentId}</h3>
  {p.dev&&<p className="text-sm text-amber-800">DEV uporablja samo dovoljen testni naslov. Dostava dejanski stranki se ne evidentira.</p>}
  {p.amount&&<p className="font-medium">Znesek: {Number(p.amount).toLocaleString("sl-SI",{style:"currency",currency:"EUR"})}</p>}
  <ul className="space-y-1 text-sm">{p.lines.map((line,i)=><li key={i}>{line.description} · količina {line.quantity} · cena na enoto z DDV {line.pricingVerified?line.unitGrossPrice:"ni preverljiva"}</li>)}</ul>
  <p className="text-sm">Predračun praviloma pošlji pred popravilom. Dejanska odobritev stranke je ločena in je lahko potrjena po telefonu; račun se pripravi šele po opravljenem popravilu.</p>
  <p className="text-sm">Prejemnik: {recipient??"pošiljanje ni konfigurirano ali naslov ni potrjen"}</p>
  {sendAllowed&&<form id={"send-estimate-"+p.serviceRequestId} className="space-y-3" onSubmit={e=>{
   e.preventDefault();if(lock.current)return;lock.current=true;setAttempted(true);
   const f=new FormData(e.currentTarget);f.set("serviceRequestId",p.serviceRequestId);f.set("quoteId",p.quoteId);
   f.set("reviewConfirmed","yes");f.set("recipient",recipient);f.set("displayedSha256",p.sha256);f.set("displayedAmount",p.amount!);
   startTransition(async()=>{try{const r=await approveAndSendQuibiEstimate(f);setMessage(r.ok?r.detail:r.message);if(r.ok)setStatus(r.status)}
    catch{setMessage("Izid ni znan. Ne ponavljajte pošiljanja; preverite dnevnik.")}finally{lock.current=false;router.refresh()}})
  }}>
   {p.manualIdentityRequired&&!p.qaIdentityExceptionAvailable&&<label className="block text-sm">Dokaz ujemanja vozila in storitve s tem primerom
    <textarea name="manualReference" required minLength={12} maxLength={1000} className="mt-1 block w-full rounded border px-3 py-2" />
   </label>}
   {p.manualIdentityRequired&&p.qaIdentityExceptionAvailable&&<label className="flex gap-2 text-sm text-amber-800"><input name="qaIdentityLimitationConfirmed" type="checkbox" value="yes" required />
    Izrecna QA izjema samo za sintetični lokalni DEV primer #9D40C42F, predračun #2176888, 122 EUR in online.gold100@gmail.com: API ne vrača ID-ja vozila. Povezava dokumenta z vozilom in storitvijo ni neodvisno dokazana. Potrjujem to omejitev; zapis ni dokaz ujemanja.
   </label>}
   {p.dev&&!!p.allowedRecipients?.length&&<label className="block text-sm">Dovoljeni testni prejemnik<select name="recipient" value={recipient} onChange={e=>{setRecipient(e.target.value)}} className="block w-full rounded border p-2">{p.allowedRecipients.map(email=><option key={email} value={email}>{email}</option>)}</select></label>}
   <CasePrimaryAction>   <button form={"send-estimate-"+p.serviceRequestId} disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
    {pending?"Preverjam in pošiljam…":"Pošlji predračun"}
   </button></CasePrimaryAction>
  </form>}
  {p.dev&&!p.sendEnabled&&<p className="text-sm">DEV: nova pošiljanja so izključena. Preverite dokument in prejemnika; stanje morebitnega prejšnjega poskusa je prikazano spodaj.</p>}
  {p.dev&&!sendAllowed&&!!p.allowedRecipients?.length&&<label className="block text-sm">Prejemnik za pregled<select value={recipient} onChange={e=>setRecipient(e.target.value)} className="block w-full rounded border p-2">{p.allowedRecipients.map(email=><option key={email} value={email}>{email}</option>)}</select></label>}
  {!sendAllowed&&!p.operationState&&!p.alreadyDelivered&&<p className="text-sm text-slate-600">Pošiljanje trenutno ni na voljo. Odobritev stranke lahko zabeležite ločeno.</p>}
  {p.operationState&&<p role="status" className="text-sm">{status==='failed'?'Pošiljanje ni uspelo.':status==='sent'?'Predračun je predan poštnemu strežniku; prejem še ni potrjen.':p.sendId?'Pošiljanje je v čakalni vrsti.':'Izid pošiljanja še ni potrjen. Ne pošiljajte ponovno.'}</p>}
  {p.operationState&&<details className="space-y-2 text-sm"><summary>Več podrobnosti pošiljanja</summary><p>{outcome.outcome}: {outcome.message}</p>
   <p>Čas poskusa (UTC): {p.attemptedAt??"ni zabeležen"}</p><p>Referenca dnevnika: {p.operationId}</p>
   {p.sendId&&<p>Quibi send_id: {p.sendId}</p>}
   <button type="button" disabled className="rounded border px-3 py-2">Ponovno pošiljanje ustavljeno</button>
  </details>}
  {p.sendId&&<button type="button" disabled={pending} onClick={()=>{void poll()}} className="rounded border px-3 py-2 text-sm">Preveri status</button>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>
}
