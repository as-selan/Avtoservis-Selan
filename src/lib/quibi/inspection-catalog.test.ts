import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionCatalogSuggestions} from './inspection-catalog.ts';
const options=[{key:'189:1',name:'Pregled zavor',code:'ZAV'},{key:'189:2',name:'Menjava olja',code:'OLJ'}];
test('inspection lines reuse only exact current Quibi names or codes, without prices or invented quantities',()=>{const r=inspectionCatalogSuggestions(' - Pregled zavor\nOLJ\nPregled zavor',options);assert.deepEqual(r.matches.map(o=>o.key),['189:1','189:2']);assert.deepEqual(r.unmatched,[]);assert.deepEqual(r.ambiguous,[]);});
test('similar services and prose are never treated as exact matches',()=>{const r=inspectionCatalogSuggestions('Pregled zavornih ploščic\nPriporočamo menjavo olja',options);assert.equal(r.matches.length,0);assert.equal(r.unmatched.length,2);});
test('multiple price lists or conflicting codes require a human choice',()=>{const r=inspectionCatalogSuggestions('ZAV',[...options,{key:'190:1',name:'Pregled zavor',code:'ZAV'}]);assert.equal(r.matches.length,0);assert.deepEqual(r.ambiguous,['ZAV']);});
test('empty findings and duplicate catalog rows do not duplicate draft lines',()=>{assert.equal(inspectionCatalogSuggestions(null,options).matches.length,0);assert.equal(inspectionCatalogSuggestions('ZAV',[options[0],options[0]]).matches.length,1);});
