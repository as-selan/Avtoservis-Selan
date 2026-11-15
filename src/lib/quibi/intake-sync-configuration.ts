import {hostedQuibiEnvironment,caseWorkQuibiEnvironment} from './deployment-policy.ts';
import {quibiWorkflowConfig} from './workflow-config.ts';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function intakeSyncConfigurationProblem(env:Record<string,string|undefined>,capability:'read'|'write'='write'):string|null{
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1')return 'V spletnem okolju je vključeno lokalno dovoljenje QUIBI_DEV_LOCAL_WRITE_ENABLED ali QUIBI_DEV_LOCAL_SEND_ENABLED. Skrbnik mora odstraniti lokalno dovoljenje; zapisovanje je ustavljeno.';
 const fixture=env.QUIBI_E2E_WRITE_ENABLED==='1';
 let mode:'dev'|'production';try{mode=fixture?caseWorkQuibiEnvironment(env):hostedQuibiEnvironment(env)}catch{return 'Okolje Quibi in ločena Supabase povezava nista usklajena (DEV Preview / produkcija).'}
 const prefix=mode==='dev'?'QUIBI_DEV':'QUIBI_PRODUCTION';
 if(env[prefix+'_INTAKE_SYNC_ENABLED']!=='1')return 'Manjka vklop '+prefix+'_INTAKE_SYNC_ENABLED. Spremembo potrdi skrbnik.';
 if(!env.QUIBI_INTAKE_SYNC_ACTOR_ID||!uuid.test(env.QUIBI_INTAKE_SYNC_ACTOR_ID))return 'QUIBI_INTAKE_SYNC_ACTOR_ID ni nastavljen na veljaven strežniški račun. Nastavitev potrdi skrbnik.';
 if(!env.SUPABASE_SERVICE_ROLE_KEY)return 'Strežniška nastavitev SUPABASE_SERVICE_ROLE_KEY ni dosegljiva. Skrbnik naj preveri zaščiteno nastavitev okolja.';
 if(env.SELAN_REMOTE_DEMO==='1'||env.NEXT_PUBLIC_SELAN_REMOTE_DEMO==='1'||env.SELAN_LOCAL_REVIEW==='1')return 'Preview je označen kot demo ali lokalni pregled (SELAN_REMOTE_DEMO, NEXT_PUBLIC_SELAN_REMOTE_DEMO ali SELAN_LOCAL_REVIEW). Skrbnik mora preveriti okolje.';
 if(capability==='write'&&!fixture&&env[prefix+'_WRITE_ENABLED']!=='1')return prefix+'_WRITE_ENABLED ni vključen. Aktivacijo zapisovanja mora odobriti skrbnik.';
 if(!env[prefix+'_USERNAME']||!env[prefix+'_PASSWORD'])return 'Strežniški nastavitvi '+prefix+'_USERNAME oziroma '+prefix+'_PASSWORD nista dosegljivi.';
 try{const config=quibiWorkflowConfig(env,capability);if(config.mode!==mode)return 'Quibi povezava ne ustreza izbranemu okolju.'}catch{return 'Quibi WRITE konfiguracija ni veljavna. Skrbnik naj preveri '+prefix+'_READ_ENABLED, '+prefix+'_WRITE_ENABLED in strežniške poverilnice; zapisovanje ni sproščeno.'}
 return null;
}
export const INTAKE_ACTOR_ACCESS_PROBLEM='Strežniški račun nima aktivne vloge owner/admin v Avtoservisu Selan. Spremembo računa ali pravic mora odobriti lastnik.';

/** Only a persisted new intake is CREATE intent. Historical page opens are READ-only. */
export function savedIntakeCanResumeCreate(request:{created_at?:string;intake_request_id?:string|null;source?:string}){
 return !!request.intake_request_id&&uuid.test(request.intake_request_id)&&['manual','web_form'].includes(request.source??'')&&Date.parse(request.created_at??'')>=Date.parse('2026-10-26T17:20:11.000Z');
}
