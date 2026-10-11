"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {prepareQuibiBusinessDocument,type BusinessPreparationResult} from '@/lib/quibi/business-document-actions';
type Choice={id:string;label:string};
export function QuibiBusinessDocumentForm({orderId,status,choices,writeEnabled,customerId,references=[]}:{orderId:string;customerId:string;status:string;choices:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vat:Choice[]};writeEnabled:boolean;references?:{document_kind:string;quibi_document_id:string}[]}){
 const [operation,setOperation]=useState('create'),[dispatchStarted,setDispatchStarted]=useState(false);
 const [kind,setKind]=useState('work_order'),[result,setResult]=useState<BusinessPreparationResult|null>(null),[pending,start]=useTransition(),lock=useRef(false),router=useRouter();
 if(status==='closed')return null;
 const labels={numberingId:'Številčenje',saleTypeId:'Vrsta prodaje'};
 const options={numberingId:choices.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')===(kind==='invoice'?'račun':'delovni nalog')),saleTypeId:choices.saleTypes};
 return <form className="space-y-3 rounded border bg-white p-4" onChange={()=>setResult(null)} onSubmit={e=>{
  e.preventDefault();if(lock.current||dispatchStarted)return;lock.current=true;
  const f=new FormData(e.currentTarget);f.set('orderId',orderId);f.set('operation',operation);const dispatch=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch')==='yes';
  if(dispatch){setDispatchStarted(true);f.set('dispatch','yes');f.set('expectedSha',result?.sha??'')}
  start(async()=>{try{setResult(await prepareQuibiBusinessDocument(f));router.refresh()}catch{setResult({ok:false,message:'Izid ni potrjen. Pred nadaljevanjem preverite dnevnik; ne ustvarjajte novega dokumenta.'})}finally{lock.current=false}});
 }}><h3 className="font-semibold">Poslovni dokument v Quibiju</h3>
 <label className="block text-sm">Operacija<select value={operation} onChange={e=>setOperation(e.target.value)} disabled={dispatchStarted} className="mt-1 w-full rounded border p-2"><option value="create">Ustvari nov dokument</option><option value="update" disabled={!references.some(r=>r.document_kind===kind)}>Posodobi povezani dokument iz odobrenega vira</option></select></label>
 {operation==='update'&&<p className="text-sm">Posodobitev dokumenta #{references.find(r=>r.document_kind===kind)?.quibi_document_id}. Vse postavke se prenesejo iz veljavnega odobrenega predračuna oziroma Quibi delovnega naloga. ID, stranka, vozilo in številčenje ostanejo isti. Prejšnja potrditev se ohrani v revizijski sledi.</p>}
 <p className="text-sm">Postavke se preberejo iz zadnjega odobrenega predračuna oziroma povezanega Quibi naloga. To ni lokalni poslovni dokument. Enota, DDV in popust vsake postavke se prenesejo iz Quibija in preverijo proti svežim šifrantom. Ponoven vnos ni potreben.</p>
 <Link className="text-sm text-blue-700" href={`/dashboard/stranke/${customerId}/quibi`}>Preglej izvirne dokumente te stranke →</Link>
 <label className="block text-sm">Vrsta dokumenta<select name="kind" value={kind} onChange={e=>{setKind(e.target.value);setOperation('create')}} disabled={dispatchStarted} className="mt-1 w-full rounded border p-2"><option value="work_order">Delovni nalog</option><option value="invoice" disabled={status!=='ready_for_collection'}>Račun po opravljenem popravilu</option></select></label>
 {Object.entries(labels).map(([key,label])=><label key={key} className="block text-sm">{label}<select name={key} required defaultValue="" className="mt-1 w-full rounded border p-2"><option value="">Izberite po pregledu izvirnega dokumenta</option>{options[key as keyof typeof options].map(n=><option key={n.id} value={n.id}>{n.label} · {n.id}</option>)}</select></label>)}
 {kind==='invoice'&&<label className="block text-sm">Dejanski datum opravljene storitve<input type="date" name="serviceDate" required className="mt-1 w-full rounded border p-2"/></label>}
 <label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" required value="yes"/>Pregledal sem izvirni dokument, postavke, odobritev stranke, enoto in DDV. Potrjujem pripravo za ta servisni nalog.</label>
 <button disabled={pending||dispatchStarted} className="rounded border px-3 py-2 disabled:opacity-50">{pending?'Preverjam…':'Preveri pripravo brez Quibi zapisa'}</button>
 {result?.sha&&<div className="space-y-2"><p>Vir: <Link className="text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/dokumenti/${kind==='work_order'?'estimate':'work_order'}/${result.sourceId}`}>#{result.sourceId} · odpri izvirnik</Link> · znesek izvirnika {result.amount} EUR</p><p className="break-all text-xs">SHA priprave: {result.sha}</p><button data-dispatch="yes" disabled={pending||dispatchStarted||!writeEnabled} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{operation==='update'?'Posodobi v Quibiju in ponovno preveri':'Ustvari v Quibiju in ponovno preveri'}</button></div>}
 {!writeEnabled&&<p className="text-sm text-amber-800">Quibi WRITE je izključen. Za dejanski DEV preizkus sta potrebna ločena odobritev in konfiguracija; pravice še niso potrjene.</p>}
 {dispatchStarted&&<p className="text-sm">Zapis je bil sprožen enkrat. Za nadaljnji pregled uporabite dokument in journal; ta obrazec ne ponavlja zahtevka.</p>}
 {result&&<p role={result.ok?'status':'alert'} className="text-sm">{result.message}</p>}
 </form>;
}
