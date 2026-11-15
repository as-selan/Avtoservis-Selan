/** Environment selection contains no business rules or credentials. */
export type QuibiEnvironment = 'dev' | 'production';
export function hostedQuibiEnvironment(env:Record<string,string|undefined>):QuibiEnvironment {
 if(env.SELAN_REMOTE_DEMO==='1'||env.NEXT_PUBLIC_SELAN_REMOTE_DEMO==='1'||env.SELAN_LOCAL_REVIEW==='1'||env.QUIBI_E2E_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_WRITE_ENABLED==='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1')throw Error('QUIBI_ENVIRONMENT_MISMATCH');
 if(env.APP_ENV==='preproduction'&&env.QUIBI_MODE==='dev'&&env.VERCEL_ENV==='preview')return 'dev';
 if(env.APP_ENV==='production'&&env.QUIBI_MODE==='production'&&env.VERCEL_ENV==='production') {
  const production=env.SELAN_PRODUCTION_SUPABASE_PROJECT_REF,dev=env.SELAN_DEV_SUPABASE_PROJECT_REF;
  if(!production||!dev||production===dev)throw Error('QUIBI_DATABASE_ENVIRONMENT_MISMATCH');
  let url:URL;try{url=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'')}catch{throw Error('QUIBI_DATABASE_ENVIRONMENT_MISMATCH')}
  if(url.protocol!=='https:'||url.hostname!==production+'.supabase.co'||url.port||url.username||url.password)throw Error('QUIBI_DATABASE_ENVIRONMENT_MISMATCH');
  return 'production';
 }
 throw Error('QUIBI_ENVIRONMENT_MISMATCH');
}
export function isHostedQuibiEnvironment(env:Record<string,string|undefined>):boolean{try{hostedQuibiEnvironment(env);return true}catch{return false}}
export function quibiJournalTable(mode:QuibiEnvironment):'quibi_dev_operation_journal'|'quibi_production_operation_journal'{return mode==='dev'?'quibi_dev_operation_journal':'quibi_production_operation_journal'}

/** Permit synthetic case review only in the existing loopback-only CI fixture. */
export function caseWorkQuibiEnvironment(env:Record<string,string|undefined>):QuibiEnvironment{
 const loopback=(value:string|undefined)=>{try{const u=new URL(value??'');return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!!u.port&&u.origin===value}catch{return false}};
 const isolatedRead=env.CI==='true'&&env.SELAN_ISOLATED_E2E==='1'&&!env.VERCEL&&!env.VERCEL_ENV&&!env.APP_ENV&&!env.QUIBI_MODE&&env.QUIBI_E2E_WRITE_ENABLED!=='1'&&loopback(env.QUIBI_E2E_ORIGIN)&&loopback(env.NEXT_PUBLIC_SUPABASE_URL);
 const isolatedWrite=env.CI==='true'&&env.SELAN_ISOLATED_E2E==='1'&&env.APP_ENV==='local'&&env.QUIBI_E2E_WRITE_ENABLED==='1'&&!env.VERCEL&&!env.VERCEL_ENV&&!env.QUIBI_MODE&&env.QUIBI_DEV_WRITE_ENABLED!=='1'&&env.QUIBI_DEV_LOCAL_SEND_ENABLED!=='1'&&loopback(env.QUIBI_E2E_ORIGIN)&&loopback(env.NEXT_PUBLIC_SUPABASE_URL)&&loopback(env.PUBLIC_APP_ORIGIN)&&env.QUIBI_DEV_USERNAME==='selan-isolated-fixture'&&env.QUIBI_DEV_PASSWORD==='selan-isolated-fixture';
 if(isolatedRead||isolatedWrite)return 'dev';
 return hostedQuibiEnvironment(env);
}
