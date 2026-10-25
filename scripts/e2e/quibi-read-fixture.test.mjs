import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

test('isolated Quibi fixture serves the documented customer vehicle READ endpoint',async()=>{
 const port=47983;
 const child=spawn(process.execPath,['scripts/e2e/quibi-fixture.mjs'],{env:{...process.env,CI:'true',SELAN_ISOLATED_E2E:'1',SELAN_E2E_FIXTURE_PORT:String(port),QUIBI_E2E_WRITE_ENABLED:'0'},stdio:'ignore'});
 try{
  let response;
  for(let attempt=0;attempt<50;attempt++){
   try{response=await fetch(`http://127.0.0.1:${port}/api2/vozila/index/2001`);break;}catch{await delay(100);}
  }
  assert.ok(response,'fixture must start');assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.error,false);
  assert.match(JSON.stringify(body),/5001/);
  assert.match(JSON.stringify(body),/TST00000000000006/);
 }finally{child.kill();}
});
