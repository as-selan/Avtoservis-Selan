import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCaseIdentity, visibleIdentityNotice} from './identity-notice.ts';
const linked={environment:'dev',customerId:'customer-1',vehicleId:'vehicle-1',customerSyncStatus:'ok',vehicleSyncStatus:'ok',customerEnvironment:'dev',vehicleEnvironment:'dev',resolvedVehicleNeedsReview:false};
test('only two confirmed links in the current hosted environment establish current identity',()=>{
 assert.equal(currentCaseIdentity(linked),true);
 for(const change of [{customerId:null},{vehicleId:null},{customerSyncStatus:'remote_changed'},{vehicleSyncStatus:'error'},{customerEnvironment:'production'},{vehicleEnvironment:'production'},{environment:null},{resolvedVehicleNeedsReview:true}])assert.equal(currentCaseIdentity({...linked,...change}),false);
});
test('current identity supersedes known persisted automatic identity warnings only',()=>{
 for(const text of ['Quibi povezava: Identiteta ali zahtevek zahteva ročni pregled. Nov zapis ni dovoljen.','Quibi povezava: Samodejna povezava še ni omogočena.','Quibi povezava: Po popravku povpraševanja izberite in potrdite pravo Quibi vozilo v tem primeru. Če ga ni, novo vozilo izrecno potrdi lastnik; samodejni CREATE je ustavljen.']){
  assert.equal(visibleIdentityNotice(text,true),null);assert.equal(visibleIdentityNotice(text,false),text);
 }
});
test('unrelated errors, unknown CREATE and current failed link notices remain visible',()=>{
 for(const text of ['Račun zahteva pregled.','Quibi povezava: Povezava še ni potrjena. Varna ponovna obdelava preveri obstoječi zahtevek; neznan CREATE se ne ponovi.','Quibi povezava: Neznana nova napaka.','Identiteta ali zahtevek zahteva ročni pregled. Nov zapis ni dovoljen.'])assert.equal(visibleIdentityNotice(text,true),text);
 assert.equal(visibleIdentityNotice(null,true),null);
});
