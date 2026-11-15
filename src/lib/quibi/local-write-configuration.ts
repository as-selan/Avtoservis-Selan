type Env=Record<string,string|undefined>;
export function assertLocalPartyWriteConfiguration(env:Env){
 let app:URL,db:URL;try{app=new URL(env.PUBLIC_APP_ORIGIN??'');db=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'')}catch{throw Error('QUIBI_LOCAL_WRITE_DISABLED')}
 const create=env.QUIBI_DEV_LOCAL_WRITE_ACTION==='create_customer';
 const vehicle=env.QUIBI_DEV_LOCAL_WRITE_ACTION==='create_vehicle';
 if(vehicle&&(env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID!=='405957'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.QUIBI_DEV_LOCAL_WRITE_VEHICLE_ID??'')))throw Error('QUIBI_LOCAL_WRITE_DISABLED');
 const validId=create?/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID??''):/^\d+$/.test(env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID??'');
 if((env.QUIBI_DEV_LOCAL_WRITE_ACTION!==undefined&&!['update_customer','create_customer','create_vehicle'].includes(env.QUIBI_DEV_LOCAL_WRITE_ACTION))||db.protocol!=='http:'||db.hostname!=='127.0.0.1'||db.username||db.password||env.APP_ENV!=='preproduction'||env.QUIBI_MODE!=='dev'||env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1'||env.QUIBI_DEV_WRITE_ENABLED!=='1'||env.SELAN_APPROVED_LOCAL_DEV!=='1'||env.QUIBI_DEV_LOCAL_SEND_ENABLED==='1'||env.VERCEL==='1'||(env.VERCEL_ENV!==undefined&&env.VERCEL_ENV!=='development')||env.SELAN_REMOTE_DEMO==='1'||env.NEXT_PUBLIC_SELAN_REMOTE_DEMO==='1'||env.SELAN_LOCAL_REVIEW==='1'||env.QUIBI_E2E_ORIGIN||!env.QUIBI_DEV_USERNAME||!env.QUIBI_DEV_PASSWORD||app.protocol!=='http:'||app.hostname!=='127.0.0.1'||app.origin!==env.PUBLIC_APP_ORIGIN||env.COMPLETION_PUBLIC_ORIGIN!==app.origin||!validId||env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID==='405956'||!/^[a-f0-9]{64}$/.test(env.QUIBI_DEV_LOCAL_WRITE_BODY_SHA256??''))throw Error('QUIBI_LOCAL_WRITE_DISABLED');
}
