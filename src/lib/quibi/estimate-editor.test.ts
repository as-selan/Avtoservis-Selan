import assert from 'node:assert/strict';import {test} from 'node:test';
import {draftRowPrice,draftTotal,initialEstimateRows,canonicalEstimateOptions,requestedEstimateRows,assistedEstimateRows} from './estimate-editor.ts';
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
