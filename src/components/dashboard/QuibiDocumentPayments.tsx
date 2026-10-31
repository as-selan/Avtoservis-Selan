import {QuibiPaymentRefresh} from './QuibiPaymentRefresh';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {documentPaymentSummary,paymentPresentation} from '@/lib/quibi/invoice-payments';
/** Render only after the containing route has confirmed document/customer ownership. */
export async function QuibiDocumentPayments({documentId,amount,dueDate,compact=false}:{documentId:string;amount?:string;dueDate?:string;compact?:boolean}){
 let rows:Awaited<ReturnType<ReturnType<typeof configuredQuibiReadClient>['documentPayments']>>=[];let summary;let failed=false;
 try{rows=await configuredQuibiReadClient().documentPayments(documentId);if(amount!==undefined)summary=documentPaymentSummary(amount,rows);}catch{failed=true;}
 const presentation=paymentPresentation(summary),money=(n:number)=>n.toLocaleString('sl-SI',{style:'currency',currency:'EUR'});
 return <section className={compact?'space-y-2':'space-y-2 rounded-xl border bg-white p-4'} aria-label="Plačilo">
  <p role="status">Plačilo: {presentation.label.replace(/^Plačilo /,'').toLocaleLowerCase('sl-SI')}{presentation.remaining!==undefined&&presentation.remaining>0?' · odprto po evidenci '+money(presentation.remaining):''}</p>
  {!compact&&<details className="text-sm text-slate-500"><summary>Podrobnosti plačil</summary>{failed&&<p>Podatkov plačila trenutno ni mogoče zanesljivo potrditi. To ni dokaz neplačila.</p>}{summary&&<p>Evidentirana plačila: {money(summary.paid)}</p>}{dueDate&&<p>Zapadlost: {dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3. $2. $1')}</p>}<ul>{rows.map((p,i)=><li key={p.id||i}>{p.amount} EUR · {p.date||'Datum ni vpisan'} · {p.method||'Način ni vpisan'}</li>)}</ul></details>}
  <QuibiPaymentRefresh/>
 </section>;
}
