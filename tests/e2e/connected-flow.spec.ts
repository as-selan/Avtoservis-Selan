import {readFileSync} from 'node:fs';
import {expect,test,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

if(process.env.CI!=='true'||process.env.SELAN_ISOLATED_E2E!=='1'||process.env.QUIBI_E2E_WRITE_ENABLED!=='1'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.E2E_API_URL??''))throw Error('Connected test requires isolated loopback fixtures');
const seed=JSON.parse(readFileSync(process.env.E2E_FIXTURES_PATH!,'utf8')) as {owner:string;mechanic:string};
const db=createClient(process.env.E2E_API_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
async function login(page:Page,email:string){await page.goto('/login');await page.getByLabel('E-pošta').fill(email);await page.getByLabel('Geslo').fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Prijava'}).click();await expect(page).not.toHaveURL(/\/login/)}
async function rowCount(caseId:string,kind:string){const result=await db.from('quibi_dev_operation_journal').select('id',{count:'exact',head:true}).eq('service_request_id',caseId).eq('kind',kind).eq('state','verified');if(result.error)throw Error('Fixture journal READ failed');return result.count}
async function caseId(){const c=await db.from('customers').select('id').eq('email','test-selan-ai@example.test').maybeSingle();if(!c.data)return null;const r=await db.from('service_requests').select('id').eq('customer_id',c.data.id).maybeSingle();return r.data?.id??null}
async function caseDiagnostic(id:string){
 const req=await db.from('service_requests').select('customer_id,vehicle_id,status,attention_reason,source').eq('id',id).single();
 const prep=await db.from('offer_preparations').select('status,auto_state').eq('service_request_id',id).maybeSingle();
 const events=await db.from('quibi_dev_operation_journal').select('kind,state,quibi_id').eq('service_request_id',id);
 if(!req.data)return {request:'missing'};
 const [customer,vehicle]=await Promise.all([db.from('integration_links').select('sync_status,quibi_environment').eq('entity_id',req.data.customer_id).eq('provider','quibi').maybeSingle(),db.from('quibi_vehicle_links').select('sync_status,quibi_environment').eq('vehicle_id',req.data.vehicle_id).maybeSingle()]);
 return {status:req.data.status,source:req.data.source,attention:req.data.attention_reason,preparation:prep.data,customer:customer.data,vehicle:vehicle.data,operations:events.data};
}
async function caseReady(id:string){const [c,v]=await Promise.all([db.from('service_requests').select('customer_id,vehicle_id').eq('id',id).single(),db.from('offer_preparations').select('auto_state').eq('service_request_id',id).maybeSingle()]);if(!c.data)return false;const [l,w]=await Promise.all([db.from('integration_links').select('sync_status').eq('entity_id',c.data.customer_id).eq('provider','quibi').maybeSingle(),db.from('quibi_vehicle_links').select('sync_status').eq('vehicle_id',c.data.vehicle_id).maybeSingle()]);return l.data?.sync_status==='ok'&&w.data?.sync_status==='ok'&&!!v.data?.auto_state}

test('one public inquiry reaches a single invoice and a persisted vehicle pickup',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(12000);
 await page.goto('/povprasevanje');await page.getByLabel('Ime in priimek / naziv').fill('TEST-SELAN-AI');await page.getByLabel('E-pošta').fill('test-selan-ai@example.test');await page.getByLabel('Telefon').fill('+38640111000');await page.getByLabel('Registrska številka').fill('TEST-AI81');await page.getByLabel(/^VIN \/ številka šasije/).fill('TESTSELANAV202601');await page.getByLabel(/^Znamka/).fill('TEST');await page.getByLabel(/^Model/).fill('QA AI');await page.getByLabel('Opis težave').fill('QA-SIM- povezan preizkus\nServis vozila');await page.getByRole('button',{name:'Pošlji povpraševanje'}).click();await expect(page.getByText('Hvala. Vaše povpraševanje smo prejeli.')).toBeVisible();
 await expect.poll(caseId,{timeout:30000}).not.toBeNull();const id=(await caseId())!;try{await expect.poll(()=>caseReady(id),{timeout:60000}).toBe(true)}catch(error){console.log('ISOLATED_CASE_DIAGNOSTIC',JSON.stringify(await caseDiagnostic(id)));throw error;}
 await login(page,seed.owner);
 const fixture=process.env.SELAN_E2E_FIXTURE_ORIGIN??'http://127.0.0.1:47862';
 expect((await fetch(fixture+'/__control?mode=error',{method:'POST'})).ok).toBe(true);
 await page.goto('/dashboard/primeri/'+id);
 await expect(page.getByRole('region',{name:'Povzetek povpraševanja'})).toContainText('Servis vozila');
 const quantity=page.getByLabel('Količina postavke 1');
 await expect(quantity).toBeEditable();await quantity.fill('2');await quantity.blur();
 await expect.poll(async()=>{const r=await db.from('offer_preparations').select('auto_draft').eq('service_request_id',id).single();return r.data?.auto_draft?.rows?.[0]?.quantity},{timeout:15000}).toBe('2');
 await page.reload();await expect(page.getByLabel('Količina postavke 1')).toHaveValue('2');
 expect((await fetch(fixture+'/__control?mode=slow',{method:'POST'})).ok).toBe(true);
 await page.goto('/dashboard/primeri/'+id,{waitUntil:'commit'});
 await expect(page.getByRole('region',{name:'Povzetek povpraševanja'})).toContainText('Servis vozila',{timeout:2200});
 await expect(page.getByText('Pripravljamo naslednje opravilo …')).toBeVisible();
 const earlyQuantity=page.getByLabel('Količina postavke 1');await expect(earlyQuantity).toBeEditable({timeout:2200});await earlyQuantity.fill('3');await earlyQuantity.blur();
 expect((await fetch(fixture+'/__control?mode=normal',{method:'POST'})).ok).toBe(true);
 await expect(page.getByRole('button',{name:'Preglej predračun',exact:true})).toBeVisible({timeout:45000});
 await expect(page.getByLabel('Količina postavke 1')).toHaveValue('3');
 await expect.poll(async()=>{const r=await db.from('offer_preparations').select('auto_draft').eq('service_request_id',id).single();return r.data?.auto_draft?.rows?.[0]?.quantity},{timeout:15000}).toBe('3');
 await page.reload();await expect(page.getByLabel('Količina postavke 1')).toHaveValue('3');

 await page.getByRole('button',{name:'Preglej predračun',exact:true}).click();await page.getByRole('button',{name:'Ustvari predračun',exact:true}).click();await expect.poll(()=>rowCount(id,'estimate'),{timeout:30000}).toBe(1);
 await page.reload();await page.getByRole('button',{name:'Stranka je odobrila',exact:true}).click();await page.getByRole('button',{name:'Ustvari delovni nalog',exact:true}).click();await expect.poll(()=>rowCount(id,'work_order'),{timeout:30000}).toBe(1);
 await page.reload();await page.getByLabel(/Mehanik/).selectOption({label:'Mehanik QA'});await page.getByRole('button',{name:'Dodeli mehaniku',exact:true}).click();await page.context().clearCookies();await login(page,seed.mechanic);await page.goto('/dashboard/mehanik/'+id);await page.getByRole('button',{name:'Začni delo',exact:true}).click();await page.getByRole('button',{name:'Zaključi delo',exact:true}).click();await page.context().clearCookies();await login(page,seed.owner);await page.goto('/dashboard/primeri/'+id);await page.getByRole('button',{name:'Potrdi opravljeno delo',exact:true}).click();
 await page.getByRole('button',{name:'Izdaj račun',exact:true}).click();await expect.poll(()=>rowCount(id,'invoice'),{timeout:30000}).toBe(1);await page.reload();await page.getByRole('link',{name:'Prevzem vozila'}).click();await page.getByRole('button',{name:'Vozilo prevzeto',exact:true}).click();await page.reload();await expect(page.getByText('Vozilo prevzeto').first()).toBeVisible();for(const kind of ['estimate','work_order','invoice'])expect(await rowCount(id,kind)).toBe(1);
});

