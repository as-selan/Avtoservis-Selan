import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const origin='http://127.0.0.1:47865';
// Requires isolated fixture copy: NEVER run against a real Selan deployment.
const browser=await chromium.launch({headless:true,channel:"chrome"});
try{
 const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+'/qa-unified',{timeout:120000,waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Izolirani UI fixture — ni dejanskega pošiljanja'}).waitFor();
 await page.request.delete(origin+'/qa-unified/state');await page.reload();
 console.log((await page.locator('main').innerText()).slice(0,600));
 await page.getByRole('checkbox').check();
 // Two synchronous submit events test the actual component's immediate ref lock.
 await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit()});
 await page.getByText('Quibi status: queued.',{exact:false}).waitFor({timeout:30000});
 await page.getByText('Quibi status: sent.',{exact:false}).waitFor({timeout:30000});
 let state=await(await page.request.get(origin+'/qa-unified/state')).json();assert.equal(state.sends,1);assert.ok(state.polls>=2);
 assert.equal(await page.getByRole('button',{name:'Odobri in pošlji stranki',exact:true}).count(),0);
 await page.getByRole('button',{name:'Preveri status',exact:true}).click();
 state=await(await page.request.get(origin+'/qa-unified/state')).json();assert.equal(state.sends,1);
 assert.match(await page.locator('main').innerText(),/prejem ni dokazan/i);
 await page.request.delete(origin+'/qa-unified/state');await page.goto(origin+'/qa-unified?approved=1',{timeout:120000,waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Pošlji stranki',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Odobri in pošlji stranki',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.getByRole('button',{name:'Pošlji stranki',exact:true}).isVisible());
 console.log('PASS: actual unified component, approve/send labels, double submit, automatic queued->sent, status without resend, mobile');
}finally{await browser.close()}
