import type {AutomaticDraftState} from '../quibi/automatic-estimate-draft';
import {automaticDraftPresentation} from '../quibi/automatic-draft-state.ts';
/** Presentation only. Existing server actions remain the authority for every transition. */
export type JourneyInput = {
 canCreateVehicle?:boolean; newVehicleRequired?:boolean; automaticDraftState?:AutomaticDraftState|null; automaticPreparation?:boolean; status: string; role: string; stepKind: string; intakeComplete: boolean;
 identityReady: boolean; hosted: boolean; offerPrepared: boolean; quoteReviewed: boolean;
 customerApproved: boolean; dispatched: boolean; hasWorkOrder: boolean;
 writeReady: boolean; sendReady: boolean; devNoEmail?: boolean; sendAttempted?: boolean; sendState?: string|null; workOrderHref?: string; hasAssignedWork?: boolean; repairPhase?: string; internalOrdersEnabled?: boolean; inspectionPending?: boolean; fixedPriceStatus?: string;
};
export const journeyStages = ['Novo povpraševanje', 'Preverjanje stranke in vozila', 'Priprava predračuna', 'Pošiljanje stranki', 'Odobritev popravila', 'Delovni nalog', 'Popravilo, račun in zaključek'];
export function caseJourney(p: JourneyInput) {
 const terminal=['closed','declined','cancelled'].includes(p.status)||p.repairPhase==='closed';
 const accepted=!['new','needs_data'].includes(p.status);
 const completed=[true,accepted&&p.intakeComplete&&(p.identityReady||!p.hosted),p.quoteReviewed,p.dispatched,p.customerApproved,p.hasWorkOrder,p.status==='closed'||p.repairPhase==='closed'];
 let current=1, action={label:'Preveri podatke',href:'#podatki'}, blocker:string|null=null;
 if(!terminal&&!p.customerApproved&&!p.hasWorkOrder&&p.sendAttempted&&p.sendState!=='sent')blocker=p.sendState==='failed'?'Pošiljanje ni uspelo. Ne ponavljajte ga samodejno; preverite shranjeni izid. Morebitni dejanski odgovor stranke lahko ločeno zabeležite spodaj.':p.sendState==='queued'?'Pošiljanje še čaka v Quibiju; prejem ni potrjen. Ne pošiljajte znova. Dejanski odgovor stranke, tudi po telefonu, zabeležite ločeno.':'Izid pošiljanja ni znan. Ne pošiljajte znova; preverite shranjeni izid in status. Dejanski odgovor stranke zabeležite ločeno.';
 const result=()=>({current,completed,action,blocker,terminal});
 if(terminal){current=6;action={label:'Preglej podatke primera',href:'#podatki'};return result();}
 if(!['owner','admin'].includes(p.role)){
  blocker='Sprejem, odobritev predračuna in poslovne dokumente lahko potrdi lastnik ali skrbnik. Preverite podatke in mu predajte isti primer.';return result();
 }
 if(p.stepKind==='review_quibi_mismatch'||p.repairPhase==='document_unknown'){
  current=p.customerApproved?5:2;action={label:'Preveri povezavo in izid dokumenta',href:p.workOrderHref??(p.customerApproved||p.hasWorkOrder?'#poslovni-nalog':'#predracun')};
  blocker='Podatki ali izid zadnjega poskusa zahtevajo pregled. Ne ponavljajte ustvarjanja ali pošiljanja; v spodnjem razdelku preverite obstoječi dokument in shranjeni izid.';return result();
 }
 if(p.hasWorkOrder){current=p.hasAssignedWork===false?5:6;action={label:p.hasAssignedWork===false?'Preglej delovni nalog':'Nadaljuj popravilo',href:p.workOrderHref??(p.hasAssignedWork===false?'#poslovni-nalog':'#popravilo')};return result();}
 if(p.automaticPreparation&&!p.quoteReviewed&&!p.customerApproved&&p.intakeComplete&&p.identityReady){current=2;const prepared=automaticDraftPresentation(p.automaticDraftState);action={label:prepared.action,href:prepared.href};return result();}
 if(!p.intakeComplete||p.status==='needs_data'){
  blocker='Manjkajo podatki za nadaljevanje. V podatkih primera preverite seznam in ustvarite povezavo za dopolnitev istega povpraševanja.';return result();
 }
 if(p.newVehicleRequired){action={label:(p.role==='owner'||p.canCreateVehicle)?'Preveri in potrdi vozilo':'Navodilo za lastnika',href:'#quibi-povezava'};blocker=null;return result();}
 if(p.hosted&&!p.identityReady){
  action={label:'Preveri stranko in vozilo',href:'#quibi-povezava'};
  blocker='Povezava stranke in vozila s Quibijem še ni potrjena. Primerjajte podatke v razdelku Povezava s Quibijem; ustvarjanje manjkajočega vozila potrdi pooblaščeni uporabnik v prikazanem obrazcu.';return result();
 }
 if(p.stepKind==='manual_inspection_billing'){
  current=6;action={label:'Uredi račun pregleda',href:'#termini'};return result();
 }
 if(p.inspectionPending){action={label:'Zabeleži ugotovitve pregleda',href:'#termini'};return result();}
 if(!accepted)return result();
 if(p.fixedPriceStatus==='accepted'){current=5;action={label:p.status==='appointment_confirmed'&&p.internalOrdersEnabled?'Ustvari interni delovni nalog':'Preveri nadaljevanje naročene storitve',href:p.status==='appointment_confirmed'&&p.internalOrdersEnabled?'#poslovni-nalog':'#termini'};if(!p.internalOrdersEnabled)blocker='Storitev po objavljeni ceni je naročena. Ta obstoječa pot še nima preverjene povezave do ustvarjanja Quibi naloga brez predračuna; preverite nadaljevanje ročno. Nov nalog ni ustvarjen.';return result();}
 if(p.fixedPriceStatus==='rejected'){current=4;action={label:'Preglej zavrnitev storitve',href:'#objavljena-cena'};return result();}
 if(p.fixedPriceStatus){current=p.fixedPriceStatus==='prepared'?2:p.fixedPriceStatus==='approved'?3:4;action={label:current===2?'Preglej objavljeno ceno':current===3?'Sporoči odobreno ceno':'Zabeleži odgovor stranke',href:'#objavljena-cena'};return result();}
 if(p.customerApproved&&p.internalOrdersEnabled){current=5;action={label:p.status==='appointment_confirmed'?'Ustvari interni delovni nalog':'Preveri ročno dogovorjeni termin',href:p.status==='appointment_confirmed'?'#poslovni-nalog':'#termini'};return result();}
 if(p.customerApproved){
  current=5;action={label:p.writeReady?'Ustvari delovni nalog':'Pripravi delovni nalog',href:'#poslovni-nalog'};
  if(!p.writeReady)blocker='Quibi ustvarjanje trenutno ni omogočeno ali pripravljeno. Priprava ne ustvari delovnega naloga. Preverite razloge v poslovnem postopku; omogočanje WRITE zahteva ločeno odobritev.';
  return result();
 }
 current=2;action={label:'Pripravi predračun',href:'#predracun'};
 if(p.stepKind==='review_estimate')action={label:'Preglej in potrdi predračun',href:'#pregled-predracuna'};
 else if(p.stepKind==='revise_estimate')action={label:'Preglej zavrnitev in popravi predračun',href:'#pregled-predracuna'};
 else if(p.quoteReviewed){
  if(p.devNoEmail||p.dispatched||p.stepKind==='await_customer'){
   current=4;action={label:'Zabeleži odobritev stranke',href:'#odobritev'};if(p.devNoEmail)blocker='Quibi DEV ne pošilja e-pošte. Dokument ni poslan. Nadaljujte z ločeno zabeleženim dejanskim odgovorom ali jasno označeno sintetično odobritvijo QA-SIM.';
  }else{
   current=3;action={label:p.sendReady?'Pošlji predračun':'Preveri pošiljanje predračuna',href:'#pregled-predracuna'};
   if(!p.sendReady)blocker='Pošiljanje prek Quibija trenutno ni omogočeno ali nima vseh potrjenih podatkov. Dokument ni poslan. Preverite spodnji obrazec; dejanski odgovor po telefonu lahko ločeno zabeležite v razdelku Odločitev stranke.';
  }
 }
 if(p.offerPrepared&&!p.quoteReviewed&&!p.writeReady&&p.stepKind!=='review_estimate')blocker='Predračun lahko pripravite in pregledate. Ustvarjanje dokumenta v Quibiju trenutno ni omogočeno ali pripravljeno; predogled še ni ustvarjen predračun.';
 return result();
}

