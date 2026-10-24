import {VehicleResolutionForm} from './VehicleResolutionForm';
type Fields={vin:string;registration:string;make:string;model:string};
/** Permission mirrors the existing server action: only owner may confirm CREATE. */
export function NewVehicleDecision({role,caseId,expected,fields,fingerprint,enabled,readOk=true}:{role:string;caseId:string;expected:string;fields:Fields;fingerprint:string;enabled:boolean;readOk?:boolean}){
 const complete=Object.values(fields).every(value=>!!value.trim());
 return <section aria-label="Potrditev vozila" className="space-y-4"><h2 className="text-lg font-semibold">Novo vozilo – potrebna potrditev</h2>
 <dl className="grid grid-cols-2 gap-3 text-sm">{Object.entries(fields).map(([key,value])=><div key={key}><dt className="text-slate-500">{{vin:'VIN',registration:'Registracija',make:'Znamka',model:'Model'}[key]}</dt><dd className="break-words font-medium">{value||'Manjka podatek'}</dd></div>)}</dl>
 {!readOk?<p role="status">Obstoječih vozil trenutno ni mogoče preveriti. Povezava mora biti obnovljena pred ustvarjanjem; podatki povpraševanja ostajajo shranjeni.</p>:role!=='owner'?<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Novo vozilo lahko potrdi samo lastnik. Lastnik naj odpre ta isti primer, preveri zgornje podatke in izbere »Potrdi in ustvari vozilo v Quibiju«. Administrator te pravice nima.</p>:enabled&&complete?<><p className="text-sm">Stranka je povezana. S klikom izrecno potrdite podatke in ustvarjanje vozila. Selan nato sam pripravi predračun.</p><VehicleResolutionForm directConfirmation caseId={caseId} expected={expected} mode="create" baselineFingerprint={fingerprint} enabled/></>:<p role="status">{!complete?'Dopolnite manjkajoče podatke vozila.':'Povezava ali dovoljenje za zapis še nista potrjena.'} <a className="text-blue-700 underline" href="#podatki">Odpri podatke in preveri povezavo</a></p>}
 </section>;
}
