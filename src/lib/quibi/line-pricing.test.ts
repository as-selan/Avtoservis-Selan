import {test} from 'node:test';import assert from 'node:assert/strict';import {quibiLinePricing,unitNetFromGross,moneyLineCents,quibiDocumentTotalCents,quibiDocumentAmountMatches} from './line-pricing.ts';
test('Quibi READ line total is never multiplied as a unit price',()=>{const result=quibiLinePricing({cenaBrezDDV:'50',kolicina:'2.2',popust:'0',cenaZDDV:'110',Ddv:{naziv:'22 %',stopnjaDDV:'22'}});assert.equal(result.unitNetPrice,'50');assert.equal(result.unitGrossPrice,'61');assert.equal(result.lineNetAmount,'110');assert.equal(result.pricingVerified,true)});
test('quantity and discount are independently verified',()=>{assert.equal(quibiLinePricing({cenaBrezDDV:'7.54',kolicina:'7.5',popust:'10',cenaZDDV:'50.9',Ddv:{stopnjaDDV:'22'}}).pricingVerified,true);assert.deepEqual(quibiLinePricing({cenaBrezDDV:'50',kolicina:'2',popust:'0',cenaZDDV:'50',Ddv:{stopnjaDDV:'22'}}),{})});
test('gross UI price becomes documented unit net and unknown VAT blocks preparation',()=>{assert.equal(unitNetFromGross(122,'5',[{id:'5',label:'22 %'}]),100);assert.throws(()=>unitNetFromGross(122,'5',[{id:'5',label:'Neznano'}]));assert.throws(()=>unitNetFromGross(122,'6',[{id:'5',label:'22 %'}]))});

test('decimal half-up cents, comma inputs, quantity and discount never drift',()=>{assert.equal(moneyLineCents('1','59,00'),5900);assert.equal(moneyLineCents('1','20.00'),2000);assert.equal(moneyLineCents('1','32.94')+moneyLineCents('1','59')+moneyLineCents('1','20'),11194);assert.equal(moneyLineCents('1','1.005'),101);assert.equal(moneyLineCents('2.5','20','10'),4500);assert.throws(()=>moneyLineCents(1,20,101));});

test('actual C066 VAT rounding is calculated, not accepted by an arbitrary tolerance',()=>{
 const line={quantity:'1',discount:'0',unitNetPrice:'40.97540984',unitGrossPrice:'49.99',historicalVatLabel:'22 %',vatId:'5',pricingVerified:true};
 assert.deepEqual(quibiDocumentTotalCents([line]),[4999,5000]);
 assert.equal(quibiDocumentAmountMatches({amount:'50.00',lines:[line]},49.99),true);
 assert.equal(quibiDocumentAmountMatches({amount:'50.01',lines:[line]},49.99),false);
 assert.equal(quibiDocumentAmountMatches({amount:'50.00',lines:[line]},48.99),false);
 assert.equal(quibiDocumentAmountMatches({amount:'50.00',lines:[{...line,historicalVatLabel:undefined}]},49.99),false);
});
