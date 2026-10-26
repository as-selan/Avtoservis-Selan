import {getStatusLabel} from './statuses.ts';
import type {ServiceOrderDemo} from './types';

export const INTAKE_QUEUE_GROUPS = [
  {id:'all',label:'Vsi odprti'}, {id:'new',label:'Novo'},
  {id:'data',label:'Manjkajo podatki'}, {id:'slots',label:'Čaka izbiro termina'},
  {id:'estimate',label:'Pregled in pošiljanje predračuna'},
  {id:'customer',label:'Odgovor stranke'}, {id:'service',label:'Odločitve servisa'},
  {id:'work',label:'Aktivno delo'}, {id:'review',label:'Pregled in zaključek'},
] as const;
export type IntakeQueueGroup = typeof INTAKE_QUEUE_GROUPS[number]['id'];
export type IntakeQueueItem = {order:ServiceOrderDemo;group:Exclude<IntakeQueueGroup,'all'>;label:string;href:string};

/** Presentation of existing case states only; never advances a workflow. */
export function intakeQueue(orders:ServiceOrderDemo[]):IntakeQueueItem[]{
 return orders.flatMap(order=>{
  if(!order.serviceRequestId||order.status==='zakljuceno')return [];
  let group:IntakeQueueItem['group']='service',label=order.nextActionLabel,anchor='naslednji-korak';
  if(order.nextActionKind==='review_quibi_mismatch'){group='service';}
  else if(['potreben_pregled','pripravljeno_za_prevzem'].includes(order.status)){group='review';anchor='popravilo';}
  else if(['aktivno_popravilo','caka_dele'].includes(order.status)){group='work';anchor='popravilo';}
  else if(order.status==='manjkajo_podatki'){group='data';anchor='podatki';}
  else if(order.requiresAttention){group='service';}
  else if(order.fixedPriceStatus&&['review_estimate','send_estimate','await_customer'].includes(order.nextActionKind??'')){group=order.nextActionKind==='await_customer'?'customer':'estimate';anchor='objavljena-cena';}
  else if(['review_estimate','revise_estimate','send_estimate'].includes(order.nextActionKind??'')){group='estimate';anchor='pregled-predracuna';}
  else if(order.nextActionKind==='await_customer'){group='customer';anchor='odobritev';}
  else if(order.nextActionKind==='manual_external_handoff'&&order.nextActionLabel==='Dodeli mehaniku'&&order.quibiWorkOrderId&&!order.repairPhase){group='work';anchor='popravilo';label='Dodeli mehaniku';}
  else if(order.nextActionKind==='manual_external_handoff'){group='service';}
  else if(order.nextActionKind==='automatic_estimate'){group='estimate';anchor='predracun';}
  else if(order.nextActionKind==='link_quibi'){anchor='quibi-povezava';}
  else if(order.slotOfferExpired){anchor='termini';label='Predlogi terminov so potekli. Umakni ponudbo in preveri nove možnosti.';}
  else if(order.slotOfferStatus&&order.slotOfferStatus!=='confirmed'){
   anchor='termini';
   if(order.slotOfferStatus==='offered'){group='slots';label='Počakaj na izbiro stranke in jo zabeleži.';}
   else if(order.slotOfferStatus==='selected')label='Preveri in ročno potrdi izbrani termin; še ni rezerviran.';
   else label='Preglej tri predloge in pripravljeno sporočilo. Po dejanskem pošiljanju to zabeleži.';
  }
  else if(order.inspectionRequested){anchor='termini';label=order.slotOfferStatus==='confirmed'?'Predhodni pregled: zabeleži ugotovitve šele po opravljenem pregledu.':'Preveri razpoložljivost in pripravi tri ročne predloge za pregled.';}
  else if(order.status==='caka_izbiro_termina'&&(!order.nextActionKind||order.nextActionKind==='manual_scheduling')){group='slots';anchor='termini';}
  else if(order.status==='caka_potrditev_ponudbe'){group='customer';anchor='odobritev';}
  else if(order.status==='novo'){group='new';}
  else if(order.status==='priprava_ponudbe'){anchor='predracun';}
  return [{order,group,label,href:'/dashboard/primeri/'+order.serviceRequestId+'#'+anchor}];
 }).sort((a,b)=>Number(!!b.order.requiresAttention||b.order.nextActionKind==='review_quibi_mismatch')-Number(!!a.order.requiresAttention||a.order.nextActionKind==='review_quibi_mismatch')||b.order.updatedAt.localeCompare(a.order.updatedAt)||a.order.id.localeCompare(b.order.id));
}
export function filterIntakeQueue(rows:IntakeQueueItem[],group:IntakeQueueGroup,search:string){
 const query=search.trim().toLocaleLowerCase('sl-SI');
 return rows.filter(row=>(group==='all'||row.group===group)&&matchesDashboardSearch(row.order,query));
}

/** Presentation groups derive from existing repair phases; no business transition. */
export const DASHBOARD_GROUPS = [
 {id:'new',label:'Novo'},
 {id:'decision',label:'Čaka moje dejanje'},
 {id:'work',label:'V delu'},
 {id:'review',label:'Pregled vodje'},
 {id:'invoice',label:'Račun'},
 {id:'handover',label:'Prevzem'},
 {id:'done',label:'Zaključeno'},
] as const;
export type DashboardGroup = typeof DASHBOARD_GROUPS[number]['id'];
export type DashboardQueueItem = Omit<IntakeQueueItem,'group'> & {group:DashboardGroup};
export function uniqueDashboardOrders(orders:ServiceOrderDemo[]){const unique=new Map<string,ServiceOrderDemo>();for(const order of orders){const key=order.serviceRequestId??order.id;const prior=unique.get(key);if(!prior||order.updatedAt>prior.updatedAt)unique.set(key,order);}return [...unique.values()];}
export function dashboardQueue(orders:ServiceOrderDemo[]):DashboardQueueItem[]{
 orders=uniqueDashboardOrders(orders);
 const open:DashboardQueueItem[]=intakeQueue(orders).map(row=>({
  ...row,href:row.order.repairPhase==='handover'?'/dashboard/primeri/'+row.order.serviceRequestId+'#prevzem':row.order.repairPhase==='invoice_review'?'/dashboard/primeri/'+row.order.serviceRequestId+'#poslovni-nalog':row.href,
  group:row.order.repairPhase==='invoice_review'?'invoice':row.order.repairPhase==='handover'?'handover':row.order.repairPhase==='review_required'?'review':row.order.requiresAttention||row.order.nextActionKind==='review_quibi_mismatch'?'decision':row.group==='new'?'new':row.group==='work'||row.group==='review'||row.order.status==='termin_potrjen'?'work':'decision',
 }));
 const closed:DashboardQueueItem[]=orders.filter(order=>order.status==='zakljuceno'&&order.serviceRequestId).map(order=>({order,group:'done',label:'Odpri zaključen primer',href:'/dashboard/primeri/'+order.serviceRequestId}));
 return [...open.sort((a,b)=>b.order.updatedAt.localeCompare(a.order.updatedAt)||a.order.id.localeCompare(b.order.id)),...closed.sort((a,b)=>b.order.updatedAt.localeCompare(a.order.updatedAt)||a.order.id.localeCompare(b.order.id))];
}
export function filterDashboardQueue(rows:DashboardQueueItem[],group:DashboardGroup,search:string){
 const query=search.trim().toLocaleLowerCase('sl-SI');
 return rows.filter(row=>row.group===group&&matchesDashboardSearch(row.order,query));
}


/** Explicit test markers only: normal words/names containing 'test' are not hidden. */
export function isSyntheticOrder(order:ServiceOrderDemo){return order.synthetic===true||[order.customerName,order.requestSummary].some(value=>/^(?:QA-SIM(?:\b|[-_])|TEST(?:[-_\s:]|$))/i.test(value.trim()));}
export function shortNextAction(item:DashboardQueueItem){
 const anchor=item.href.split('#')[1];
 if(item.order.quibiWorkOrderId&&!item.order.repairPhase&&item.label==='Dodeli mehaniku')return 'Dodeli mehaniku';
 if(item.group==='new')return 'Preglej povpraševanje';
 if(item.group==='invoice')return 'Odpri račun';
 if(item.group==='review')return 'Preglej opravljeno delo';
 if(item.group==='handover')return 'Prevzem vozila';
 if(item.group==='done')return 'Odpri primer';
 if(item.order.nextActionKind==='automatic_estimate')return item.order.nextActionLabel.replace(/[.!]$/,'');
 if(item.order.nextActionKind==='review_quibi_mismatch')return 'Preveri dokument';
 return ({podatki:'Preveri podatke','quibi-povezava':'Preveri povezavo',predracun:'Pripravi predračun','pregled-predracuna':'Preglej predračun',odobritev:'Zabeleži odgovor',termini:'Uredi dogovor',popravilo:item.group==='work'?'Odpri delo':'Preglej delo','objavljena-cena':'Preglej storitev'} as Record<string,string>)[anchor]??'Odpri primer';
}

export function dashboardStatusLabel(order:ServiceOrderDemo){
 return ({assigned:'Dodeljeno mehaniku',in_progress:'Delo poteka',awaiting_parts:'Čaka dele',review_required:'Čaka vodjo',invoice_review:'Priprava računa',handover:'Čaka prevzem',document_unknown:'Preveri dokument',closed:'Zaključeno'} as Record<string,string>)[order.repairPhase??'']??getStatusLabel(order.status);
}

/** Operates only on the authenticated, organization-scoped snapshot. */
export function matchesDashboardSearch(order:ServiceOrderDemo,search:string){
 const query=search.trim().replace(/^quibi\s*#?\s*(?=\d+$)/i,'').replace(/^#/,'').toLocaleLowerCase('sl-SI');
 return !query||[order.id,order.serviceRequestId,order.serviceRequestId?.slice(0,8),order.quibiWorkOrderId,order.customerName,order.registration,order.vehicleMakeModel,order.requestSummary,order.mechanicName].filter(Boolean).join(' ').toLocaleLowerCase('sl-SI').includes(query);
}

export function defaultDashboardGroup(orders:ServiceOrderDemo[]):DashboardGroup{
 const rows=dashboardQueue(orders.filter(order=>!isSyntheticOrder(order)));
 return DASHBOARD_GROUPS.find(group=>rows.some(row=>row.group===group.id))?.id??'new';
}
