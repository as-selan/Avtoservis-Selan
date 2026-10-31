import type {EstimateDraftRow} from '../quibi/estimate-editor.ts';
export const INSPECTION_ITEMS = ['Zavore', 'Pnevmatike', 'Tekočine', 'Podvozje', 'Luči', 'Drugo'] as const;
export type InspectionItem = typeof INSPECTION_ITEMS[number];
export type InspectionChecks = Partial<Record<InspectionItem, 'ok' | 'repair'>>;
/** Existing findings/notes storage; unmarked items never imply a completed check. */
export function inspectionFindings(checks: InspectionChecks, note = '') {
  return [...INSPECTION_ITEMS.flatMap(item => checks[item] ? [item + ': ' + (checks[item] === 'ok' ? 'V redu' : 'Potrebno popravilo')] : []), note.trim()].filter(Boolean).join('\n');
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
