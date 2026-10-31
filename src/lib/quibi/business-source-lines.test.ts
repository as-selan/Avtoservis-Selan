import assert from 'node:assert/strict';import {test} from 'node:test';import {businessSourceLines} from './business-source-lines.ts';
const source={id:'10',customerId:'405957',amount:'122',status:'',contentSha256:'a'.repeat(64),lines:[{description:'Delo',quantity:'1',grossPrice:'100',unitNetPrice:'100',pricingVerified:true,unitId:'1',vatId:'5',discount:'10'},{description:'Material',quantity:'2',grossPrice:'20',unitNetPrice:'20',pricingVerified:true,unitId:'2',vatId:'6',discount:'0'}]};
test('business document transfer preserves each Quibi unit, VAT and discount without staff re-entry',()=>{const lines=businessSourceLines(source,[{id:'1'},{id:'2'}],[{id:'5'},{id:'6'}]);assert.equal(lines[0].popust,10);assert.ok(!('sifra' in lines[1]));assert.equal(lines[1].enota_id,'2');assert.equal(lines[1].ddv_id,'6');assert.equal(lines[1].kolicina,2);assert.equal(source.lines[0].discount,'10');});
test('business transfer rejects missing or unknown references, invalid discounts and quantities',()=>{assert.throws(()=>businessSourceLines(source,[{id:'1'}],[{id:'5'},{id:'6'}]));for(const patch of [{discount:undefined},{discount:'101'},{discount:'NaN'},{quantity:'0'},{unitNetPrice:'Infinity'},{unitNetPrice:''},{vatId:undefined}]){const changed={...source,lines:[{...source.lines[0],...patch}]};assert.throws(()=>businessSourceLines(changed,[{id:'1'}],[{id:'5'}]));}});

test('approved non-stock code price is preserved when current base changes; stock override is forbidden',()=>{const doc={...source,lines:[{...source.lines[0],articleId:'11',articleCode:'SERVICE'}]};const article={id:'11',code:'SERVICE',name:'Delo',netPrice:'110',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',stockManaged:false};const lines=businessSourceLines(doc,[{id:'1'}],[{id:'5'}],[article]);assert.deepEqual(lines[0],{sifra:'SERVICE',kolicina:1,popust:10,ddv_id:'5',opis:'Delo',cena:100});assert.throws(()=>businessSourceLines(doc,[{id:'1'}],[{id:'5'}],[{...article,stockManaged:true}]),/STOCK_PRICE_CHANGED/);assert.throws(()=>businessSourceLines(doc,[{id:'1'}],[{id:'5'}],[{...article,unitId:'2'}]),/ARTICLE_CHANGED/)});

import {appendWorkOrderCatalogLine} from './business-source-lines.ts';
test('append preserves three work-order lines and adds one catalog line exactly once',()=>{
 const third={...source.lines[0],description:'Diagnostika',quantity:'3',unitNetPrice:'15',grossPrice:'15',discount:'5'};
 const current={...source,lines:[...source.lines,third]};
 const option={key:'article:17',articleId:'17',priceListId:'',name:'Zavore',code:'B17',priceListName:'Osnovna',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',grossPrice:24.4,discount:0,priceListNetPrice:'20',priceListDiscount:0,priceListDiffers:false,sourceSha:'b'.repeat(64),stockManaged:false,unitNetPrice:20};
 const units=[{id:'1'},{id:'2'}],vat=[{id:'5'},{id:'6'}];
 const merged=appendWorkOrderCatalogLine(current,units,vat,[],option,1,false);
 assert.equal(merged.length,4);assert.deepEqual(merged.slice(0,3),businessSourceLines(current,units,vat));
 assert.deepEqual(merged[3],{sifra:'B17',kolicina:1,popust:0,ddv_id:'5',opis:'Zavore',cena:20});
 assert.throws(()=>appendWorkOrderCatalogLine(current,units,vat,[],option,1,true),/ALREADY_APPLIED/);
 assert.throws(()=>appendWorkOrderCatalogLine({...current,lines:[...current.lines,{...third,lineType:'3',quantity:'0',grossPrice:'0'}]},units,vat,[],option,1,false),/UNSUPPORTED/);
});
