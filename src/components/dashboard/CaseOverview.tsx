import type {ReactNode} from 'react';

/** Keep the working context visible above the active form. */
export function CaseOverview({customer,vehicle,request,missing,status,prepared,mechanicName,mechanicEmail}:{mechanicName?:string|null;mechanicEmail?:string|null;customer:string;vehicle:string;request:string;missing:string[];status?:string;prepared?:string}){
 return <section aria-label="Povzetek povpraševanja" className="space-y-3 py-1 text-sm">
  <dl className="grid gap-4 sm:grid-cols-3">
   <Entry label="Stranka">{customer}</Entry>
   <Entry label="Vozilo">{vehicle}</Entry>
   {(mechanicName||mechanicEmail)&&<Entry label="Mehanik">{mechanicName?.trim()||mechanicEmail||'Mehanik'}{mechanicName?.trim()&&mechanicEmail&&<span className="block break-all text-xs font-normal text-slate-500">{mechanicEmail}</span>}</Entry>}
   {status&&<Entry label="Trenutno stanje">{status}</Entry>}
  </dl>
  <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
   <details className="min-w-0"><summary className="cursor-pointer text-slate-500">Zahtevane storitve in opis</summary><p className="mt-2 whitespace-pre-wrap break-words">{request.replace(/\\n/g,'\n')}</p></details>
   {prepared&&<div className="min-w-0"><dt className="text-xs font-medium text-slate-500">Selan je pripravil</dt><dd className="mt-1 text-slate-950">{prepared}</dd></div>}
  </dl>
  {missing.length>0&&<p className="text-amber-900">Dopolnite: {missing.join(', ')}.</p>}
 </section>;
}
function Entry({label,children}:{label:string;children:ReactNode}){return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-950">{children}</dd></div>;}
