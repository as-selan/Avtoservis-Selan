import Link from 'next/link';
import type {CaseWork} from '@/lib/case-work/read';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {loadQuibiDocument,verifyWorkOrderDocument} from '@/lib/quibi/document-read';
import {QuibiDocumentPayments} from './QuibiDocumentPayments';
export async function ClosedCaseSummary({work,customer}:{work:CaseWork;customer:string}){
 let invoice;try{if(!work.invoice)throw Error('INVOICE_REQUIRED');invoice=await loadQuibiDocument(configuredQuibiReadClient(),'invoice',work.invoice.id,work.customerQuibiId);verifyWorkOrderDocument(invoice,work.customerQuibiId,work.vehicleQuibiId,work.invoice.sha);}catch{/* Historical closure is not revoked by a provider outage. */}
 const closed=work.review?.events.find(e=>e.action==='closed'&&e.evidence_sha===work.review?.evidenceSha);
 return <section aria-label="Zaključen primer" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">{work.vehicle.make} {work.vehicle.model} · {work.vehicle.registration}</h2>
  <p className="text-sm text-slate-600">{customer}{(work.mechanicName?.trim()||work.mechanicEmail)&&' · '+(work.mechanicName?.trim()||work.mechanicEmail)}</p>
  <p>Račun {invoice?.number||String(closed?.body.invoiceNumber??'')}{invoice&&' · '+Number(invoice.amount).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})}</p>
  {invoice?<QuibiDocumentPayments documentId={invoice.id} amount={invoice.amount} compact/>:<p role="status">Plačilo: ni potrjeno. Podatki računa trenutno niso dosegljivi.</p>}
  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{work.invoice&&<Link className="min-h-11 py-3 text-blue-700 underline" href={'/dashboard/quibi/stranke/'+work.customerQuibiId+'/dokumenti/invoice/'+work.invoice.id}>Odpri račun</Link>}</div>
 </section>;
}
