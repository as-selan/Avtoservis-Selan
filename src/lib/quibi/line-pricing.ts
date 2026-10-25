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

/** Quibi may round gross lines or round net bases before calculating VAT. No arbitrary cent tolerance. */
export function quibiDocumentTotalCents(lines:{quantity:string;discount?:string;unitGrossPrice?:string;unitNetPrice?:string;historicalVatLabel?:string;vatId?:string;pricingVerified?:boolean;lineType?:string}[]):number[]{
 const chargeable=lines.filter(line=>line.lineType!=='3');if(!chargeable.length)return [];
 const totals:number[]=[];const bases=new Map<string,{base:number;factor:number}>();let gross=0,vatKnown=true;
 try{for(const line of chargeable){if(!line.pricingVerified||line.unitGrossPrice==null||line.discount==null)return [];
 gross+=moneyLineCents(line.quantity,line.unitGrossPrice,line.discount);
 try{if(line.unitNetPrice==null||!line.historicalVatLabel||!line.vatId)throw Error('VAT_UNKNOWN');const factor=vatFactor(line.historicalVatLabel),key=line.vatId+':'+factor;const group=bases.get(key)??{base:0,factor};group.base+=moneyLineCents(line.quantity,line.unitNetPrice,line.discount);bases.set(key,group);}catch{vatKnown=false;}}
 totals.push(gross);if(vatKnown)totals.push([...bases.values()].reduce((sum,g)=>sum+g.base+moneyLineCents(1,g.base/100*(g.factor-1)),0));
 }catch{return [];}
 return [...new Set(totals)].filter(Number.isSafeInteger);
}
export function quibiDocumentAmountMatches(doc:{amount:string;lines:Parameters<typeof quibiDocumentTotalCents>[0]},expectedAmount?:number){
 const actual=Number(doc.amount);if(!Number.isFinite(actual)||actual<0)return false;
 const totals=quibiDocumentTotalCents(doc.lines),cents=moneyLineCents(1,actual);
 if(expectedAmount!==undefined&&(!Number.isFinite(expectedAmount)||expectedAmount<0))return false;
 return totals.includes(cents)&&(expectedAmount===undefined||totals.includes(moneyLineCents(1,expectedAmount)));
}
