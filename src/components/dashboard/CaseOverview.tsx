import type {ReactNode} from 'react';

/** Essential context stays visible even when its full form is collapsed. */
export function CaseOverview({customer,vehicle,request,missing}:{customer:string;vehicle:string;request:string;missing:string[]}){
 return <section aria-label="Povzetek povpraševanja" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
  <dl className="grid gap-3 sm:grid-cols-2">
   <Entry label="Stranka">{customer}</Entry>
   <Entry label="Vozilo">{vehicle}</Entry>
   <div className="min-w-0 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Želja stranke</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-950">{request}</dd></div>
  </dl>
  <p className={`mt-3 border-t pt-3 ${missing.length?'text-amber-900':'text-slate-600'}`}>{missing.length?`Dopolnite: ${missing.join(', ')}. Odprite naslednji korak za dopolnitev podatkov.`:'Osnovni podatki so izpolnjeni. Naslednje opravilo je prikazano spodaj.'}</p>
 </section>;
}
function Entry({label,children}:{label:string;children:ReactNode}){return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-950">{children}</dd></div>;}
