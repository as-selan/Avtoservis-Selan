import {customerRemoteId} from './customer-remote-id.ts';
import {createHash} from 'node:crypto';
import {assertLocalPartyWriteConfiguration} from './local-write-configuration.ts';
export {assertLocalPartyWriteConfiguration} from './local-write-configuration.ts';
type Env=Record<string,string|undefined>;
/** Exact opt-in and immutable synthetic payload; no general local write access. */
export function assertLocalPartyWriteRequest(env:Env,headers:Pick<Headers,'get'>){
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1')return;
 assertLocalPartyWriteConfiguration(env);const app=new URL(env.PUBLIC_APP_ORIGIN!);
 if(headers.get('host')!==app.host||headers.get('origin')!==app.origin||[headers.get('x-forwarded-host')].some(v=>v!==null&&v!==app.host)||[headers.get('x-forwarded-for')].some(v=>v!==null&&v!=='127.0.0.1'))throw Error('QUIBI_LOCAL_WRITE_REQUEST_FORBIDDEN');
}
export function assertLocalPartyWriteTarget(env:Env,path:string,method:string,body?:object){
 if(env.QUIBI_DEV_LOCAL_WRITE_ENABLED!=='1')return;
 assertLocalPartyWriteConfiguration(env);
 if(method==='GET')return;
 const vehicleCreate=env.QUIBI_DEV_LOCAL_WRITE_ACTION==='create_vehicle';
 if(vehicleCreate){
  const v=(body as {Vozila?:Record<string,unknown>}|undefined)?.Vozila;
  if(method!=='POST'||path!=='/api2/vozila/form'||!v||Object.keys(body!).length!==1||Object.keys(v).length!==5||v.stranka_id!==405957||v.internastevilka!=='TESTSELANAX202601'||v.registrskastevilka!=='QA SELAN AI'||v.proizvajalec!=='TEST'||v.model!=='SELAN AI'||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==env.QUIBI_DEV_LOCAL_WRITE_BODY_SHA256)throw Error('QUIBI_LOCAL_WRITE_SCOPE_MISMATCH');
  return;
 }
 const create=env.QUIBI_DEV_LOCAL_WRITE_ACTION==='create_customer';
 const customer=(body as {Stranka?:Record<string,unknown>}|undefined)?.Stranka;
 const synthetic=create&&!!customer&&customer.remote_id===customerRemoteId(env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID!)&&customer.naziv==='TEST-SELAN-AI'&&customer.emajl==='test-selan-ai@example.test'&&Object.keys(customer).every(key=>['remote_id','naziv','emajl'].includes(key));
 if(method!=='POST'||path!==(create?'/api2/stranka/form':`/api2/stranka/form/${env.QUIBI_DEV_LOCAL_WRITE_CUSTOMER_ID}`)||(create&&!synthetic)||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==env.QUIBI_DEV_LOCAL_WRITE_BODY_SHA256)throw Error('QUIBI_LOCAL_WRITE_SCOPE_MISMATCH');
}
