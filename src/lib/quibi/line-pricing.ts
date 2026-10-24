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

/** Decimal multiplication and half-up rounding in cents; no binary-money accumulation. */
export function moneyLineCents(quantity:string|number,unitPrice:string|number,discount:string|number=0):number {
 const scaled=(value:string|number)=>{const text=(typeof value==='number'&&Number.isFinite(value)?value.toFixed(8):String(value)).trim().replace(',','.');if(!/^\d+(?:\.\d{1,8})?$/.test(text))throw Error('INVALID_MONEY');const [whole,fraction='']=text.split('.');return BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,'0'));};
 const q=scaled(quantity),p=scaled(unitPrice),d=scaled(discount),scale=BigInt(100000000);
 if(d>BigInt(100)*scale)throw Error('INVALID_MONEY');
 const numerator=q*p*(BigInt(100)*scale-d)*BigInt(100),denominator=BigInt(100)*scale*scale*scale;
 const cents=(numerator+denominator/BigInt(2))/denominator;
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INVALID_MONEY');return Number(cents);
}
