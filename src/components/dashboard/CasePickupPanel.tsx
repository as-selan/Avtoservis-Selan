import {Suspense} from 'react';
import Link from 'next/link';
import {CasePickupFlow} from './CasePickupFlow';
import type {CaseWork} from '@/lib/case-work/read';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {loadQuibiDocument,verifyWorkOrderDocument} from '@/lib/quibi/document-read';
import {documentPaymentSummary,paymentPresentation} from '@/lib/quibi/invoice-payments';
import {CaseReviewForm} from './CaseReviewForm';

export function CasePickupPanel({work,role}:{work:CaseWork;role:string}){
 if(!['owner','admin'].includes(role)||!work.invoice)return null;
 const closed=work.phase?.id==='closed';const invoicePromise=readInvoice(work);
 const content=<section id="prevzem" tabIndex={-1} className="space-y-4 scroll-mt-20 [&_form]:sticky [&_form]:bottom-2 [&_form]:z-10 [&_form]:bg-white" aria-label="Prevzem vozila">
  <h2 className="text-xl font-semibold">{closed?'Vozilo prevzeto':'Prevzem vozila'}</h2>
  {work.review?.simulated&&<span data-test-case-badge className="inline-block rounded bg-slate-100 px-2 py-1 text-xs">Testni primer</span>}
  <p className="font-medium">{work.vehicle.make} {work.vehicle.model} · {work.vehicle.registration}</p>
  <p>Račun #{work.invoice.id}</p>
  <Suspense fallback={<p role="status">Plačilo ni potrjeno</p>}><InvoiceDetails invoicePromise={invoicePromise}/></Suspense>
  {!closed&&<CaseReviewForm caseId={work.caseId} action="closed" sha={work.review?.evidenceSha} enabled={!!work.review?.ready&&!work.businessUncertain} simulated={!!work.review?.simulated}/>}
 </section>;
 const summary=<section className="space-y-3" aria-label="Izdani račun"><h3 className="text-xl font-semibold">Račun izdan</h3><Suspense fallback={<p>Račun #{work.invoice.id}</p>}><InvoiceSummary invoicePromise={invoicePromise} id={work.invoice.id}/></Suspense><a className="block text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={'/api/quibi/stranke/'+work.customerQuibiId+'/dokumenti/invoice/'+work.invoice.id+'/pdf'}>Odpri PDF</a><Link className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 font-medium text-white" href={'/dashboard/primeri/'+work.caseId+'#prevzem'}>Prevzem vozila</Link></section>;
 return closed?content:<CasePickupFlow summary={summary}>{content}</CasePickupFlow>;
}
async function readInvoice(work:CaseWork){try{const invoice=await loadQuibiDocument(configuredQuibiReadClient(),'invoice',work.invoice!.id,work.customerQuibiId);verifyWorkOrderDocument(invoice,work.customerQuibiId,work.vehicleQuibiId,work.invoice!.sha);if(!invoice.number||invoice.number==='Osnutek')throw Error('INVOICE_DRAFT');return invoice;}catch{return null;}}
async function InvoiceSummary({invoicePromise,id}:{invoicePromise:ReturnType<typeof readInvoice>;id:string}){const invoice=await invoicePromise;return <p>{invoice?`${invoice.number} · ${Number(invoice.amount).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})}`:`Račun #${id}`}</p>;}
async function InvoiceDetails({invoicePromise}:{invoicePromise:ReturnType<typeof readInvoice>}){const invoice=await invoicePromise;if(!invoice)return <p role="status">Plačilo ni potrjeno</p>;let payment;try{payment=documentPaymentSummary(invoice.amount,await configuredQuibiReadClient().documentPayments(invoice.id));}catch{}return <><p>{Number(invoice.amount).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})}</p><p role="status">{paymentPresentation(payment).label}</p></>;}
