import type {QuibiCustomer,QuibiVehicle,QuibiDocument} from './contracts.ts';
 type Reader={customer:(id:string)=>Promise<QuibiCustomer>;vehicles:(id:string)=>Promise<QuibiVehicle[]>;estimates:(id:string)=>Promise<QuibiDocument[]>;workOrders:(id:string)=>Promise<QuibiDocument[]>;invoices:(id:string)=>Promise<QuibiDocument[]>};
 export async function readIntegrationOverview(read:Reader,id:string){
  if(!/^[1-9][0-9]{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw Error('QUIBI_INVALID_CUSTOMER_ID');
  const customer=await read.customer(id);if(customer.id!==id)throw Error('QUIBI_CUSTOMER_ID_MISMATCH');
  const scoped=async<T extends {customerId:string}>(promise:Promise<T[]>)=>{const rows=await promise;if(rows.some(row=>row.customerId!==id))throw Error('QUIBI_CUSTOMER_ID_MISMATCH');return rows;};
  const [vehicles,estimates,workOrders,invoices]=await Promise.allSettled([scoped(read.vehicles(id)),scoped(read.estimates(id)),scoped(read.workOrders(id)),scoped(read.invoices(id))]);
  return {customer,vehicles,estimates,workOrders,invoices,checkedAt:new Date().toISOString()};
 }
