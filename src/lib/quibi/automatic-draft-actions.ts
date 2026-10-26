"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {loadEstimateCatalog} from './estimate-catalog';
import {completeServiceReferences,conditionalInspectionRows,draftTotal,type EstimateDraftRow} from './estimate-editor';
import {buildAutomaticEstimateDraft,needsCatalogFieldRepair,repairCatalogDraftFields,type AutomaticEstimateDraft} from './automatic-estimate-draft';
import {revalidatePath} from 'next/cache';
export async function saveAutomaticOfferRows(caseId:string,run:string,expectedUpdatedAt:string,rows:EstimateDraftRow[]){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role)||!Array.isArray(rows)||rows.length<1||rows.length>100||JSON.stringify(rows).length>64000||rows.some(r=>!r||typeof r.key!=='string'||r.key!==''&&!/^(?:article|\d+):\d+$/.test(r.key)||typeof r.quantity!=='string'||typeof r.discount!=='string'||r.inspectionPricing!==undefined&&!['ordered','not_ordered'].includes(r.inspectionPricing)||r.unitPrice!==undefined&&typeof r.unitPrice!=='string'||['requestedService','description','unitId','vatId','matchSource'].some(key=>{const value=(r as unknown as Record<string,unknown>)[key];return value!==undefined&&(typeof value!=='string'||value.length>1000)})||r.candidateKeys!==undefined&&(!Array.isArray(r.candidateKeys)||r.candidateKeys.length>100||r.candidateKeys.some(key=>typeof key!=='string'||!/^(?:article|\d+):\d+$/.test(key)))))return {ok:false as const};
 const db=await createClient();const stored=await db.from('offer_preparations').select('auto_draft').eq('organization_id',access.organizationId).eq('service_request_id',caseId).single();
 if(stored.error||!stored.data.auto_draft)return {ok:false as const};
 const draft=stored.data.auto_draft as AutomaticEstimateDraft;
 const catalog=await loadEstimateCatalog(configuredQuibiReadClient());const current=new Map(catalog.options.map(o=>[o.key,o]));
 // Preserve verified persisted choices if the cached catalog is temporarily unavailable.
 for(const option of draft.options)if(!current.has(option.key))current.set(option.key,option);
 const options=[...current.values()];
 const inspection=await db.from('preliminary_inspections').select('status,repair_decision').eq('organization_id',access.organizationId).eq('service_request_id',caseId).maybeSingle();if(inspection.error)return {ok:false as const};
 rows=conditionalInspectionRows(completeServiceReferences(rows,options,draft.defaults),options,inspection.data?.status==='completed'?inspection.data.repair_decision:null);
 const state=draftTotal(rows,options,draft.customerPriceListId)!==null?'ready':rows.some(r=>!r.key&&(r.candidateKeys?.length||r.matchSource==='Predlog iz opisa'))?'ambiguous':'missing_price';
 const needed=new Set(rows.flatMap(r=>[r.key,...(r.candidateKeys??[])]));
 const saved=await db.rpc('save_automatic_offer_rows',{p_case:caseId,p_run:run,p_expected_updated_at:expectedUpdatedAt,p_rows:rows,p_options:options.filter(o=>needed.has(o.key)),p_state:state});
 if(saved.error||!saved.data?.updatedAt)return {ok:false as const};revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);return {ok:true as const,updatedAt:saved.data.updatedAt as string};
}

/** Uses the same authenticated, optimistic save RPC; no document or identity writes. */
export async function refreshAutomaticOfferCatalogFields(caseId:string){
 const access=await requirePhase1OperationalAccess();if(!['owner','admin'].includes(access.role))return null;
 const db=await createClient();
 const request=await db.from('service_requests').select('customer_id,vehicle_id,status,service_wanted,problem_description').eq('organization_id',access.organizationId).eq('id',caseId).is('archived_at',null).single();
 if(request.error||!request.data||!['new','preparing_offer'].includes(request.data.status))return null;
 const stored=await db.from('offer_preparations').select('auto_draft,auto_run,updated_at').eq('organization_id',access.organizationId).eq('service_request_id',caseId).single();
 const saved=stored.data?.auto_draft as AutomaticEstimateDraft|null;
 if(stored.error||!saved||!stored.data?.auto_run)return null;
 const inspection=await db.from('preliminary_inspections').select('status,repair_decision').eq('organization_id',access.organizationId).eq('service_request_id',caseId).maybeSingle();if(inspection.error)return null;
 const pricedRows=conditionalInspectionRows(completeServiceReferences(saved.rows,saved.options,saved.defaults),saved.options,inspection.data?.status==='completed'?inspection.data.repair_decision:null);
 if(JSON.stringify(pricedRows)!==JSON.stringify(saved.rows)){
  const state=draftTotal(pricedRows,saved.options,saved.customerPriceListId)!==null?'ready':pricedRows.some(r=>!r.key&&r.candidateKeys?.length)?'ambiguous':'missing_price';
  const result=await db.rpc('save_automatic_offer_rows',{p_case:caseId,p_run:stored.data.auto_run,p_expected_updated_at:stored.data.updated_at,p_rows:pricedRows,p_options:saved.options,p_state:state});
  return result.error||!result.data?.updatedAt?null:{auto_draft:{...saved,rows:pricedRows},auto_state:state,updated_at:result.data.updatedAt as string};
 }
 if(!needsCatalogFieldRepair(saved))return null;
 const [customer,vehicle]=await Promise.all([db.from('integration_links').select('external_id,quibi_environment,sync_status').eq('organization_id',access.organizationId).eq('entity_id',request.data.customer_id).eq('provider','quibi').eq('entity_type','customer').single(),db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,quibi_environment,sync_status').eq('organization_id',access.organizationId).eq('customer_id',request.data.customer_id).eq('vehicle_id',request.data.vehicle_id).single()]);
 if(customer.error||vehicle.error||customer.data?.sync_status!=='ok'||vehicle.data?.sync_status!=='ok'||customer.data.quibi_environment!==vehicle.data.quibi_environment||customer.data.external_id!==vehicle.data.quibi_customer_id)return null;
 const fresh=await buildAutomaticEstimateDraft({wanted:request.data.service_wanted,description:request.data.problem_description,customerId:customer.data.external_id,vehicleId:vehicle.data.quibi_vehicle_id,allowOrganizationHistory:true},configuredQuibiReadClient());
 const repaired=repairCatalogDraftFields(saved,fresh.draft);
 if(JSON.stringify(repaired.draft.rows)===JSON.stringify(saved.rows))return null;
 const result=await db.rpc('save_automatic_offer_rows',{p_case:caseId,p_run:stored.data.auto_run,p_expected_updated_at:stored.data.updated_at,p_rows:repaired.draft.rows,p_options:repaired.draft.options,p_state:repaired.state});
 return result.error||!result.data?.updatedAt?null:{auto_draft:repaired.draft,auto_state:repaired.state,updated_at:result.data.updatedAt as string};
}
