'use server';
import {createHash} from 'node:crypto';
import {createClient as createPrivilegedClient} from '@supabase/supabase-js';
import {revalidatePath} from 'next/cache';
import {requireWorkshopAccess} from '@/lib/auth/requireWorkshopAccess';
import {createClient} from '@/lib/supabase/server';
import {configuredQuibiReadClient} from '@/lib/quibi/client';
import {configuredQuibiWorkflowWriteClient} from '@/lib/quibi/write-client';
import {quibiWorkflowJournal} from '@/lib/quibi/write-journal';
import {caseWorkQuibiEnvironment} from '@/lib/quibi/deployment-policy';
import {loadEstimateCatalog} from '@/lib/quibi/estimate-catalog';
import {estimateCatalogSource} from '@/lib/quibi/estimate-catalog-source';
import {appendWorkOrderCatalogLine} from '@/lib/quibi/business-source-lines';
import {businessDocumentBody,businessUpdatePayload,updateBusinessDocument} from '@/lib/quibi/business-document-workflow';
import {withDocumentId,type EstimateBody} from '@/lib/quibi/write-contract';
import {loadQuibiDocument} from '@/lib/quibi/document-read';
import {quibiDocumentTotalCents} from '@/lib/quibi/line-pricing';
import {syntheticCaseEvidenceAllowed} from '@/lib/quibi/synthetic-case-evidence';
import {customerFingerprint,vehicleFingerprint} from '@/lib/quibi/contracts';

function privileged(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('JOURNAL_UNAVAILABLE');return createPrivilegedClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
async function scope(caseId:string){
 const access=await requireWorkshopAccess(),db=await createClient();
 if(!['owner','admin'].includes(access.role)||caseWorkQuibiEnvironment(process.env)!=='dev')throw Error('FORBIDDEN');
 const {data:a,error}=await db.from('service_case_assignments').select('*').eq('case_id',caseId).eq('organization_id',access.organizationId).single();
 if(error||!a)throw Error('FORBIDDEN');
 const {data:s}=await db.from('service_requests').select('customer_id,vehicle_id,problem_description').eq('id',caseId).eq('organization_id',access.organizationId).is('archived_at',null).single();
 if(!s||s.vehicle_id!==a.vehicle_id)throw Error('FORBIDDEN');
 const [{data:c},{data:v}]=await Promise.all([db.from('customers').select('display_name,phone,email').eq('organization_id',access.organizationId).eq('id',s.customer_id).is('archived_at',null).single(),db.from('vehicles').select('customer_id,vin,registration_current,make,model').eq('organization_id',access.organizationId).eq('id',s.vehicle_id).is('archived_at',null).single()]);
 if(!syntheticCaseEvidenceAllowed(process.env,{caseId,description:s.problem_description,name:c?.display_name,email:c?.email,vin:v?.vin}))throw Error('DEV_SYNTHETIC_ONLY');
 if(!c||!v||v.customer_id!==s.customer_id)throw Error('IDENTITY_UNVERIFIED');
 return {access,db,a,s,c,v};
}
export async function findingCatalogSearch(caseId:string,query:string){
 try{const {a}=await scope(caseId);const q=query.trim().toLocaleLowerCase('sl-SI');if(q.length<2||q.length>100)return {ok:true,options:[]};const read=configuredQuibiReadClient();const [catalog,customer,units,vatRates]=await Promise.all([loadEstimateCatalog(read),read.customer(a.quibi_customer_id),read.catalog('units'),read.catalog('vat')]);const matches=catalog.options.filter(o=>(o.name+' '+o.code).toLocaleLowerCase('sl-SI').includes(q)).slice(0,30);const resolved=await Promise.allSettled(matches.map(async item=>{const form=new FormData();form.set('catalogSource',item.key);form.set('quantity','1');const source=await estimateCatalogSource(form,read,{units,vatRates},customer);if(!source)throw Error('CATALOG_UNAVAILABLE');const o=source.option;return {key:item.key,name:o.name,code:o.code,unit:o.unitLabel,vat:o.vatLabel,gross:o.grossPrice,discount:o.discount,sourceSha:o.sourceSha};}));return {ok:true,options:resolved.flatMap(r=>r.status==='fulfilled'?[r.value]:[])};}catch{return {ok:false,options:[]};}
}
type Snapshot={description:string;line:import('@/lib/quibi/contracts').QuibiEstimateDetail['lines'][number];baselineSha:string;requestSha:string;body:EstimateBody;expectedAmount:string;unitPrices:number[];unitIds:string[]};
export async function saveFindingCatalogItem(form:FormData){
 let stored=false;
 try{
  const caseId=String(form.get('caseId')??''),findingId=String(form.get('findingId')??''),{access,db,a,s,c,v}=await scope(caseId),admin=privileged();
  const {data:f}=await db.from('case_repair_findings').select('id,state').eq('case_id',caseId).eq('id',findingId).single();if(!f)throw Error('FINDING_UNAVAILABLE');
  const read=configuredQuibiReadClient(),existing=await db.from('case_finding_offers').select('id,lines,quibi_operation_id,case_finding_offer_decisions(decision)').eq('finding_id',findingId).order('version',{ascending:false}).limit(1).maybeSingle();
  let offerId:string,snapshot:Snapshot;
  if(existing.data&&f.state==='approved'){
   offerId=existing.data.id;snapshot=existing.data.lines[0] as Snapshot;stored=true;
   if(existing.data.quibi_operation_id)return {ok:true,message:'Postavka je že dodana.'};
  }else{
   if(existing.error||f.state!=='recorded')throw Error('FINDING_UNAVAILABLE');
   const sent=await db.from('quibi_dev_operation_journal').select('quibi_id,request_body').eq('organization_id',access.organizationId).eq('service_request_id',caseId).eq('kind','send').not('attempted_at','is',null);
   if(sent.error||sent.data?.some(row=>{try{return row.quibi_id===a.quibi_work_order_id||JSON.parse(row.request_body).documentId===a.quibi_work_order_id}catch{return true}}))throw Error('SEND_HISTORY_BLOCKED');
   const [source,customer,vehicle,units,vat,customerLink,vehicleLink]=await Promise.all([loadQuibiDocument(read,'work_order',a.quibi_work_order_id,a.quibi_customer_id),read.customer(a.quibi_customer_id),read.vehicle(a.quibi_vehicle_id,a.quibi_customer_id),read.catalog('units'),read.catalog('vat'),db.from('integration_links').select('*').eq('organization_id',access.organizationId).eq('entity_id',s.customer_id).eq('entity_type','customer').eq('provider','quibi').single(),db.from('quibi_vehicle_links').select('*').eq('organization_id',access.organizationId).eq('vehicle_id',s.vehicle_id).eq('customer_id',s.customer_id).single()]);
   const cl=customerLink.data,vl=vehicleLink.data;
   if(customerLink.error||vehicleLink.error||!cl||!vl||cl.quibi_environment!=='dev'||vl.quibi_environment!=='dev'||cl.sync_status!=='ok'||vl.sync_status!=='ok'||cl.external_id!==a.quibi_customer_id||vl.quibi_customer_id!==a.quibi_customer_id||vl.quibi_vehicle_id!==a.quibi_vehicle_id||vehicle.disabled||customerFingerprint({name:c.display_name,phone:c.phone??'',email:c.email??''})!==cl.local_fingerprint||customerFingerprint(customer)!==cl.external_fingerprint||vehicleFingerprint({vin:v.vin??'',registration:v.registration_current??'',make:v.make??'',model:v.model??''})!==vl.local_fingerprint||vehicleFingerprint(vehicle)!==vl.external_fingerprint)throw Error('IDENTITY_CHANGED');
   if(source.contentSha256!==a.quibi_content_sha256||source.vehicleId!==a.quibi_vehicle_id||!source.numberingId||!source.saleTypeId)throw Error('SOURCE_CHANGED');
   const chosen=await estimateCatalogSource(form,read,{units,vatRates:vat},customer);if(!chosen||chosen.option.sourceSha!==String(form.get('sourceSha')??''))throw Error('CATALOG_CHANGED');
   const quantity=Number(form.get('quantity')),articleIds=[...new Set(source.lines.flatMap(l=>l.articleId?[l.articleId]:[]))],articles=await Promise.all(articleIds.map(id=>read.article(id)));
   const lines=appendWorkOrderCatalogLine(source,units,vat,articles,chosen.option,quantity,false);
   const line={description:chosen.option.name,...(chosen.option.code?{articleId:chosen.option.articleId,articleCode:chosen.option.code}:{}),quantity:String(quantity),unitId:chosen.option.unitId,vatId:chosen.option.vatId,unitNetPrice:String(chosen.option.unitNetPrice),unitGrossPrice:String(chosen.option.grossPrice),historicalVatLabel:chosen.option.vatLabel,discount:String(chosen.option.discount),grossPrice:String(chosen.total),pricingVerified:true};
   const before=quibiDocumentTotalCents(source.lines),after=quibiDocumentTotalCents([...source.lines,line]);const candidates=before.flatMap((value,index)=>value===Math.round(Number(source.amount)*100)&&after[index]!==undefined?[after[index]]:[]);if(new Set(candidates).size!==1)throw Error('TOTAL_UNVERIFIED');
   const body=withDocumentId(businessDocumentBody('work_order',caseId,{serviceRequestId:caseId,numberingId:source.numberingId,saleTypeId:source.saleTypeId,customerId:a.quibi_customer_id,vehicleId:a.quibi_vehicle_id,warehouseId:source.warehouseId,lines,note:`Selan ${caseId}; dodatna postavka`}),source.id);
   const payload=businessUpdatePayload(body,source.contentSha256);
   snapshot={description:line.description,line,baselineSha:source.contentSha256,requestSha:payload.sha256,body,expectedAmount:(candidates[0]/100).toFixed(2),unitPrices:[...source.lines.map(l=>Number(l.unitNetPrice)),Number(chosen.option.unitNetPrice)],unitIds:[...source.lines.map(l=>l.unitId!),chosen.option.unitId]};
   const sha=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
   const result=await admin.rpc('record_finding_catalog_decision',{p_case:caseId,p_finding:findingId,p_actor:access.userId,p_lines:[snapshot],p_sha:sha,p_decision:'approved'});if(result.error||!result.data)throw Error('DECISION_NOT_SAVED');offerId=result.data;stored=true;
  }
  if(!snapshot?.body||!snapshot.requestSha||businessUpdatePayload(snapshot.body,snapshot.baselineSha).sha256!==snapshot.requestSha)throw Error('SNAPSHOT_INVALID');
  const op=await updateBusinessDocument({kind:'work_order',orderId:caseId,caseId,documentId:String(snapshot.body.Glavadokumenta.id),baselineSha:snapshot.baselineSha,expectedSha:snapshot.requestSha,expectedAmount:snapshot.expectedAmount,expectedUnitNetPrices:snapshot.unitPrices,expectedUnitIds:snapshot.unitIds,body:snapshot.body,read,write:configuredQuibiWorkflowWriteClient(),journal:quibiWorkflowJournal(access.organizationId,access.userId)});
  const bound=await admin.rpc('bind_finding_catalog_operation',{p_case:caseId,p_offer:offerId,p_operation:op.id});if(bound.error)throw Error('BIND_FAILED');
  revalidatePath('/dashboard/primeri/'+caseId);revalidatePath('/dashboard/mehanik/'+caseId);return {ok:true,message:'Odobrena postavka je dodana na preverjeni delovni nalog.'};
 }catch{return {ok:false,message:stored?'Odobritev je shranjena, izid posodobitve pa zahteva preverjanje. Ponovno izberite nadaljevanje; nove postavke ne ustvarjajte.':'Postavke ni mogoče varno dodati. Preverite katalog, ceno in nalog.'};}
}
