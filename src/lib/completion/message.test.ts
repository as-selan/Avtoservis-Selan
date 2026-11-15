import test from 'node:test';
import assert from 'node:assert/strict';
import {completionMessage} from './message.ts';

test('manual draft asks for either contact, web asks for both', () => {
  assert.match(completionMessage(['phone','email','vin'],'manual'), /telefonska številka ali e-poštni naslov/);
  assert.match(completionMessage(['phone','email'],'web'), /telefonska številka, e-poštni naslov/);
});
test('draft preserves safe URL and the same case without machine field names', () => {
  const draft=completionMessage(['make','make','registration','unknown'],'web','https://selan.test/dopolnitev/token');
  assert.equal(draft.split('znamka vozila').length,2);
  assert.match(draft,/registrska oznaka/);assert.doesNotMatch(draft,/unknown/);
  assert.match(draft,/https:\/\/selan.test\/dopolnitev\/token/);assert.match(draft,/isto povpraševanje/);
});
