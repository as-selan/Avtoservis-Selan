import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseQuibiArticle,parseQuibiPriceLists} from './pricing-read.ts';
const prices={error:false,data:{Cenik:[{Cenik:{id:'189',naziv:'Servis'},Artiklicenika:[{cenik_id:'189',sifranti_id:'116731',cenaBrezDDV:'29.51',popust:'0'}]}]}};
const article={error:false,data:{Sifranti:{Sifranti:{id:'116731',sifra:'SERVICE',naziv:'Storitev',cenaBrezDDV:'37.70',ddv_id:'5',enota_id:'1'},Ddv:{id:'5',naziv:'22 %'},Enota:{id:'1',naziv:'kos'}}}};
test('pricing keeps price list and master article prices distinct and preserves provider IDs',()=>{
 assert.equal(parseQuibiPriceLists(prices)[0].lines[0].netPrice,'29.51');
 assert.equal(parseQuibiArticle(article,'116731').netPrice,'37.70');
 assert.deepEqual(parseQuibiPriceLists({error:false,data:{Cenik:[]}}),[]);
 assert.throws(()=>parseQuibiPriceLists({error:true,data:{Cenik:[]}}));
 assert.throws(()=>parseQuibiPriceLists({error:false,data:{}}));
});
test('pricing rejects mismatched article, catalog references and malformed prices',()=>{
 assert.throws(()=>parseQuibiArticle(article,'2'),/ARTICLE_MISMATCH/);
 const wrong=structuredClone(article);wrong.data.Sifranti.Ddv.id='9';assert.throws(()=>parseQuibiArticle(wrong,'116731'),/REFERENCE_MISMATCH/);
 const list=structuredClone(prices);list.data.Cenik[0].Artiklicenika[0].cenik_id='190';assert.throws(()=>parseQuibiPriceLists(list),/MISMATCH/);
 const invalid=structuredClone(article);invalid.data.Sifranti.Sifranti.cenaBrezDDV='NaN';assert.throws(()=>parseQuibiArticle(invalid,'116731'));
});
