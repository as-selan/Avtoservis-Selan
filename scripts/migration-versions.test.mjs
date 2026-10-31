import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const mapping=JSON.parse(readFileSync('supabase/migration-version-map.json','utf8'));
// Independent fingerprints read from DEV schema_migrations, 2026-10-24. No DB writes.
const installed={
 '20261024094647':'1453287798007f9537e21d325f8005859d38ac5cd019322f48038a173477c2f9',
 '20261024100001':'0a60879e93eba3bd9b756442a9c95cb2253c1be5ce3f2ca88fbab831499666d0',
 '20261024100417':'ca38539d6ff5fe9d1693c4742fd34d957de402b2e6e5c78ba5d42a1200aad960',
};
for(const [version,sha] of Object.entries(installed))test(`canonical migration ${version} preserves SQL bytes and installed DEV content`,()=>{
 const row=mapping.migrations.find(m=>m.canonicalVersion===version);assert.ok(row);
 const file=`supabase/migrations/${version}_${row.name}.sql`,raw=readFileSync(file);
 assert.equal(createHash('sha256').update(raw.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'),row.fileSha256);
 const normalized=raw.toString('utf8').replace(/^\uFEFF/,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\r\n]*/g,'').replace(/\s/g,'').replace(/^;+|;+$/g,'').toLowerCase();
 assert.equal(createHash('sha256').update(normalized).digest('hex'),sha);assert.equal(row.normalizedSha256,sha);
 assert.equal(existsSync(`supabase/migrations/${row.formerVersion}_${row.name}.sql`),false,'equivalent SQL must not have two executable versions');
});

test('isolated full-chain manifest includes every active migration exactly once',()=>{
 const shell=readFileSync('.github/ci/prepare-ci-workdir.sh','utf8');
 const staged=[...shell.matchAll(/"(\d{14}_[^"\n]+\.sql)"/g)].map(m=>m[1]).sort();
 const active=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
 assert.deepEqual(staged,active);assert.equal(new Set(staged).size,staged.length);
});
