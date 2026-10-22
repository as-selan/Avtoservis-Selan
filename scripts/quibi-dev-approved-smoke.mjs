// Explicit operator-run DEV integration check, never imported by the application.
// Run only inside the existing approved Vercel Preview build environment.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createQuibiReadClient} from '../src/lib/quibi/client.ts';
import {createQuibiWorkflowWriteClient} from '../src/lib/quibi/write-http.ts';
import {quibiWorkflowConfig} from '../src/lib/quibi/workflow-config.ts';
import {quibiDevTestRecipient} from '../src/lib/quibi/write-contract.ts';
import {quibiDevOperationJournal} from '../src/lib/quibi/write-journal.ts';
import {createAndVerifyEstimate,sendAndTrackEstimate} from '../src/lib/quibi/write-workflow.ts';
import {quibiDevEstimateChoices} from '../src/lib/quibi/write-options.ts';
import {loadEstimateCatalog} from '../src/lib/quibi/estimate-catalog.ts';
import {canonicalEstimateOptions,requestedEstimateRows,assistedEstimateRows} from '../src/lib/quibi/estimate-editor.ts';
import {customerFingerprint} from '../src/lib/quibi/contracts.ts';
import {verifiedVehicleLink} from '../src/lib/quibi/price-suggestion.ts';
import {estimateCatalogRows} from '../src/lib/quibi/estimate-catalog-source.ts';
import {confirmBusinessContent} from '../src/lib/quibi/business-document-workflow.ts';
const seedId='9d40c42f-b6a8-473b-983f-f9620df97d10',caseId='d726b5b3-8a49-4c6f-a857-202610220019';
const report={scope:'Real Quibi DEV integration; synthetic case only; not authenticated browser E2E',caseId,created:false,linked:false,sent:false};
const one=async(query)=>{const {data,error}=await query;assert.ok(!error,'DEV_SMOKE_DATABASE_READ_FAILED');assert.ok(data,'DEV_SMOKE_DATA_MISSING');return data;};
try{
 assert.equal(process.env.SELAN_APPROVED_DEV_SMOKE,'20261022-pr19');
 assert.equal(process.env.VERCEL_PROJECT_ID,'prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU');
 assert.equal(process.env.VERCEL_ENV,'preview');
 assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'verxxsjbewmkgoxwqvxo.supabase.co');
 assert.notEqual(process.env.QUIBI_PRODUCTION_WRITE_ENABLED,'1');assert.notEqual(process.env.QUIBI_PRODUCTION_SEND_ENABLED,'1');
 const config=quibiWorkflowConfig(process.env,'write');assert.equal(config.origin,'https://dev.quibi.net');
 const read=createQuibiReadClient(config),write=createQuibiWorkflowWriteClient({...config,environment:process.env});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const seed=await one(db.from('service_requests').select('*').eq('id',seedId).is('archived_at',null).single());
 const customer=await one(db.from('customers').select('*').eq('id',seed.customer_id).eq('organization_id',seed.organization_id).single());
 const vehicle=await one(db.from('vehicles').select('*').eq('id',seed.vehicle_id).eq('customer_id',customer.id).single());
 assert.ok(customer.display_name.startsWith('TEST-AUTOSERVIS-SELAN-')&&customer.email.endsWith('@example.test')&&vehicle.vin.startsWith('TEST'),'DEV_SMOKE_REQUIRES_EXISTING_SYNTHETIC_PARTIES');
 const prep=await one(db.from('offer_preparations').select('created_by_profile_id').eq('service_request_id',seedId).single());
 const actor=prep.created_by_profile_id;
 const membership=await one(db.from('organization_memberships').select('role').eq('organization_id',seed.organization_id).eq('profile_id',actor).eq('is_active',true).single());
 assert.ok(['owner','admin'].includes(membership.role),'DEV_SMOKE_ACTOR_FORBIDDEN');
 const link=await one(db.from('integration_links').select('*').eq('entity_id',customer.id).eq('provider','quibi').eq('entity_type','customer').single());
 const vehicleLink=await one(db.from('quibi_vehicle_links').select('*').eq('vehicle_id',vehicle.id).eq('customer_id',customer.id).single());
 assert.equal(link.quibi_environment,'dev');assert.equal(vehicleLink.quibi_environment,'dev');assert.equal(link.sync_status,'ok');assert.equal(vehicleLink.sync_status,'ok');
 const remoteCustomer=await read.customer(link.external_id),remoteVehicle=await read.vehicle(vehicleLink.quibi_vehicle_id,link.external_id);
 assert.equal(customerFingerprint({name:customer.display_name,phone:customer.phone??'',email:customer.email??''}),link.local_fingerprint);assert.equal(customerFingerprint(remoteCustomer),link.external_fingerprint);
 assert.ok(verifiedVehicleLink({customerId:link.external_id,localVehicle:{vin:vehicle.vin,registration:vehicle.registration_current??'',make:vehicle.make??'',model:vehicle.model??''},remoteVehicle,vehicleLink}));
 const recipient=quibiDevTestRecipient(process.env,customer.email);assert.notEqual(recipient,remoteCustomer.email.toLowerCase());
 const [catalog,choices]=await Promise.all([loadEstimateCatalog(read),quibiDevEstimateChoices(write)]);
 const options=canonicalEstimateOptions(catalog.options,remoteCustomer.priceListId);
 report.catalog={count:options.length,issues:catalog.issues,saleTypes:choices.saleTypes,warehouses:choices.warehouses,services:options.filter(o=>/servis|pregled|zavor|tehni/i.test(o.name)).map(o=>({key:o.key,name:o.name}))};
 report.requestRows=assistedEstimateRows(requestedEstimateRows('Avtomehanika','SERVIS VOZILA\nPREGLED PRED TEHNIČNIM\nPREGELD ZAVOR',options,remoteCustomer.priceListId),options).map(r=>({request:r.requestedService,key:r.key,candidates:r.candidateKeys}));
 console.log('SELAN_DEV_SMOKE_READ '+JSON.stringify(report));
 assert.equal(choices.saleTypes.length,1,'DEV_SMOKE_SALE_TYPE_AMBIGUOUS');assert.ok(choices.warehouses.length<=1,'DEV_SMOKE_WAREHOUSE_AMBIGUOUS');
 const option=options.find(o=>o.stockManaged===false&&['kos','kom','storitev'].includes(o.unitLabel.toLowerCase())&&o.grossPrice>0&&/QA|TEST|servis|pregled/i.test(o.name));assert.ok(option,'DEV_SMOKE_NO_VERIFIED_SERVICE');
 const existing=await db.from('service_requests').select('summary,customer_id,vehicle_id').eq('id',caseId).maybeSingle();assert.ok(!existing.error);
 if(existing.data){assert.equal(existing.data.summary,'QA-SIM-PR19-20261022');assert.equal(existing.data.customer_id,customer.id);assert.equal(existing.data.vehicle_id,vehicle.id);}
 else{const {error}=await db.from('service_requests').insert({id:caseId,organization_id:seed.organization_id,customer_id:customer.id,vehicle_id:vehicle.id,status:'preparing_offer',summary:'QA-SIM-PR19-20261022',problem_description:'QA-SIM-PR19 synthetic DEV CREATE and allowlisted SEND only',service_wanted:option.name,source:seed.source,channel:seed.channel});assert.ok(!error,'DEV_SMOKE_CASE_INSERT_FAILED');}
 const prepExists=await db.from('offer_preparations').select('id').eq('service_request_id',caseId).maybeSingle();assert.ok(!prepExists.error);if(!prepExists.data){const {error}=await db.from('offer_preparations').insert({organization_id:seed.organization_id,service_request_id:caseId,created_by_profile_id:actor,status:'ready_for_provider'});assert.ok(!error,'DEV_SMOKE_PREPARATION_FAILED');}
 const form=new FormData();form.set('catalogLines',JSON.stringify([{key:option.key,quantity:'1',discount:''}]));
 const rows=await estimateCatalogRows(form,read,choices,remoteCustomer);assert.ok(rows,'DEV_SMOKE_FRESH_REVIEW_REQUIRED');
 const journal=quibiDevOperationJournal(seed.organization_id,actor);
 const op=await createAndVerifyEstimate({journal,read,write,input:{serviceRequestId:caseId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,saleTypeId:choices.saleTypes[0].id,warehouseId:choices.warehouses[0]?.id,lines:rows.lines,note:'TEST-AUTOSERVIS-SELAN QA-SIM-PR19-20261022'},verifyContent:(detail,body)=>confirmBusinessContent(detail,body,rows.unitNetPrices,rows.unitIds)});
 assert.equal(op.state,'verified');assert.ok(op.quibiId);report.created=true;report.documentId=op.quibiId;console.log('SELAN_DEV_SMOKE_CREATED '+JSON.stringify(report));
 const detail=await read.estimateDetail(op.quibiId,link.external_id);
 const registration=await db.rpc('register_manual_quibi_estimate',{p_organization_id:seed.organization_id,p_service_request_id:caseId,p_quibi_customer_id:link.external_id,p_external_id:op.quibiId,p_content_sha256:detail.contentSha256,p_actor_id:actor});
 assert.ok(!registration.error&&registration.data?.ok,'DEV_SMOKE_LINK_FAILED');
 const quote=await one(db.from('quotes').select('id,evidence_payload').eq('service_request_id',caseId).order('version_no',{ascending:false}).limit(1).single());assert.equal(String(quote.evidence_payload.external_id),op.quibiId);report.linked=true;report.quoteId=quote.id;console.log('SELAN_DEV_SMOKE_LINKED '+JSON.stringify(report));
 const body=JSON.parse(op.requestBody);
 const sent=await sendAndTrackEstimate({journal,read,write,quoteRevisionId:quote.id,serviceRequestId:caseId,documentId:op.quibiId,recipient,subject:'TEST-AUTOSERVIS-SELAN QA-SIM-PR19',customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,externalId:op.externalId,numberingId:String(body.Glavadokumenta.stevilcenje_id),approvedContentSha256:detail.contentSha256,approvedForSend:true,beforeDispatch:async()=>{quibiWorkflowConfig(process.env,'send');assert.equal(quibiDevTestRecipient(process.env,customer.email),recipient);}});
 report.sendId=sent.sendId;report.sendStatus=sent.sendStatus;report.sent=sent.sendStatus==='sent';console.log('SELAN_DEV_SMOKE_RESULT '+JSON.stringify(report));
}catch(error){report.error=error instanceof Error&&/^QUIBI_[A-Z_0-9]+$/.test(error.message)?error.message:error?.code??'DEV_SMOKE_CHECK_FAILED';report.check=error instanceof assert.AssertionError?String(error.message).split('\n')[0]:undefined;console.log('SELAN_DEV_SMOKE_RESULT '+JSON.stringify(report));process.exitCode=1;}
