import type { WorkshopAccess } from '../auth/requireWorkshopAccess';
export type MechanicOrder={id:string;organization_id:string;status:string;vehicle:{make:string;model:string;registration:string;vin:string};events:{id:string;body:string;created_at:string}[];photos:{id:string;caption:string;storage_path:string}[]};
export function scopedMechanicOrders(value:unknown,access:WorkshopAccess,orderId?:string):MechanicOrder[]{
 if(access.role!=='mechanic'||!Array.isArray(value))throw Error('MECHANIC_ORDER_ACCESS');
 for(const order of value){if(!order||typeof order!=='object'||order.organization_id!==access.organizationId||(orderId&&order.id!==orderId)||typeof order.id!=='string'||!['open','in_progress','awaiting_parts','ready_for_collection','closed'].includes(order.status)||!order.vehicle||!Array.isArray(order.events)||!Array.isArray(order.photos))throw Error('MECHANIC_ORDER_SCOPE');}
 return value as MechanicOrder[];
}
