export type QuibiPriceList = {id:string;name:string;lines:{articleId:string;netPrice:string;discount:string}[]};
export type QuibiArticle = {id:string;code:string;name:string;netPrice:string;vatId:string;vatLabel:string;unitId:string;unitLabel:string};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('QUIBI_INVALID_PRICING');return value as Record<string,unknown>};
const id=(value:unknown)=>{const text=String(value??'');if(!/^[1-9][0-9]{0,14}$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error('QUIBI_INVALID_PRICING');return text};
const decimal=(value:unknown)=>{const text=String(value??'');if(!/^\d+(\.\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('QUIBI_INVALID_PRICING');return text};
const name=(value:unknown)=>{if(typeof value!=='string'||!value.trim())throw Error('QUIBI_INVALID_PRICING');return value.trim()};
function data(value:unknown){const envelope=object(value);if(envelope.error!==false)throw Error('QUIBI_INVALID_PRICING');return object(envelope.data)}
export function parseQuibiPriceLists(value:unknown):QuibiPriceList[]{
 const rows=data(value).Cenik;if(!Array.isArray(rows)||rows.length>1000)throw Error('QUIBI_INVALID_PRICING');
 return rows.map(row=>{const wrapper=object(row),list=object(wrapper.Cenik),lines=wrapper.Artiklicenika;if(!Array.isArray(lines)||lines.length>10000)throw Error('QUIBI_INVALID_PRICING');const listId=id(list.id);return {id:listId,name:name(list.naziv),lines:lines.map(value=>{const line=object(value);if(id(line.cenik_id)!==listId)throw Error('QUIBI_PRICELIST_MISMATCH');const discount=decimal(line.popust);if(Number(discount)>100)throw Error('QUIBI_INVALID_PRICING');return {articleId:id(line.sifranti_id),netPrice:decimal(line.cenaBrezDDV),discount}})}});
}
export function parseQuibiArticle(value:unknown,expectedId:string):QuibiArticle{
 const wrapper=object(data(value).Sifranti),article=object(wrapper.Sifranti),vat=object(wrapper.Ddv),unit=object(wrapper.Enota);
 const articleId=id(article.id);if(articleId!==id(expectedId))throw Error('QUIBI_ARTICLE_MISMATCH');
 const vatId=id(article.ddv_id),unitId=id(article.enota_id);if(id(vat.id)!==vatId||id(unit.id)!==unitId)throw Error('QUIBI_ARTICLE_REFERENCE_MISMATCH');
 return {id:articleId,code:name(article.sifra),name:name(article.naziv),netPrice:decimal(article.cenaBrezDDV),vatId,vatLabel:name(vat.naziv),unitId,unitLabel:name(unit.naziv)};
}
