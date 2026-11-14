export type FindingStatus='needed'|'planned'|'completed'|'rejected'|'deferred'|'unknown';
type Finding={id:string;case_id:string;description:string;state:string;created_at:string};
type Offer={finding_id:string;case_id:string;quibi_operation_id:string|null;completed_at:string|null};
export type VehicleFinding=Finding & {status:FindingStatus};
/** Only explicit completion on the same case and finding proves work was performed. */
export function vehicleFindings(caseIds:string[],findings:Finding[],offers:Offer[]|null):VehicleFinding[]{
 const allowed=new Set(caseIds);
 return findings.filter(f=>allowed.has(f.case_id)).map(f=>{
  let status:FindingStatus='unknown';
  if(f.state==='recorded')status='needed';
  else if(f.state==='rejected')status='rejected';
  else if(f.state==='noted')status='deferred';
  else if(f.state==='approved'&&offers)status=offers.some(o=>o.case_id===f.case_id&&o.finding_id===f.id&&!!o.quibi_operation_id&&!!o.completed_at)?'completed':'planned';
  return {...f,status};
 });
}
