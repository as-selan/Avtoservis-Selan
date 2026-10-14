"use server";
import {revalidatePath} from 'next/cache';import {redirect} from 'next/navigation';import {createClient} from '@/lib/supabase/server';import {completePasswordOnboarding} from '@/lib/team/password-onboarding';
export type SetPasswordState={error:string|null};
export async function setPasswordAction(_prev:SetPasswordState,form:FormData):Promise<SetPasswordState>{
 const db=await createClient();const result=await completePasswordOnboarding(String(form.get('password')??''),String(form.get('confirm')??''),{
 identity:async()=>{const r=await db.auth.getUser();return r.error?null:r.data.user?.id??null;},
 updatePassword:async password=>!(await db.auth.updateUser({password})).error,
 acceptInvitation:async()=>{const r=await db.rpc('accept_team_invitation');return !r.error&&r.data===true;},
 activeWorkshopRole:async userId=>{const org=await db.from('organizations').select('id').eq('slug','avtoservis-selan').maybeSingle();if(org.error||!org.data)return null;const m=await db.from('organization_memberships').select('role').eq('organization_id',org.data.id).eq('profile_id',userId).eq('is_active',true).maybeSingle();return m.error?null:m.data?.role??null;}
 });if('error' in result)return {error:result.error};revalidatePath('/','layout');redirect(result.destination);
}
