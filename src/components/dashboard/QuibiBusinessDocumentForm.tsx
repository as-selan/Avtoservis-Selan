"use client";
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {prepareQuibiBusinessDocument,type BusinessPreparationResult} from '@/lib/quibi/business-document-actions';
import {businessFormStart,businessDispatchMayContinue} from '@/lib/quibi/business-form-state';
type Choice={id:string;label:string};
export function QuibiBusinessDocumentForm({orderId,caseId,status,choices,writeEnabled,customerId,references=[]}:{orderId:string;caseId?:string;customerId:string;status:string;choices:{numberings:Choice[];saleTypes:Choice[];units:Choice[];vat:Choice[]};writeEnabled:boolean;references?:{document_kind:string;quibi_document_id:string}[]}){
 const initial=businessFormStart(references);
 const [operation,setOperation]=useState(initial.operation),[dispatchStarted,setDispatchStarted]=useState(false);
 const [kind,setKind]=useState(initial.kind),[result,setResult]=useState<BusinessPreparationResult|null>(null),[pending,start]=useTransition(),lock=useRef(false),router=useRouter();
 if(status==='closed')return null;
 const labels={numberingId:'Številčenje',saleTypeId:'Vrsta prodaje'};
 const options={numberingId:choices.numberings.filter(n=>n.label.trim().toLocaleLowerCase('sl-SI')===(kind==='invoice'?'račun':'delovni nalog')),saleTypeId:choices.saleTypes};
 return <form className="space-y-3 rounded border bg-white p-4" onChange={e=>{if(!(e.target instanceof HTMLInputElement)||e.target.name!=="confirmed")setResult(null)}} onSubmit={e=>{
  e.preventDefault();if(lock.current||dispatchStarted)return;lock.current=true;
  const f=new FormData(e.currentTarget);f.set(caseId?'caseId':'orderId',caseId??orderId);f.set('operation',operation);const dispatch=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch')==='yes';
  if(dispatch){setDispatchStarted(true);f.set('dispatch','yes');f.set('expectedSha',result?.sha??'')}
  start(async()=>{try{const next=await prepareQuibiBusinessDocument(f);setResult(next);if(dispatch&&businessDispatchMayContinue(next))setDispatchStarted(false);router.refresh()}catch{setResult({ok:false,message:'Izid ni potrjen. Pred nadaljevanjem preverite dnevnik; ne ustvarjajte novega dokumenta.'})}finally{lock.current=false}});
 }}><h3 className="font-semibold">Poslovni dokument v Quibiju</h3>
 <label className="block text-sm">Operacija<select value={operation} onChange={e=>setOperation(e.target.value)} disabled={dispatchStarted} className="mt-1 w-full rounded border p-2"><option value="create">Ustvari nov dokument</option><option value="update" disabled={!references.some(r=>r.document_kind===kind)}>Posodobi povezani dokument iz odobrenega vira</option></select></label>
 {operation==='update'&&<p className="text-sm">Posodobitev dokumenta #{references.find(r=>r.document_kind===kind)?.quibi_document_id}. Vse postavke se prenesejo iz veljavnega odobrenega predračuna oziroma Quibi delovnega naloga. ID, stranka, vozilo in številčenje ostanejo isti. Prejšnja potrditev se ohrani v revizijski sledi.</p>}
 <p className="text-sm">Postavke se preberejo iz zadnjega odobrenega predračuna oziroma povezanega Quibi naloga. To ni lokalni poslovni dokument. Enota, DDV in popust vsake postavke se prenesejo iz Quibija in preverijo proti svežim šifrantom. Ponoven vnos ni potreben.</p>
 <Link className="text-sm text-blue-700" href={`/dashboard/stranke/${customerId}/quibi`}>Preglej izvirne dokumente te stranke →</Link>
 <label className="block text-sm">Vrsta dokumenta<select name="kind" value={kind} onChange={e=>{setKind(e.target.value);setOperation('create')}} disabled={dispatchStarted} className="mt-1 w-full rounded border p-2"><option value="work_order">Delovni nalog</option><option value="invoice" disabled={caseId?!references.some(r=>r.document_kind==='work_order'):status!=='ready_for_collection'}>Račun po opravljenem popravilu</option></select></label>
 {Object.entries(labels).map(([key,label])=><label key={key} className="block text-sm">{label}<select key={kind+key} name={key} required={key==='numberingId'&&options.numberingId.length!==1} defaultValue={key==='numberingId'&&options.numberingId.length===1?options.numberingId[0].id:''} className="mt-1 w-full rounded border p-2"><option value="">Uporabi preverjeni izvirni dokument</option>{options[key as keyof typeof options].map(n=><option key={n.id} value={n.id}>{n.label} · {n.id}</option>)}</select></label>)}
 {kind==='invoice'&&caseId&&<label className="flex gap-2 text-sm"><input name="repairCompleted" type="checkbox" required value="yes"/>Potrjujem, da je popravilo dejansko opravljeno in da so postavke Quibi naloga pripravljene za račun.</label>}
 {kind==='invoice'&&<label className="block text-sm">Dejanski datum opravljene storitve<input type="date" name="serviceDate" required className="mt-1 w-full rounded border p-2"/></label>}
 <label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" required={!!result?.sha} value="yes"/>Pregledal sem izvirni dokument, postavke, odobritev stranke, enoto in DDV. Potrjujem pripravo za ta servisni nalog.</label>
 <button disabled={pending||dispatchStarted} className="rounded border px-3 py-2 disabled:opacity-50">{pending?'Preverjam…':'Preglej pripravo dokumenta'}</button>
 {result?.sha&&<div className="space-y-2"><p>Vir: <Link className="text-blue-700" href={`/dashboard/stranke/${customerId}/quibi/dokumenti/${kind==='work_order'?'estimate':'work_order'}/${result.sourceId}`}>#{result.sourceId} · odpri izvirnik</Link> · znesek izvirnika {result.amount} EUR</p><div className="space-y-2">{result.lines?.map((line,index)=><div key={index} className="border-t pt-2"><p className="break-words">{line.description}</p><p>{line.quantity} {line.unit} · DDV {line.vat} · popust {line.discount} % · {Number(line.unitGrossPrice).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})} na enoto z DDV</p></div>)}{result.notes?.length?<p className="text-amber-800">Izvirne opombe: {result.notes.join(' · ')}. Ostanejo v izvornem Quibi dokumentu; niso obračunske postavke.</p>:null}</div><details className="text-xs"><summary>Podrobnosti preverjanja</summary><p className="break-all">Prstni odtis: {result.sha}</p></details><button data-dispatch="yes" disabled={pending||dispatchStarted||!writeEnabled} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{operation==='update'?'Posodobi v Quibiju in ponovno preveri':'Ustvari v Quibiju in ponovno preveri'}</button></div>}
 {!writeEnabled&&<p className="text-sm text-amber-800">Quibi WRITE je izključen. Za dejanski DEV preizkus sta potrebna ločena odobritev in konfiguracija; pravice še niso potrjene.</p>}
 {dispatchStarted&&<p className="text-sm">Zahtevek je bil sprožen enkrat. Preverite prikazani rezultat in povezani dokument. Ob neznanem izidu ponovitev ostaja ustavljena.</p>}
 {result&&<p role={result.ok?'status':'alert'} className="text-sm">{result.message}</p>}
 </form>;
}
