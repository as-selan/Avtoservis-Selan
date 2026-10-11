/** Hosted Quibi DEV does not require the optional internal team module. */
export function internalWorkOrdersEnabled(env:Record<string,string|undefined>){return !(env.APP_ENV==='preproduction'&&env.QUIBI_MODE==='dev'&&env.VERCEL_ENV==='preview')||env.SELAN_INTERNAL_WORK_ORDERS_ENABLED==='1'}
