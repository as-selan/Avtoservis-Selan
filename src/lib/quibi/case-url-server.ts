import 'server-only';
import {configuredQuibiWorkflowWriteClient} from './write-client';
import {syncQuibiCaseUrl} from './case-url-sync';
/** Best effort; the same key makes the next verified sync safe after an unknown outcome. */
export async function syncVerifiedCaseUrl(documentId:string,caseId:string):Promise<void>{
 try {
  const client=configuredQuibiWorkflowWriteClient();
  const ok=await syncQuibiCaseUrl({documentId,caseId,origin:process.env.PUBLIC_APP_ORIGIN??'',verified:true,production:process.env.QUIBI_MODE==='production'},client);
  if(!ok)console.error('quibi_case_url_sync_failed');
 } catch { console.error('quibi_case_url_sync_failed'); }
}
