import {caseWorkQuibiEnvironment,quibiJournalTable} from './deployment-policy';
import {createClient} from '@/lib/supabase/server';
import {assertCaseBusinessScope,caseBusinessReference,type JournalReferenceRow} from './case-business-policy';
export async function loadCaseBusinessContext(db:Awaited<ReturnType<typeof createClient>>,organizationId:string,caseId:string,kind:string,repairCompleted:boolean,readOnly=false,allowPendingReference=false){
 const {data,error}=await db.from('service_requests').select('id,customer_id,vehicle_id,status,problem_description').eq('organization_id',organizationId).eq('id',caseId).is('archived_at',null).single();
 if(error||!data||!data.customer_id||!data.vehicle_id||caseId==='9d40c42f-b6a8-473b-983f-f9620df97d10')throw Error('CASE_BLOCKED');
 assertCaseBusinessScope(process.env,data.status,kind,repairCompleted,readOnly);
 const {data:operations,error:journalError}=await db.from(quibiJournalTable(caseWorkQuibiEnvironment(process.env))).select('id,kind,state,quibi_id,quibi_content_sha256,request_body,created_at').eq('organization_id',organizationId).eq('service_request_id',caseId).in('kind',['work_order','invoice','work_order_update','invoice_update']);
 if(journalError)throw Error('QUIBI_JOURNAL_READ_FAILED');
 const rows=(operations??[]) as JournalReferenceRow[];
 return {order:{...data,service_request_id:data.id,status:kind==='invoice'?'ready_for_collection':'open'},reference:readOnly&&allowPendingReference?null:caseBusinessReference(rows,kind,caseWorkQuibiEnvironment(process.env)),workOrderReference:caseBusinessReference(rows,'work_order',caseWorkQuibiEnvironment(process.env))};
}
