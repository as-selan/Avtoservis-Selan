"use server";
import {requirePhase1OperationalAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from './client';
import {loadEstimateCatalog} from './estimate-catalog';
import {draftTotal,type EstimateDraftRow} from './estimate-editor';
import type {AutomaticEstimateDraft} from './automatic-estimate-draft';
import {revalidatePath} from 'next/cache';
export async function saveAutomaticOfferRows(caseId:string,run:string,expectedUpdatedAt:string,rows:EstimateDraftRow[]){
 const access=await requirePhase1OperationalAccess();
 if(!['owner','admin'].includes(access.role)||!Array.isArray(rows)||rows.length<1||rows.length>100||JSON.stringify(rows).length>64000||rows.some(r=>!r||typeof r.key!=='string'||r.key!==''&&!/^(?:article|\d+):\d+$/.test(r.key)||typeof r.quantity!=='string'||typeof r.discount!=='string'||r.unitPrice!==undefined&&typeof r.unitPrice!=='string'||['requestedService','description','unitId','vatId','matchSource'].some(key=>{const value=(r as unknown as Record<string,unknown>)[key];return value!==undefined&&(typeof value!=='string'||value.length>1000)})||r.candidateKeys!==undefined&&(!Array.isArray(r.candidateKeys)||r.candidateKeys.length>100||r.candidateKeys.some(key=>typeof key!=='string'||!/^(?:article|\d+):\d+$/.test(key)))))return {ok:false as const};
 const db=await createClient();const stored=await db.from('offer_preparations').select('auto_draft').eq('organization_id',access.organizationId).eq('service_request_id',caseId).single();
 if(stored.error||!stored.data.auto_draft)return {ok:false as const};
 const draft=stored.data.auto_draft as AutomaticEstimateDraft;
 const catalog=await loadEstimateCatalog(configuredQuibiReadClient());const current=new Map(catalog.options.map(o=>[o.key,o]));
 // Preserve verified persisted choices if the cached catalog is temporarily unavailable.
 for(const option of draft.options)if(!current.has(option.key))current.set(option.key,option);
 const options=[...current.values()];
 const state=draftTotal(rows,options,draft.customerPriceListId)!==null?'ready':rows.some(r=>!r.key&&(r.candidateKeys?.length||r.matchSource==='Predlog iz opisa'))?'ambiguous':'missing_price';
 const needed=new Set(rows.flatMap(r=>[r.key,...(r.candidateKeys??[])]));
 const saved=await db.rpc('save_automatic_offer_rows',{p_case:caseId,p_run:run,p_expected_updated_at:expectedUpdatedAt,p_rows:rows,p_options:options.filter(o=>needed.has(o.key)),p_state:state});
 if(saved.error||!saved.data?.updatedAt)return {ok:false as const};revalidatePath('/dashboard');revalidatePath('/dashboard/primeri/'+caseId);return {ok:true as const,updatedAt:saved.data.updatedAt as string};
}
