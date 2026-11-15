import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRefreshScheduler, REALTIME_TABLES } from './realtime-refresh.ts';
function fixture() {
 let allowed = true, refreshes = 0, callback: (() => void) | undefined;
 const scheduler = createRefreshScheduler({refresh:()=>refreshes++,canRefresh:()=>allowed,
  schedule:fn=>{callback=fn;return 1;},cancel:()=>{callback=undefined;}});
 return {scheduler,count:()=>refreshes,block:()=>{allowed=false;},allow:()=>{allowed=true;},tick:()=>{const fn=callback;callback=undefined;fn?.();}};
}
test('one refresh for a burst of notes, photos and status events',()=>{
 const f=fixture();f.scheduler.changed();f.scheduler.changed();f.scheduler.changed();
 assert.equal(f.count(),0);f.tick();assert.equal(f.count(),1);f.tick();assert.equal(f.count(),1);
});
test('typing or hidden tab defers but never loses invalidation',()=>{
 const f=fixture();f.block();f.scheduler.changed();f.tick();assert.equal(f.count(),0);
 f.allow();f.scheduler.resume();f.tick();assert.equal(f.count(),1);
});
test('cleanup cancels a queued refresh and ignores late events',()=>{
 const f=fixture();f.scheduler.changed();f.scheduler.dispose();f.tick();f.scheduler.changed();f.tick();assert.equal(f.count(),0);
});
test('reconnection invalidation uses the same scheduler; no refresh without a change',()=>{
 const f=fixture();f.scheduler.resume();f.tick();assert.equal(f.count(),0);
 f.scheduler.changed();f.tick();f.scheduler.changed();f.tick();assert.equal(f.count(),2);
});
test('subscription only includes the existing operational tables',()=>{
 assert.deepEqual([...REALTIME_TABLES],['service_requests','service_case_assignments','service_case_notes','service_case_photos','service_case_reviews']);
});
