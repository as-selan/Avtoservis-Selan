import type {QuibiDocument,QuibiEstimateDetail} from './contracts.ts';
export type VehicleHistoryDocument={id:string;kind:'work_order'|'estimate'|'invoice';customerId:string;number:string;date:string;work:string[]};
type Read={workOrders:(id:string)=>Promise<QuibiDocument[]>;estimates:(id:string)=>Promise<QuibiDocument[]>;invoices:(id:string)=>Promise<QuibiDocument[]>;documentDetail:(id:string,customer:string)=>Promise<QuibiEstimateDetail>;vehicle:(id:string,customer:string)=>Promise<{id:string;customerId:string}>};
/** Only the authorized customer's listed documents; vehicle identity is checked again on details. */
export async function readVehicleHistory(read:Read,customerId:string,vehicleId:string,offset=0,exclude:string[]=[]){
 if(![customerId,vehicleId].every(id=>/^[1-9]\d{0,14}$/.test(id))||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('INVALID_HISTORY_SCOPE');
 const vehicle=await read.vehicle(vehicleId,customerId);if(vehicle.id!==vehicleId||vehicle.customerId!==customerId)throw Error('QUIBI_VEHICLE_ID_MISMATCH');
 const lists=await Promise.all([read.workOrders(customerId),read.estimates(customerId),read.invoices(customerId)]);
 const kinds=['work_order','estimate','invoice'] as const;
 const refs=[...new Map(lists.flatMap((list,i)=>list.filter(d=>d.customerId===customerId&&!exclude.includes(d.id)).map(d=>[kinds[i]+':'+d.id,{...d,kind:kinds[i]}] as const))).values()].sort((a,b)=>Number(b.id)-Number(a.id));
 const docs:VehicleHistoryDocument[]=[];let unavailable=false;
 const page=refs.slice(offset,offset+24);
 for(let i=0;i<page.length;i+=4)await Promise.all(page.slice(i,i+4).map(async ref=>{try{const d=await read.documentDetail(ref.id,customerId);if(d.id!==ref.id||d.customerId!==customerId)throw Error('QUIBI_DOCUMENT_CUSTOMER_MISMATCH');if(d.vehicleId===vehicleId)docs.push({id:d.id,kind:ref.kind,customerId,number:d.number||d.id,date:d.serviceDate||d.date||'',work:d.lines.map(line=>line.description)});}catch{unavailable=true;}}));
 return {documents:docs.sort((a,b)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id)),next:offset+page.length<refs.length?offset+page.length:null,unavailable};
}
