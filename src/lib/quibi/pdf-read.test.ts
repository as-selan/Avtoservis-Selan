import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readQuibiPdf} from './pdf-read.ts';
test('PDF export uses only document rendering and validates binary format',async()=>{
 const fetcher:typeof fetch=async(_url,options)=>{assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');assert.deepEqual(JSON.parse(String(options?.body)),{Glavadokumenta:{id:42,natisni:3,jezik:'sl'}});return new Response('%PDF-fixture',{headers:{'content-type':'application/pdf'}})};
 assert.equal(new TextDecoder().decode(await readQuibiPdf(fetcher,'https://dev.quibi.net/api2/glavadokumenta/pdf',{},'42')),'%PDF-fixture');
 await assert.rejects(readQuibiPdf(async()=>new Response('<html>',{headers:{'content-type':'application/pdf'}}),'https://dev.quibi.net/api2/glavadokumenta/pdf',{},'42'),/INVALID/);
 await assert.rejects(readQuibiPdf(async()=>new Response('{}',{headers:{'content-type':'application/json'}}),'https://dev.quibi.net/api2/glavadokumenta/pdf',{},'42'),/UNAVAILABLE/);
});

test('PDF export rejects oversized provider responses',async()=>{
 const bytes=new Uint8Array(10*1024*1024+1);bytes.set(new TextEncoder().encode('%PDF-'));
 await assert.rejects(readQuibiPdf(async()=>new Response(bytes,{headers:{'content-type':'application/pdf'}}),'https://dev.quibi.net/api2/glavadokumenta/pdf',{},'42'),/TOO_LARGE/);
});
