import {caseJourney,type JourneyInput} from '@/lib/cases/journey';

export function CaseJourney({input,explanation}:{input:JourneyInput;explanation:string}){
 const journey=caseJourney(input);
 const nextExplanation=input.devNoEmail&&input.quoteReviewed&&!input.customerApproved&&!input.hasWorkOrder?"Predračun je pregledan. Zabeležite odgovor stranke.":explanation;
 return <section aria-label="Naslednje opravilo" className="scroll-mt-20 rounded-xl bg-slate-100 p-4 sm:p-5" id="naslednji-korak">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
   <div className="min-w-0"><h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">{journey.terminal?'Primer je zaključen':'Naslednje opravilo'}</h2><p className="mt-1 font-semibold text-slate-950">{nextExplanation}</p></div>
   <a data-case-primary href={journey.action.href} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-5 py-3 text-center font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{journey.action.label} →</a>
  </div>
  {journey.blocker&&<p role="status" className="mt-3 text-sm text-amber-950">{journey.blocker}</p>}
 </section>;
}
