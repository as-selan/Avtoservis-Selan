type CustomerLink={external_id:string;sync_status:string;quibi_environment:string};
type VehicleLink={customer_id:string;quibi_customer_id:string;sync_status:string;quibi_environment:string};
/** Stored linkage status only; fresh identity checks still run before business actions. */
export function intakeConnection(customerId:string|null,customer:CustomerLink|undefined,vehicle:VehicleLink|undefined,environment:string='dev'){
 if(!customer)return {linked:false,label:'Povezava s Quibijem še ni potrjena'};
 if(customer.sync_status!=='ok'||customer.quibi_environment!==environment)return {linked:false,label:'Povezava stranke zahteva pregled'};
 if(!vehicle)return {linked:false,label:'Stranka je povezana; povezava vozila še ni potrjena'};
 if(vehicle.sync_status!=='ok'||vehicle.quibi_environment!==environment||vehicle.customer_id!==customerId||vehicle.quibi_customer_id!==customer.external_id)return {linked:false,label:'Povezava vozila zahteva pregled'};
 return {linked:true,label:'Stranka in vozilo povezana s Quibijem'};
}
