"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcileQuibiEstimate, prepareQuibiEstimateHistory, prepareQuibiEstimateRevision, prepareQuibiEstimate, checkQuibiDevTestEstimateStatus, createQuibiDevEstimate, sendQuibiDevTestEstimate, updateQuibiDevEstimate } from "@/lib/quibi/dev-write-actions";
import type { EstimateHistoryProposal } from '@/lib/quibi/estimate-history';
import type { EstimateCatalogOption } from '@/lib/quibi/estimate-catalog';
import type { EstimateReview } from '@/lib/quibi/estimate-preparation';
import type { CreatedEstimateSummary } from '@/lib/quibi/created-estimate-summary';
import type { QuibiChoice } from "@/lib/quibi/write-options";

export function QuibiDevWritePanel({ serviceRequestId, mode, quoteId, choices, sendStatus, sendId, operationState, lineDescription, catalogOptions=[], catalogIssues=[], initialCatalogSource, writeEnabled=true }: {
  serviceRequestId: string; mode: "prepare" | "create" | "update" | "send"; quoteId?: string;
  writeEnabled?:boolean;
  catalogOptions?:EstimateCatalogOption[];catalogIssues?:string[];initialCatalogSource?:string;
  lineDescription?: string;
  choices?: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[]; warehouses?: QuibiChoice[] };
  sendStatus?: string | null; sendId?: string | null; operationState?: string;
}) {
  const router = useRouter();
  const formElement=useRef<HTMLFormElement>(null),automaticPreparation=useRef('');
  const [revision,setRevision]=useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [catalogSource,setCatalogSource]=useState(initialCatalogSource??'');
  const selectedSource=catalogOptions.find(option=>option.key===catalogSource);
  const [history,setHistory]=useState<{proposals:EstimateHistoryProposal[];issues:string[]}>({proposals:[],issues:[]});
  const [historySource,setHistorySource]=useState('');
  const [historyPending,setHistoryPending]=useState(mode==='create'||mode==='prepare');
  const selectedHistory=history.proposals.find(p=>p.key===historySource&&p.ready);

  const [sourceSha,setSourceSha]=useState<string|null>(null);
  const [preparedSha, setPreparedSha] = useState<string | null>(null);
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [document, setDocument] = useState<CreatedEstimateSummary | null>(null);
  const money = (amount:number) => amount.toLocaleString('sl-SI',{style:'currency',currency:'EUR'});
  const [confirmed, setConfirmed] = useState(false);
  const [dispatchStarted, setDispatchStarted] = useState(false);
  const lock = useRef(false);
  const historyInterrupted=useRef(false),historyReading=useRef(mode==='create'||mode==='prepare');
  useEffect(()=>{
    if(mode!=='create'&&mode!=='prepare'||operationState==='failed')return;
    if(operationState==='uncertain'||operationState==='dispatching'){let active=true;void reconcileQuibiEstimate(serviceRequestId).then(result=>{if(active){setMessage(result.message);if(result.ok)router.refresh();}});return ()=>{active=false};}
    let active=true;
    historyInterrupted.current=false;historyReading.current=true;
    const form=new FormData();form.set('serviceRequestId',serviceRequestId);
    if(catalogSource){form.set('catalogSource',catalogSource);form.set('quantity','1');}
    void (async()=>{
      let proposals:EstimateHistoryProposal[]=[],issues:string[]=[],scope='vehicle',offset=0,hasVehicleMatch=false;
      while(active&&!historyInterrupted.current){
        form.set('historyScope',scope);form.set('historyOffset',String(offset));
        const result=await prepareQuibiEstimateHistory(form);if(!active||historyInterrupted.current)return;
        proposals=[...new Map([...proposals,...result.proposals].map(p=>[p.key,p])).values()];issues=[...new Set([...issues,...result.issues])];
        hasVehicleMatch=proposals.some(p=>p.ready&&p.scope==='vehicle');
        setHistory({proposals,issues});
        if(!('nextPage' in result)||!result.nextPage||(result.nextPage.scope==='other'&&hasVehicleMatch))break;
        scope=result.nextPage.scope;offset=result.nextPage.offset;
      }
      if(active){const reliable=proposals.filter(p=>p.ready&&p.scope==='vehicle');const automatic=reliable.length===1&&!issues.some(i=>i.includes('ni popoln')||i.includes('največ pet'))?reliable[0].key:'';setHistorySource(automatic);if(automatic){setPreparedSha(null);setSourceSha(null);setReview(null);setConfirmed(false);}}
    })().catch(()=>{if(active)setHistory({proposals:[],issues:['Zgodovine trenutno ni mogoče preveriti.']});}).finally(()=>{if(active){historyReading.current=false;setHistoryPending(false)}});
    return ()=>{active=false};
  },[serviceRequestId,mode,catalogSource,operationState,router]);
  useEffect(()=>{
    if(!['prepare','create'].includes(mode)||historyPending||historyReading.current||!formElement.current||(!selectedSource&&!selectedHistory)||operationState==='failed'||operationState==='uncertain'||operationState==='dispatching'||dispatchStarted||lock.current)return;
    const data=new FormData(formElement.current);data.delete('createConfirmed');data.delete('serviceMatchConfirmed');
    if(!choices?.saleTypes.some(s=>s.id===data.get('saleTypeId')))return;
    const signature=JSON.stringify({fields:[...data.entries()],catalogSha:selectedSource?.sourceSha,historySha:selectedHistory?.sourceSha});if(automaticPreparation.current===signature)return;
    automaticPreparation.current=signature;lock.current=true;data.set('serviceRequestId',serviceRequestId);
    // READ preview only. CREATE is exclusively the explicitly confirmed submit action.
    startTransition(async()=>{try{const result=await prepareQuibiEstimate(data);setMessage(result.ok?result.detail:result.message);setPreparedSha(result.ok?result.sha??null:null);setSourceSha(result.ok?result.sourceSha??null:null);setReview(result.ok?result.review??null:null);setConfirmed(false)}catch{setMessage('Priprave ni mogoče preveriti. Poskusite ponovno pregledati predračun.')}finally{lock.current=false}});
  },[mode,serviceRequestId,historyPending,historySource,catalogSource,revision,operationState,dispatchStarted,selectedSource,selectedHistory,choices]);
  if((mode==='create'||mode==='prepare')&&operationState==='failed')return <section className="space-y-2 rounded border border-red-300 p-3"><p role="alert">Quibi je dokončno zavrnil ustvarjanje predračuna. Dokument ni potrjeno ustvarjen. Ta poskus je zaklenjen; samodejne ponovitve ni.</p><p>Pred nadaljevanjem mora skrbnik preveriti razlog zavrnitve pri Quibiju. Ne ustvarjajte drugega dokumenta brez preverjenega nadaljevanja.</p></section>;
  if((mode==='create'||mode==='prepare')&&(operationState==='uncertain'||operationState==='dispatching'))return <section className="space-y-2 rounded border border-amber-300 p-3"><p>Izid ustvarjanja zahteva preverjanje. Novega predračuna ne ustvarjajte.</p><button disabled={pending} className="rounded border px-3 py-2" onClick={()=>startTransition(async()=>{const result=await reconcileQuibiEstimate(serviceRequestId);setMessage(result.message);if(result.ok)router.refresh()})}>{pending?'Preverjam Quibi…':'Preveri obstoječi dokument brez novega CREATE'}</button>{message&&<p role="status">{message}</p>}</section>;
  if ((mode === "create" || mode === "prepare") && (!choices?.saleTypes.length || !choices.units.length || !choices.vatRates.length))
    return <p role="alert" className="text-sm text-amber-800">Quibijevi šifranti niso na voljo; ustvarjanje je ustavljeno.</p>;
  return <form ref={formElement} className="space-y-3 border-t pt-3" onChange={event => {if (!(event.target instanceof HTMLInputElement) || !["createConfirmed","updateConfirmed","serviceMatchConfirmed"].includes(event.target.name)) {setPreparedSha(null);setSourceSha(null);setReview(null);setConfirmed(false);setRevision(v=>v+1)}}} onSubmit={(event) => {
    event.preventDefault();
    if (lock.current || pending || (historyPending&&!selectedSource&&!selectedHistory) || (mode === "send" && operationState && !sendId && operationState !== "prepared")) return;
    const form = new FormData(event.currentTarget);
    form.set("serviceRequestId", serviceRequestId);
    if (quoteId) form.set("quoteId", quoteId);
    const dispatch = (mode === "create" || mode === "update") && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch') === 'yes';
    if (dispatch && (!writeEnabled || !preparedSha || dispatchStarted || form.get(mode==='update'?'updateConfirmed':'createConfirmed') !== 'yes')) {setMessage('Preglejte postavko in potrdite ustvarjanje predračuna.');return;}
    if(dispatch&&mode==='create'&&form.get('createConfirmed')==='yes')form.set('serviceMatchConfirmed','yes');
    if (dispatch) {form.set('expectedSha', preparedSha!);if(sourceSha)form.set('expectedSourceSha',sourceSha);setDispatchStarted(true)}
    historyInterrupted.current=true;
    lock.current = true;
    startTransition(async () => {
      try { const result = mode==="update"&&!dispatch?await prepareQuibiEstimateRevision(form):(mode === "prepare" || (mode === "create" && !dispatch)) ? await prepareQuibiEstimate(form) : mode === "create" ? await createQuibiDevEstimate(form)
        : mode === "update" ? await updateQuibiDevEstimate(form) : sendId ? await checkQuibiDevTestEstimateStatus(form) : await sendQuibiDevTestEstimate(form);
      setMessage(result.ok ? result.detail : result.message);
      if(result.ok && result.document) setDocument(result.document);
      if(!dispatch) {setSourceSha(result.ok?result.sourceSha??null:null);setReview(result.ok ? result.review ?? null : null);setConfirmed(false);}
      if (!dispatch && (mode === "create" || mode === "prepare" || mode === "update")) setPreparedSha(result.ok ? result.sha ?? null : null);
      router.refresh();
      } catch {setMessage("Izid ni potrjen. Preverite dnevnik; pošiljanja ali ustvarjanja ne ponavljajte.")} finally {lock.current = false}
    });
  }}><fieldset disabled={pending} className="space-y-3">
    {document && <section role="status" className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
      <p className="font-semibold">Quibi predračun #{document.id}{document.number ? ` · ${document.number}` : ''}</p>
      <p>Znesek po Quibiju: {money(Number(document.amount.replace(',', '.')))}</p>
      <a className="block text-blue-700 underline" href={`/dashboard/stranke/${document.customerId}/quibi/predracuni/${document.id}`}>Odpri predračun</a>
      <a className="block text-blue-700 underline" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${document.customerId}/estimate/${document.id}/pdf`}>Odpri PDF iz Quibija</a>
      {!document.linked && <p role="alert">Povezava s primerom zahteva pregled. Ne ustvarjajte drugega predračuna.</p>}
      <p>Dokument ni poslan. Pošiljanje zahteva ločeno odobritev.</p>
    </section>}
    <h3 className="font-medium">{mode === "prepare" ? "Pripravi ponudbo za popravilo" : mode === "create" ? "Ustvari predračun v Quibiju" :
      mode === "update" ? "Popravi zavrnjeni Quibi predračun" : "Pošlji predračun samo na testni naslov"}</h3>
    {(mode === "create" || mode === "prepare") && <>
      {catalogIssues.map(issue=><p key={issue} role="alert" className="text-sm text-amber-800">{issue}</p>)}
      <label className="block text-sm">Postavka iz Quibija
        <select name="catalogSource" value={catalogSource} onChange={event=>{setCatalogSource(event.target.value);setHistorySource('');setHistory({proposals:[],issues:[]});setHistoryPending(true)}} className="mt-1 block w-full rounded border px-3 py-2">
          <option value="">{catalogOptions.length?'Izberite storitev ali dopolnite manjkajočo postavko spodaj':'Šifrant ni na voljo; dopolnite postavko za pregled'}</option>
          {catalogOptions.map(option=><option key={option.key} value={option.key}>{option.name} · {option.code} · {option.priceListDiffers?'osnovna cena artikla':option.priceListName}</option>)}
        </select>
      </label>
      <section aria-label="Predlog iz Quibijeve zgodovine" className="space-y-2 rounded border p-3 text-sm">
        <p className="font-medium">Predlog iz zgodovine popravil</p>
        {historyPending?<p role="status">Preverjam Quibijeve dokumente in aktualne cene…</p>:<>
          {history.issues.map(issue=><p key={issue} className="text-amber-800">{issue}</p>)}
          <label className="block">Pripravljene postavke<select name="historySource" value={historySource} onChange={e=>setHistorySource(e.target.value)} className="mt-1 block w-full rounded border p-2">
            <option value="">{history.proposals.length?'Izberite predlog ali uporabite postavko iz cenika':'Natančnega ujemanja storitve ni v pregledanih dokumentih'}</option>
            {history.proposals.map(p=><option key={p.key} value={p.key} disabled={!p.ready}>{p.kind==='work_order'?'Delovni nalog':p.kind==='invoice'?'Račun':'Predračun'} #{p.documentId} · {p.date} · {p.scope==='vehicle'?'isto vozilo':'drug dokument – potreben pregled'}{!p.ready?' · nepopolne cene ali DDV':''}</option>)}
          </select></label>
          {history.proposals.filter(p=>!p.ready).map(p=><p key={p.key}>Dokument #{p.documentId}: {p.issues.join(' ')}</p>)}
          {selectedHistory&&<div className="space-y-2">
            <p>Vir: Quibi dokument #{selectedHistory.documentId}, {selectedHistory.date}. {selectedHistory.scope==='other'?'Predloga ni mogoče predstavljati kot popravilo tega vozila.':''}</p>
            {selectedHistory.lines.map((line,index)=><div key={index} className="border-t pt-2"><p className="break-words">{line.description} · {line.articleCode}</p><p>{line.quantity} {line.unit} · aktualni DDV {line.vat}</p><p>Prejšnja cena na enoto z DDV: {money(Number(line.previousPrice))} · prejšnji popust {line.previousDiscount} % · prejšnji DDV {line.historicalVat}</p><p>Aktualna cena na enoto: {money(line.currentPrice)} · aktualni popust {line.discount} %</p></div>)}
            <p>Predlagano skupaj: {money(selectedHistory.total)}. Preglejte, ali so vse izvorne postavke potrebne za to popravilo. Vse postavke se ponovno preverijo pred ustvarjanjem.</p>
          </div>}
        </>}
      </section>
      {selectedSource && !selectedHistory && <div className="space-y-2 rounded border bg-blue-50 p-3 text-sm">
        <p>{selectedSource.name} · šifra {selectedSource.code}</p>
        <p>Quibi: {money(selectedSource.grossPrice)} na {selectedSource.unitLabel} z DDV {selectedSource.vatLabel} · popust {selectedSource.discount} %</p>
        {selectedSource.priceListDiffers && <p className="text-amber-800">Cenik {selectedSource.priceListName}: {money(Number(selectedSource.priceListNetPrice))} brez DDV, popust {selectedSource.priceListDiscount} %. Strežnik pri pregledu ponudbe preveri, ali je cenik dodeljen tej stranki. Ne uporabljajte posebne cene brez potrjene dodelitve.</p>}
        <p>Pred potrditvijo strežnik ponovno prebere stranko, artikel in cenik. Veljavna cena je prikazana v pregledu ponudbe.</p>
        <label className="block">Količina<input name="quantity" type="number" defaultValue="1" min="0.001" max="100000" step="0.001" required className="mt-1 block w-full rounded border px-3 py-2"/></label>
        <input type="hidden" name="unitId" value={selectedSource.unitId}/><input type="hidden" name="vatId" value={selectedSource.vatId}/>
        <input type="hidden" name="unitPrice" value={selectedSource.grossPrice}/>
      </div>}
      {selectedSource && selectedHistory && <><input type="hidden" name="quantity" value="1"/><input type="hidden" name="unitPrice" value={selectedSource.grossPrice}/></>}
      {lineDescription && !selectedSource && <p className="text-sm">Postavka za pregled: {lineDescription}</p>}
      <p className="text-xs text-amber-800">{mode === "prepare" ? "Priprava uporablja samo Quibi READ; dokumenta ne ustvari in ničesar ne pošlje." : "To ustvari dejanski dokument v konfiguriranem Quibi okolju."} {mode === "prepare" ? "Payload in SHA sta samo za pregled in nista shranjen poslovni dokument. Pred ustvarjanjem bo izvedeno novo preverjanje." : "Ponavljanje uporabi isti shranjeni zahtevek. Quibi bo po ustvaritvi ponovno prebran; ceno mora nato potrditi Tadej."}</p>
      <label className="block text-sm">Vrsta prodaje
        <select key={historySource} defaultValue={selectedHistory?.saleTypeId&&choices?.saleTypes.some(s=>s.id===selectedHistory.saleTypeId)?selectedHistory.saleTypeId:choices?.saleTypes.length===1?choices.saleTypes[0].id:''} name="saleTypeId" required className="mt-1 block w-full rounded border px-3 py-2">
          <option value="">Izberite vrsto prodaje, če je vir ne določa</option>{choices?.saleTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {!!choices?.warehouses?.length&&<label className="block text-sm">Skladišče v Quibiju<select name="warehouseId" defaultValue={choices.warehouses.length===1?choices.warehouses[0].id:''} required className="mt-1 block w-full rounded border px-3 py-2"><option value="">Izberite skladišče</option>{choices.warehouses.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>}
      {selectedHistory?<><input type="hidden" name="unitId" value={choices?.units.find(u=>u.label===selectedHistory.reviewedLines[0]?.unit)?.id??''}/><input type="hidden" name="vatId" value={selectedHistory.payloadLines[0]?.ddv_id??''}/></>:<div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">Enota
          <select key={`unit-${selectedSource?.key??'manual'}`} defaultValue={selectedSource?.unitId??''} name="unitId" disabled={!!selectedSource&&!selectedHistory} required className="mt-1 block w-full rounded border px-3 py-2">
            <option value="">Izberite enoto</option>{choices?.units.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">DDV
          <select key={`vat-${selectedSource?.key??'manual'}`} defaultValue={selectedSource?.vatId??''} name="vatId" disabled={!!selectedSource} required className="mt-1 block w-full rounded border px-3 py-2">
            <option value="">Izberite preverjeni DDV</option>{choices?.vatRates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>}
    </>}
    {(mode === "prepare" || mode === "create" || mode === "update") && <>
      {!selectedSource && !selectedHistory && <label className="block text-sm">Cena za eno storitev z DDV (€)
        <input name="unitPrice" type="number" min="0.01" max="1000000" step="0.01" required
          className="mt-1 block w-full rounded border px-3 py-2" />
      </label>}
      {mode==='update'&&<label className="flex gap-2 text-sm"><input name="serviceMatchConfirmed" type="checkbox" value="yes" required={!!preparedSha} />
        Preveril sem, da storitev, stranka, vozilo in predračun pripadajo temu primeru.
      </label>}
    </>}
    {mode === "send" && <>
      <p className="text-xs text-amber-800">Prejemnik je izključno dovoljen testni naslov. To ni dostava stranki. Status »sent« pomeni predajo poštnemu strežniku, ne prejema ali branja.</p>
      {sendStatus && <p className="text-sm">Zadnji status testnega pošiljanja: {sendStatus}</p>}
      <label className="flex gap-2 text-sm"><input name="testSendConfirmed" type="checkbox" value="yes" required={!sendId} />
        Potrjujem pošiljanje samo na konfiguriran testni naslov.
      </label>
    </>}
    <button disabled={pending || (historyPending&&!selectedSource&&!selectedHistory) || (mode === "send" && !!operationState && !sendId && operationState !== "prepared")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
      {pending ? "Preverjam…" : mode === "prepare" ? "Preglej ponudbo" : mode === "create" ? "Preglej ponudbo" : mode === "update" ? "Preglej popravek" : sendId ? "Preveri status brez ponovnega pošiljanja" : "Pošlji testno"}
    </button>
    {(mode === "create" || mode === "prepare" || mode === "update") && preparedSha && <div className="space-y-2">
      {review && <section aria-label="Pregled ponudbe pred ustvarjanjem" className="space-y-2 rounded border bg-slate-50 p-3 text-sm">
        <p>Quibi stranka #{review.customerId} · vozilo #{review.vehicleId}</p>
        <p>{review.numbering} · {review.saleType}</p>{review.pricingSource&&<p>{review.pricingSource}</p>}
        {review.lines.map((line,index)=><div key={index} className="space-y-1 border-t pt-2">
          <p className="whitespace-pre-wrap break-words font-medium">{line.description}</p>
          <p>Količina: {line.quantity} {line.unit} · DDV: {line.vat} · popust: {line.discount} %</p>
          <p>Cena na enoto z DDV: {money(line.unitPrice)}</p>
        </div>)}
        <p className="font-semibold">Skupaj z DDV: {money(review.total)}</p>
      </section>}
      <details className="text-xs"><summary>Podrobnosti preverjanja</summary><p className="break-all">Prstni odtis: {preparedSha}</p></details>
      <label className="flex gap-2 text-sm"><input name={mode==="update"?"updateConfirmed":"createConfirmed"} type="checkbox" value="yes" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={dispatchStarted||mode==="prepare"||!writeEnabled}/>Potrjujem {mode==="update"?"posodobitev":"ustvarjanje"} pregledanega predračuna v Quibi DEV za prikazano stranko, vozilo in storitev tega primera.</label>
      <button data-dispatch="yes" disabled={pending || dispatchStarted || !confirmed || mode==="prepare" || !writeEnabled} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{mode==='prepare'||!writeEnabled?'Zapis čaka na odobreno aktivacijo DEV WRITE':dispatchStarted ? 'Dispatch sprožen; pred nadaljevanjem preverite dnevnik' : mode==='update'?'Posodobi pregledani predračun v Quibiju':'Ustvari pregledani predračun v Quibiju'}</button>
    </div>}
    {message && <p role={message.startsWith("Priprava preverjena") || message.startsWith("Quibi DEV") || message.startsWith("Quibi je") ? "status" : "alert"} className="whitespace-pre-wrap break-all text-sm">{message.split("\n")[0]}</p>}
    {message.includes("\n") && <details className="text-xs"><summary>Podrobnosti priprave za pregled</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">{message.slice(message.indexOf("\n")+1)}</pre></details>}
  </fieldset></form>;
}
