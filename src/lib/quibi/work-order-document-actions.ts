"use server";
import {revalidatePath} from 'next/cache';
import {createClient as privileged} from '@supabase/supabase-js';
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {quibiLinkEnvironment} from './workflow-config';
import {customerFingerprint,vehicleFingerprint} from './contracts';
import {loadQuibiDocument,verifyWorkOrderDocument} from './document-read';
export async function linkWorkOrderQuibiDocument(form:FormData):Promise<{ok:boolean;message:string}>{
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role))return {ok:false,message:'Povezavo lahko potrdi skrbnik.'};
 const orderId=String(form.get('orderId')??''),documentId=String(form.get('documentId')??''),kind=String(form.get('kind')??''),sha=String(form.get('sha')??'');
 if(!/^[a-f0-9-]{36}$/i.test(orderId)||!/^\d+$/.test(documentId)||!['work_order','invoice'].includes(kind)||form.get('confirmed')!=='yes')return {ok:false,message:'Izrecno potrdite povezavo tega dokumenta s servisnim primerom.'};
 try{
 const db=await createClient(),environment=quibiLinkEnvironment(process.env);
 const {data:order}=await db.from('work_orders').select('id,customer_id,vehicle_id,status').eq('organization_id',access.organizationId).eq('id',orderId).single();
 if(!order||order.status==='closed')throw Error('ORDER_UNAVAILABLE');
 const [{data:link},{data:vehicleLink},{data:customer},{data:vehicle}]=await Promise.all([
 db.from('integration_links').select('external_id,quibi_environment,sync_status,local_fingerprint,external_fingerprint').eq('organization_id',access.organizationId).eq('entity_id',order.customer_id).eq('entity_type','customer').eq('provider','quibi').single(),
 db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,quibi_environment,local_fingerprint,external_fingerprint,sync_status').eq('organization_id',access.organizationId).eq('vehicle_id',order.vehicle_id).eq('customer_id',order.customer_id).single(),
 db.from('customers').select('display_name,phone,email,archived_at').eq('organization_id',access.organizationId).eq('id',order.customer_id).single(),
 db.from('vehicles').select('customer_id,vin,registration_current,make,model,archived_at').eq('organization_id',access.organizationId).eq('id',order.vehicle_id).single()]);
 if(!link||!vehicleLink||!customer||!vehicle||customer.archived_at||vehicle.archived_at||link.quibi_environment!==environment||vehicleLink.quibi_environment!==environment||vehicleLink.quibi_customer_id!==link.external_id||vehicle.customer_id!==order.customer_id||link.sync_status!=='ok'||vehicleLink.sync_status!=='ok')throw Error('IDENTITY_UNVERIFIED');
 const client=configuredQuibiReadClient();
 const [remoteCustomer,remoteVehicle,document]=await Promise.all([client.customer(link.external_id),client.vehicle(vehicleLink.quibi_vehicle_id,link.external_id),loadQuibiDocument(client,kind as 'work_order'|'invoice',documentId,link.external_id)]);
 if(customerFingerprint({name:customer.display_name,phone:customer.phone??'',email:customer.email??''})!==link.local_fingerprint||customerFingerprint(remoteCustomer)!==link.external_fingerprint||vehicleFingerprint({vin:vehicle.vin??'',registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''})!==vehicleLink.local_fingerprint||vehicleFingerprint(remoteVehicle)!==vehicleLink.external_fingerprint||remoteVehicle.disabled)throw Error('IDENTITY_CHANGED');
 verifyWorkOrderDocument(document,link.external_id,vehicleLink.quibi_vehicle_id,sha);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('LINK_STORAGE_UNAVAILABLE');
 const store=privileged(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const entry={organization_id:access.organizationId,work_order_id:orderId,document_kind:kind,quibi_environment:environment,quibi_document_id:documentId,quibi_customer_id:link.external_id,quibi_vehicle_id:vehicleLink.quibi_vehicle_id,content_sha256:document.contentSha256,confirmed_by_profile_id:access.userId};
 const {error}=await store.from('work_order_quibi_documents').insert(entry);
 if(error){const {data:existing}=await db.from('work_order_quibi_documents').select('quibi_document_id,content_sha256,quibi_environment').eq('organization_id',access.organizationId).eq('work_order_id',orderId).eq('document_kind',kind).single();if(!existing||existing.quibi_document_id!==documentId||existing.content_sha256!==sha||existing.quibi_environment!==environment)throw Error('LINK_CONFLICT');}
 revalidatePath(`/dashboard/nalogi/${orderId}`);return {ok:true,message:'Povezava je shranjena. Poslovni dokument ostaja v Quibiju.'};
 }catch(error){const code=error instanceof Error?error.message:'';return {ok:false,message:code==='QUIBI_DOCUMENT_VEHICLE_UNVERIFIED'?'Quibi ne potrjuje vozila dokumenta. Povezava ni shranjena; QA izjema za predračun se tukaj ne uporablja.':code==='QUIBI_DOCUMENT_CONTENT_CHANGED'?'Vsebina dokumenta se je spremenila. Ponovno jo preglejte.':'Povezava ni potrjena. Preverite identiteto stranke in vozila, dokument ter namestitev migracije.'};}
}
