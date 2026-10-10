"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {prepareQuibiBusinessDocument,type BusinessPreparationResult} from '@/lib/quibi/business-document-actions';
type Choice={id:string;label:string};
export function QuibiBusinessDocumentForm({orderId,status,choices,writeEnabled,customerId}:{orderId:string;customerId:string;status:string;choices:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vat:Choice[]};writeEnabled:boolean}){
 const [kind,setKind]=useState('work_order'),[result,setResult]=useState<BusinessPreparationResult|null>(null),[pending,start]=useTransition(),lock=useRef(false),router=useRouter();
 if(status==='closed')return null;
 const labels={numberingId:'Številčenje',saleTypeId:'Vrsta prodaje',unitId:'Enota izvirnih postavk',vatId:'DDV izvirnih postavk'};
 const options={numberingId:choices.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')===(kind==='invoice'?'račun':'delovni nalog')),saleTypeId:choices.saleTypes,unitId:choices.units,vatId:choices.vat};
 return <form className="space-y-3 rounded border bg-white p-4" onChange={()=>setResult(null)} onSubmit={e=>{
  e.preventDefault();if(lock.current)return;lock.current=true;
  const f=new FormData(e.currentTarget);f.set('orderId',orderId);const dispatch=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch')==='yes';
  if(dispatch){f.set('dispatch','yes');f.set('expectedSha',result?.sha??'')}
  start(async()=>{try{setResult(await prepareQuibiBusinessDocument(f));router.refresh()}catch{setResult({ok:false,message:'Izid ni potrjen. Pred nadaljevanjem preverite dnevnik; ne ustvarjajte novega dokumenta.'})}finally{lock.current=false}});
 }}><h3 className="font-semibold">Pripravi poslovni dokument v Quibiju</h3>
 <p className="text-sm">Postavke se preberejo iz zadnjega odobrenega predračuna oziroma povezanega Quibi naloga. To ni lokalni poslovni dokument. Prenos zahteva potrjene enote, DDV in postavke brez popusta.</p>
 <Link className="text-sm text-blue-700" href={`/dashboard/stranke/${customerId}/quibi`}>Preglej izvirne dokumente te stranke →</Link>
 <label className="block text-sm">Vrsta dokumenta<select name="kind" value={kind} onChange={e=>setKind(e.target.value)} className="mt-1 w-full rounded border p-2"><option value="work_order">Delovni nalog</option><option value="invoice" disabled={status!=='ready_for_collection'}>Račun po opravljenem popravilu</option></select></label>
 {Object.entries(labels).map(([key,label])=><label key={key} className="block text-sm">{label}<select name={key} required defaultValue="" className="mt-1 w-full rounded border p-2"><option value="">Izberite po pregledu izvirnega dokumenta</option>{options[key as keyof typeof options].map(n=><option key={n.id} value={n.id}>{n.label} · {n.id}</option>)}</select></label>)}
 {kind==='invoice'&&<label className="block text-sm">Dejanski datum opravljene storitve<input type="date" name="serviceDate" required className="mt-1 w-full rounded border p-2"/></label>}
 <label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" required value="yes"/>Pregledal sem izvirni dokument, postavke, odobritev stranke, enoto in DDV. Potrjujem pripravo za ta servisni nalog.</label>
 <button disabled={pending} className="rounded border px-3 py-2 disabled:opacity-50">{pending?'Preverjam…':'Preveri pripravo brez Quibi zapisa'}</button>
 {result?.sha&&<div className="space-y-2"><p>Vir: <Link className="text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/dokumenti/${kind==='work_order'?'estimate':'work_order'}/${result.sourceId}`}>#{result.sourceId} · odpri izvirnik</Link> · znesek izvirnika {result.amount} EUR</p><p className="break-all text-xs">SHA priprave: {result.sha}</p><button data-dispatch="yes" disabled={pending||!writeEnabled} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">Ustvari v Quibiju in ponovno preveri</button></div>}
 {!writeEnabled&&<p className="text-sm text-amber-800">Quibi WRITE je izključen. Za dejanski DEV preizkus sta potrebna ločena odobritev in konfiguracija; pravice še niso potrjene.</p>}
 {result&&<p role={result.ok?'status':'alert'} className="text-sm">{result.message}</p>}
 </form>;
}
