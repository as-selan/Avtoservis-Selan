import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type Seed = { owner: string; reception: string; mechanic: string; foreign: string;
  invitedEmail: string; inviteActionLink: string;
  customer: string; linkedCustomer: string; vehicle: string; caseId: string;
  preparedCaseId: string;
  mechanicCases:{desktop:string;mobile:string};
  incompleteCases: { desktop: string; mobile: string };
  editable: {desktop:{customer:string;name:string};mobile:{customer:string;name:string}} };
const path = process.env.E2E_FIXTURES_PATH;
if (process.env.CI !== "true" || process.env.SELAN_ISOLATED_E2E !== "1" || !path || !process.env.E2E_PASSWORD) {
  throw new Error("Playwright E2E requires disposable CI fixtures");
}
const seed = JSON.parse(readFileSync(path, "utf8")) as Seed;
const fixtureOrigin = process.env.SELAN_E2E_FIXTURE_ORIGIN ?? "http://127.0.0.1:47862";
const appOrigin = process.env.SELAN_E2E_APP_ORIGIN ?? "http://127.0.0.1:3000";
for (const origin of [fixtureOrigin, appOrigin]) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("E2E origin must be loopback");
}


async function caseStatus(id:string){
 const url=process.env.E2E_API_URL??'',key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!key)throw Error("Isolated DB READ required");
 const db=createSupabaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await db.from('service_requests').select('status').eq('id',id).single();
 if(result.error)throw Error('Synthetic case READ failed');return result.data.status;
}
async function openCaseSection(page:Page,id:string){
 const target=page.locator('#'+id);
 const secondary=page.locator(`details[data-case-secondary="${id}"]`);
 if(await secondary.count()){
  const outer=page.locator('details').filter({has:secondary}).first();
  if(await outer.getAttribute('open')===null)await outer.locator(':scope > summary').click();
  if(await secondary.getAttribute('open')===null)await secondary.locator(':scope > summary').click();
 }
 await expect(target).toBeVisible();
}

async function login(page: Page, email: string, password = process.env.E2E_PASSWORD!) {
  await page.goto("/login");
  await page.getByLabel("E-pošta").fill(email);
  await page.getByLabel("Geslo").fill(password);
  await page.getByRole("button", { name: "Prijava" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}
async function fixtureMode(mode: "normal" | "changed" | "error") {
  const response = await fetch(`${fixtureOrigin}/__control?mode=${mode}`, { method: "POST" });
  expect(response.ok).toBeTruthy();
}
async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

function futureLjubljanaDate(days: number) {
  const target = new Date(Date.now() + days * 86_400_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(target).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T10:00`;
}

async function recordThreeManualSlots(page: Page, label: string) {
  for (const [index, days] of [7, 8, 9].entries()) {
    await page.getByLabel(`Možnost ${index + 1} · Europe/Ljubljana`).fill(futureLjubljanaDate(days));
  }
  await page.getByRole("textbox", { name: "Kje in kdaj ste preverili razpoložljivost" }).fill(`${label}-CHECK`);
  await page.getByRole("checkbox", { name: "Tri termine sem dejansko preveril v svojem koledarju." }).check();
  await page.getByRole("button", { name: "Shrani tri možnosti" }).click();
  await expect(page.getByText("Tri možnosti so pripravljene, niso še poslane ali rezervirane.")).toBeVisible();
  await page.getByRole("textbox", { name: "Referenca dejansko poslanih možnosti" }).fill(`${label}-SENT`);
  await page.getByRole("checkbox", { name: "Te tri možnosti sem dejansko poslal stranki." }).check();
  await page.getByRole("button", { name: "Evidentiraj dejansko pošiljanje" }).click();
  await expect(page.getByText("Tri možnosti so bile ročno poslane; nobena ni začasno rezervirana.")).toBeVisible();
  await page.getByRole("combobox", { name: "Izbrana možnost" }).selectOption("2");
  await page.getByRole("textbox", { name: "Referenca strankine izbire" }).fill(`${label}-REPLY`);
  await page.getByRole("checkbox", { name: "Prejel sem dejansko izbiro stranke." }).check();
  await page.getByRole("button", { name: "Evidentiraj strankino izbiro" }).click();
  await expect(page.getByText("Stranka je izbrala termin; ročna rezervacija še ni potrjena.")).toBeVisible();
  await page.getByRole("textbox", { name: "Referenca dejanske ročne rezervacije" }).fill(`${label}-BOOKING`);
  await page.getByRole("checkbox", { name: "Izbrani termin sem dejansko rezerviral v svojem koledarju." }).check();
  await page.getByRole("button", { name: "Potrdi ročno rezerviran termin" }).click();
  const savedBooking=page.getByText(`Referenca ročne rezervacije: ${label}-BOOKING`);
  await expect(savedBooking).toBeAttached();
  await openCaseSection(page, "termini");
  await expect(savedBooking).toBeVisible();
}

test.beforeEach(async () => { await fixtureMode("normal"); });

test("public intake loads and protected dashboard requires login", async ({ page }) => {
  await page.goto("/povprasevanje");
  await expect(page.getByRole("heading", { name: /povpraševanje/i })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("default Supabase invite link establishes a cookie session and allows password setup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Single-use isolated invite token.");
  await page.goto(seed.inviteActionLink);
  await expect(page).toHaveURL(/\/nastavi-geslo$/);
  await expect(page.getByRole("heading", { name: "Avtoservis Selan" })).toBeVisible();
  await page.getByLabel("Novo geslo").fill(process.env.E2E_PASSWORD!);
  await page.getByLabel("Ponovi geslo").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Shrani geslo" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
});

test("recovery email returning to /login exchanges its session and permits password setup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Single-use isolated recovery token.");
  const apiUrl = process.env.E2E_API_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey || !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl)) {
    throw new Error("Recovery test requires isolated loopback Auth admin");
  }
  const admin = createSupabaseClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // generateLink does not send an email; this uses only the synthetic invited user.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery", email: seed.invitedEmail, options: { redirectTo: `${appOrigin}/login` },
  });
  if (error || !data.properties?.action_link) throw new Error("Isolated recovery link generation failed");
  await page.goto(data.properties.action_link);
  await expect(page).toHaveURL(/\/nastavi-geslo$/);
  const recoveredPassword = `${process.env.E2E_PASSWORD!}-recovered`;
  await page.getByLabel("Novo geslo").fill(recoveredPassword);
  await page.getByLabel("Ponovi geslo").fill(recoveredPassword);
  await page.getByRole("button", { name: "Shrani geslo" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.context().clearCookies();
  await login(page, seed.invitedEmail, recoveredPassword);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
});

test("dedicated recovery callback accepts a Supabase recovery session fragment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Single-use isolated recovery token.");
  const apiUrl = process.env.E2E_API_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey || !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl)) throw new Error("Isolated Auth required");
  const admin = createSupabaseClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery", email: seed.reception, options: { redirectTo: `${appOrigin}/auth/recovery` },
  });
  if (error || !data.properties?.action_link) throw new Error("Isolated recovery link generation failed");
  await page.goto(data.properties.action_link);
  await expect(page).toHaveURL(/\/nastavi-geslo$/);
  await expect(page.getByLabel("Novo geslo")).toBeVisible();
});

test("forgot-password requests recovery for invited and admin accounts without account disclosure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Single isolated Auth email quota.");
  for (const email of [seed.invitedEmail, seed.owner]) {
    await page.goto("/login");
    await page.getByRole("button", { name: "Pozabljeno geslo" }).click();
    await page.getByLabel("E-pošta").fill(email);
    const recoveryResponse = page.waitForResponse((response) =>
      response.url().includes("/auth/v1/recover") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Pošlji navodila" }).click();
    expect((await recoveryResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText(
      "Če račun obstaja, smo poslali navodila za ponastavitev gesla.",
    );
    await page.getByRole("button", { name: "Nazaj na prijavo" }).click();
    await expect(page.getByRole("button", { name: "Prijava" })).toBeVisible();
    if (email === seed.invitedEmail) {
      // Follow the real message in Mailpit from the same browser that initiated PKCE.
      const messageResponse = await fetch("http://127.0.0.1:54324/api/v1/message/latest");
      if (!messageResponse.ok) throw new Error("Isolated recovery email was not captured");
      const message = await messageResponse.json() as { Text?: string; HTML?: string };
      const body = `${message.Text ?? ""} ${message.HTML ?? ""}`.replaceAll("&amp;", "&");
      const verificationUrl = body.match(/https?:\/\/[^\s<>"']+\/auth\/v1\/verify\?[^\s<>"']+/)?.[0];
      if (!verificationUrl || !verificationUrl.startsWith(`${process.env.E2E_API_URL}/auth/v1/verify?`)) {
        throw new Error("Isolated recovery email has no local verification URL");
      }
      let sawImplicitRecovery = false;
      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
        const url = new URL(frame.url());
        const fragment = new URLSearchParams(url.hash.slice(1));
        if (url.origin === appOrigin && url.pathname === "/auth/recovery" &&
            fragment.get("type") === "recovery" && fragment.has("access_token") && fragment.has("refresh_token")) {
          sawImplicitRecovery = true;
        }
      });
      await page.goto(verificationUrl);
      await expect(page).toHaveURL(/\/nastavi-geslo$/);
      expect(sawImplicitRecovery).toBe(true);
      const changedPassword = `${process.env.E2E_PASSWORD!}-implicit`;
      await page.getByLabel("Novo geslo").fill(changedPassword);
      await page.getByLabel("Ponovi geslo").fill(changedPassword);
      await page.getByRole("button", { name: "Shrani geslo" }).click();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
      await page.context().clearCookies();
      await login(page, seed.invitedEmail, changedPassword);
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
      await page.context().clearCookies();
    }
  }
});

test("real owner login opens dashboard and canonical case", async ({ page }) => {
  await login(page, seed.owner);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole('searchbox',{name:'Poišči primer'}).fill('neobstoječ test');
  await page.getByRole('button',{name:'Počisti iskanje'}).click();
  await expect(page.getByRole('searchbox',{name:'Poišči primer'})).toHaveValue('');
  await page.goto(`/dashboard/primeri/${seed.caseId}`);
  await expect(page.getByRole("heading", { name: /Primer #/ })).toBeVisible();
  await page.getByText("Zahtevane storitve in opis", {exact:true}).click();
  await expect(page.getByText("Izolirani E2E primer")).toBeVisible();
  for (const width of [1440, 390, 350]) {
    await page.setViewportSize({ width, height: 900 });
    const journey = page.getByRole('region', { name: 'Naslednje opravilo' });
    const primary = journey.locator('[data-case-primary]');
    await expect(primary).toHaveCount(1);
    await expect(journey).toHaveCount(1);
    expect(await journey.evaluate(element=>getComputedStyle(element).position)).toBe('sticky');
    await primary.click();
    const target = await primary.getAttribute('href');
    expect(target?.startsWith('#')).toBe(true);
    await expect(page.locator(target!)).toBeVisible();
    await noHorizontalOverflow(page);
    await page.locator('#naslednji-korak').scrollIntoViewIfNeeded();
  }
  await noHorizontalOverflow(page);
});

test("mechanic and foreign organization cannot enter operational dashboard", async ({ page }) => {
  for (const email of [seed.mechanic, seed.foreign]) {
    await login(page, email);
    await expect(page).toHaveURL(email === seed.mechanic ? /\/dashboard\/mehanik(?:\?|$)/ : /\/dostop-zavrnjen(?:\?|$)/);
    await page.goto("/dashboard/stranke");
    await expect(page).toHaveURL(/\/dostop-zavrnjen(?:\?|$)/);
    await page.context().clearCookies();
  }
});

test("confirmed Quibi link shows only linked documents and records drift and read errors", async ({ page }) => {
  await login(page, seed.reception);
  await page.goto(`/dashboard/stranke/${seed.linkedCustomer}/quibi`);
  await expect(page.getByText("Potrjena povezava: Quibi #2001")).toBeVisible();
  await expect(page.getByText("Nalog #3001")).toBeVisible();
  await expect(page.getByText("Predračun #4001")).toBeVisible();
  await page.getByRole("link", { name: "Predračun #4001 · preveri vsebino" }).click();
  await expect(page.getByRole("heading", { name: "Quibijev predračun #4001" })).toBeVisible();
  await expect(page.getByText("Preizkusna storitev", { exact: true })).toBeVisible();
  await page.goto(`/dashboard/stranke/${seed.linkedCustomer}/quibi`);
  await noHorizontalOverflow(page);

  await fixtureMode("changed");
  await page.getByRole("button", { name: "Ponovno preveri Quibi" }).click();
  await expect(page.getByText(/Quibijevi podatki so se spremenili/).first()).toBeVisible();

  await fixtureMode("error");
  await page.getByRole("button", { name: "Ponovno preveri Quibi" }).click();
  await expect(page.getByText(/Zadnja sinhronizacija ni uspela/)).toBeVisible();
  await expect(page.getByText("Ni prikazanih nalogov.")).toHaveCount(0);
});

test("manual Quibi confirmation requires an explicit match and prevents duplicate link", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One shared synthetic customer is linked once.");
  await login(page, seed.owner);
  await page.goto(`/dashboard/stranke/${seed.customer}/quibi`);
  await page.getByRole("textbox", { name: /Ime, telefon/ }).fill("Ana Preizkus");
  await page.getByRole("button", { name: "Poišči" }).click();
  await expect(page.getByText("#2002 · Ana Preizkus")).toBeVisible();
  await page.getByRole("checkbox", { name: /Ročno sem preveril/ }).check();
  await page.getByRole("button", { name: "Potrdi povezavo" }).click();
  await expect(page.getByText("Potrjena povezava: Quibi #2002")).toBeVisible();
});

test("vehicle ID needs manual confirmation and later drift is visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One shared synthetic vehicle is linked once.");
  await login(page, seed.owner);
  await page.goto(`/dashboard/stranke/${seed.linkedCustomer}/quibi`);
  await expect(page.getByText(/Quibi #5001/).first()).toBeVisible();
  await expect(page.getByText(/TST00000000000006/).first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Preveril sem, da gre za isto vozilo." }).check();
  await page.getByRole("button", { name: "Poveži vozili" }).click();
  await expect(page.getByText(/Selan LJ QB1 ↔ Quibi #5001/)).toBeVisible();
  await page.getByRole("button", { name: "Ponovno preveri vozilo" }).click();
  await expect(page.getByRole("status")).toContainText("Povezava vozila je znova preverjena");
  await fixtureMode("changed");
  await page.getByRole("button", { name: "Ponovno preveri vozilo" }).click();
  await expect(page.getByText(/Podatki vozila so se spremenili/)).toBeVisible();
  await fixtureMode("normal");
  await page.getByRole("button", {name:"Ponovno preveri vozilo"}).click();
  await expect(page.getByRole("status")).toContainText("Povezava vozila je znova preverjena");
});

test("manual estimate ID is linked only after a live Quibi read", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One verified synthetic estimate is linked once.");
  await login(page, seed.owner);
  await page.goto(`/dashboard/stranke/${seed.linkedCustomer}/quibi`);
  await page.getByRole("button", { name: "Ponovno preveri Quibi" }).click();
  await expect(page.getByRole("status")).toContainText("Quibijeva povezava je znova preverjena");
  await page.goto(`/dashboard/primeri/${seed.preparedCaseId}`);
  await openCaseSection(page, "termini");
  await page.getByRole("button", { name: "Označi potreben predhodni pregled" }).click();
  await expect(page.getByRole("button", { name: "Zavore – V redu", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Opomba (neobvezno)" }).fill("Izoliran pregled vozila je bil opravljen.");
  await expect(page.getByRole("checkbox", { name: /Pregled je bil dejansko opravljen/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Zabeleži opravljen pregled" }).click();
  await openCaseSection(page, "predracun");
  await page.getByText("Napredno – poveži obstoječ predračun", {exact:true}).click();
  await page.getByRole("textbox", { name: "Quibijev ID predračuna" }).fill("4001");
  await page.getByRole("checkbox", { name: /Ročno sem preveril, da gre za predračun/ }).check();
  await page.getByRole("button", { name: "Preveri in poveži predračun" }).click();
  // Successful refresh unmounts the linking form; assert the persisted quote, not its transient toast.
  await expect(page.getByText("Zabeležena različica ponudbe #1: unreviewed", {exact:false})).toBeAttached();
  await openCaseSection(page, "predracun");
  await expect(page.getByText("Zabeležena različica ponudbe #1: unreviewed", {exact:false})).toBeVisible();
  await openCaseSection(page, "pregled-predracuna");
  await page.getByRole("button", { name: "Odobri predračun" }).click();
  await openCaseSection(page, "odobritev");
  await page.getByText("Ločeno evidentiraj dejansko dostavo predračuna (neobvezno)", {exact:true}).click();
  await page.getByRole("textbox", { name: "Referenca dejanske dostave", exact:true }).fill("QA-MESSAGE-4001");
  await page.getByRole("button", { name: "Evidentiraj dejansko dostavo", exact:true }).click();
  await expect.poll(() => caseStatus(seed.preparedCaseId)).toBe("awaiting_customer_approval");
  await openCaseSection(page, "odobritev");
  await page.getByRole("button", { name: "Stranka je odobrila", exact:true }).click();
  await expect.poll(() => caseStatus(seed.preparedCaseId)).toBe("awaiting_slot_selection");
  await openCaseSection(page, "termini");
  await expect(page.getByRole("checkbox", { name: /Potrdil sem dejansko odločitev stranke/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Popravilo naročeno" }).click();
  await expect(page.getByText(/predhodni pregled je brezplačen/)).toBeVisible();
  await recordThreeManualSlots(page, "REPAIR");
  await expect.poll(() => caseStatus(seed.preparedCaseId)).toBe("appointment_confirmed");
});

test("completed preliminary inspection remains payable when repair is not ordered", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "A single isolated inspection outcome is recorded once.");
  await login(page, seed.reception);
  await page.goto(`/dashboard/primeri/${seed.caseId}`);
  await openCaseSection(page, "termini");
  await page.getByRole("button", { name: "Označi potreben predhodni pregled" }).click();
  await recordThreeManualSlots(page, "INSPECTION");
  await expect(page.getByText("Referenca ročne rezervacije: INSPECTION-BOOKING")).toBeVisible();
  await page.getByRole("textbox", { name: "Opomba (neobvezno)" }).fill("Pregled je bil opravljen brez naročila popravila.");
  await expect(page.getByRole("checkbox", { name: /Pregled je bil dejansko opravljen/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Zabeleži opravljen pregled" }).click();
  await expect(page.getByRole("checkbox", { name: /Potrdil sem dejansko odločitev stranke/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Popravilo ni naročeno" }).click();
  await expect(page.getByText(/predhodni pregled je plačljiv/)).toBeVisible();
  await noHorizontalOverflow(page);
});

test("customer search and customer and vehicle edits persist in the same organization", async ({ page }, testInfo) => {
  const editable=seed.editable[testInfo.project.name === "mobile-chromium" ? "mobile" : "desktop"];
  await login(page, seed.reception);
  await page.goto("/dashboard/stranke");
  await page.getByRole("searchbox", { name: /Išči po imenu/ }).fill(editable.name);
  await expect(page.getByRole("link", { name: editable.name })).toBeVisible();
  await page.getByRole("link", { name: editable.name }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/stranke/${editable.customer}$`));

  await page.getByRole("button", { name: "Uredi stranko" }).click();
  await page.getByLabel("Telefon").fill("+38640999888");
  await page.getByRole("button", { name: "Shrani" }).click();
  await expect(page.getByRole("status")).toContainText("Spremembe stranke so shranjene");
  await expect(page.getByText("+38640999888")).toBeVisible();

  await page.getByRole("button", { name: "Uredi vozilo" }).first().click();
  await page.getByLabel("Registracija").fill("LJ QA1");
  await page.getByRole("button", { name: "Shrani" }).click();
  await expect(page.getByRole("status")).toContainText("Spremembe vozila so shranjene");
  await expect(page.getByText("LJ QA1").first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test("public inquiry creates a case that staff can find through the same customer directory", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name === "desktop-chromium" ? "Namizje" : "Mobilno";
  const name = `Spletni Preizkus ${suffix}`;
  await page.goto("/povprasevanje");
  await page.getByLabel("Ime in priimek / naziv").fill(name);
  await page.getByLabel("Telefon").fill(suffix === "Namizje" ? "+38640777111" : "+38640777222");
  await page.getByLabel("E-pošta").fill(`selan-e2e-web-${suffix.toLowerCase()}@example.test`);
  await page.getByLabel(/^VIN \/ številka šasije/).fill(suffix === "Namizje" ? "TST00000000000071" : "TST00000000000072");
  await page.getByLabel(/^Znamka/).fill("Test");
  await page.getByLabel(/^Model/).fill("Web E2E");
  await page.getByLabel("Opis težave").fill("Preizkus spletnega sprejema v izoliranem okolju.");
  await page.getByRole("button", { name: "Pošlji povpraševanje" }).click();
  await expect(page.getByText("Hvala. Vaše povpraševanje smo prejeli.")).toBeVisible();

  await login(page, seed.reception);
  await page.goto("/dashboard/stranke");
  await page.getByRole("searchbox", { name: /Išči po imenu/ }).fill(name);
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("manual phone intake explicitly reuses the selected customer and vehicle", async ({ page }) => {
  await login(page, seed.owner);
  await page.getByRole("button", { name: "+ Novo povpraševanje", exact:true }).click();
  const dialog = page.getByRole("dialog", { name: "Novo povpraševanje" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Ime, telefon, registracija ali VIN" }).fill("Ana Preizkus");
  await expect(dialog.getByText("Podatki so izpolnjeni.",{exact:true})).toBeVisible();
  await expect(dialog.getByLabel("VIN / številka šasije")).not.toHaveValue('');
  await expect(dialog.getByLabel("Znamka", {exact:true})).toHaveValue('Test');
  await expect(dialog.getByLabel("Model", {exact:true})).toHaveValue('Model');
  await expect(dialog.getByText("Podatki so izpolnjeni.",{exact:true})).toBeVisible();
  await dialog.getByRole("textbox", { name: "Storitev / kaj stranka želi" }).fill("Preizkus telefonskega sprejema");
  await dialog.getByRole("button", { name: "Ustvari povpraševanje" }).click();
  await expect(page).toHaveURL(/\/dashboard\/primeri\/[0-9a-f-]{36}$/);
  await expect(dialog).not.toBeVisible();
});

test("manual intake creates a new customer and vehicle for the same case", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  const name = mobile ? "Ročni Preizkus Mobilno" : "Ročni Preizkus Namizje";
  const phone = mobile ? "+38640777555" : "+38640777444";
  const vin = mobile ? "TST00000000000005" : "TST00000000000004";
  await login(page, seed.reception);
  await page.getByRole("button", { name: "+ Novo povpraševanje", exact:true }).click();
  const dialog = page.getByRole("dialog", { name: "Novo povpraševanje" });
  await dialog.getByRole("button", { name: "Telefon", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Ime in priimek *" }).fill(name);
  await dialog.getByRole("textbox", { name: "Telefon", exact: true }).fill(phone);
  await dialog.getByRole("textbox", { name: "VIN / številka šasije" }).fill(vin);
  await dialog.getByRole("textbox", { name: "Znamka" }).fill("Test");
  await dialog.getByRole("textbox", { name: "Model" }).fill("Novo");
  await dialog.getByRole("textbox", { name: "Storitev / kaj stranka želi" }).fill("Pregled vozila v izoliranem testu");
  await dialog.getByRole("button", { name: "Ustvari povpraševanje" }).click();
  await expect(page).toHaveURL(/\/dashboard\/primeri\/[0-9a-f-]{36}$/);
  await expect(dialog).not.toBeVisible();
  await page.goto("/dashboard/stranke");
  await page.getByRole("searchbox", { name: /Išči po imenu/ }).fill(phone);
  await page.getByRole("link", { name }).click();
  await expect(page.getByText(vin)).toBeVisible();
  await noHorizontalOverflow(page);
});

test("missing data link completes the original case without exposing the token in the URL", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  const caseId = mobile ? seed.incompleteCases.mobile : seed.incompleteCases.desktop;
  await login(page, seed.owner);
  await page.goto(`/dashboard/primeri/${caseId}`);
  await page.getByRole("button", { name: "Pripravi dopolnitev podatkov" }).click();
  const link = await page.getByRole("textbox", { name: "Povezava za dopolnitev" }).inputValue();
  expect(link).toMatch(new RegExp(`^${appOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/dopolnitev#token=`));

  await page.goto(link);
  await expect(page).not.toHaveURL(/#token=/);
  await page.getByLabel("VIN").fill(mobile ? "TST00000000000003" : "TST00000000000002");
  await page.getByLabel("Znamka").fill("Test");
  await page.getByLabel("Model").fill("Dopolnjen");
  await page.getByRole("button", { name: "Pošlji podatke" }).click();
  await expect(page.getByRole("status")).toContainText("Podatki so dopolnjeni");

  await page.goto(`/dashboard/primeri/${caseId}`);
  await expect.poll(()=>caseStatus(caseId)).toBe("new");
  await openCaseSection(page, "podatki");
  // Completion restores local data, but must not bypass confirmed Quibi identity.
  await expect(page.getByRole("button", {name:"Sprejmi primer za pripravo ponudbe"})).toHaveCount(0);
  await page.reload();
  await expect.poll(()=>caseStatus(caseId)).toBe("new");
  await expect(page.getByRole("region", {name:"Povzetek povpraševanja"})).toContainText(mobile ? "TST00000000000003" : "TST00000000000002");

});

test('mechanic starts, uploads a private photo batch and completes work without a note; owner sees the same evidence',async({page},testInfo)=>{
 const id=seed.mechanicCases[testInfo.project.name==='mobile-chromium'?'mobile':'desktop'];
 if(testInfo.project.name==='mobile-chromium')await page.setViewportSize({width:390,height:844});
 await login(page,seed.mechanic);await page.goto('/dashboard/mehanik');await expect(page.locator('a[href="/dashboard/mehanik/'+id+'"]')).toBeVisible();
 await expect(page.locator('main ul li a').first()).toHaveAttribute('href','/dashboard/mehanik/'+seed.mechanicCases.mobile);
 const watch=await page.context().newPage();await watch.bringToFront();await watch.goto('/dashboard/mehanik');await expect(watch.locator('[data-workshop-realtime]')).toHaveAttribute('data-workshop-realtime','subscribed',{timeout:15000});
 await page.goto('/dashboard/mehanik/'+id);
 await expect(page.getByText('Mehanik QA',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Začni delo',exact:true}).click();
 await expect(page.getByRole('button',{name:'Zaključi delo',exact:true})).toBeVisible();
 await expect(page.locator('#case-primary-action [data-case-primary]')).toHaveText('Zaključi delo');
 await watch.bringToFront();await expect(watch.locator('a[href="/dashboard/mehanik/'+id+'"]')).toContainText('Delo poteka',{timeout:15000});await page.bringToFront();
 await expect(page.getByLabel('Fotografiraj vozilo ali del')).toBeVisible();
 const camera=page.getByLabel('Fotografiraj vozilo ali del');await expect(camera).toHaveAttribute('capture','environment');
 const gallery=page.getByLabel('Ali izberi iz galerije');await expect(gallery).toHaveAttribute('multiple','');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=','base64');
 await gallery.setInputFiles([{name:'qa-part-one.png',mimeType:'image/png',buffer:png},{name:'qa-part-two.png',mimeType:'image/png',buffer:png}]);
 await expect(page.getByRole('img',{name:'Fotografija popravila',exact:true})).toHaveCount(2,{timeout:20000});
 await expect(page.getByRole('button',{name:'Shrani fotografijo',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/p3-mechanic-'+testInfo.project.name+'.png',fullPage:true});
 await page.locator('[data-work-form="progress"] summary').filter({hasText:'Pregled vozila'}).click();
 await page.getByRole('button',{name:'Zavore – Potrebno popravilo',exact:true}).click();
 await page.getByRole('button',{name:'Luči – V redu',exact:true}).click();
 await expect(page.getByRole('button',{name:'Zavore – Potrebno popravilo',exact:true})).toHaveAttribute('aria-pressed','true');
 await noHorizontalOverflow(page);
 await page.getByRole('button',{name:'Zaključi delo',exact:true}).click();
 await expect(page.locator('[data-work-form="progress"]')).toHaveCount(0);
 await page.reload();await expect(page.getByText('Zavore: Potrebno popravilo\nLuči: V redu',{exact:true})).toBeVisible();
 await watch.bringToFront();await expect(watch.locator('a[href="/dashboard/mehanik/'+id+'"]')).toContainText('Delo opravljeno',{timeout:15000});await expect(watch.locator('main ul li a').first()).toHaveAttribute('href','/dashboard/mehanik/'+seed.mechanicCases.mobile);await watch.close();
 await page.reload();await expect(page.locator('[data-work-form="progress"]')).toHaveCount(0);
 await expect(page.getByRole('img',{name:'Fotografija popravila',exact:true})).toHaveCount(2);
 await noHorizontalOverflow(page);
 await page.context().clearCookies();await login(page,seed.owner);await page.goto('/dashboard/primeri/'+id);await openCaseSection(page,'popravilo');
 await expect(page.getByRole('button',{name:'Potrdi opravljeno delo',exact:true})).toBeVisible();
 await expect(page.locator('#naslednji-korak [data-case-primary]')).toHaveText('Potrdi opravljeno delo');
 await expect(page.locator('[data-work-form="assign"]')).toHaveCount(0);await expect(page.locator('[data-work-form="progress"]')).toHaveCount(0);
 await expect(page.getByRole('img',{name:'Fotografija popravila',exact:true})).toHaveCount(2);
 await noHorizontalOverflow(page);await page.screenshot({path:'test-results/p3-review-'+testInfo.project.name+'.png',fullPage:true});
 if(testInfo.project.name==='mobile-chromium'){await page.setViewportSize({width:350,height:844});await noHorizontalOverflow(page);await page.screenshot({path:'test-results/p3-review-350.png',fullPage:true});}
});
