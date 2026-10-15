import {QuibiPaymentRefresh} from './QuibiPaymentRefresh';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {quibiToday} from '@/lib/quibi/invoice-review';
import {documentPaymentSummary,invoiceDueStatus} from '@/lib/quibi/invoice-payments';
/** Render only after the containing route has confirmed document/customer ownership. */
export async function QuibiDocumentPayments({documentId,amount,dueDate}:{documentId:string;amount?:string;dueDate?:string}){
 let rows;try{rows=await configuredQuibiReadClient().documentPayments(documentId)}catch{return <section className="rounded border p-4"><h2 className="font-semibold">Plačila v Quibiju</h2><p role="alert">Plačil dokumenta ni mogoče potrditi ali njihovega formata zanesljivo razložiti. To ne pomeni, da račun ni plačan. Preverite dokument v Quibiju.</p></section>}
 let summary;try{if(amount!==undefined)summary=documentPaymentSummary(amount,rows)}catch{/* Keep individual provider entries; never invent a paid status. */}
 const due=summary?invoiceDueStatus(dueDate,summary.remaining,quibiToday()):null;
 const money=(n:number)=>n.toLocaleString('sl-SI',{style:'currency',currency:'EUR'});
 return <section className="space-y-2 rounded border bg-white p-4"><h2 className="font-semibold">Plačila v Quibiju</h2>{summary&&<div role="status"><p>{summary.status}</p><p>Evidentirana plačila: {money(summary.paid)} · preostanek po evidenci: {money(summary.remaining)}</p></div>}{dueDate&&<p>Zapadlost po Quibiju: {dueDate}</p>}{due&&<p>{due}</p>}<ul className="space-y-2 text-sm">{rows.map((p,i)=><li key={p.id||i}>{p.amount} EUR · {p.date||'datum ni vrnjen'} · {p.method||'način ni vrnjen'}</li>)}{!rows.length&&<li>Quibi ni vrnil plačil za ta dokument.</li>}</ul>{amount!==undefined&&!summary&&<p role="alert">Seštevka plačil ni mogoče zanesljivo preveriti; status plačila ni potrjen.</p>}<QuibiPaymentRefresh/><p className="text-sm">Svež READ iz Quibija. Brez evidentiranih plačil ne dokazuje, da denar ni bil prejet. Selan ne vodi druge evidence plačil in ne zaključi primera samodejno.</p></section>;
}
