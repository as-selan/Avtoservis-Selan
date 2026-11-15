import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
// Discover every offline test; never silently narrow the suite to an old directory list.
function discover(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=join(directory,entry.name);return entry.isDirectory()?discover(path):/\.test\.(ts|mjs)$/.test(entry.name)?[path]:[]})}
const files=[...discover('src'),...discover('scripts'),'next.config.test.ts'].sort();
console.log(`Running ${files.length} offline test files (no hosted credentials required).`);
const result=spawnSync(process.execPath,['--experimental-strip-types','--conditions=react-server','--import','./scripts/contact-test-register.mjs','--test','--test-concurrency=2',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
