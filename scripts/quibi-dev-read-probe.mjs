// Read-only diagnostic for the isolated Vercel DEV Preview; never creates documents or sends mail.
const env=process.env;
if(env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!=='prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU'||env.QUIBI_MODE!=='dev')throw Error('DEV_SCOPE_REQUIRED');
if(!env.QUIBI_DEV_USERNAME||!env.QUIBI_DEV_PASSWORD||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('DEV_CREDENTIALS_UNAVAILABLE');
const db=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'');
if(db.hostname!=='verxxsjbewmkgoxwqvxo.supabase.co'||db.protocol!=='https:')throw Error('DEV_DATABASE_MISMATCH');
const headers={username:env.QUIBI_DEV_USERNAME,password:env.QUIBI_DEV_PASSWORD,'Content-Type':'application/json'};
const result={quibiHttp:null,quibiError:null,syntheticCustomerVerified:false,dbHttp:null};
try {
 const response=await fetch('https://dev.quibi.net/api2/stranka/view/405956',{headers,redirect:'error',signal:AbortSignal.timeout(12000)});
 const body=await response.json();const customer=body.data?.Stranka;
 result.quibiHttp=response.status;result.quibiError=body.error;
 result.syntheticCustomerVerified=body.error===false&&String(customer?.id)==='405956'&&/^TEST-AUTOSERVIS-SELAN-/i.test(customer?.naziv??'');
} catch { /* no credentials or upstream bodies in logs */ }
try {
 const response=await fetch(db.origin+'/rest/v1/',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY},redirect:'error',signal:AbortSignal.timeout(12000)});
 result.dbHttp=response.status;
} catch { /* report availability only */ }
console.log('SELAN_DEV_READ_PROBE '+JSON.stringify(result));
