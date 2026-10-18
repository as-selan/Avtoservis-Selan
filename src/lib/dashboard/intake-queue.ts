import type {ServiceOrderDemo} from './types';

export const INTAKE_QUEUE_GROUPS = [
  {id:'all',label:'Vsi odprti'}, {id:'new',label:'Nova povpraševanja'},
  {id:'data',label:'Manjkajo podatki'}, {id:'slots',label:'Čaka izbiro termina'},
  {id:'customer',label:'Čaka odločitev stranke'}, {id:'service',label:'Ukrep servisa'},
] as const;
export type IntakeQueueGroup = typeof INTAKE_QUEUE_GROUPS[number]['id'];
export type IntakeQueueItem = {order:ServiceOrderDemo;group:Exclude<IntakeQueueGroup,'all'>;label:string;href:string};

/** Presentation of existing case states only; never advances a workflow. */
export function intakeQueue(orders:ServiceOrderDemo[]):IntakeQueueItem[]{
 return orders.flatMap(order=>{
  if(!order.serviceRequestId||order.status==='zakljuceno')return [];
  let group:IntakeQueueItem['group']='service',label=order.nextActionLabel,anchor='naslednji-korak';
  if(order.status==='manjkajo_podatki'){group='data';anchor='podatki';}
  else if(order.requiresAttention||order.nextActionKind==='review_quibi_mismatch'){group='service';}
  else if(order.slotOfferExpired){anchor='termini';label='Predlogi terminov so potekli. Umakni ponudbo in preveri nove možnosti.';}
  else if(order.slotOfferStatus&&order.slotOfferStatus!=='confirmed'){
   anchor='termini';
   if(order.slotOfferStatus==='offered'){group='slots';label='Počakaj na izbiro stranke in jo zabeleži.';}
   else if(order.slotOfferStatus==='selected')label='Preveri in ročno potrdi izbrani termin; še ni rezerviran.';
   else label='Preglej tri predloge in pripravljeno sporočilo. Po dejanskem pošiljanju to zabeleži.';
  }
  else if(order.inspectionRequested){anchor='termini';label=order.slotOfferStatus==='confirmed'?'Predhodni pregled: zabeleži ugotovitve šele po opravljenem pregledu.':'Preveri razpoložljivost in pripravi tri ročne predloge za pregled.';}
  else if(order.status==='caka_izbiro_termina'&&(!order.nextActionKind||order.nextActionKind==='manual_scheduling')){group='slots';anchor='termini';}
  else if(order.status==='caka_potrditev_ponudbe'){group='customer';anchor='predracun';}
  else if(order.status==='novo'){group='new';}
  else if(order.status==='priprava_ponudbe'){anchor='predracun';}
  return [{order,group,label,href:'/dashboard/primeri/'+order.serviceRequestId+'#'+anchor}];
 }).sort((a,b)=>b.order.updatedAt.localeCompare(a.order.updatedAt)||a.order.id.localeCompare(b.order.id));
}
export function filterIntakeQueue(rows:IntakeQueueItem[],group:IntakeQueueGroup,search:string){
 const query=search.trim().toLocaleLowerCase('sl-SI');
 return rows.filter(row=>(group==='all'||row.group===group)&&(!query||[row.order.id,row.order.customerName,row.order.registration,row.order.vehicleMakeModel,row.order.requestSummary].join(' ').toLocaleLowerCase('sl-SI').includes(query)));
}
