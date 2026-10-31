import {moneyLineCents} from './line-pricing.ts';
export type PriceLine={description:string;quantity:string;discount?:string;unitNetPrice?:string;lineNetAmount?:string;unitGrossPrice?:string;pricingVerified?:boolean;lineType?:string;vat?:string;historicalVatLabel?:string;unit?:string;unitId?:string;vatId?:string};
/** Net lines are authoritative source values; never multiply a rounded derived gross unit back into a line. */
export function netLineCents(line:PriceLine){if(line.lineType==='3')return null;if(line.pricingVerified===false||line.unitNetPrice===undefined||line.discount===undefined)return null;try{return line.lineNetAmount!==undefined?moneyLineCents(1,line.lineNetAmount):moneyLineCents(line.quantity,line.unitNetPrice,line.discount);}catch{return null;}}
export function euroCents(cents:number|null){return cents===null?'Ni potrjeno':(cents/100).toLocaleString('sl-SI',{style:'currency',currency:'EUR'});}
export function sourceEuro(value?:string){try{return value===undefined?'Ni podatka':euroCents(moneyLineCents(1,value));}catch{return 'Ni potrjeno';}}

/** Presentation only: retain the exact original description in the source details and payload. */
export function businessLineDescription(value:string){return value.replace(/^QA-SIM(?:[\s:-]+E2E)?[\s:-]+/i,'')||value;}
