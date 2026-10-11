"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {processIntakeSynchronization} from './automatic-intake-sync';
import {revalidatePath} from 'next/cache';
export async function retryIntakeSynchronization(caseId:string){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Povezavo lahko preveri skrbnik.'};
 const db=await createClient();
 const {data,error}=await db.from('service_requests').select('id').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single();
 if(error||!data)return {ok:false,message:'Servisni primer ni dostopen.'};
 await processIntakeSynchronization(data.id);
 revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+data.id);
 return {ok:true,message:'Povezava je ponovno preverjena. Upoštevajte stanje primera; neznani zahtevki niso ponovno poslani.'};
}
