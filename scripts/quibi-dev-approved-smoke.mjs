// Explicit operator-run DEV integration check, never imported by the application.
// Run only inside the existing approved Vercel Preview build environment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {businessDocumentBody,createBusinessDocument,confirmBusinessContent as confirmContent} from '../src/lib/quibi/business-document-workflow.ts';
import {businessSourceLines,quibiSourceNotes} from '../src/lib/quibi/business-source-lines.ts';
import {loadQuibiDocument} from '../src/lib/quibi/document-read.ts';
import {verifiedInvoiceHeader} from '../src/lib/quibi/invoice-header.ts';
import {invoiceSourceChanges,verifyInvoiceSourceTotal,quibiToday} from '../src/lib/quibi/invoice-review.ts';
import {businessHeaderSelection} from '../src/lib/quibi/business-form-state.ts';
import {createClient} from '@supabase/supabase-js';
import {createQuibiReadClient} from '../src/lib/quibi/client.ts';
import {createQuibiWorkflowWriteClient,safeQuibiValidation} from '../src/lib/quibi/write-http.ts';
import {quibiWorkflowConfig} from '../src/lib/quibi/workflow-config.ts';
import {quibiDevTestRecipient,stableEstimatePayload} from '../src/lib/quibi/write-contract.ts';
import {quibiDevOperationJournal} from '../src/lib/quibi/write-journal.ts';
import {createAndVerifyEstimate,sendAndTrackEstimate,checkTrackedEstimateStatus} from '../src/lib/quibi/write-workflow.ts';
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
 // Separate synthetic case and journal identity: this opt-in never touches the original completed case.
 if(process.env.SELAN_DEV_SMOKE_FREE_LINES==='1'){
  assert.notEqual(process.env.SELAN_DEV_SMOKE_BUSINESS,'1','DEV_SMOKE_MODES_CONFLICT');
  assert.notEqual(process.env.SELAN_DEV_SMOKE_STATUS_ONLY,'1','DEV_SMOKE_MODES_CONFLICT');
  const freeCaseId='c7156f6e-76ca-48b3-8cc0-202610220030',summary='QA-SIM-PR19-FREE-20261022';
  report.caseId=freeCaseId;report.scope='Real Quibi DEV FREE-line estimate; synthetic operator QA prices; no send, approval or business documents';report.caseLinked=false;
  const choices=await quibiDevEstimateChoices(write);
  const sales=choices.saleTypes.filter(c=>c.label==='Dobava blaga in storitev'),warehouses=choices.warehouses.filter(c=>c.label==='Delavnica');
  assert.equal(sales.length,1,'DEV_SMOKE_TEST_SALE_TYPE_UNVERIFIED');assert.equal(warehouses.length,1,'DEV_SMOKE_TEST_WAREHOUSE_UNVERIFIED');
  // QA-only explicit choice from freshly read catalogs; no fabricated unit or VAT IDs.
  const units=choices.defaults?.unitId?choices.units.filter(u=>u.id===choices.defaults.unitId):choices.units.filter(u=>/^(kos|kom|komad)$/i.test(u.label));
  const vats=choices.vatRates.filter(v=>/^22(?:[.,]0+)?\s*%$/.test(v.label.trim()));
  assert.equal(units.length,1,'DEV_SMOKE_FREE_UNIT_AMBIGUOUS');assert.equal(vats.length,1,'DEV_SMOKE_FREE_VAT_AMBIGUOUS');
  const descriptions=['QA-SIM FREE · servis vozila · operator QA test price','QA-SIM FREE · pregled pred tehničnim · operator QA test price','QA-SIM FREE · pregled zavor · operator QA test price'];
  const prices=['30','20','15']; // Explicit operator-requested synthetic gross prices, never inferred catalog prices.
  const form=new FormData();form.set('catalogLines',JSON.stringify(descriptions.map((description,index)=>({key:'',description,quantity:'1',discount:'0',unitId:units[0].id,vatId:vats[0].id,unitPrice:prices[index]}))));
  const rows=await estimateCatalogRows(form,read,choices,remoteCustomer);
  assert.ok(rows,'DEV_SMOKE_FRESH_REVIEW_REQUIRED');assert.equal(rows.lines.length,3);assert.ok(rows.lines.every(line=>!('sifra' in line)&&line.kolicina===1));
  assert.deepEqual(rows.reviewedLines.map(line=>line.unitPrice),[30,20,15]);
  const existing=await db.from('service_requests').select('organization_id,summary,customer_id,vehicle_id,problem_description,archived_at').eq('id',freeCaseId).maybeSingle();assert.ok(!existing.error,'DEV_SMOKE_DATABASE_READ_FAILED');
  if(existing.data){assert.equal(existing.data.organization_id,seed.organization_id);assert.equal(existing.data.summary,summary);assert.equal(existing.data.customer_id,customer.id);assert.equal(existing.data.vehicle_id,vehicle.id);assert.ok(existing.data.problem_description?.startsWith('QA-SIM-PR19-FREE'));assert.equal(existing.data.archived_at,null);}
  else{const {error}=await db.from('service_requests').insert({id:freeCaseId,organization_id:seed.organization_id,customer_id:customer.id,vehicle_id:vehicle.id,status:'preparing_offer',summary,problem_description:'QA-SIM-PR19-FREE synthetic operator QA prices 30/20/15 EUR gross, qty 1; NO SEND; no actual customer approval or repair',service_wanted:descriptions.join('\n'),source:seed.source,channel:seed.channel});assert.ok(!error,'DEV_SMOKE_CASE_INSERT_FAILED');}
  const prepExists=await db.from('offer_preparations').select('id,organization_id,created_by_profile_id').eq('service_request_id',freeCaseId).maybeSingle();assert.ok(!prepExists.error,'DEV_SMOKE_DATABASE_READ_FAILED');
  if(prepExists.data){assert.equal(prepExists.data.organization_id,seed.organization_id);assert.equal(prepExists.data.created_by_profile_id,actor);}
  else{const {error}=await db.from('offer_preparations').insert({organization_id:seed.organization_id,service_request_id:freeCaseId,created_by_profile_id:actor,status:'ready_for_provider'});assert.ok(!error,'DEV_SMOKE_PREPARATION_FAILED');}
  const journal=quibiDevOperationJournal(seed.organization_id,actor);
  const previous=await journal.get('estimate',freeCaseId);
  if(previous?.quibiId){const actual=await read.estimateDetail(previous.quibiId,link.external_id);console.log('SELAN_DEV_FREE_DIAGNOSTIC '+JSON.stringify({id:previous.quibiId,state:previous.state,amount:actual.amount,expectedLines:Object.values(JSON.parse(previous.requestBody).Postavkedokumenta),actualLines:actual.lines.map(l=>({description:l.description,quantity:l.quantity,unitId:l.unitId,vatId:l.vatId,unitNetPrice:l.unitNetPrice,grossPrice:l.grossPrice,discount:l.discount,pricingVerified:l.pricingVerified,articleCode:l.articleCode}))}));}
  if(process.env.SELAN_DEV_FREE_REPAIR==='1'){
   assert.equal(previous?.quibiId,'2176927','DEV_SMOKE_KNOWN_SYNTHETIC_DOCUMENT_REQUIRED');assert.equal(previous.state,'uncertain');
   const current=await read.estimateDetail(previous.quibiId,link.external_id);assert.equal(current.externalId,previous.externalId);assert.equal(Number(current.amount),0);
   const body=JSON.parse(previous.requestBody);body.Glavadokumenta.id=Number(previous.quibiId);
   for(const line of Object.values(body.Postavkedokumenta)){assert.ok(!('sifra' in line));line.cenaBrezDDV=line.cenaZDDV;}
   const payload=stableEstimatePayload(body),revision='e128577d-bd3a-4d4f-86d1-202610220032';
   const recovery=await journal.insertOnce({kind:'estimate_update',localEntityId:revision,serviceRequestId:freeCaseId,externalId:null,requestBody:payload.json,requestSha256:payload.sha256});assert.equal(recovery.requestSha256,payload.sha256);
   assert.equal(recovery.state,'prepared','DEV_SMOKE_REPAIR_NOT_RETRIED');assert.ok(await journal.claim(recovery.id,'prepared'));
   await journal.patch(recovery.id,'dispatching',{state:'uncertain',quibiId:previous.quibiId,documentNumber:previous.documentNumber});
   const updated=await write.updateEstimate(previous.quibiId,body);assert.equal(updated.id,previous.quibiId);
   const reread=await read.estimateDetail(previous.quibiId,link.external_id);
   console.log('SELAN_DEV_FREE_REPAIR_RESULT '+JSON.stringify({id:reread.id,amount:reread.amount,lines:reread.lines.map(l=>({description:l.description,unitNetPrice:l.unitNetPrice,grossPrice:l.grossPrice,unitId:l.unitId,vatId:l.vatId,quantity:l.quantity,pricingVerified:l.pricingVerified}))}));
   confirmBusinessContent(reread,body,rows.unitNetPrices,rows.unitIds);assert.equal(Number(reread.amount),65);
   await journal.patch(recovery.id,'uncertain',{state:'verified',quibiContentSha256:reread.contentSha256});
  }
  const op=await createAndVerifyEstimate({journal,read,write,input:{serviceRequestId:freeCaseId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,saleTypeId:sales[0].id,warehouseId:warehouses[0].id,lines:rows.lines,note:summary+'; operator QA test gross prices 30/20/15 EUR; NO SEND; no customer approval'},verifyContent:(detail,body)=>confirmBusinessContent(detail,body,rows.unitNetPrices,rows.unitIds)});
  assert.equal(op.state,'verified');assert.ok(op.quibiId);report.created=true;report.documentId=op.quibiId;
  // Also reread/verify on an idempotent retry of an already-verified journal entry.
  const detail=await read.estimateDetail(op.quibiId,link.external_id);confirmBusinessContent(detail,JSON.parse(op.requestBody),rows.unitNetPrices,rows.unitIds);
  const registration=await db.rpc('register_manual_quibi_estimate',{p_organization_id:seed.organization_id,p_service_request_id:freeCaseId,p_quibi_customer_id:link.external_id,p_external_id:op.quibiId,p_content_sha256:detail.contentSha256,p_actor_id:actor});
  assert.ok(!registration.error&&registration.data?.ok,'DEV_SMOKE_LINK_FAILED');
  const quote=await one(db.from('quotes').select('id,evidence_payload').eq('service_request_id',freeCaseId).order('version_no',{ascending:false}).limit(1).single());assert.equal(String(quote.evidence_payload.external_id),op.quibiId);
  report.linked=true;report.caseLinked=true;report.quoteId=quote.id;report.freeLines={count:3,quantities:[1,1,1],operatorQaGrossPrices:[30,20,15],unitId:units[0].id,vatId:vats[0].id};
  // Explicit QA-only decision; no delivery or actual customer response is fabricated.
  const reviewed=await db.rpc('review_verified_manual_quote',{p_organization_id:seed.organization_id,p_quote_id:quote.id,p_content_sha256:detail.contentSha256,p_actor_id:actor,p_decision:'approve'});assert.ok(!reviewed.error&&reviewed.data?.ok,'DEV_SMOKE_INTERNAL_REVIEW_FAILED');
  const decision=await db.rpc('record_manual_estimate_decision',{p_organization_id:seed.organization_id,p_quote_id:quote.id,p_actor_id:actor,p_decision:'approved',p_reference:'QA-SIM-PR19-FREE synthetic test approval only; no actual customer response or email'});assert.ok(!decision.error&&decision.data?.ok,'DEV_SMOKE_SYNTHETIC_APPROVAL_FAILED');
  report.syntheticApprovalRecorded=true;report.actualCustomerApproval=false;report.mechanicAuthenticatedE2E=false;
  const [numberings,unitsCatalog,vatCatalog,saleTypes]=await Promise.all([read.catalog('numberings'),read.catalog('units'),read.catalog('vat'),read.catalog('saleTypes')]);
  let source=await loadQuibiDocument(read,'estimate',op.quibiId,link.external_id);const approvedSource=source;report.business=[];
  for(const kind of ['work_order','invoice']){
   const header=businessHeaderSelection(kind,numberings,saleTypes,{numberingId:'',saleTypeId:'',sourceSaleTypeId:source.saleTypeId});assert.ok(header.ready,'DEV_SMOKE_BUSINESS_HEADER_AMBIGUOUS');
   const lines=businessSourceLines(source,unitsCatalog,vatCatalog,[]),charged=source.lines.filter(l=>!quibiSourceNotes(source).includes(l));
   const expectedUnitNetPrices=charged.map(l=>Number(l.unitNetPrice)),expectedUnitIds=charged.map(l=>l.unitId);let invoiceHeader;
   if(kind==='invoice'){
    assert.deepEqual(invoiceSourceChanges(approvedSource,source),[]);verifyInvoiceSourceTotal(source);
    invoiceHeader=await verifiedInvoiceHeader(read,header.numberingId);
    if(!invoiceHeader.paymentMethod){const methods=invoiceHeader.paymentMethods.filter(m=>/^(TRR|bančno nakazilo|nakazilo(?: na TRR)?|transakcijski racun|transakcijski račun)$/i.test(m.trim()));if(methods.length===1)invoiceHeader=await verifiedInvoiceHeader(read,header.numberingId,{spaceId:invoiceHeader.spaceId,paymentMethod:methods[0]});}
    assert.ok(invoiceHeader.ready,'DEV_SMOKE_INVOICE_HEADER_AMBIGUOUS');
   }
   const body=businessDocumentBody(kind,freeCaseId,{serviceRequestId:freeCaseId,numberingId:header.numberingId,saleTypeId:header.saleTypeId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,warehouseId:source.warehouseId,spaceId:invoiceHeader?.spaceId,paymentMethod:invoiceHeader?.paymentMethod,lines,note:summary+'; QA-SIM synthetic approval and completed-work fixture ONLY; no actual customer approval or repair; NO SEND'},kind==='invoice'?quibiToday():undefined);
   if(kind==='invoice'){body.Glavadokumenta.datIzdRac=quibiToday();body.Glavadokumenta.datValute=quibiToday();}
   const business=await createBusinessDocument({kind,orderId:freeCaseId,caseId:freeCaseId,body,journal,read,write,expectedAmount:source.amount,expectedUnitNetPrices,expectedUnitIds});assert.equal(business.state,'verified');assert.ok(business.quibiId);
   source=await loadQuibiDocument(read,kind,business.quibiId,link.external_id);confirmBusinessContent(source,body,expectedUnitNetPrices,expectedUnitIds);assert.equal(Math.round(Number(source.amount)*100),6500);
   report.business.push({kind,id:business.quibiId,state:business.state,number:source.number,amount:source.amount,caseLinked:true});
  }
  console.log('SELAN_DEV_FREE_LINES_RESULT '+JSON.stringify(report));process.exit(0);
 }
 const recipient=quibiDevTestRecipient(process.env,customer.email);assert.notEqual(recipient,remoteCustomer.email.toLowerCase());
 if(process.env.SELAN_DEV_SMOKE_BUSINESS==='1'){
  report.startedAt=new Date().toISOString();report.scope='Real Quibi DEV catalog diagnostics and synthetic work order/invoice integration; not authenticated UI E2E';
  const journal=quibiDevOperationJournal(seed.organization_id,actor);
  const clean=(value)=>safeQuibiValidation({message:value},[config.username,config.password]).summary;
  try{
   const currentCase=await one(db.from('service_requests').select('customer_id,vehicle_id,summary,problem_description').eq('id',caseId).eq('organization_id',seed.organization_id).single());
   assert.equal(currentCase.customer_id,customer.id);assert.equal(currentCase.vehicle_id,vehicle.id);assert.equal(currentCase.summary,'QA-SIM-PR19-20261022');assert.ok(currentCase.problem_description.startsWith('QA-SIM-'));
   const probe=async(path,accept=false)=>{const started=Date.now();try{
    const response=await fetch(config.origin+path,{method:'GET',headers:{username:config.username,password:config.password,'Content-Type':'application/json',...(accept?{Accept:'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
    const body=await response.text();let envelope;try{envelope=JSON.parse(body)}catch{}
    return {at:new Date().toISOString(),method:'GET',path,requestBody:false,acceptJson:accept,status:response.status,durationMs:Date.now()-started,contentType:response.headers.get('content-type'),server:response.headers.get('server'),responseDate:response.headers.get('date'),responseSha256:createHash('sha256').update(body).digest('hex'),bodyBytes:Buffer.byteLength(body),requestId:response.headers.get('x-request-id')??response.headers.get('cf-ray'),...(envelope?{apiError:envelope.error,diagnostic:safeQuibiValidation(envelope,[config.username,config.password]),dataKeys:Object.keys(envelope.data??{})}:{responseKind:'non_json'})};
   }catch(error){return {path,method:'GET',error:error instanceof Error?error.name:'READ_FAILED'};}};
   report.catalogDiagnostics=await Promise.all([probe('/api2/sifranti'),probe('/api2/sifranti',true),probe('/api2/cenik'),probe('/api2/sifranti/view/116731'),probe('/api2/kategorije')]);
   const lists=await read.priceLists();report.priceLists=lists.map(l=>({id:l.id,name:l.name,articleCount:l.lines.length}));
   const warehouses=await read.catalog('warehouses');report.stockAlternatives=[];
   for(const warehouse of warehouses){try{const stock=await read.stock(warehouse.id,false);report.stockAlternatives.push({warehouseId:warehouse.id,articleCount:stock.length,scope:'inventory only; not a complete non-stock service catalog'});}catch(error){report.stockAlternatives.push({warehouseId:warehouse.id,error:clean(error instanceof Error?error.message:'READ_FAILED')});}}
   const estimateOp=await journal.get('estimate',caseId);assert.equal(estimateOp?.state,'verified');assert.equal(estimateOp.quibiId,'2176924');
   const quote=await one(db.from('quotes').select('id,evidence_payload').eq('service_request_id',caseId).order('version_no',{ascending:false}).limit(1).single());assert.equal(String(quote.evidence_payload.external_id),estimateOp.quibiId);
   const sendOp=await journal.get('send',quote.id);assert.equal(sendOp?.sendId,'277127');assert.equal(JSON.parse(sendOp.requestBody).recipient,recipient);
   const delivery=await write.getSendStatus(estimateOp.quibiId,sendOp.sendId);report.delivery={sendId:sendOp.sendId,status:delivery.status,reason:clean(delivery.error??''),resend:false};
   report.created=true;report.linked=true;report.documentId=estimateOp.quibiId;
   const [numberings,units,vat,saleTypes]=await Promise.all([read.catalog('numberings'),read.catalog('units'),read.catalog('vat'),read.catalog('saleTypes')]);
   report.businessCatalogs={numberings:numberings.filter(n=>['Račun','Delovni nalog'].includes(n.label)),saleTypeCount:saleTypes.length,warehouses};console.log('SELAN_DEV_BUSINESS_PROGRESS '+JSON.stringify({business:report.business,invoiceHeader:report.invoiceHeader}));
   let source=await loadQuibiDocument(read,'estimate',estimateOp.quibiId,link.external_id);
   assert.equal(source.vehicleId,vehicleLink.quibi_vehicle_id);verifyInvoiceSourceTotal(source);
   const original=JSON.parse(estimateOp.requestBody);const originalLines=Object.values(original.Postavkedokumenta);assert.ok(originalLines.every(line=>typeof line.cena==='number'),'DEV_SMOKE_ORIGINAL_PRICE_UNVERIFIED');
   const originalArticles=await Promise.all([...new Set(source.lines.flatMap(l=>l.articleId?[l.articleId]:[]))].map(id=>read.article(id)));
   confirmContent(source,original,originalLines.map(l=>l.cena),source.lines.filter(l=>!quibiSourceNotes(source).includes(l)).map(l=>originalArticles.find(a=>a.id===l.articleId)?.unitId));
   const approvedSource=source;report.business=[];
   for(const kind of ['work_order','invoice']){
    const header=businessHeaderSelection(kind,numberings,saleTypes,{numberingId:'',saleTypeId:'',sourceSaleTypeId:source.saleTypeId});assert.ok(header.ready,'DEV_SMOKE_NUMBERING_OR_SALE_TYPE_AMBIGUOUS');
    assert.ok(warehouses.some(w=>w.id===source.warehouseId),'DEV_SMOKE_SOURCE_WAREHOUSE_UNVERIFIED');
    const articles=await Promise.all([...new Set(source.lines.flatMap(l=>l.articleId?[l.articleId]:[]))].map(id=>read.article(id)));
    const lines=businessSourceLines(source,units,vat,articles),charged=source.lines.filter(l=>!quibiSourceNotes(source).includes(l));
    const expectedUnitNetPrices=charged.map(l=>Number(l.unitNetPrice)),expectedUnitIds=charged.map(l=>l.unitId);
    let invoiceHeader;
    if(kind==='invoice'){
     assert.deepEqual(invoiceSourceChanges(approvedSource,source),[]);verifyInvoiceSourceTotal(source);
     invoiceHeader=await verifiedInvoiceHeader(read,header.numberingId);report.invoiceHeader=invoiceHeader;console.log('SELAN_DEV_BUSINESS_PROGRESS '+JSON.stringify({business:report.business,invoiceHeader:report.invoiceHeader}));
     // Explicit non-cash synthetic test choice, only when the live catalog proves one match.
     if(!invoiceHeader.paymentMethod){const nonCash=invoiceHeader.paymentMethods.filter(m=>/^(TRR|bančno nakazilo|nakazilo(?: na TRR)?|transakcijski racun|transakcijski račun)$/i.test(m.trim()));if(nonCash.length===1)invoiceHeader=await verifiedInvoiceHeader(read,header.numberingId,{spaceId:invoiceHeader.spaceId,paymentMethod:nonCash[0]});}
     assert.ok(invoiceHeader.ready,'DEV_SMOKE_INVOICE_HEADER_AMBIGUOUS');report.invoiceHeader=invoiceHeader;
    }
    const body=businessDocumentBody(kind,caseId,{serviceRequestId:caseId,numberingId:header.numberingId,saleTypeId:header.saleTypeId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,warehouseId:source.warehouseId,spaceId:invoiceHeader?.spaceId,paymentMethod:invoiceHeader?.paymentMethod,lines,note:'QA-SIM-PR19 TEST ONLY; source '+source.id+'; source SHA '+source.contentSha256+'; synthetic approval/work completion only; no actual repair or customer approval'},kind==='invoice'?quibiToday():undefined);
    if(kind==='invoice'){body.Glavadokumenta.datIzdRac=quibiToday();body.Glavadokumenta.datValute=quibiToday();}
    const op=process.env.SELAN_DEV_SMOKE_BUSINESS_VERIFY_ONLY==='1'?await journal.get(kind,caseId):await createBusinessDocument({kind,orderId:caseId,caseId,body,journal,read,write,expectedAmount:source.amount,expectedUnitNetPrices,expectedUnitIds});
    assert.ok(op,'DEV_SMOKE_EXISTING_BUSINESS_DOCUMENT_REQUIRED');assert.equal(op.requestSha256,stableEstimatePayload(body).sha256,'DEV_SMOKE_EXISTING_REQUEST_CHANGED');
    assert.equal(op.state,'verified');assert.ok(op.quibiId);const expectedAmount=source.amount;source=await loadQuibiDocument(read,kind,op.quibiId,link.external_id);confirmContent(source,body,expectedUnitNetPrices,expectedUnitIds);assert.equal(Number(source.amount),Number(expectedAmount));
    report.business.push({kind,id:op.quibiId,state:op.state,number:source.number,amount:source.amount,caseLinked:true,sourceId:kind==='work_order'?estimateOp.quibiId:report.business.find(b=>b.kind==='work_order')?.id});console.log('SELAN_DEV_BUSINESS_PROGRESS '+JSON.stringify({business:report.business,invoiceHeader:report.invoiceHeader}));
   }
  }catch(error){report.businessError={code:error instanceof Error&&/^[A-Z_0-9]+$/.test(error.message)?error.message:error?.code??'DEV_BUSINESS_CHECK_FAILED',check:error instanceof assert.AssertionError?String(error.message).split('\n')[0]:undefined,validation:error?.validation};}
  report.journal=[];for(const kind of ['work_order','invoice']){const op=await journal.get(kind,caseId);if(op)report.journal.push({kind,state:op.state,id:op.quibiId});}
  console.log('SELAN_DEV_CATALOG_RESULT '+JSON.stringify({startedAt:report.startedAt,catalogDiagnostics:report.catalogDiagnostics,priceLists:report.priceLists,stockAlternatives:report.stockAlternatives}));delete report.catalogDiagnostics;delete report.priceLists;delete report.stockAlternatives;console.log('SELAN_DEV_BUSINESS_RESULT '+JSON.stringify(report));process.exit(0);
 }
 if(process.env.SELAN_DEV_SMOKE_STATUS_ONLY==='1'){
  const journal=quibiDevOperationJournal(seed.organization_id,actor),created=await journal.get('estimate',caseId);assert.equal(created?.state,'verified');assert.ok(created.quibiId);
  const quote=await one(db.from('quotes').select('id,evidence_payload').eq('service_request_id',caseId).order('version_no',{ascending:false}).limit(1).single());assert.equal(String(quote.evidence_payload.external_id),created.quibiId);
  report.created=true;report.linked=true;report.documentId=created.quibiId;report.quoteId=quote.id;
  const sent=await journal.get('send',quote.id);assert.ok(sent?.sendId,'DEV_SMOKE_NO_TRACKED_SEND');assert.equal(JSON.parse(sent.requestBody).recipient,recipient);
  // Re-read even a terminal journal status once for bounded provider diagnostics, never resend.
  const statusWrite=createQuibiWorkflowWriteClient({...config,environment:process.env,statusOnly:true,fetcher:async(url,init)=>{
   const response=await fetch(url,init);try{const payload=await response.clone().json();const data=payload?.data??payload;report.deliveryDiagnostics={httpStatus:response.status,fields:Object.keys(data??{}).filter(k=>/^[a-zA-Z_]{1,50}$/.test(k)),...safeQuibiValidation({errors:data?.napaka,message:[data?.message,data?.error_message,data?.errorMessage,data?.last_error,data?.reason,typeof data?.error==='string'?data.error:''].filter(v=>typeof v==='string').join(' ')},[config.username,config.password])};}catch{report.deliveryDiagnostics={httpStatus:response.status};}return response;
  }});
  await statusWrite.getSendStatus(created.quibiId,sent.sendId);
  let result=sent;
  for(let i=0;i<3;i++){result=await checkTrackedEstimateStatus({journal,write,operation:result,documentId:created.quibiId});if(result.sendStatus!=='queued')break;await new Promise(resolve=>setTimeout(resolve,2000));}
  report.sendId=result.sendId;report.sendStatus=result.sendStatus;report.sent=result.sendStatus==='sent';console.log('SELAN_DEV_SMOKE_RESULT '+JSON.stringify(report));process.exit(0);
 }
 const [catalog,choices]=await Promise.all([loadEstimateCatalog(read),quibiDevEstimateChoices(write)]);
 let fullCatalog;try{const all=await write.getArticles();fullCatalog={keys:Object.keys(all),entries:Array.isArray(all.Sifranti)?all.Sifranti.length:null};}catch(error){fullCatalog={error:error instanceof Error?error.message:'READ_FAILED'};}
 const options=canonicalEstimateOptions(catalog.options,remoteCustomer.priceListId);
 report.catalog={fullCatalog,allOptions:options.map(o=>({key:o.key,name:o.name,unit:o.unitLabel,stockManaged:o.stockManaged})),count:options.length,issues:catalog.issues,saleTypes:choices.saleTypes,warehouses:choices.warehouses,services:options.filter(o=>/servis|pregled|zavor|tehni/i.test(o.name)).map(o=>({key:o.key,name:o.name}))};
 report.requestRows=assistedEstimateRows(requestedEstimateRows('Avtomehanika','SERVIS VOZILA\nPREGLED PRED TEHNIČNIM\nPREGELD ZAVOR',options,remoteCustomer.priceListId),options).map(r=>({request:r.requestedService,key:r.key,candidates:r.candidateKeys}));
 console.log('SELAN_DEV_SMOKE_READ '+JSON.stringify(report));
 // Explicit synthetic test choices, verified by live catalog labels. Never application defaults.
 const sales=choices.saleTypes.filter(c=>c.label==='Dobava blaga in storitev'),warehouses=choices.warehouses.filter(c=>c.label==='Delavnica');
 assert.equal(sales.length,1,'DEV_SMOKE_TEST_SALE_TYPE_UNVERIFIED');assert.equal(warehouses.length,1,'DEV_SMOKE_TEST_WAREHOUSE_UNVERIFIED');
 const saleTypeId=sales[0].id,warehouseId=warehouses[0].id;
 const option=options.find(o=>o.grossPrice>0);assert.ok(option,'DEV_SMOKE_NO_VERIFIED_SERVICE');
 const existing=await db.from('service_requests').select('summary,customer_id,vehicle_id').eq('id',caseId).maybeSingle();assert.ok(!existing.error);
 if(existing.data){assert.equal(existing.data.summary,'QA-SIM-PR19-20261022');assert.equal(existing.data.customer_id,customer.id);assert.equal(existing.data.vehicle_id,vehicle.id);}
 else{const {error}=await db.from('service_requests').insert({id:caseId,organization_id:seed.organization_id,customer_id:customer.id,vehicle_id:vehicle.id,status:'preparing_offer',summary:'QA-SIM-PR19-20261022',problem_description:'QA-SIM-PR19 synthetic DEV CREATE and allowlisted SEND only',service_wanted:option.name,source:seed.source,channel:seed.channel});assert.ok(!error,'DEV_SMOKE_CASE_INSERT_FAILED');}
 const prepExists=await db.from('offer_preparations').select('id').eq('service_request_id',caseId).maybeSingle();assert.ok(!prepExists.error);if(!prepExists.data){const {error}=await db.from('offer_preparations').insert({organization_id:seed.organization_id,service_request_id:caseId,created_by_profile_id:actor,status:'ready_for_provider'});assert.ok(!error,'DEV_SMOKE_PREPARATION_FAILED');}
 const form=new FormData();form.set('catalogLines',JSON.stringify([{key:option.key,quantity:'1',discount:''}]));
 const rows=await estimateCatalogRows(form,read,choices,remoteCustomer);assert.ok(rows,'DEV_SMOKE_FRESH_REVIEW_REQUIRED');
 const journal=quibiDevOperationJournal(seed.organization_id,actor);
 const op=await createAndVerifyEstimate({journal,read,write,input:{serviceRequestId:caseId,customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,saleTypeId,warehouseId,lines:rows.lines,note:'TEST-AUTOSERVIS-SELAN QA-SIM-PR19-20261022'},verifyContent:(detail,body)=>confirmBusinessContent(detail,body,rows.unitNetPrices,rows.unitIds)});
 assert.equal(op.state,'verified');assert.ok(op.quibiId);report.created=true;report.documentId=op.quibiId;console.log('SELAN_DEV_SMOKE_CREATED '+JSON.stringify(report));
 const detail=await read.estimateDetail(op.quibiId,link.external_id);
 const registration=await db.rpc('register_manual_quibi_estimate',{p_organization_id:seed.organization_id,p_service_request_id:caseId,p_quibi_customer_id:link.external_id,p_external_id:op.quibiId,p_content_sha256:detail.contentSha256,p_actor_id:actor});
 assert.ok(!registration.error&&registration.data?.ok,'DEV_SMOKE_LINK_FAILED');
 const quote=await one(db.from('quotes').select('id,evidence_payload').eq('service_request_id',caseId).order('version_no',{ascending:false}).limit(1).single());assert.equal(String(quote.evidence_payload.external_id),op.quibiId);report.linked=true;report.quoteId=quote.id;console.log('SELAN_DEV_SMOKE_LINKED '+JSON.stringify(report));
 const body=JSON.parse(op.requestBody);
 const sent=await sendAndTrackEstimate({journal,read,write,quoteRevisionId:quote.id,serviceRequestId:caseId,documentId:op.quibiId,recipient,subject:'TEST-AUTOSERVIS-SELAN QA-SIM-PR19',customerId:link.external_id,vehicleId:vehicleLink.quibi_vehicle_id,externalId:op.externalId,numberingId:String(body.Glavadokumenta.stevilcenje_id),approvedContentSha256:detail.contentSha256,approvedForSend:true,beforeDispatch:async()=>{quibiWorkflowConfig(process.env,'send');assert.equal(quibiDevTestRecipient(process.env,customer.email),recipient);}});
 report.sendId=sent.sendId;report.sendStatus=sent.sendStatus;report.sent=sent.sendStatus==='sent';console.log('SELAN_DEV_SMOKE_RESULT '+JSON.stringify(report));
}catch(error){report.error=error instanceof Error&&/^QUIBI_[A-Z_0-9]+$/.test(error.message)?error.message:error?.code??'DEV_SMOKE_CHECK_FAILED';report.check=error instanceof assert.AssertionError?String(error.message).split('\n')[0]:undefined;console.log('SELAN_DEV_SMOKE_RESULT '+JSON.stringify(report));process.exitCode=1;}
