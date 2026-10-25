import {CasePickupFlow} from './CasePickupFlow';
import {QuibiIssuedInvoice} from './QuibiIssuedInvoice';
import type {CaseWork} from '@/lib/case-work/read';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {loadQuibiDocument,verifyWorkOrderDocument} from '@/lib/quibi/document-read';
import {documentPaymentSummary} from '@/lib/quibi/invoice-payments';
import {CaseReviewForm} from './CaseReviewForm';
export async function CasePickupPanel({work,role}:{work:CaseWork;role:string}){
 if(!['owner','admin'].includes(role)||!work.invoice)return null;
 const closed=work.phase?.id==='closed';let invoice;
 try{invoice=await loadQuibiDocument(configuredQuibiReadClient(),'invoice',work.invoice.id,work.customerQuibiId);verifyWorkOrderDocument(invoice,work.customerQuibiId,work.vehicleQuibiId,work.invoice.sha);if(!invoice.number||invoice.number==='Osnutek')throw Error('INVOICE_DRAFT');}
 catch{return <section id="prevzem" tabIndex={-1} className="space-y-3 scroll-mt-20"><h2 className="text-xl font-semibold">Prevzem vozila</h2><p role="alert">Računa trenutno ni mogoče preveriti. Osveži stran pozneje. Obstoječi podatki so ohranjeni.</p></section>;}
 let paid=false;try{const payment=documentPaymentSummary(invoice.amount,await configuredQuibiReadClient().documentPayments(invoice.id));paid=payment.remaining<=0&&payment.paid>0;}catch{/* Unknown remains unknown; pickup is independent of payment. */}
 const content=<section id="prevzem" tabIndex={-1} className="space-y-4 scroll-mt-20 [&_form]:sticky [&_form]:bottom-2 [&_form]:z-10 [&_form]:bg-white" aria-label="Prevzem vozila">
  <h2 className="text-xl font-semibold">{closed?'Vozilo prevzeto':'Prevzem vozila'}</h2>
  {work.review?.simulated&&<span data-test-case-badge className="inline-block rounded bg-slate-100 px-2 py-1 text-xs">Testni primer</span>}
  <p className="font-medium">{work.vehicle.make} {work.vehicle.model} · {work.vehicle.registration}</p>
  <p>Račun #{invoice.id} · {Number(invoice.amount).toLocaleString('sl-SI',{style:'currency',currency:'EUR'})}</p>
  <p role="status">{paid?'Plačilo potrjeno':'Plačilo ni potrjeno'}</p>
  {!closed&&<CaseReviewForm caseId={work.caseId} action="closed" sha={work.review?.evidenceSha} enabled={!!work.review?.ready&&!work.businessUncertain} simulated={!!work.review?.simulated}/>}
 </section>;
 return closed?content:<CasePickupFlow summary={<QuibiIssuedInvoice caseId={work.caseId} customerId={work.customerQuibiId} invoice={invoice}/>}>{content}</CasePickupFlow>;
}
