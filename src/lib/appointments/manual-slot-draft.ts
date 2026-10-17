import {ljubljanaWallTimeToIso} from './ljubljana-time';

/** User-supplied, actually checked options only. Never invents availability. */
export function manualSlotDraft(values: string[], now = Date.now()): {ok:true;slots:string[];message:string} | {ok:false;message:string} {
  const slots=values.map(ljubljanaWallTimeToIso);
  if(values.length!==3||slots.some(slot=>!slot))return {ok:false,message:'Vnesite tri veljavne in nedvoumne termine po času Europe/Ljubljana.'};
  const verified=slots as string[];
  if(new Set(verified).size!==3)return {ok:false,message:'Izberite tri različne termine.'};
  if(verified.some(slot=>Date.parse(slot)<=now))return {ok:false,message:'Vsi trije termini morajo biti v prihodnosti. Ponovno preverite razpoložljivost.'};
  return {ok:true,slots:verified,message:slotProposalMessage(verified)};
}

export function slotProposalMessage(slots: string[]): string {
  return ['Pozdravljeni,','', 'Predlagamo tri ročno preverjene možnosti:',...slots.map((slot,i)=>`${i+1}. ${new Date(slot).toLocaleString('sl-SI',{timeZone:'Europe/Ljubljana',dateStyle:'medium',timeStyle:'short'})}`),'Prosimo, sporočite svojo izbiro. Termin do naše potrditve ni rezerviran.','','Lep pozdrav, Avtoservis Selan'].join('\n');
}
