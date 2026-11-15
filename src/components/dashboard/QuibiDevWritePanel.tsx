"use client";
import {EstimateComposer} from './EstimateComposer';
import {inspectionCatalogSuggestions} from '@/lib/quibi/inspection-catalog';

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcileQuibiEstimate, prepareQuibiEstimateHistory, prepareQuibiEstimateRevision, prepareQuibiEstimate, checkQuibiDevTestEstimateStatus, createQuibiDevEstimate, sendQuibiDevTestEstimate, updateQuibiDevEstimate } from "@/lib/quibi/dev-write-actions";
import type { EstimateHistoryProposal } from '@/lib/quibi/estimate-history';
import type { EstimateCatalogOption } from '@/lib/quibi/estimate-catalog';
import type { EstimateReview } from '@/lib/quibi/estimate-preparation';
import type { CreatedEstimateSummary } from '@/lib/quibi/created-estimate-summary';
import type { QuibiChoice } from "@/lib/quibi/write-options";

function LegacyQuibiDevWritePanel({ serviceRequestId, mode, quoteId, choices, sendStatus, sendId, operationState, lineDescription, catalogOptions=[], catalogIssues=[], initialCatalogSource, inspectionFindings, aiEstimateLines=[], writeEnabled=true }: {
  serviceRequestId: string; mode: "prepare" | "create" | "update" | "send"; quoteId?: string;
  offerPrepared?:boolean;customerPriceListId?:string|null;writeEnabled?:boolean; inspectionFindings?:string|null; aiEstimateLines?:Array<{key:string;quantity:number|null}>;
  catalogOptions?:EstimateCatalogOption[];catalogIssues?:string[];initialCatalogSource?:string;requestedService?:string|null;requestDescription?:string|null;aiServiceMatches?:import("@/lib/assistance/intake-analysis").IntakeServiceMatch[];
  lineDescription?: string;
  choices?: { saleTypes: QuibiChoice[]; units: QuibiChoice[]; vatRates: QuibiChoice[]; warehouses?: QuibiChoice[] };
  sendStatus?: string | null; sendId?: string | null; operationState?: string;
}) {
  const router = useRouter();
  const inspectionSuggestions=inspectionCatalogSuggestions(inspectionFindings,catalogOptions);
  const createLocked = (mode === 'create' || mode === 'prepare') && ['failed','uncertain','dispatching','verified'].includes(operationState ?? '');
  const formElement=useRef<HTMLFormElement>(null),automaticPreparation=useRef(''),manualCatalogChoice=useRef(false);
  const [revision,setRevision]=useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [catalogSource,setCatalogSource]=useState(initialCatalogSource??'');
  const selectedSource=catalogOptions.find(option=>option.key===catalogSource);
  const [history,setHistory]=useState<{proposals:EstimateHistoryProposal[];issues:string[]}>({proposals:[],issues:[]});
  const [historySource,setHistorySource]=useState('');
  const [historyPending,setHistoryPending]=useState(!aiEstimateLines.length&&(mode==='create'||mode==='prepare'));
  const selectedHistory=history.proposals.find(p=>p.key===historySource&&p.ready);

  const [sourceSha,setSourceSha]=useState<string|null>(null);
  const [preparedSha, setPreparedSha] = useState<string | null>(null);
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [document, setDocument] = useState<CreatedEstimateSummary | null>(null);
  const money = (amount:number) => amount.toLocaleString('sl-SI',{style:'currency',currency:'EUR'});
  const [confirmed, setConfirmed] = useState(false);
  const [dispatchStarted, setDispatchStarted] = useState(false);
  const lock = useRef(false);
  const historyInterrupted=useRef(false),historyReading=useRef(!aiEstimateLines.length&&(mode==='create'||mode==='prepare'));
  const [rows,setRows]=useState<Array<{key:string;quantity:string;discount:string}>|null>(aiEstimateLines.length?aiEstimateLines.map(line=>({key:line.key,quantity:line.quantity===null?'':String(line.quantity),discount:''})):null);
  function changeRows(next:NonNullable<typeof rows>){historyInterrupted.current=true;historyReading.current=false;manualCatalogChoice.current=true;setHistoryPending(false);setRows(next);setHistorySource('');setPreparedSha(null);setSourceSha(null);setReview(null);setConfirmed(false);setRevision(v=>v+1)}
  function addRow(){const existing=rows??(selectedHistory?selectedHistory.reviewedLines.map((line,i)=>({key:catalogOptions.find(o=>o.code===('sifra' in selectedHistory.payloadLines[i]?selectedHistory.payloadLines[i].sifra:''))?.key??'',quantity:String(line.quantity),discount:String(line.discount)})):selectedSource?[{key:selectedSource.key,quantity:String(new FormData(formElement.current!).get('quantity')??'1'),discount:''}]:[]);changeRows([...existing,{key:'',quantity:'1',discount:''}])}
  useEffect(()=>{
    if(mode!=='create'&&mode!=='prepare')return;
    if(rows!==null)return;
    if(manualCatalogChoice.current && catalogSource){historyInterrupted.current=true;historyReading.current=false;setHistoryPending(false);return;}
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
  },[serviceRequestId,mode,catalogSource,operationState,router,rows]);
  useEffect(()=>{
    if(!['prepare','create'].includes(mode)||historyPending||historyReading.current||!formElement.current||(!selectedSource&&!selectedHistory&&!rows?.length)||dispatchStarted||lock.current)return;
    // Honor the same required fields as manual submit before starting a background READ.
    if(!formElement.current.checkValidity())return;
    const data=new FormData(formElement.current);data.delete('createConfirmed');data.delete('serviceMatchConfirmed');
    if(!choices?.saleTypes.some(s=>s.id===data.get('saleTypeId')))return;
    const signature=JSON.stringify({fields:[...data.entries()],catalogSha:selectedSource?.sourceSha,historySha:selectedHistory?.sourceSha});if(automaticPreparation.current===signature)return;
    automaticPreparation.current=signature;lock.current=true;data.set('serviceRequestId',serviceRequestId);
    // READ preview only. CREATE is exclusively the explicitly confirmed submit action.
    startTransition(async()=>{try{const result=await prepareQuibiEstimate(data);setMessage(result.ok?result.detail:result.message);setPreparedSha(result.ok?result.sha??null:null);setSourceSha(result.ok?result.sourceSha??null:null);setReview(result.ok?result.review??null:null);setConfirmed(false)}catch{setMessage('Priprave ni mogoče preveriti. Poskusite ponovno pregledati predračun.')}finally{lock.current=false}});
  },[mode,serviceRequestId,historyPending,historySource,catalogSource,revision,operationState,dispatchStarted,selectedSource,selectedHistory,choices,rows]);
  if ((mode === "create" || mode === "prepare") && (!choices?.saleTypes.length || !choices.units.length || !choices.vatRates.length))
    return <p role="alert" className="text-sm text-amber-800">Quibijevi šifranti niso na voljo; ustvarjanje je ustavljeno.</p>;
  return <form ref={formElement} className="space-y-3 border-t pt-3" onChange={event => {if (!(event.target instanceof HTMLInputElement) || !["createConfirmed","updateConfirmed","serviceMatchConfirmed"].includes(event.target.name)) {setPreparedSha(null);setSourceSha(null);setReview(null);setConfirmed(false);setRevision(v=>v+1)}}} onSubmit={(event) => {
    event.preventDefault();
    if (lock.current || pending || (historyPending&&!selectedSource&&!selectedHistory&&rows===null) || (mode === "send" && operationState && !sendId && operationState !== "prepared")) return;
    const form = new FormData(event.currentTarget);
    form.set("serviceRequestId", serviceRequestId);
    if (quoteId) form.set("quoteId", quoteId);
    const dispatch = (mode === "create" || mode === "update") && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-dispatch') === 'yes';
    if (dispatch && ((mode === "create" && createLocked) || !writeEnabled || !preparedSha || dispatchStarted || form.get(mode==='update'?'updateConfirmed':'createConfirmed') !== 'yes')) {setMessage('Preglejte postavko in potrdite ustvarjanje predračuna.');return;}
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
      if (dispatch || mode === "send") router.refresh();
      } catch {setMessage(dispatch || mode === "send" ? "Izid ni potrjen. Preverite stanje; pošiljanja ali ustvarjanja ne ponavljajte." : "Pregleda trenutno ni mogoče pridobiti. Ponovno kliknite Preglej ponudbo; dokument ni ustvarjen ali poslan.")} finally {lock.current = false}
    });
  }}><fieldset disabled={pending} className="space-y-3">
    {(mode === "create" || mode === "prepare") && createLocked && <section className="space-y-2 rounded border border-amber-300 p-3 text-sm">
      <p>{operationState === 'failed' ? 'Prejšnje ustvarjanje je bilo zavrnjeno.' : operationState === 'verified' ? 'Predračun je že ustvarjen; njegove povezave je treba preveriti.' : 'Izid prejšnjega ustvarjanja še ni potrjen.'} Ponovno ustvarjanje je ustavljeno. Spodaj lahko pregledate ponudbo brez novega dokumenta.</p>
      {(operationState === 'uncertain' || operationState === 'dispatching') && <button type="button" disabled={pending} className="rounded border px-3 py-2" onClick={()=>startTransition(async()=>{try{const result=await reconcileQuibiEstimate(serviceRequestId);setMessage(result.message);if(result.ok)router.refresh()}catch{setMessage('Obstoječega dokumenta trenutno ni mogoče preveriti. Ponovno ustvarjanje ostaja ustavljeno.')}})}>Preveri obstoječi dokument</button>}
    </section>}
    {document && <section role="status" className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
      <p className="font-semibold">Quibi predračun #{document.id}{document.number ? ` · ${document.number}` : ''}</p>
      <p>Znesek po Quibiju: {money(Number(document.amount.replace(',', '.')))}</p>
      <a className="block text-blue-700 underline" href={`/dashboard/stranke/${document.customerId}/quibi/predracuni/${document.id}`}>Odpri predračun</a>
      <a className="block text-blue-700 underline" target="_blank" rel="noreferrer" href={`/api/quibi/dokumenti/${document.customerId}/estimate/${document.id}/pdf`}>Odpri PDF iz Quibija</a>
      {!document.linked && <p role="alert">Povezava s primerom zahteva pregled. Ne ustvarjajte drugega predračuna.</p>}
      <p>Dokument ni poslan. Pošiljanje zahteva ločeno odobritev.</p>
    </section>}
    <h3 className="font-medium">{mode === "prepare" ? "Pripravi ponudbo za popravilo" : mode === "create" ? "Pripravi ponudbo za popravilo" :
      mode === "update" ? "Popravi zavrnjeni Quibi predračun" : "Pošlji predračun samo na testni naslov"}</h3>
    {(mode === "create" || mode === "prepare") && <>
      {inspectionFindings&&<section aria-label="Podlaga opravljenega pregleda" className="space-y-2 rounded border bg-blue-50 p-3 text-sm">
        <p className="font-medium">Ugotovitve opravljenega pregleda</p><p className="whitespace-pre-wrap break-words">{inspectionFindings}</p>
        {inspectionSuggestions.matches.length>0&&<><ul>{inspectionSuggestions.matches.map(o=><li key={o.key}>{o.code} · {o.name}</li>)}</ul><button type="button" className="rounded border px-3 py-2" onClick={()=>changeRows(inspectionSuggestions.matches.map(o=>({key:o.key,quantity:'',discount:''})))}>Pripravi postavke iz pregleda</button><p>V predlog se prenesejo samo enolično prepoznane Quibi postavke. Dopolnite dejanske količine; cene, DDV in popusti se preverijo v predogledu. Izbira zamenja trenutni predlog, ne spremeni Quibija.</p></>}
        {(inspectionSuggestions.unmatched.length>0||inspectionSuggestions.ambiguous.length>0)&&<p>Preostale ugotovitve niso enolična Quibi postavka. Izberite ustrezne storitve oziroma dele spodaj; podobnih nazivov ne enačimo.</p>}
      </section>}
      {aiEstimateLines.length>0&&<p className="text-sm text-blue-800">AI je pripravil predlog Quibi postavk za vaš pregled. Cene, DDV in popusti se sveže preverijo v predogledu. Dopolnite le neznane količine.</p>}
      {catalogIssues.map(issue=><p key={issue} role="alert" className="text-sm text-amber-800">{issue}</p>)}
      {rows!==null&&<section aria-label="Postavke predračuna" className="space-y-3">
        <input type="hidden" name="catalogLines" value={JSON.stringify(rows)}/>
        {rows.map((row,index)=>{const option=catalogOptions.find(o=>o.key===row.key);return <article key={index} className="space-y-2 rounded border bg-white p-3">
          <label className="block">Postavka {index+1}<select required value={row.key} onChange={e=>changeRows(rows.map((r,i)=>i===index?{...r,key:e.target.value,discount:''}:r))} className="block w-full min-w-0 rounded border p-2"><option value="">Izberite Quibi artikel ali storitev</option>{catalogOptions.map(o=><option key={o.key} value={o.key}>{o.code} · {o.name}</option>)}</select></label>
          {option&&<p className="text-sm">Enota: {option.unitLabel} · DDV: {option.vatLabel}. Cena in cenik stranke se preverita v predogledu.</p>}
          <div className="grid grid-cols-2 gap-2"><label>Količina<input aria-label={'Količina postavke '+(index+1)} type="number" min="0.001" max="100000" step="0.001" required value={row.quantity} onChange={e=>changeRows(rows.map((r,i)=>i===index?{...r,quantity:e.target.value}:r))} className="block w-full rounded border p-2"/></label>
          <label>Popust (%)<input aria-label={'Popust postavke '+(index+1)} type="number" min="0" max="100" step="0.01" placeholder="Iz Quibija" value={row.discount} onChange={e=>changeRows(rows.map((r,i)=>i===index?{...r,discount:e.target.value}:r))} className="block w-full rounded border p-2"/></label></div>
          <button type="button" className="rounded border px-3 py-2" onClick={()=>changeRows(rows.filter((_,i)=>i!==index))}>Odstrani postavko {index+1}</button>
        </article>})}
        {!rows.length&&<p>Dodajte vsaj eno Quibijevo postavko.</p>}
      </section>}
      <button type="button" disabled={!!rows&&rows.length>=100} className="rounded border px-3 py-2" onClick={addRow}>Dodaj postavko</button>
      {!rows&&<><label className="block text-sm">Postavka iz Quibija
        <select name="catalogSource" value={catalogSource} onChange={event=>{manualCatalogChoice.current=!!event.target.value;setCatalogSource(event.target.value);setHistorySource('');setHistory({proposals:[],issues:[]});setHistoryPending(true)}} className="mt-1 block w-full rounded border px-3 py-2">
          <option value="">{catalogOptions.length?'Izberite storitev ali dopolnite manjkajočo postavko spodaj':'Šifrant ni na voljo; dopolnite postavko za pregled'}</option>
          {catalogOptions.map(option=><option key={option.key} value={option.key}>{option.name} · {option.code} · {option.priceListDiffers?'osnovna cena artikla':option.priceListName}</option>)}
        </select>
      </label>
      <section aria-label="Predlog iz Quibijeve zgodovine" className="space-y-2 rounded border p-3 text-sm">
        <p className="font-medium">Predlog iz zgodovine popravil</p>
        {historyPending?<p role="status">Preverjam Quibijeve dokumente in aktualne cene…</p>:<>
          {history.issues.map(issue=><p key={issue} className="text-amber-800">{issue}</p>)}
          <label className="block">Pripravljene postavke<select name="historySource" value={historySource} onChange={e=>setHistorySource(e.target.value)} className="mt-1 block w-full rounded border p-2">
            <option value="">{history.proposals.length?'Izberite predlog ali uporabite postavko iz cenika':'Ni pripravljenega zgodovinskega predloga; uporabite postavko iz cenika'}</option>
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
      </>}
      <p className="text-xs text-amber-800">{mode === "prepare" ? "Priprava prebere podatke. Dokument nastane šele po vašem kliku." : "Pregled ne ustvari dokumenta. Ustvarjanje je ločeno potrjeno dejanje."} {mode === "prepare" ? "Predlog še ni shranjen poslovni dokument. Pred ustvarjanjem se podatki znova preverijo." : "Ponavljanje uporabi isti shranjeni zahtevek. Quibi bo po ustvaritvi ponovno prebran; ceno mora nato potrditi Tadej."}</p>
      <label className="block text-sm">Vrsta prodaje
        <select key={historySource} defaultValue={selectedHistory?.saleTypeId&&choices?.saleTypes.some(s=>s.id===selectedHistory.saleTypeId)?selectedHistory.saleTypeId:choices?.saleTypes.length===1?choices.saleTypes[0].id:''} name="saleTypeId" required className="mt-1 block w-full rounded border px-3 py-2">
          <option value="">Izberite vrsto prodaje, če je vir ne določa</option>{choices?.saleTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {!!choices?.warehouses?.length&&<label className="block text-sm">Skladišče v Quibiju<select name="warehouseId" defaultValue={choices.warehouses.length===1?choices.warehouses[0].id:''} required className="mt-1 block w-full rounded border px-3 py-2"><option value="">Izberite skladišče</option>{choices.warehouses.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>}
      {rows?<><input type="hidden" name="unitId" value={catalogOptions.find(o=>o.key===rows[0]?.key)?.unitId??''}/><input type="hidden" name="vatId" value={catalogOptions.find(o=>o.key===rows[0]?.key)?.vatId??''}/></>:selectedHistory?<><input type="hidden" name="unitId" value={choices?.units.find(u=>u.label===selectedHistory.reviewedLines[0]?.unit)?.id??''}/><input type="hidden" name="vatId" value={selectedHistory.payloadLines[0]?.ddv_id??''}/></>:<div className="grid gap-2 sm:grid-cols-2">
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
      {!rows && !selectedSource && !selectedHistory && <label className="block text-sm">Cena za eno storitev z DDV (€)
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
    <button disabled={pending || (rows!==null&&!rows.length) || (historyPending&&!selectedSource&&!selectedHistory&&rows===null) || (mode === "send" && !!operationState && !sendId && operationState !== "prepared")} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">
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
      {mode !== "prepare" && !createLocked && <label className="flex gap-2 text-sm"><input name={mode==="update"?"updateConfirmed":"createConfirmed"} type="checkbox" value="yes" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={dispatchStarted||!writeEnabled}/>Potrjujem {mode==="update"?"posodobitev":"ustvarjanje"} pregledanega predračuna v Quibiju za prikazano stranko, vozilo in storitev tega primera.</label>}
      <button data-dispatch="yes" disabled={pending || dispatchStarted || !confirmed || mode==="prepare" || !writeEnabled || (mode==="create" && createLocked)} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{mode==='create'&&createLocked?'Ponovno ustvarjanje ustavljeno':mode==='prepare'||!writeEnabled?'Ustvarjanje trenutno ni omogočeno':dispatchStarted ? 'Dispatch sprožen; pred nadaljevanjem preverite dnevnik' : mode==='update'?'Posodobi pregledani predračun v Quibiju':'Ustvari pregledani predračun v Quibiju'}</button>
    </div>}
    {message && <p role={message.startsWith("Priprava preverjena") || message.startsWith("Quibi DEV") || message.startsWith("Quibi je") ? "status" : "alert"} className="whitespace-pre-wrap break-all text-sm">{message.split("\n")[0]}</p>}
    {message.includes("\n") && <details className="text-xs"><summary>Podrobnosti priprave za pregled</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">{message.slice(message.indexOf("\n")+1)}</pre></details>}
  </fieldset></form>;
}

export function QuibiDevWritePanel(props:Parameters<typeof LegacyQuibiDevWritePanel>[0]){return props.mode==='prepare'||props.mode==='create'?<EstimateComposer {...props} mode={props.mode}/>:<LegacyQuibiDevWritePanel {...props}/>;}
