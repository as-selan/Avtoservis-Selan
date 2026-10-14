"use server";
import {createClient as adminClient} from '@supabase/supabase-js';
import {revalidatePath} from 'next/cache';
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {inviteEmail,ownerAction,dispatchTeamInvitation} from './policy';
export async function teamAction(form:FormData){try{
 const access=await requireWorkshopAccess();ownerAction(access.role,form.get('confirmed'));const db=await createClient();const action=String(form.get('action'));
 if(action==='invite'){
  const email=inviteEmail(form.get('email')),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,origin=process.env.PUBLIC_APP_ORIGIN||process.env.COMPLETION_PUBLIC_ORIGIN;
  if(!url||!key||!origin||new URL(origin).protocol!=='https:')throw Error('CONFIGURATION_REQUIRED');
  const admin=adminClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  await dispatchTeamInvitation({email,prepare:async()=>{const r=await db.rpc('prepare_team_invitation',{p_org:access.organizationId,p_email:email});if(r.error)throw Error(r.error.message.includes('ACCOUNT_ALREADY_EXISTS')?'ACCOUNT_ALREADY_EXISTS':'INVITE_UNAVAILABLE');return String(r.data)},invite:async(address)=>{const r=await admin.auth.admin.inviteUserByEmail(address,{redirectTo:new URL('/auth/accept-invite',origin).href});if(r.error&&!((r.error.status??0)>=400&&(r.error.status??0)<500))throw Error('INVITE_UNKNOWN');return {userId:r.data.user?.id??null,rejected:!!r.error}},finish:async(id,user,state)=>{const r=await admin.rpc('finish_team_invitation',{p_id:id,p_user:user,p_state:state});if(r.error)throw Error('INVITE_UNKNOWN')}});
 }else if(action==='cancel'||action==='deactivate'){
  const target=String(form.get('target'));if(!/^[a-f0-9-]{36}$/i.test(target))throw Error('INVALID_INPUT');const r=await db.rpc('change_team_access',{p_org:access.organizationId,p_target:target,p_cancel:action==='cancel'});if(r.error)throw Error('ACCESS_CHANGE_FAILED');
 }else throw Error('INVALID_INPUT');
 revalidatePath('/dashboard/nastavitve/ekipa');return {ok:true,message:action==='invite'?'Povabilo je sprejel Supabase Auth. Dostop nastane po sprejemu povabila; prejem e-pošte še ni potrjen.':'Sprememba dostopa je shranjena.'};
}catch(e){return {ok:false,message:e instanceof Error&&e.message==='ACCOUNT_ALREADY_EXISTS'?'Račun že obstaja. Novega ne ustvarjamo; preverite njegovo obstoječe članstvo.':'Dejanje ni potrjeno. Preverite dovoljenja in namestitev migracije. Ob negotovem povabilu ne pošiljajte znova; preverite stanje v Ekipi.'}}}
