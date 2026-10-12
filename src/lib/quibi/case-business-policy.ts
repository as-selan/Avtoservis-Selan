export type BusinessReference={id:string;quibi_document_id:string;content_sha256:string;quibi_environment:string;quibi_customer_id?:string;quibi_vehicle_id?:string};
export function assertCaseBusinessScope(env:Record<string,string|undefined>,status:string,kind:string,repairCompleted:boolean,readOnly=false){
 if(env.APP_ENV!=='preproduction'||env.QUIBI_MODE!=='dev'||env.VERCEL_ENV!=='preview'||env.SELAN_REMOTE_DEMO==='1'||env.QUIBI_E2E_WRITE_ENABLED==='1')throw Error('CASE_BUSINESS_FORBIDDEN');
 if(!['awaiting_slot_selection','appointment_confirmed','converted'].includes(status)||!['work_order','invoice'].includes(kind)||(kind==='invoice'&&!repairCompleted&&!readOnly))throw Error('QUIBI_BUSINESS_STAGE_NOT_READY');
}
export type JournalReferenceRow={id:string;kind:string;state:string;quibi_id:string|null;quibi_content_sha256:string|null;request_body:string;created_at:string};
export function caseBusinessReference(rows:JournalReferenceRow[],kind:string):BusinessReference|null{
 const related=rows.filter(r=>r.kind===kind||r.kind===kind+'_update');
 if(related.some(r=>r.state!=='verified'))throw Error('QUIBI_OPERATION_REQUIRES_RECONCILIATION');
 if(!related.length)return null;
 const creates=related.filter(r=>r.kind===kind);if(creates.length!==1)throw Error('CASE_DOCUMENT_CONFLICT');
 const latest=[...related].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
 if(!latest.quibi_id||latest.quibi_id!==creates[0].quibi_id||!latest.quibi_content_sha256||!/^[a-f0-9]{64}$/.test(latest.quibi_content_sha256))throw Error('CASE_DOCUMENT_UNVERIFIED');
 const payload=JSON.parse(latest.request_body),body=payload.body??payload;if(!body.Glavadokumenta)throw Error('CASE_DOCUMENT_UNVERIFIED');
 return {id:latest.id,quibi_document_id:latest.quibi_id,content_sha256:latest.quibi_content_sha256,quibi_environment:'dev',quibi_customer_id:String(body.Glavadokumenta.stranka_id),quibi_vehicle_id:String(body.Glavadokumenta.vozila_id)};
}

export function assertBusinessCreationNamespace(rows:{local_entity_id:string;kind:string}[],scopeId:string,kind:string){if(rows.some(r=>r.kind===kind&&r.local_entity_id!==scopeId))throw Error('CASE_DOCUMENT_CONFLICT')}
