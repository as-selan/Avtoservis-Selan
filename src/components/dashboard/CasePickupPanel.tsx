import Link from 'next/link';
import {CasePickupFlow} from './CasePickupFlow';
import type {CaseWork} from '@/lib/case-work/read';
import {currentInvoiceCheck} from '@/lib/case-work/review-policy';
import {paymentPresentation} from '@/lib/quibi/invoice-payments';
import {CaseReviewForm} from './CaseReviewForm';

export function CasePickupPanel({work,role}:{work:CaseWork;role:string}){
 if(!['owner','admin'].includes(role)||!work.invoice)return null;
 const closed=work.phase?.id==='closed';
 const checked=work.review&&currentInvoiceCheck(work.review,work.invoice);
 const closedEvent=closed?work.review?.events.find(e=>e.action==='closed'&&e.evidence_sha===work.review?.evidenceSha&&e.body.invoiceId===work.invoice?.id&&e.body.invoiceSha===work.invoice?.sha):undefined;
 const saved=closedEvent?.body??checked?.body;
 const amount=typeof saved?.amount==='string'||typeof saved?.amount==='number'?Number(saved.amount):NaN;
 const formatted=Number.isFinite(amount)?amount.toLocaleString('sl-SI',{style:'currency',currency:'EUR'}):null;
 const payment=saved?.payment as {paid:number;remaining:number;status:string}|null|undefined;
 const content=<section id="prevzem" tabIndex={-1} className="space-y-4 scroll-mt-20 [&_form]:sticky [&_form]:bottom-2 [&_form]:z-10 [&_form]:bg-white" aria-label="Prevzem vozila">
  <h2 className="text-xl font-semibold">{closed?'Vozilo prevzeto':'Prevzem vozila'}</h2>
  {work.review?.simulated&&<span data-test-case-badge className="inline-block rounded bg-slate-100 px-2 py-1 text-xs">Testni primer</span>}
  <p className="font-medium">{work.vehicle.make} {work.vehicle.model} · {work.vehicle.registration}</p>
  <p>Račun #{work.invoice.id}{formatted&&' · '+formatted}</p>
  <p role="status">{payment?"Ob zadnjem preverjanju: ":""}{paymentPresentation(payment??undefined).label}</p>
  {!closed&&<CaseReviewForm caseId={work.caseId} action="closed" sha={work.review?.evidenceSha} enabled={!!work.review?.ready&&!work.businessUncertain} simulated={!!work.review?.simulated}/>}
 </section>;
 const summary=<section className="space-y-3" aria-label="Izdani račun"><h3 className="text-xl font-semibold">Račun izdan</h3><p>{typeof saved?.invoiceNumber==='string'?saved.invoiceNumber:'Račun #'+work.invoice.id}{formatted&&' · '+formatted}</p><a className="block text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={'/api/quibi/stranke/'+work.customerQuibiId+'/dokumenti/invoice/'+work.invoice.id+'/pdf'}>Odpri PDF</a><Link className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 font-medium text-white" href={'/dashboard/primeri/'+work.caseId+'#prevzem'}>Prevzem vozila</Link></section>;
 return closed?content:<CasePickupFlow summary={summary}>{content}</CasePickupFlow>;
}
