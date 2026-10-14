import {quibiWorkflowConfig} from './workflow-config.ts';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function intakeSyncConfigurationProblem(env:Record<string,string|undefined>):string|null{
 if(env.APP_ENV!=='preproduction'||env.QUIBI_MODE!=='dev'||env.VERCEL_ENV!=='preview')return 'Samodejna povezava je dovoljena samo v Selan DEV Vercel Preview.';
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1')return 'V Preview je vključeno lokalno dovoljenje QUIBI_DEV_LOCAL_WRITE_ENABLED ali QUIBI_DEV_LOCAL_SEND_ENABLED. Skrbnik mora odstraniti lokalno dovoljenje; zapisovanje je ustavljeno.';
 if(env.QUIBI_DEV_INTAKE_SYNC_ENABLED!=='1')return 'Manjka vklop QUIBI_DEV_INTAKE_SYNC_ENABLED za Preview. Spremembo potrdi skrbnik.';
 if(!env.QUIBI_INTAKE_SYNC_ACTOR_ID||!uuid.test(env.QUIBI_INTAKE_SYNC_ACTOR_ID))return 'QUIBI_INTAKE_SYNC_ACTOR_ID ni nastavljen na veljaven strežniški račun. Nastavitev potrdi skrbnik.';
 if(!env.SUPABASE_SERVICE_ROLE_KEY)return 'Strežniška nastavitev SUPABASE_SERVICE_ROLE_KEY ni dosegljiva. Skrbnik naj preveri zaščiteno Preview nastavitev.';
 if(env.SELAN_REMOTE_DEMO==='1'||env.NEXT_PUBLIC_SELAN_REMOTE_DEMO==='1'||env.SELAN_LOCAL_REVIEW==='1')return 'Preview je označen kot demo ali lokalni pregled (SELAN_REMOTE_DEMO, NEXT_PUBLIC_SELAN_REMOTE_DEMO ali SELAN_LOCAL_REVIEW). Skrbnik mora preveriti okolje.';
 if(env.QUIBI_DEV_WRITE_ENABLED!=='1')return 'QUIBI_DEV_WRITE_ENABLED ni vključen za Preview. Aktivacijo zapisovanja mora odobriti skrbnik; povezave ne bomo ustvarjali samodejno.';
 if(!env.QUIBI_DEV_USERNAME||!env.QUIBI_DEV_PASSWORD)return 'Strežniški Quibi DEV poverilnici QUIBI_DEV_USERNAME oziroma QUIBI_DEV_PASSWORD nista dosegljivi. Skrbnik naj preveri zaščitene Preview nastavitve.';
 try{const config=quibiWorkflowConfig(env,'write');if(config.mode!=='dev'||config.origin!=='https://dev.quibi.net')return 'Quibi povezava ni omejena na dev.quibi.net.'}catch{return 'Quibi DEV WRITE konfiguracija ni veljavna. Skrbnik naj preveri QUIBI_DEV_WRITE_ENABLED, strežniške DEV poverilnice in dovoljeno Preview okolje; zapisovanje ni sproščeno.'}
 return null;
}
export const INTAKE_ACTOR_ACCESS_PROBLEM='Strežniški račun nima aktivne vloge owner/admin v Avtoservisu Selan. Spremembo računa ali pravic mora odobriti lastnik.';
