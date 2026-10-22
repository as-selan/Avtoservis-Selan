import {journeyActionDescription} from '@/lib/cases/workspace';
import { caseJourney, journeyStages, type JourneyInput } from '@/lib/cases/journey';

export function CaseJourney({ input, explanation }: { input: JourneyInput; explanation: string }) {
 const journey=caseJourney(input);
 return <section aria-label="Postopek primera" className="scroll-mt-20 space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5" id="naslednji-korak">
  <div><h2 className="text-lg font-semibold text-blue-950">{journey.terminal?'Zaključen postopek':'Kaj je naslednje?'}</h2>
   <p className="mt-1 text-sm text-blue-900">{journey.terminal?'Preglejte shranjena dokazila in podatke primera.':`Trenutna faza ${journey.current+1} od 7: ${journeyStages[journey.current]}`}</p></div>
  <a data-case-primary href={journey.action.href} className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-center font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto">{journey.action.label} →</a>
  <p className="text-sm text-blue-950">{journeyActionDescription(journey.action.href)}</p>
  {journey.blocker&&<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{journey.blocker}</p>}
  <ol aria-label="Faze postopka" className="grid grid-cols-2 gap-2 xl:grid-cols-4">{journeyStages.map((label,index)=>{
   const current=!journey.terminal&&index===journey.current;
   const state=current?'Trenutno':journey.completed[index]?'Opravljeno':'Še ni potrjeno';
   return <li key={label} aria-current={current?'step':undefined} className={`min-w-0 rounded-lg border p-2.5 text-sm ${current?'border-blue-600 bg-white text-blue-950':journey.completed[index]?'border-green-200 bg-green-50 text-green-950':'border-slate-200 bg-white text-slate-600'}`}><span className="block font-semibold">{index+1}. {label}</span><span className="text-xs">{state}</span></li>;
  })}</ol>
  <p className="text-xs text-slate-600">Priprava, ustvarjen dokument, pošiljanje in odobritev stranke so ločeni koraki. Odobritev po telefonu ne potrjuje pošiljanja. Termin uredite ločeno.</p>
  <details className="text-sm text-slate-700"><summary className="cursor-pointer">Podrobnosti trenutnega stanja</summary><p className="mt-2">{explanation}</p></details>
 </section>;
}
