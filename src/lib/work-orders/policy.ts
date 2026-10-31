export const workOrderLabels: Record<string,string>={open:"Odprt nalog",in_progress:"Popravilo poteka",awaiting_parts:"Čaka na dele",ready_for_collection:"Pripravljeno za prevzem",closed:"Zaključeno"};
export function canTransitionWorkOrder(from:string,to:string):boolean {
 const transitions:Record<string,string[]>={open:["in_progress"],in_progress:["awaiting_parts","ready_for_collection"],awaiting_parts:["in_progress"],ready_for_collection:["in_progress","closed"],closed:[]};
 return transitions[from]?.includes(to)??false;
}
export function inspectionChargePolicy(decision:string|null){return decision===null?"not_applicable":decision==="ordered"?"waived":decision==="not_ordered"?"charge_required":"unresolved"}
