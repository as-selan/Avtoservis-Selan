import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticIntakeSelection,intakeAutofill,preserveEditedFields,intakeVehicleSelection} from './selection.ts';
import {searchQuibiIntake,mergeIntakeCandidates} from './quibi-search.ts';
import {inspectionFindings,inspectionRepairServices,withInspectionRows} from '../inspections/checklist.ts';
import {readVehicleHistory} from '../quibi/vehicle-history.ts';
const vehicle={vehicleId:'local-v',make:'TEST',model:'Vozilo',registrationCurrent:'LJ-123',vin:'TESTVIN'};
const customer={customerId:'local-c',displayName:'TEST Žagar',phone:'040123456',email:null,vehicles:[vehicle]};
test('an explicit customer click fills the only vehicle or exact registration/VIN, never guesses among vehicles',()=>{
 assert.equal(intakeVehicleSelection(customer,'Žagar')?.vehicleId,'local-v');
 const multi={...customer,vehicles:[vehicle,{...vehicle,vehicleId:'v2',registrationCurrent:'MB-456',vin:'OTHER'}]};
 assert.equal(intakeVehicleSelection(multi,'lj 123')?.vehicleId,'local-v');assert.equal(intakeVehicleSelection(multi,'OTHER')?.vehicleId,'v2');assert.equal(intakeVehicleSelection(multi,'Žagar'),null);
});
test('checklist has optional note, stores only selected findings and reuses repair scope without prices or duplicates',()=>{
 const findings=inspectionFindings({Zavore:'repair',Luči:'ok'});assert.equal(findings,'Zavore: Potrebno popravilo\nLuči: V redu');assert.deepEqual(inspectionRepairServices(findings),['Zavore']);assert.equal(inspectionFindings({}),'');
 const rows=withInspectionRows([],findings);assert.equal(rows.length,1);assert.equal(rows[0].key,'');assert.equal(rows[0].quantity,'');assert.equal('unitPrice' in rows[0],false);assert.deepEqual(withInspectionRows(JSON.parse(JSON.stringify(rows)),findings),rows);
});
test('Quibi intake finds registration and owner through READ only, reuses local identity and additional vehicles',async()=>{
 const remote={id:'7',name:'TEST Žagar',phone:'040123456',email:''};const v={id:'8',customerId:'7',make:'TEST',model:'Vozilo',registration:'LJ-123',vin:'TESTVIN',disabled:false};
 const read={customers:async()=>[remote],allVehicles:async()=>[v],lookupVehicle:async()=>v,customer:async()=>remote,vehicles:async()=>[v]};
 const candidates=await searchQuibiIntake(read,'lj123');assert.equal(candidates[0].customerId,'quibi:7');assert.equal(candidates[0].vehicles[0].vehicleId,'quibi:8');assert.equal((await searchQuibiIntake(read,'zagar')).length,1);assert.equal((await searchQuibiIntake(read,'123456')).length,1);assert.equal((await searchQuibiIntake(read,'TEST Vozilo')).length,1);
 assert.deepEqual(mergeIntakeCandidates([customer],candidates),[customer]);
});
test('vehicle history includes listed documents only for exact customer and vehicle; detail mismatch is not exposed',async()=>{
 const document={id:'1',customerId:'7',numberingId:'1',status:'',amount:'50'};
 const detail={...document,vehicleId:'8',number:'TEST-1',date:'2026-10-25',lines:[{description:'Servis',quantity:'1',grossPrice:'50'}],contentSha256:'a'.repeat(64)};
 const read={vehicle:async()=>({id:'8',customerId:'7'}),workOrders:async()=>[document],estimates:async()=>[],invoices:async()=>[],documentDetail:async()=>detail};
 assert.equal((await readVehicleHistory(read,'7','8')).documents[0].work[0],'Servis');
 assert.equal((await readVehicleHistory({...read,documentDetail:async()=>({...detail,vehicleId:'9'})},'7','8')).documents.length,0);
 const wrong=await readVehicleHistory({...read,documentDetail:async()=>({...detail,customerId:'9'})},'7','8');assert.equal(wrong.documents.length,0);assert.equal(wrong.unavailable,true);
 assert.equal((await readVehicleHistory(read,'7','8',0,['1'])).documents.length,0);
 await assert.rejects(readVehicleHistory(read,'7','9'),/MISMATCH/);
});


test('one unambiguous result auto-selects without a click; multiple customers or vehicles remain choices',()=>{
 assert.equal(automaticIntakeSelection([customer],'Žagar')?.vehicle?.vehicleId,'local-v');
 const multiple={...customer,vehicles:[vehicle,{...vehicle,vehicleId:'v2',registrationCurrent:'MB-456',vin:'OTHER'}]};
 assert.equal(automaticIntakeSelection([multiple],'Žagar'),null);
 assert.equal(automaticIntakeSelection([multiple],'MB456')?.vehicle?.vehicleId,'v2');
 assert.equal(automaticIntakeSelection([customer,{...customer,customerId:'second',vehicles:[]}],'Žagar'),null);
});
test('all available metadata prefill, unavailable values stay blank, manual edits survive later enrichment',()=>{
 const values=intakeAutofill(customer,{...vehicle,year:2018,mileage:123456,fuel:'petrol',powerKw:110,engine:'1968',engineType:'TEST'});
 assert.equal(values.year,'2018');assert.equal(values.mileage,'123456');assert.equal(values.fuel,'bencin');assert.equal(values.powerKw,'110');assert.equal(values.engineDisplacement,'1968');assert.equal(values.engineCode,'TEST');assert.equal(values.email,'');
 const edited=preserveEditedFields(values,{phone:'999',year:'2020',powerKw:'120'},new Set<keyof typeof values>(['phone','year']));
 assert.equal(edited.phone,'040123456');assert.equal(edited.year,'2018');assert.equal(edited.powerKw,'120');
 assert.equal(intakeAutofill(customer,vehicle).powerKw,'');assert.equal(intakeAutofill(customer,vehicle).mileage,'');
});


test('duplicate remote identities and conflicting VINs stay ambiguous instead of being merged for auto-selection',()=>{
 const r={...customer,customerId:'quibi:7',vehicles:[{...vehicle,vehicleId:'quibi:8'}]};
 const duplicated=mergeIntakeCandidates([customer],[r,{...r,customerId:'quibi:9'}]);assert.equal(duplicated.length,3);assert.equal(automaticIntakeSelection(duplicated,'Žagar'),null);
 const conflicting=mergeIntakeCandidates([customer],[{...r,vehicles:[{...r.vehicles[0],vin:'OTHER'}]}]);assert.equal(conflicting[0].vehicles.length,2);assert.equal(automaticIntakeSelection(conflicting,'LJ-123'),null);
});
