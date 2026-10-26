import assert from 'node:assert/strict';import {test} from 'node:test';
import {suggestedEstimateRows,draftRowPrice,draftTotal,initialEstimateRows,canonicalEstimateOptions,requestedEstimateRows,assistedEstimateRows} from './estimate-editor.ts';
const option={key:'9:11',articleId:'11',priceListId:'9',name:'Servis',code:'S',priceListName:'Cenik',unitId:'1',unitLabel:'kos',vatId:'2',vatLabel:'22 %',grossPrice:122,discount:0,priceListNetPrice:'80',priceListDiscount:5,priceListDiffers:true,sourceSha:'a',stockManaged:false};
test('confirmed customer pricing is reused without a typed price or repeated confirmation',()=>{assert.deepEqual(initialEstimateRows([],option.key),[{key:option.key,quantity:'1',discount:''}]);assert.equal(draftRowPrice({key:option.key,quantity:'2',discount:''},option,'9').unitPrice,97.6);assert.equal(draftRowPrice({key:option.key,quantity:'2',discount:''},option,null).unitPrice,122)});
test('row choices and discount produce per-line cents and incomplete input has no false total',()=>{const row={key:option.key,quantity:'2',discount:'5',unitPrice:'100'};assert.equal(draftTotal([row],[option],'9'),190);assert.equal(draftTotal([{...row,quantity:''}],[option],'9'),null);assert.equal(draftTotal([{...row,unitPrice:'0oops'}],[option],'9'),null);assert.equal(draftTotal([],[option],'9'),null)});
test('AI quantities remain unknown instead of being invented, and exact service starts filled',()=>{assert.deepEqual(initialEstimateRows([{key:option.key,quantity:null}],null),[{key:option.key,quantity:'',discount:''}]);assert.deepEqual(initialEstimateRows([],null),[])});

test('a cleared price blocks a false total while an explicit free line remains zero',()=>{assert.equal(draftTotal([{key:option.key,quantity:'1',discount:'',unitPrice:''}],[option],null),null);assert.equal(draftTotal([{key:option.key,quantity:'1',discount:'',unitPrice:'0'}],[option],null),0)});

test('each article uses its assigned customer list even when another list appeared first',()=>{const other={...option,key:'10:11',priceListId:'10'};assert.deepEqual(canonicalEstimateOptions([other,option],'9').map(o=>o.key),['9:11']);assert.equal(canonicalEstimateOptions([other,option],null).length,1)});

test('all three requested services survive without AI; only reliable exact matches receive catalog prices',()=>{
 const options=[{...option,name:'Servis vozila'},{...option,key:'9:12',articleId:'12',name:'Pregled pred tehničnim'}];
 const rows=requestedEstimateRows('SERVIS VOZILA \nPREGLED PRED TEHNIČNIM\nPREGELD ZAVOR',null,options,'9');
 assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.key),['9:11','9:12','']);assert.equal(rows[2].requestedService,'PREGELD ZAVOR');assert.equal(draftTotal(rows,options,'9'),null);
});
test('duplicate price lists are one article, ambiguous articles never guessed and hourly quantity stays blank',()=>{
 const other={...option,key:'10:11',priceListId:'10'};
 assert.equal(requestedEstimateRows('Servis',null,[other,option],'9')[0].key,'9:11');
 assert.equal(requestedEstimateRows('Servis',null,[option,{...option,key:'9:12',articleId:'12'}],'9')[0].key,'');
 assert.equal(requestedEstimateRows('Servis',null,[{...option,unitLabel:'ura'}],'9')[0].quantity,'');
});

test('one clear transposition pre-fills only an existing catalog service',()=>{
 const catalog=[{...option,name:'Pregled zavor'}];const rows=requestedEstimateRows('PREGELD ZAVOR',null,catalog,'9');
 const result=assistedEstimateRows(rows,catalog);assert.equal(result[0].key,option.key);assert.equal(result[0].unitPrice,undefined);
});
test('ambiguous AI offers row choices; confident AI uses only validated catalog references',()=>{
 const catalog=[{...option,name:'Pregled zavor'},{...option,key:'9:12',articleId:'12',name:'Kontrola zavornega sistema'}];const rows=requestedEstimateRows('Pregled zavornega sistema',null,catalog,'9');
 const uncertain=assistedEstimateRows(rows,catalog,[{requestedService:'Pregled zavornega sistema',key:null,confidence:'uncertain',alternatives:['9:11','9:12']}]);assert.equal(uncertain[0].key,'');assert.deepEqual(uncertain[0].candidateKeys,['9:11','9:12']);
 const high=assistedEstimateRows(rows,catalog,[{requestedService:'Pregled zavornega sistema',key:'9:11',confidence:'high',alternatives:[]}]);assert.equal(high[0].key,'9:11');assert.equal(high[0].unitPrice,undefined);
});

test('bounded synonymous service names match but never expand a generic service to parts replacement',()=>{
 const options=[{...option,name:'Pregled zavor'},{...option,key:'9:12',articleId:'12',name:'Pregled pred tehničnim pregledom'}];
 const rows=assistedEstimateRows(requestedEstimateRows('Kontrola zavornega sistema\nPregled pred tehničnim',null,options,'9'),options);assert.deepEqual(rows.map(r=>r.key),['9:11','9:12']);
 assert.equal(assistedEstimateRows(requestedEstimateRows('Servis vozila',null,options,'9'),[{...option,name:'Menjava olja'}])[0].key,'');
});


test('known regular service synonym is filled, but a nonzero free-named inspection remains a choice',()=>{
 const make=(id:string,name:string,grossPrice:number)=>({key:'article:'+id,articleId:id,priceListId:'',name,code:id,priceListName:'Osnovna cena',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',grossPrice,discount:0,priceListNetPrice:'27',priceListDiscount:0,priceListDiffers:false,sourceSha:'a'.repeat(64),stockManaged:false});
 const options=[make('1','REDNI SERVIS VOZILA',32.94),make('2','BREZPLAČNI PREGLED VOZILA PRED TEHNIČNIM PREGLEDOM',59)];
 const rows=assistedEstimateRows(requestedEstimateRows('SERVIS VOZILA\nPREGLED PRED TEHNIČNIM\nPREGELD ZAVOR',null,options),options);
 assert.equal(rows.length,3);assert.equal(rows[0].key,'article:1');assert.equal(rows[0].quantity,'1');assert.equal(rows[1].key,'');assert.ok(rows[1].candidateKeys?.includes('article:2'));assert.equal(rows[2].key,'');
});


test('brake inspection never suggests a different inspection system or brake replacement',()=>{
 const make=(id:string,name:string)=>({key:'article:'+id,articleId:id,priceListId:'',name,code:id,priceListName:'Osnovna',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',grossPrice:29,discount:0,priceListNetPrice:'23.77',priceListDiscount:0,priceListDiffers:false,sourceSha:'a'.repeat(64),stockManaged:false});
 const options=[make('1','KONTROLA PODVOZJA'),make('2','ZAMENJAVA ZAVORNE TEKOČINE')];const [row]=assistedEstimateRows(requestedEstimateRows('PREGELD ZAVOR',null,options),options);assert.equal(row.key,'');assert.deepEqual(row.candidateKeys,[]);
});

test('explicit service list escaped line breaks and explicit QA heading do not swallow three requested services',()=>{const rows=requestedEstimateRows('TESTNO POVPRAŠEVANJE – AVTOSERVIS SELAN\\n\\nServis vozila\\nPregled pred tehničnim pregledom\\nPregled zavor',null,[]);assert.deepEqual(rows.map(r=>r.requestedService),['Servis vozila','Pregled pred tehničnim pregledom','Pregled zavor']);});

test('customer prose is not billed and explicit wanted services do not acquire description rows',()=>{
 assert.deepEqual(requestedEstimateRows(null,'Avto ropota in zavore cvilijo',[]),[]);
 const rows=requestedEstimateRows('Menjava olja','Pregled zavor\nAvto ropota',[]);
 assert.deepEqual(rows.map(row=>row.requestedService),['Menjava olja']);
});

test('category and saved service description yield unpriced editable suggestions, not automatic billing',()=>{
 const rows=suggestedEstimateRows('Avtomehanika','Servis vozila\\nPregled pred tehničnim pregledom\\nPregeld zavor',[option]);assert.deepEqual(rows.map(r=>r.requestedService),['Servis vozila','Pregled pred tehničnim pregledom','Pregeld zavor']);assert.ok(rows.every(r=>r.key===''&&r.unitPrice===undefined));assert.equal(draftTotal(rows,[option]),null);
});
test('prose and negated services never invent billable work; explicit service selection remains authoritative',()=>{
 assert.deepEqual(suggestedEstimateRows('Avtomehanika','Avto ropota in zavore cvilijo. Ne želim menjave olja.',[]),[]);
 assert.deepEqual(suggestedEstimateRows('Avtomehanika','Pregled zavor ni potreben',[]),[]);
 const rows=suggestedEstimateRows('Menjava olja','Pregled zavor',[]);assert.deepEqual(rows.map(r=>r.requestedService),['Menjava olja']);
});

// Conditional inspection uses the existing article price and percentage discount.
import {conditionalInspectionRows} from './estimate-editor.ts';
import {estimateCatalogRows} from './estimate-catalog-source.ts';
const inspectionOption={...option,key:'article:211414',articleId:'211414',code:'ASBPVPTH',name:'BREZPLAČNI PREGLED VOZILA PRED TEHNIČNIM PREGLEDOM',priceListId:'',grossPrice:58.9992,priceListNetPrice:'48.36',priceListDiscount:0,discount:0,priceListDiffers:false,vatId:'5'};
const inspectionRows=[{key:option.key,quantity:'1',discount:''},{key:'',quantity:'1',discount:'',requestedService:'Pregled pred tehničnim pregledom',description:'Pregled pred tehničnim pregledom',candidateKeys:[inspectionOption.key],unitId:'1',vatId:'5'},{key:'',quantity:'',discount:'',description:'Pregled zavor'}];
test('inspection pending never bills automatically; ordered repair uses 100 percent and preserves all three services',()=>{
 const options=[option,inspectionOption],pending=conditionalInspectionRows(inspectionRows,options,'pending');assert.equal(pending[1].key,'');assert.equal(draftTotal(pending,options),null);
 const ordered=conditionalInspectionRows(pending,options,'ordered');assert.equal(ordered[1].key,inspectionOption.key);assert.equal(ordered[1].discount,'100');assert.equal(ordered[1].unitPrice,undefined);assert.equal(draftTotal([ordered[1]],options),0);assert.deepEqual(ordered[0],inspectionRows[0]);assert.deepEqual(ordered[2],inspectionRows[2]);assert.equal(inspectionOption.grossPrice,58.9992);
});
test('inspection decision transitions survive JSON persistence without changing quantity, description or source VAT',()=>{
 const options=[inspectionOption],ordered=conditionalInspectionRows([inspectionRows[1]],options,'ordered');ordered[0].quantity='2';ordered[0].description='Ohranjen opis';
 const paid=conditionalInspectionRows(JSON.parse(JSON.stringify(ordered)),options,'not_ordered');assert.equal(paid[0].discount,'0');assert.equal(draftTotal(paid,options),118);assert.equal(paid[0].quantity,'2');assert.equal(paid[0].description,'Ohranjen opis');assert.equal(paid[0].vatId,'5');
 const reopened=conditionalInspectionRows(JSON.parse(JSON.stringify(paid)),options,'ordered');assert.equal(draftTotal(reopened,options),0);
 const pending=conditionalInspectionRows(reopened,options,null);assert.equal(pending[0].key,'');assert.equal(pending[0].discount,'');assert.equal(draftTotal(pending,options),null);
});
test('manual inspection price, discount, unrelated articles and removed rows remain owned by the user',()=>{
 const options=[inspectionOption];const manual={...inspectionRows[1],key:inspectionOption.key,unitPrice:'45',quantity:'3',discount:'10'};assert.deepEqual(conditionalInspectionRows([manual],options,'ordered'),[manual]);
 const auto=conditionalInspectionRows([inspectionRows[1]],options,'ordered')[0];const edited={...auto,discount:'15'};assert.equal(conditionalInspectionRows([edited],options,'not_ordered')[0].discount,'15');assert.equal(conditionalInspectionRows([],options,'ordered').length,0);
 const other={...inspectionRows[1],candidateKeys:['article:999']};assert.deepEqual(conditionalInspectionRows([other],options,'ordered'),[other]);
});
test('fresh Quibi preparation preserves source net price and VAT while discount produces zero or verified 59 EUR',async()=>{
 const article={id:'211414',code:'ASBPVPTH',name:inspectionOption.name,netPrice:'48.36',unitId:'1',unitLabel:'kos',vatId:'5',vatLabel:'22 %',stockManaged:false};
 const read={priceLists:async()=>[],article:async()=>article};const catalogs={units:[{id:'1',label:'kos'}],vatRates:[{id:'5',label:'22 %'}]};
 for(const decision of ['ordered','not_ordered'] as const){const rows=conditionalInspectionRows([inspectionRows[1]],[inspectionOption],decision);const form=new FormData();form.set('catalogLines',JSON.stringify(rows));const result=await estimateCatalogRows(form,read,catalogs,{priceListId:null});assert.ok(result);assert.equal(result.unitNetPrices[0],48.36);assert.equal(result.unitIds[0],'1');assert.equal(result.reviewedLines[0].vat,'22 %');assert.equal(result.reviewedLines[0].discount,decision==='ordered'?100:0);assert.equal(draftTotal(rows,[inspectionOption]),decision==='ordered'?0:59);}
});

import {completeServiceReferences} from './estimate-editor.ts';
test('missing brake service references reuse unanimous verified service rows without changing the manually saved price or quantity',()=>{const rows=[{key:inspectionOption.key,quantity:'1',discount:''},{key:'',description:'Pregled zavor',requestedService:'Pregeld zavor',quantity:'1',discount:'',unitPrice:'12'}];const result=completeServiceReferences(rows,[inspectionOption]);assert.equal(result[1].unitId,'1');assert.equal(result[1].vatId,'5');assert.equal(result[1].unitPrice,'12');assert.equal(result[1].quantity,'1');assert.equal(draftTotal([result[1]],[inspectionOption]),12);assert.deepEqual(completeServiceReferences(JSON.parse(JSON.stringify(result)),[inspectionOption]),result);});
test('mixed VAT never supplies a guessed service VAT; manual references and goods stay unchanged',()=>{const vat9={...inspectionOption,key:'article:99',articleId:'99',vatId:'9',vatLabel:'9.5 %'};const rows=[{key:inspectionOption.key,quantity:'1',discount:''},{key:vat9.key,quantity:'1',discount:''},{key:'',description:'Pregled zavor',quantity:'1',discount:'',unitPrice:'12'},{key:'',description:'Oljni filter',quantity:'1',discount:'',unitPrice:'12'},{key:'',description:'Pregled zavor',unitId:'manual-unit',vatId:'manual-vat',quantity:'2',discount:'10',unitPrice:'13'}];const result=completeServiceReferences(rows,[inspectionOption,vat9]);assert.equal(result[2].unitId,'1');assert.equal(result[2].vatId,undefined);assert.equal(result[3].unitId,undefined);assert.deepEqual(result[4],rows[4]);assert.equal(completeServiceReferences([rows[2]],[])[0].unitId,undefined);});
