// Explicitly scoped, synthetic-only DEV URL integration test. Never sends email.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {quibiWorkflowConfig} from '../src/lib/quibi/workflow-config.ts';
import {createQuibiReadClient} from '../src/lib/quibi/client.ts';
import {createQuibiWorkflowWriteClient} from '../src/lib/quibi/write-http.ts';
import {quibiDevOperationJournal} from '../src/lib/quibi/write-journal.ts';
import {createOrReconcileCustomer,createOrReconcileVehicle} from '../src/lib/quibi/party-write-workflow.ts';
import {createAndVerifyEstimate} from '../src/lib/quibi/write-workflow.ts';
import {customerFingerprint,vehicleFingerprint} from '../src/lib/quibi/contracts.ts';
import {quibiDevEstimateChoices} from '../src/lib/quibi/write-options.ts';
import {confirmBusinessContent} from '../src/lib/quibi/business-document-workflow.ts';
const customerId='a75b760e-cdd2-4ffb-bc48-7d1e77972df8',vehicleId='a29dc770-1ba7-4632-9b44-dc6a099ae71b',caseId='9cc0a81e-15fb-4b7c-a789-6f60bcf644d8';
const marker='TEST-AUTOSERVIS-SELAN-URL-B917',email='qa-url-b917@example.test',phone='',vin='TESTSELANURLB9171',registration='TEST-URL-B917';
let stage='scope';
try {
 assert.equal(process.env.VERCEL_PROJECT_ID,'prj_OSpIMwU9zkrcImKhGxpaq8PnrgUU');assert.equal(process.env.VERCEL_ENV,'preview');assert.equal(process.env.QUIBI_MODE,'dev');assert.equal(process.env.SELAN_URL_DEV_SMOKE,'one-synthetic-no-send');
 assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'verxxsjbewmkgoxwqvxo.supabase.co');assert.notEqual(process.env.QUIBI_PRODUCTION_WRITE_ENABLED,'1');assert.notEqual(process.env.QUIBI_PRODUCTION_SEND_ENABLED,'1');
 const config=quibiWorkflowConfig(process.env,'write');assert.equal(config.origin,'https://dev.quibi.net');
 const origin=process.env.PUBLIC_APP_ORIGIN;const appUrl=new URL(origin);assert.equal(appUrl.protocol,'https:');assert.equal(appUrl.origin,origin);assert.ok(appUrl.hostname.endsWith('.vercel.app'));
 const nativeFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url??input);const method=(init?.method??'GET').toUpperCase();if(url.hostname==='dev.quibi.net'&&method==='POST'&&!/^\/api2\/(?:stranka\/form|vozila\/form|predracuni|dn|fakture|glavadokumenta\/form|urlpovezave\/add\/\d+)$/.test(url.pathname))throw Error('UNEXPECTED_QUIBI_WRITE');if(!['dev.quibi.net','verxxsjbewmkgoxwqvxo.supabase.co'].includes(url.hostname))throw Error('UNEXPECTED_NETWORK_TARGET');return nativeFetch(input,init)};
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const read=createQuibiReadClient(config),write=createQuibiWorkflowWriteClient({...config,environment:process.env});
 if(process.env.SELAN_URL_DEV_INSPECT==='1'){
  const found=(await read.vehicles('408828')).filter(x=>x.vin===vin&&x.registration===registration&&x.make==='TEST'&&x.model==='URL QA'&&!x.disabled);
  let owner=null,oldCustomerReadable=false,oldDocumentCounts=null;
  try{owner=(await read.lookupVehicle('2395')).customerId}catch{}
  try{oldCustomerReadable=(await read.customer('405963')).id==='405963'}catch{}
  if(oldCustomerReadable){try{const [estimates,orders,invoices]=await Promise.all([read.estimates('405963'),read.workOrders('405963'),read.invoices('405963')]);oldDocumentCounts={estimates:estimates.length,orders:orders.length,invoices:invoices.length}}catch{}}
  const alternatives=[];let syntheticCount=0,scanErrors=0,scanStatus='completed';
  try{
   const synthetic=(await read.customers()).filter(x=>/^(?:TEST|QA[-_ ])/i.test(x.name)&&/@example\.(?:test|invalid)$/i.test(x.email)).slice(0,25);
   syntheticCount=synthetic.length;for(const remote of synthetic){
    const linked=await db.from('integration_links').select('organization_id,entity_id,local_fingerprint,external_fingerprint').eq('provider','quibi').eq('entity_type','customer').eq('external_id',remote.id).eq('quibi_environment','dev').eq('sync_status','ok');
    if(linked.error){scanErrors++;continue;}
    for(const l of linked.data??[]){
     if(customerFingerprint(remote)!==l.external_fingerprint)continue;
     const customer=await db.from('customers').select('display_name,phone,email').eq('organization_id',l.organization_id).eq('id',l.entity_id).is('archived_at',null).maybeSingle();
     if(customer.error||!customer.data||!/^(?:TEST|QA[-_ ])/i.test(customer.data.display_name??'')||!/@example\.(?:test|invalid)$/i.test(customer.data.email??'')||customerFingerprint({name:customer.data.display_name,phone:customer.data.phone??'',email:customer.data.email??''})!==l.local_fingerprint)continue;
     const cases=await db.from('service_requests').select('id,vehicle_id,summary,problem_description').eq('organization_id',l.organization_id).eq('customer_id',l.entity_id).is('archived_at',null).limit(20);
     if(cases.error){scanErrors++;continue;}
     for(const c of cases.data??[]){
      if(!c.vehicle_id||!/^QA-SIM/i.test(c.summary??'')||!/^QA-SIM/i.test(c.problem_description??''))continue;
      const local=await db.from('vehicles').select('vin,registration_current,make,model').eq('organization_id',l.organization_id).eq('id',c.vehicle_id).eq('customer_id',l.entity_id).is('archived_at',null).maybeSingle();
      const vl=await db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,local_fingerprint,external_fingerprint').eq('organization_id',l.organization_id).eq('vehicle_id',c.vehicle_id).eq('customer_id',l.entity_id).eq('quibi_environment','dev').eq('sync_status','ok').maybeSingle();
      if(local.error||vl.error||!local.data||!vl.data||vl.data.quibi_customer_id!==remote.id||!/^TEST/i.test(local.data.vin??''))continue;
      const current=await read.vehicle(vl.data.quibi_vehicle_id,remote.id).catch(()=>null);if(!current||current.disabled||vehicleFingerprint(current)!==vl.data.external_fingerprint||vehicleFingerprint({vin:local.data.vin??'',registration:local.data.registration_current??'',make:local.data.make??'',model:local.data.model??''})!==vl.data.local_fingerprint)continue;
      const journal=await db.from('quibi_dev_operation_journal').select('quibi_id,quibi_content_sha256,request_body').eq('organization_id',l.organization_id).eq('service_request_id',c.id).eq('kind','estimate').eq('state','verified').not('quibi_id','is',null);
      if(journal.error){scanErrors++;continue;}
      for(const j of journal.data??[]){const doc=await read.estimateDetail(j.quibi_id,remote.id).catch(()=>null);if(!doc||doc.vehicleId!==current.id||doc.contentSha256!==j.quibi_content_sha256||doc.externalId!=='selan-service-request:'+c.id)continue;alternatives.push({caseId:c.id,customerId:remote.id,vehicleId:current.id,documentId:doc.id});}
     }
    }
   }
  }catch{scanStatus='failed'}
  console.log('SELAN_DEV_URL_INSPECT '+JSON.stringify({matches:found.map(x=>x.id),customerId:'408828',vehicleOwner:owner,oldCustomerReadable,oldDocumentCounts,alternatives,syntheticCount,scanErrors,scanStatus}));process.exit(0);
 }
 const one=async(q)=>{const {data,error}=await q;assert.ok(!error&&data,'DB_READ_FAILED');return data};
 const seed=await one(db.from('service_requests').select('organization_id,source,channel').eq('id','9d40c42f-b6a8-473b-983f-f9620df97d10').is('archived_at',null).single());
 const prep=await one(db.from('offer_preparations').select('created_by_profile_id').eq('service_request_id','9d40c42f-b6a8-473b-983f-f9620df97d10').single());
 const actor=prep.created_by_profile_id,member=await one(db.from('organization_memberships').select('role,is_active').eq('organization_id',seed.organization_id).eq('profile_id',actor).single());assert.ok(member.is_active&&['owner','admin'].includes(member.role));
 const ensure=async(table,id,record,checks)=>{const found=await db.from(table).select('*').eq('id',id).maybeSingle();assert.ok(!found.error,'DB_READ_FAILED');if(found.data){for(const [k,v] of Object.entries(checks))assert.equal(found.data[k],v,'SYNTHETIC_ID_CONFLICT');}else{const result=await db.from(table).insert({id,...record});assert.ok(!result.error,'SYNTHETIC_INSERT_FAILED');}};
 stage='local_synthetic';await ensure('customers',customerId,{organization_id:seed.organization_id,display_name:marker,email,phone},{organization_id:seed.organization_id,display_name:marker,email,phone});
 await ensure('vehicles',vehicleId,{organization_id:seed.organization_id,customer_id:customerId,vin,registration_current:registration,make:'TEST',model:'URL QA'},{organization_id:seed.organization_id,customer_id:customerId,vin,registration_current:registration});
 await ensure('service_requests',caseId,{organization_id:seed.organization_id,customer_id:customerId,vehicle_id:vehicleId,status:'preparing_offer',summary:'QA-SIM-QUIBI-URL-B917',problem_description:'QA-SIM synthetic URL integration only; no customer or email',service_wanted:'QA synthetic test',source:seed.source,channel:seed.channel},{organization_id:seed.organization_id,customer_id:customerId,vehicle_id:vehicleId,summary:'QA-SIM-QUIBI-URL-B917'});
 const journal=quibiDevOperationJournal(seed.organization_id,actor);
 stage='quibi_customer';const cop=await createOrReconcileCustomer({journal,read,write,input:{serviceRequestId:caseId,customerId,name:marker,phone,email}});assert.ok(cop.quibiId);const remoteCustomer=await read.customer(cop.quibiId);assert.equal(customerFingerprint(remoteCustomer),customerFingerprint({name:marker,phone,email}));
 const cl=await db.from('integration_links').select('external_id,quibi_environment').eq('organization_id',seed.organization_id).eq('entity_id',customerId).eq('provider','quibi').eq('entity_type','customer').maybeSingle();assert.ok(!cl.error);if(cl.data){assert.equal(cl.data.external_id,cop.quibiId);assert.equal(cl.data.quibi_environment,'dev')}else{const f=customerFingerprint(remoteCustomer);const x=await db.from('integration_links').insert({organization_id:seed.organization_id,entity_id:customerId,provider:'quibi',entity_type:'customer',external_id:cop.quibiId,local_fingerprint:f,external_fingerprint:f,confirmed_by:actor,sync_status:'ok',quibi_environment:'dev'});assert.ok(!x.error,'CUSTOMER_LINK_FAILED')}
 stage='quibi_vehicle';const vop=await createOrReconcileVehicle({journal,read,write,input:{serviceRequestId:caseId,vehicleId,quibiCustomerId:cop.quibiId,registration,vin,make:'TEST',model:'URL QA'}});assert.ok(vop.quibiId);const remoteVehicle=await read.vehicle(vop.quibiId,cop.quibiId);const vf=vehicleFingerprint({vin,registration,make:'TEST',model:'URL QA'});assert.equal(vehicleFingerprint(remoteVehicle),vf);
 const vl=await db.from('quibi_vehicle_links').select('quibi_vehicle_id,quibi_customer_id,quibi_environment').eq('organization_id',seed.organization_id).eq('vehicle_id',vehicleId).maybeSingle();assert.ok(!vl.error);if(vl.data){assert.equal(vl.data.quibi_vehicle_id,vop.quibiId);assert.equal(vl.data.quibi_customer_id,cop.quibiId);assert.equal(vl.data.quibi_environment,'dev')}else{const x=await db.from('quibi_vehicle_links').insert({organization_id:seed.organization_id,customer_id:customerId,vehicle_id:vehicleId,quibi_customer_id:cop.quibiId,quibi_vehicle_id:vop.quibiId,local_fingerprint:vf,external_fingerprint:vf,confirmed_by:actor,sync_status:'ok',quibi_environment:'dev'});assert.ok(!x.error,'VEHICLE_LINK_FAILED')}
 stage='catalog';const choices=await quibiDevEstimateChoices(write);const sales=choices.saleTypes.filter(x=>x.label.toLocaleLowerCase('sl-SI')==='dobava blaga in storitev'),units=choices.units.filter(x=>/^(kos|kom|komad)$/i.test(x.label)),vats=choices.vatRates.filter(x=>/^22(?:[.,]0+)?\s*%$/.test(x.label)),warehouses=choices.warehouses.filter(x=>x.label.toLocaleLowerCase('sl-SI')==='delavnica');assert.equal(sales.length,1);assert.equal(units.length,1);assert.equal(vats.length,1);assert.equal(warehouses.length,1);
 stage='estimate';const p=await db.from('offer_preparations').select('id').eq('organization_id',seed.organization_id).eq('service_request_id',caseId).maybeSingle();assert.ok(!p.error);if(!p.data){const x=await db.from('offer_preparations').insert({organization_id:seed.organization_id,service_request_id:caseId,created_by_profile_id:actor,status:'ready_for_provider'});assert.ok(!x.error,'PREP_INSERT_FAILED')}
 const input={serviceRequestId:caseId,customerId:cop.quibiId,vehicleId:vop.quibiId,saleTypeId:sales[0].id,warehouseId:warehouses[0].id,lines:[{opis:'QA-SIM synthetic URL integration only',enota_id:units[0].id,ddv_id:vats[0].id,kolicina:1,cenaZDDV:1,popust:0}],note:'QA-SIM synthetic test; NO SEND'};
 const estimateRead={estimates:read.estimates,estimateDetail:read.estimateDetail};const op=await createAndVerifyEstimate({journal,read:estimateRead,write,input,verifyContent:(detail,body)=>confirmBusinessContent(detail,body)});assert.equal(op.state,'verified');assert.ok(op.quibiId);assert.ok(op.quibiContentSha256);
 const registered=await db.rpc('register_manual_quibi_estimate',{p_organization_id:seed.organization_id,p_service_request_id:caseId,p_quibi_customer_id:cop.quibiId,p_external_id:op.quibiId,p_content_sha256:op.quibiContentSha256,p_actor_id:actor});assert.ok(!registered.error&&registered.data?.ok,'ESTIMATE_LINK_FAILED');
 stage='url_write';const payload={url:origin+'/dashboard/primeri/'+caseId,naziv:'Fotografije in priloge vozila',zunanji_id:'selan-case:'+caseId};const first=await write.addCaseUrl(op.quibiId,payload,origin);
 stage='url_read';const getLinks=async()=>{const response=await fetch(config.origin+'/api2/urlpovezave/index/'+op.quibiId,{headers:{username:config.username,password:config.password,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});assert.ok(response.ok);const json=await response.json();assert.equal(json.error,false);assert.ok(Array.isArray(json.data?.Povezave));return json.data.Povezave.filter(x=>x.zunanji_id===payload.zunanji_id)};
 const links=await getLinks();assert.equal(links.length,1);assert.equal(links[0].url,payload.url);assert.equal(links[0].naziv,payload.naziv);stage='url_repeat';const second=await write.addCaseUrl(op.quibiId,payload,origin);assert.equal(second.obstaja,true);const again=await getLinks();assert.equal(again.length,1);assert.equal(String(again[0].id),String(links[0].id));
 console.log('SELAN_DEV_URL_SMOKE '+JSON.stringify({ok:true,caseId,customerId:cop.quibiId,vehicleId:vop.quibiId,documentId:op.quibiId,url:payload.url,firstExisted:first.obstaja,secondExisted:second.obstaja,matchingLinks:again.length,noSend:true}));
} catch(error) {console.error('SELAN_DEV_URL_SMOKE '+JSON.stringify({ok:false,stage,code:error instanceof Error?error.message.replace(/[^A-Za-z0-9_: -]/g,'').slice(0,100):'unknown'}));process.exitCode=1;}
