import test from 'node:test';import assert from 'node:assert/strict';import {readArticlePages} from './article-pages.ts';
const row=(id:number)=>({Sifranti:{id:String(id),sifra:'S'+id,naziv:'Storitev '+id,cenaBrezDDV:'10',enota_id:'1',ddv_id:'5',vodiZalogo:'0'},Enota:{id:'1',naziv:'kos'},Ddv:{id:'5',naziv:'22 %'}});
const page=(ids:number[],next:unknown)=>({error:false,data:{Sifranti:ids.map(row)},naslednji_po:next});
test('reads every cursor page including a short nonterminal page, once and in order',async()=>{const paths:string[]=[];const values=[page([1,2],2),page([3],3),page([4],null)];const rows=await readArticlePages(async path=>{paths.push(path);return values.shift()},2);assert.deepEqual(rows.map(r=>r.id),['1','2','3','4']);assert.deepEqual(paths.map(p=>new URL('https://fixture'+p).searchParams.get('po')),['0','2','3']);assert.ok(paths.every(p=>p.startsWith('/api2/sifranti/seznam?')&&p.includes('arhivirano=0')))});
test('empty terminal page is valid; missing cursor, malformed data and duplicate/regressing IDs fail closed',async()=>{assert.deepEqual(await readArticlePages(async()=>page([],null)),[]);for(const value of [{error:true},page([1],undefined),page([2,1],null),page([1,1],null),page([1],0),page([1],2),page([],1)])await assert.rejects(readArticlePages(async()=>value,2));});
test('never silently truncates or accepts a repeated page, missing price or mismatched references',async()=>{const values=[page([1],1),page([1],null)];await assert.rejects(readArticlePages(async()=>values.shift(),1),/DUPLICATE_OR_ORDER/);const missing=page([1],null);delete (missing.data.Sifranti[0].Sifranti as Partial<typeof missing.data.Sifranti[0]['Sifranti']>).cenaBrezDDV;await assert.rejects(readArticlePages(async()=>missing));const mismatch=page([1],null);mismatch.data.Sifranti[0].Enota.id='9';await assert.rejects(readArticlePages(async()=>mismatch),/REFERENCE/);await assert.rejects(readArticlePages(async()=>page([1,2],null),1));});


test('service index excludes bulk stock data but validates every ID and reports unsupported service rows',async()=>{
 const invalid:string[]=[],rows=page([1,2,3],null);delete (rows.data.Sifranti[1].Sifranti as Partial<typeof rows.data.Sifranti[1]['Sifranti']>).sifra;
 const selected=await readArticlePages(async()=>rows,3,{include:r=>Number((r.Sifranti as {id:string}).id)>1,invalid:id=>invalid.push(id)});assert.deepEqual(selected.map(r=>r.id),['3']);assert.deepEqual(invalid,['2']);
 await assert.rejects(readArticlePages(async()=>page([1,1],null),3,{include:()=>false}),/DUPLICATE/);
});


test('blank SKU is accepted only for explicitly non-stock rows when free-line fallback is enabled',async()=>{
 const value=page([1],null);value.data.Sifranti[0].Sifranti.sifra='';assert.equal((await readArticlePages(async()=>value,500,{allowUncoded:true}))[0].code,'');
 value.data.Sifranti[0].Sifranti.vodiZalogo='1';await assert.rejects(readArticlePages(async()=>value,500,{allowUncoded:true}));
});
