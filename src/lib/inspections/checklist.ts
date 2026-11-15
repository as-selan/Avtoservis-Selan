import type {EstimateDraftRow} from '../quibi/estimate-editor.ts';
export const INSPECTION_ITEMS = ['Zavore', 'Pnevmatike', 'Tekočine', 'Podvozje', 'Luči', 'Drugo'] as const;
export type InspectionItem = typeof INSPECTION_ITEMS[number];
export type InspectionChecks = Partial<Record<InspectionItem, 'ok' | 'repair' | 'not_inspected'>>;
/** Existing findings/notes storage; unmarked items never imply a completed check. */
export function inspectionFindings(checks: InspectionChecks, note = '') {
  return [...INSPECTION_ITEMS.flatMap(item => checks[item] ? [item + ': ' + (checks[item] === 'ok' ? 'V redu' : checks[item] === 'repair' ? 'Potrebno popravilo' : 'Ni pregledano')] : []), note.trim()].filter(Boolean).join('\n');
}
/** Restore the latest explicitly saved state; ordinary notes do not change checks. */
export function inspectionChecksFromNotes(notes:string[]):InspectionChecks {
 const checks:InspectionChecks={};
 for(const note of notes) for(const line of note.split(/\r?\n/)) for(const item of INSPECTION_ITEMS){
  if(line===item+': V redu') checks[item]='ok';
  else if(line===item+': Potrebno popravilo') checks[item]='repair';
  else if(line===item+': Ni pregledano') checks[item]='not_inspected';
 }
 return checks;
}
export function inspectionChangedChecks(current:InspectionChecks,saved:InspectionChecks):InspectionChecks {
 const changed:InspectionChecks={};
 for(const item of INSPECTION_ITEMS) if(current[item]!==undefined && current[item]!==saved[item]) changed[item]=current[item];
 return changed;
}
export function inspectionRepairServices(findings?: string | null) {
  return (findings ?? '').split(/\r?\n/).flatMap(line => {
    const match = /^(Zavore|Pnevmatike|Tekočine|Podvozje|Luči|Drugo): Potrebno popravilo$/.exec(line.trim());
    return match ? [match[1]] : [];
  });
}

/** Findings suggest scope, never a price, quantity, performed repair or approval. */
export function withInspectionRows(rows:EstimateDraftRow[],findings?:string|null):EstimateDraftRow[] {
 const extra=inspectionRepairServices(findings).map(item=>item+' – potrebno popravilo');
 const labels=new Set(rows.map(row=>(row.requestedService??row.description??'').toLocaleLowerCase('sl-SI')));
 return [...rows,...extra.filter(label=>!labels.has(label.toLocaleLowerCase('sl-SI'))).map(requestedService=>({key:'',quantity:'',discount:'',description:requestedService,requestedService}))];
}
