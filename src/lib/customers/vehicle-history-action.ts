"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {hostedQuibiEnvironment,quibiJournalTable} from '@/lib/quibi/deployment-policy';
import {assertDirectDevVehicleRead} from '@/lib/quibi/direct-document-read';
import {readVehicleHistory,type VehicleHistoryDocument} from '@/lib/quibi/vehicle-history';
export type VehicleHistoryScope={caseId:string;includeCurrent?:boolean}|{customerId:string;vehicleId:string};
export type VehicleHistoryResult={cases:{id:string;date:string;work:string;findings:string|null;photos:{id:string;url:string;caption:string}[]}[];documents:VehicleHistoryDocument[];next:number|null;unavailable:boolean};
export async function loadVehicleHistory(scope:VehicleHistoryScope,offset=0):Promise<VehicleHistoryResult>{
 const access=await requirePhase1OperationalAccess(),db=await createClient();
 const result:VehicleHistoryResult={cases:[],documents:[],next:null,unavailable:false};
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('INVALID_HISTORY_SCOPE');
 let remoteCustomer='',remoteVehicle='',exclude:string[]=[];
 if('caseId' in scope){
  if(!/^[a-f0-9-]{36}$/i.test(scope.caseId))throw Error('INVALID_HISTORY_SCOPE');
  const request=await db.from('service_requests').select('vehicle_id,customer_id').eq('organization_id',access.organizationId).eq('id',scope.caseId).is('archived_at',null).single();
  if(request.error||!request.data)throw Error('HISTORY_ACCESS_DENIED');
  if(!request.data.vehicle_id)return result;
  if(offset===0){
   let previousQuery=db.from('service_requests').select('id,created_at,service_wanted,problem_description').eq('organization_id',access.organizationId).eq('vehicle_id',request.data.vehicle_id).is('archived_at',null);
   if(!scope.includeCurrent)previousQuery=previousQuery.neq('id',scope.caseId);
   const previous=await previousQuery.order('created_at',{ascending:false}).limit(100);
   if(previous.error)result.unavailable=true;
   const rows=previous.data??[],ids=rows.map(r=>r.id);
   if(ids.length){const [photos,inspections]=await Promise.all([db.from('service_case_photos').select('id,case_id,object_path,caption').in('case_id',ids).eq('state','ready'),db.from('preliminary_inspections').select('service_request_id,findings').eq('organization_id',access.organizationId).in('service_request_id',ids)]);
    if(photos.error||inspections.error)result.unavailable=true;
    const signed=await Promise.all((photos.data??[]).map(async p=>({...p,url:(await db.storage.from('service-case-evidence').createSignedUrl(p.object_path,300)).data?.signedUrl})));
    result.cases=rows.map(r=>({id:r.id,date:r.created_at,work:r.service_wanted||r.problem_description||'Servis vozila',findings:inspections.data?.find(p=>p.service_request_id===r.id)?.findings??null,photos:signed.filter(p=>p.case_id===r.id&&p.url).map(p=>({id:p.id,url:p.url!,caption:p.caption}))}));
   }
  }
  try{const environment=hostedQuibiEnvironment(process.env);
   const link=await db.from('quibi_vehicle_links').select('quibi_customer_id,quibi_vehicle_id').eq('organization_id',access.organizationId).eq('customer_id',request.data.customer_id).eq('vehicle_id',request.data.vehicle_id).eq('quibi_environment',environment).eq('sync_status','ok').maybeSingle();
   if(link.error)result.unavailable=true;
   if(link.data){remoteCustomer=link.data.quibi_customer_id;remoteVehicle=link.data.quibi_vehicle_id;}
   const current=await db.from(quibiJournalTable(environment)).select('quibi_id').eq('organization_id',access.organizationId).eq('service_request_id',scope.caseId).eq('state','verified');exclude=(scope.includeCurrent?[]:current.data??[]).map(r=>r.quibi_id).filter((id):id is string=>!!id);
  }catch{result.unavailable=true;}
 }else{assertDirectDevVehicleRead(process.env,access.role,scope.customerId,scope.vehicleId);remoteCustomer=scope.customerId;remoteVehicle=scope.vehicleId;}
 if(remoteCustomer&&remoteVehicle){try{const remote=await readVehicleHistory(configuredQuibiReadClient(),remoteCustomer,remoteVehicle,offset,exclude);result.documents=remote.documents;result.next=remote.next;result.unavailable ||= remote.unavailable;}catch{result.unavailable=true;}}
 return result;
}
