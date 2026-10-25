import type {CaseStep} from '../cases/next-step.ts';
export type ReviewEvent={id:string;action:'accepted'|'returned'|'invoice_checked'|'closed';evidence_sha:string;created_at:string;actor_label?:string;simulated:boolean;body:Record<string,unknown>};
export type ReviewState={lastActivity?:string|null;workLocked?:boolean;ready:boolean;evidenceSha?:string;simulated:boolean;events:ReviewEvent[]};
export type RepairPhase={id:string;label:string;next:string;uiStatus:'aktivno_popravilo'|'caka_dele'|'potreben_pregled'|'pripravljeno_za_prevzem'|'zakljuceno';attention:boolean;step:CaseStep};
export function reviewDecision(state:ReviewState){return state.events.filter(e=>e.evidence_sha===state.evidenceSha&&['accepted','returned'].includes(e.action)).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];}
export function currentInvoiceCheck(state:ReviewState,invoice?:{id:string;sha:string}){if(reviewDecision(state)?.action!=='accepted')return undefined;return state.events.filter(e=>e.action==='invoice_checked'&&e.evidence_sha===state.evidenceSha&&(!invoice||(e.body.invoiceId===invoice.id&&e.body.invoiceSha===invoice.sha))).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];}
export function repairPhase(status:string,state?:ReviewState,invoice?:{id:string;sha:string},uncertain=false):RepairPhase{
 let id=status,label='Dodeljeno mehaniku',next='Mehanik začne delo in beleži napredek.',uiStatus:RepairPhase['uiStatus']='aktivno_popravilo',attention=false;
 if(status==='in_progress'){label='Delo poteka';next='Mehanik nadaljuje delo ter doda zapiske in fotografije.';}
 if(status==='awaiting_parts'){label='Čaka rezervne dele';next='Uredite potrebne dele in nadaljujte delo.';uiStatus='caka_dele';}
 if(status==='work_completed'){
  id='review_required';label='Delo opravljeno – čaka pregled vodje';next='Vodja pregleda opravljeno delo, zapiske in fotografije.';uiStatus='potreben_pregled';attention=true;
  if(state&&reviewDecision(state)?.action==='accepted'){
   id='invoice_review';label='Pregledano – preveri račun';next=invoice?'Preglej obstoječi račun, PDF in plačila v Quibiju.':'Predogled računa se pripravi samodejno iz preverjenega naloga. Preglej račun.';
   const checked=currentInvoiceCheck(state,invoice);
   if(checked&&invoice){id='handover';label='Čaka prevzem oziroma naslednje poslovno dejanje';next='Zabeleži prevzem in stanje plačila. Brez dokazila obveščanje ni potrjeno.';uiStatus='pripravljeno_za_prevzem';
    if(state.events.some(e=>e.action==='closed'&&e.evidence_sha===state.evidenceSha&&e.body.invoiceId===invoice.id&&e.body.invoiceSha===invoice.sha)){id='closed';label='Zaključeno';next=state.simulated?'Zaključek je evidentiran za testni primer.':'Prevzem in zaključek sta evidentirana. Morebitno odprto plačilo ostaja v Quibiju.';const closing=state.events.find(e=>e.action==='closed'&&e.evidence_sha===state.evidenceSha&&e.body.invoiceId===invoice.id&&e.body.invoiceSha===invoice.sha);const payment=closing?.body.payment as {remaining?:unknown}|null|undefined;if(typeof payment?.remaining==='number'&&payment.remaining>0)next+=' Preostanek po Quibijevi evidenci ob zaključku: '+payment.remaining.toLocaleString('sl-SI',{style:'currency',currency:'EUR'})+'.';else if(!payment)next+=' Stanje plačila ni potrjeno; preveri v Quibiju.';uiStatus='zakljuceno';attention=false;}
   }
  }
 }
 if(uncertain&&id!=='review_required'){id='document_unknown';label='Poslovni dokument zahteva preverjanje';next='Izid Quibi operacije ni znan. Preveri obstoječi dokument; CREATE in SEND ne ponavljaj.';uiStatus='potreben_pregled';attention=true;}
 return {id,label,next,uiStatus,attention,step:{kind:id==='closed'?'closed':'manual_external_handoff',label:next,externalConfirmed:false}};
}
export function reviewReference(value:unknown){if(typeof value!=='string'||value.trim().length<12||value.trim().length>1000)throw Error('REFERENCE_REQUIRED');return value.trim();}
export function requireReviewRole(role:string){if(!['owner','admin'].includes(role))throw Error('FORBIDDEN');}
export function syntheticRepair(problem:string){return /QA-SIM|QA PREIZKUS|SINTETIČNI|SYNTHETIC/i.test(problem);}

/** Explicitly authorized synthetic DEV work stays labelled through review and closure. */
export function a73SyntheticWork(environment:string,caseId:string,vin:string,problem:string){return environment==='dev'&&caseId==='a73db6be-7216-4677-bc0a-26e97693ad75'&&vin==='TESTSELANBX202602'&&problem.startsWith('TESTNO POVPRAŠEVANJE – AVTOSERVIS SELAN');}
