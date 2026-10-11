import type {QuibiEstimateDetail} from './contracts.ts';
import type {QuibiArticle} from './pricing-read.ts';
import type {DocumentLine} from './write-contract.ts';
export function quibiSourceNotes(source:QuibiEstimateDetail){return source.lines.filter(l=>l.lineType==='3'&&Number(l.quantity)===0&&Number(l.grossPrice)===0);}
export function businessSourceLines(source:QuibiEstimateDetail,units:{id:string}[],vat:{id:string}[],articles:QuibiArticle[]=[]):DocumentLine[]{
 const chargeable=source.lines.filter(l=>!quibiSourceNotes(source).includes(l));
 if(!chargeable.length)throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
 return chargeable.map(line=>{
  if(!line.pricingVerified||line.unitNetPrice==null||!/^\d+(\.\d+)?$/.test(line.unitNetPrice)||!line.unitId||!line.vatId||!units.some(unit=>unit.id===line.unitId)||!vat.some(rate=>rate.id===line.vatId)||line.discount==null||!/^\d+(\.\d+)?$/.test(line.discount)||Number(line.discount)>100)throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  const quantity=Number(line.quantity),price=Number(line.unitNetPrice),discount=Number(line.discount);
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0||!line.description.trim())throw Error('SOURCE_LINE_METADATA_UNSUPPORTED');
  if(line.articleId||line.articleCode){const article=articles.find(a=>a.id===line.articleId&&a.code===line.articleCode);if(!article||article.unitId!==line.unitId||article.vatId!==line.vatId)throw Error('SOURCE_ARTICLE_CHANGED');
   if(article.stockManaged!==false&&Number(article.netPrice)!==price)throw Error('SOURCE_STOCK_PRICE_CHANGED');
   return {sifra:article.code,kolicina:quantity,popust:discount,ddv_id:line.vatId,...(article.stockManaged===false?{opis:line.description,cena:price}:{})};
  }
  // Documented free-line CREATE price is UNIT NET despite its name.
  return {opis:line.description,enota_id:line.unitId,ddv_id:line.vatId,kolicina:quantity,cenaZDDV:price,popust:discount};
 });
}
