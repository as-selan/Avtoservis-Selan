import test from 'node:test';
import assert from 'node:assert/strict';
import {canConfirmQuibiVehicleCreate as allowed} from './vehicle-create-permission.ts';
const dev={APP_ENV:'preproduction',QUIBI_MODE:'dev',VERCEL_ENV:'preview'};
test('administrator may explicitly confirm only hosted Quibi DEV vehicles',()=>{
 assert.equal(allowed('admin',dev),true);
 for(const patch of [{APP_ENV:'production'},{QUIBI_MODE:'production'},{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{SELAN_REMOTE_DEMO:'1'},{NEXT_PUBLIC_SELAN_REMOTE_DEMO:'1'},{SELAN_LOCAL_REVIEW:'1'},{QUIBI_E2E_WRITE_ENABLED:'1'},{QUIBI_DEV_LOCAL_WRITE_ENABLED:'1'},{QUIBI_DEV_LOCAL_SEND_ENABLED:'1'}])assert.equal(allowed('admin',{...dev,...patch}),false);
 assert.equal(allowed('admin',{}),false);
 const prod={APP_ENV:'production',QUIBI_MODE:'production',VERCEL_ENV:'production',SELAN_DEV_SUPABASE_PROJECT_REF:'dev',SELAN_PRODUCTION_SUPABASE_PROJECT_REF:'prod',NEXT_PUBLIC_SUPABASE_URL:'https://prod.supabase.co'};
 assert.equal(allowed('admin',prod),false);assert.equal(allowed('owner',prod),true);
 for(const role of ['reception','mechanic','customer','', 'OWNER'])assert.equal(allowed(role,dev),false);
 assert.equal(allowed('owner',dev),true);
});
