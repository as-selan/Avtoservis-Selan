import {test} from 'node:test';import assert from 'node:assert/strict';import {customerCatalogPricing} from './customer-catalog-pricing.ts';
const article={id:'11',code:'SERVICE',name:'Storitev',netPrice:'100',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',stockManaged:false};const list={id:'189',name:'Posebni cenik',lines:[{articleId:'11',netPrice:'80',discount:'5'}]};
test('unassigned customer gets verified base price, never the unrelated special list',()=>{const p=customerCatalogPricing(article,list,[list],{priceListId:null});assert.equal(p.option.grossPrice,122);assert.equal(p.option.discount,0);assert.equal(p.custom,false)});
test('explicitly assigned customer list supplies documented non-stock custom price and discount',()=>{const p=customerCatalogPricing(article,list,[list],{priceListId:'189'});assert.equal(p.net,80);assert.equal(p.option.grossPrice,97.6);assert.equal(p.option.discount,5);assert.equal(p.custom,true)});
test('unknown customer policy, unavailable list and unsupported stock override stop preparation',()=>{assert.throws(()=>customerCatalogPricing(article,list,[list],{}));assert.throws(()=>customerCatalogPricing(article,list,[list],{priceListId:'190'}));assert.throws(()=>customerCatalogPricing({...article,stockManaged:true},list,[list],{priceListId:'189'}))});

import {parseCustomerDetail,parseCustomers} from './contracts.ts';
test('both customer list and detail preserve explicit null and assigned price list IDs',()=>{for(const value of [null,'189']){const row={Stranka:{id:'2',naziv:'TEST',cenik_id:value}};const detail=parseCustomerDetail({error:false,data:{Stranke:row}}),list=parseCustomers({error:false,data:{Stranke:[row]}});assert.equal(detail.priceListId,value);assert.equal(list[0].priceListId,value)}const missing=parseCustomerDetail({error:false,data:{Stranke:{Stranka:{id:'2',naziv:'TEST'}}}});assert.equal(missing.priceListId,undefined)});

test('unrelated price lists never invalidate the approved base price; actual assigned changes do',()=>{
 const another={...list,id:'190',lines:[{articleId:'11',netPrice:'999',discount:'20'}]};
 const first=customerCatalogPricing(article,list,[list,another],{priceListId:null});
 assert.equal(customerCatalogPricing(article,another,[list,another],{priceListId:null}).option.sourceSha,first.option.sourceSha);
 const assigned=customerCatalogPricing(article,list,[list,another],{priceListId:'189'});
 assert.notEqual(customerCatalogPricing(article,list,[{...list,lines:[{articleId:'11',netPrice:'81',discount:'5'}]},another],{priceListId:'189'}).option.sourceSha,assigned.option.sourceSha);
});
