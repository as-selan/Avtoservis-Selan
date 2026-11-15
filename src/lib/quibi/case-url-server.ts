import 'server-only';
import {after} from 'next/server';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {retryQuibiCaseUrl} from './case-url-sync';
/** Only called after the document association is verified and persisted. */
export async function syncVerifiedCaseUrl(documentId:string,caseId:string):Promise<void>{
 try {
  after(async()=>{
   try {
    const client=configuredQuibiWorkflowWriteClient();
    const ok=await retryQuibiCaseUrl({documentId,caseId,origin:process.env.PUBLIC_APP_ORIGIN??'',verified:true,production:process.env.QUIBI_MODE==='production'},client);
    if(!ok)console.error('quibi_case_url_sync_failed');
   } catch { console.error('quibi_case_url_sync_failed'); }
  });
 } catch { console.error('quibi_case_url_schedule_failed'); }
}
