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
 const result=await processIntakeSynchronization(data.id);
 revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+data.id);
 if(result?.customerId&&result.vehicleId)return {ok:true,message:'Stranka in vozilo sta preverjeno povezana. Preglejte podatke primera in nadaljujte pripravo predračuna.'};
 if(result?.customerId)return {ok:false,message:'Stranka je povezana. Za vozilo dopolnite manjkajoče podatke istega primera; nov poslovni dokument ni ustvarjen.'};
 return {ok:false,message:'Povezava še ni potrjena. Preverite prikazani razlog in identiteto v tem primeru. Neznani zahtevki niso ponovno poslani.'};
}
