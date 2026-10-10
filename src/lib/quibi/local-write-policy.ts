import {createHash} from 'node:crypto';
type Env=Record<string,string|undefined>;
/** One reviewed customer-update body only. This permission cannot send or create documents. */
export function assertLocalPartyWriteConfiguration(env:Env){
 let app:URL,db:URL;try{app=new URL(env.PUBLIC_APP_ORIGIN??'');db=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'')}catch{throw Error('QUIBI_LOCAL_WRITE_DISABLED')}
 if(db.protocol!=='http:'||db.hostname!=='127.0.0.1'||db.username||db.password||env.APP_ENV!=='preproduction'||env.QUIBI_MODE!=='dev'||env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1'||env.QUIBI_DEV_WRITE_ENABLED!=='1'||env.SELAN_APPROVED_LOCAL_DEV!=='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1'||env.VERCEL==='1'||(env.VERCEL_ENV!==undefined&&env.VERCEL_ENV!=='development')||env.SELAN_REMOTE_DEMO==='1'||env.NEXT_PUBLIC_SELAN_REMOTE_DEMO==='1'||env.SELAN_LOCAL_REVIEW==='1'||env.QUIBI_E2E_ORIGIN||!env.QUIBI_DEV_USERNAME||!env.QUIBI_DEV_PASSWORD||app.protocol!=='http:'||app.hostname!=='127.0.0.1'||app.origin!==env.PUBLIC_APP_ORIGIN||env.COMPLETION_PUBLIC_ORIGIN!==app.origin||!/^\d+$/.test(env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID??'')||env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID==='405956'||!/^[a-f0-9]{64}$/.test(env.QUIBI_DEV_LOCAL_WRITE_BODY_SHA256??''))throw Error('QUIBI_LOCAL_WRITE_DISABLED');
}
export function assertLocalPartyWriteRequest(env:Env,headers:Pick<Headers,'get'>){
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1')return;
 assertLocalPartyWriteConfiguration(env);const app=new URL(env.PUBLIC_APP_ORIGIN!);
 if(headers.get('host')!==app.host||headers.get('origin')!==app.origin||[headers.get('x-forwarded-host')].some(v=>v!==null&&v!==app.host)||[headers.get('x-forwarded-for')].some(v=>v!==null&&v!=='127.0.0.1'))throw Error('QUIBI_LOCAL_WRITE_REQUEST_FORBIDDEN');
}
export function assertLocalPartyWriteTarget(env:Env,path:string,method:string,body?:object){
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1')return;
 assertLocalPartyWriteConfiguration(env);
 if(method==='GET')return;
 if(method!=='POST'||path!==`/api2/stranka/form/${env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID}`||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==env.QUIBI_DEV_LOCAL_WRITE_BODY_SHA256)throw Error('QUIBI_LOCAL_WRITE_SCOPE_MISMATCH');
}
