import assert from 'node:assert/strict';
import {test} from 'node:test';
import {caseSectionOrder, journeyActionDescription,canStartPreliminaryInspection} from './workspace.ts';
test('the actionable form comes first and every other form remains present exactly once',()=>{
 const ids=['podatki','quibi-povezava','predracun','pregled-predracuna','odobritev','poslovni-nalog','popravilo'];
 for(const id of ids){const order=caseSectionOrder('#'+id,ids);assert.equal(order[0],id);assert.deepEqual([...order].sort(),[...ids].sort());assert.equal(new Set(order).size,ids.length);}
});
test('external order links keep the repair context and unknown links retain the intake',()=>{
 const ids=['podatki','predracun','popravilo'];
 assert.equal(caseSectionOrder('/dashboard/nalogi/test',ids)[0],'popravilo');
 assert.equal(caseSectionOrder('#not-present',ids)[0],'podatki');
});
test('button outcomes explain preparation versus actual sending and creation',()=>{
 assert.match(journeyActionDescription('#podatki'),/še ne ustvari/);
 assert.match(journeyActionDescription('#pregled-predracuna'),/ločeni/);
 assert.match(journeyActionDescription('#odobritev'),/dejanski odgovor/);
 assert.match(journeyActionDescription('#poslovni-nalog'),/posebej/);
});

test('optional inspection is reachable before quoting but never adds an invoice-stage task',()=>{
 const initial={status:'preparing_offer',hasQuote:false,hasFixedPrice:false,hasWorkOrder:false};
 assert.equal(canStartPreliminaryInspection(initial),true);
 for(const change of [{hasQuote:true},{hasFixedPrice:true},{hasWorkOrder:true},{status:'converted'}])assert.equal(canStartPreliminaryInspection({...initial,...change}),false);
});
