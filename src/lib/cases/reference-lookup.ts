import 'server-only';
import type {createClient} from '@/lib/supabase/server';
import {resolveShortCaseReference} from './reference';
export async function lookupCaseReference(db:Awaited<ReturnType<typeof createClient>>,organizationId:string,reference:string){
 return resolveShortCaseReference(reference,organizationId,async(org,range)=>{
  const result=await db.from('service_requests').select('id').eq('organization_id',org).is('archived_at',null).gte('id',range.lower).lte('id',range.upper).limit(2);
  return result.error?[]:(result.data??[]).map(row=>row.id);
 });
}
