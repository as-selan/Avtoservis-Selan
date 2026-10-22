import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
import {loadCaseWork} from '@/lib/case-work/read';
import {CASE_WORK_LABELS} from '@/lib/case-work/policy';

export default async function MechanicCases(){
 const access=await requireWorkshopAccess();
 if(access.role!=='mechanic')redirect('/dashboard');
 const {rows,error}=await loadCaseWork();
 return <section className="space-y-6">
  <div><h1 className="text-3xl font-semibold tracking-tight">Moje delo</h1><p className="mt-2 text-slate-600">Odpri vozilo, preveri naloge in zabeleži opravljeno delo.</p></div>
  {error?<p role="alert" className="rounded-lg bg-white p-5">Dodelitev ni mogoče prebrati. Osveži stran; če težava ostane, obvesti vodjo.</p>:!rows.length?<p className="rounded-lg bg-white p-6 text-slate-600">Trenutno nimaš dodeljenega dela.</p>:<ul className="divide-y divide-slate-200 rounded-xl bg-white">{rows.map(w=><li key={w.caseId}><Link className="group flex min-h-28 items-center justify-between gap-4 px-5 py-5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600" href={'/dashboard/mehanik/'+w.caseId}><div className="min-w-0 space-y-1"><p className="text-lg font-semibold">{w.vehicle.registration || 'Vozilo brez registracije'}</p><p className="text-slate-600">{w.vehicle.make} {w.vehicle.model}</p><p className="text-sm text-slate-500">Nalog #{w.quibiId} · {w.review?.workLocked?'Zaključeno':CASE_WORK_LABELS[w.status]}</p></div><span className="shrink-0 text-sm font-medium text-blue-700">Odpri →</span></Link></li>)}</ul>}
 </section>;
}
