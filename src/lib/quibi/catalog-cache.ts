import 'server-only';
import {unstable_cache} from 'next/cache';
import {createHash} from 'node:crypto';
import {createQuibiReadClient} from './client';
// Cache only the small service/price-list index, never 54k stock items in the browser.
// Credentials are not cache arguments; an opaque digest isolates account/origin scopes.
const pending=new Map<string,ReturnType<ReturnType<typeof createQuibiReadClient>['catalogSnapshot']>>();
export function cachedCatalogSnapshot(config:{username:string;password:string;origin?:string}){
 const scope=createHash('sha256').update(JSON.stringify([config.origin??'https://dev.quibi.net',config.username,config.password])).digest('hex');
 const active=pending.get(scope);if(active)return active;
 const read=unstable_cache(()=>createQuibiReadClient(config).catalogSnapshot(),['quibi-service-catalog-v1',scope],{revalidate:900});
 const promise=read().finally(()=>{if(pending.get(scope)===promise)pending.delete(scope)});pending.set(scope,promise);return promise;
}
