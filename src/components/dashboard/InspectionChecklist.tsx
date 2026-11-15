"use client";
import {INSPECTION_ITEMS, type InspectionChecks} from '@/lib/inspections/checklist';
const states=[{value:'ok',label:'V redu'},{value:'repair',label:'Potrebno popravilo'},{value:'not_inspected',label:'Ni pregledano'}] as const;
export function InspectionChecklist({value,onChange,disabled=false}:{value:InspectionChecks;onChange:(value:InspectionChecks)=>void;disabled?:boolean}) {
 return <fieldset disabled={disabled} className="space-y-2"><legend className="font-medium">Pregled vozila</legend>{INSPECTION_ITEMS.map(item=><div key={item} className="border-b border-slate-100 py-2"><span>{item}</span><div className="mt-2 flex flex-wrap gap-2">{states.map(state=><button key={state.value} type="button" aria-label={item+' – '+state.label} aria-pressed={(value[item]??'not_inspected')===state.value} onClick={()=>onChange({...value,[item]:state.value})} className={'min-h-11 rounded-lg border px-3 py-2 text-sm '+((value[item]??'not_inspected')===state.value?'border-blue-700 bg-blue-50 text-blue-900':'border-slate-300 bg-white')}>{state.label}</button>)}</div></div>)}</fieldset>;
}
