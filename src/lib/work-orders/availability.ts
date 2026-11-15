import { caseWorkQuibiEnvironment } from '../quibi/deployment-policy.ts';

/** Hosted Quibi DEV and the matching isolated write fixture use direct Quibi orders. */
export function internalWorkOrdersEnabled(env:Record<string,string|undefined>){
 if(env.QUIBI_E2E_WRITE_ENABLED==='1'){
  try{if(caseWorkQuibiEnvironment(env)==='dev')return false}catch{/* Invalid fixture must not change the normal workflow. */}
 }
 return !(env.APP_ENV==='preproduction'&&env.QUIBI_MODE==='dev'&&env.VERCEL_ENV==='preview')||env.SELAN_INTERNAL_WORK_ORDERS_ENABLED==='1';
}
