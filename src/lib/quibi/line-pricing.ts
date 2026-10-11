/** Quibi view: cenaBrezDDV is unit net; cenaZDDV is the discounted net LINE value. */
export function quibiLinePricing(row:Record<string,unknown>){
 const decimal=(v:unknown)=>typeof v==='number'||typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
 const unitNet=decimal(row.cenaBrezDDV),quantity=decimal(row.kolicina),discount=decimal(row.popust),lineNet=decimal(row.cenaZDDV);
 const vat=row.Ddv&&typeof row.Ddv==='object'?row.Ddv as Record<string,unknown>:{};
 const rate=decimal(vat.stopnjaDDV);
 if(![unitNet,quantity,discount,lineNet,rate].every(Number.isFinite)||unitNet<0||quantity<0||discount<0||discount>100||lineNet<0||rate<0||rate>100||Math.abs(Math.round(unitNet*quantity*(1-discount/100)*100)/100-lineNet)>0.011)return {};
 return {unitNetPrice:String(unitNet),unitGrossPrice:String(Number((unitNet*(1+rate/100)).toFixed(8))),lineNetAmount:String(lineNet),historicalVatLabel:typeof vat.naziv==='string'?vat.naziv:rate+' %',pricingVerified:true as const};
}
export function vatFactor(label:string){const rate=label.trim().match(/^(\d+(?:[.,]\d+)?)\s*%$/);if(!rate)throw Error('QUIBI_VAT_REQUIRES_REVIEW');const value=Number(rate[1].replace(',','.'));if(value>100||!Number.isFinite(value))throw Error('QUIBI_VAT_REQUIRES_REVIEW');return 1+value/100;}
export function unitNetFromGross(price:number,vatId:string,rates:{id:string;label:string}[]){const vat=rates.find(v=>v.id===vatId);if(!vat||!Number.isFinite(price)||price<0)throw Error('QUIBI_VAT_REQUIRES_REVIEW');return Number((price/vatFactor(vat.label)).toFixed(8));}
