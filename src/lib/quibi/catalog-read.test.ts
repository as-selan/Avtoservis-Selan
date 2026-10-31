import assert from 'node:assert/strict';import {test} from 'node:test';import {parseQuibiCatalog} from './catalog-read.ts';
test('catalog reads preserve provider IDs and distinguish empty from failed',()=>{
 assert.deepEqual(parseQuibiCatalog({error:false,data:{Statusi:[]}},'statuses'),[]);
 assert.deepEqual(parseQuibiCatalog({error:false,data:{Stevilcenje:[{Stevilcenje:{id:'12',naziv:'Račun'}}]}},'numberings'),[{id:'12',label:'Račun'}]);
 assert.deepEqual(parseQuibiCatalog({error:false,data:{'1':'Dobava'}},'saleTypes'),[{id:'1',label:'Dobava'}]);
 assert.throws(()=>parseQuibiCatalog({error:true,data:{Statusi:[]}},'statuses'),/INVALID/);
 assert.throws(()=>parseQuibiCatalog({error:false,data:{}},'vat'),/INVALID/);
});

test('warehouses and address types preserve the actual provider field names',()=>{
 assert.deepEqual(parseQuibiCatalog({error:false,data:{Skladisca:[{Skladisca:{id:'49',naziv:'Delavnica'}}]}},'warehouses'),[{id:'49',label:'Delavnica'}]);
 assert.deepEqual(parseQuibiCatalog({error:false,data:{Addresstypes:[{Addresstype:{id:'1',name:'Račun'}}]}},'addressTypes'),[{id:'1',label:'Račun'}]);
});
