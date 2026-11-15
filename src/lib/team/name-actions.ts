"use server";
import {createClient as privilegedClient} from '@supabase/supabase-js';
import {revalidatePath} from 'next/cache';
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {saveMechanicName} from './mechanic-name';
export async function updateMechanicName(form:FormData){
 try{
  const access=await requireWorkshopAccess();if(access.role!=='owner')return {ok:false,message:'Ime mehanika lahko ureja samo lastnik.'};
  const db=await createClient();
  await saveMechanicName({role:access.role,organizationId:access.organizationId,target:String(form.get('target')??''),name:form.get('fullName'),isMechanic:async(org,id)=>{const r=await db.from('organization_memberships').select('profile_id').eq('organization_id',org).eq('profile_id',id).eq('role','mechanic').maybeSingle();return !r.error&&!!r.data;},save:async(id,name)=>{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('CONFIGURATION_REQUIRED');
   // Existing RLS only permits self-updates. Privilege is confined to this checked
   // owner action and this single column; never edit Auth, email or membership.
   const admin=privilegedClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const r=await admin.from('profiles').update({full_name:name||null}).eq('id',id).select('id').single();if(r.error||!r.data)throw Error('SAVE_FAILED');
  }});
  revalidatePath('/dashboard','layout');return {ok:true,message:'Ime mehanika je shranjeno.'};
 }catch(e){return {ok:false,message:e instanceof Error&&e.message==='INVALID_NAME'?'Ime lahko vsebuje največ 120 znakov brez kontrolnih znakov.':'Imena ni bilo mogoče shraniti. Preverite članstvo in poskusite znova.'};}
}
