import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Seed = { owner: string; reception: string; mechanic: string; foreign: string;
  customer: string; linkedCustomer: string; vehicle: string; caseId: string;
  incompleteCases: { desktop: string; mobile: string } };
const path = process.env.E2E_FIXTURES_PATH;
if (process.env.CI !== "true" || process.env.SELAN_ISOLATED_E2E !== "1" || !path || !process.env.E2E_PASSWORD) {
  throw new Error("Playwright E2E requires disposable CI fixtures");
}
const seed = JSON.parse(readFileSync(path, "utf8")) as Seed;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-pošta").fill(email);
  await page.getByLabel("Geslo").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Prijava" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}
async function fixtureMode(mode: "normal" | "changed" | "error") {
  const response = await fetch(`http://127.0.0.1:47862/__control?mode=${mode}`, { method: "POST" });
  expect(response.ok).toBeTruthy();
}
async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test.beforeEach(async () => { await fixtureMode("normal"); });

test("public intake loads and protected dashboard requires login", async ({ page }) => {
  await page.goto("/povprasevanje");
  await expect(page.getByRole("heading", { name: /povpraševanje/i })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("real owner login opens dashboard and canonical case", async ({ page }) => {
  await login(page, seed.owner);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.goto(`/dashboard/primeri/${seed.caseId}`);
  await expect(page.getByRole("heading", { name: /Primer #/ })).toBeVisible();
  await expect(page.getByText("Izolirani E2E primer")).toBeVisible();
  await noHorizontalOverflow(page);
});

test("mechanic and foreign organization cannot enter operational dashboard", async ({ page }) => {
  for (const email of [seed.mechanic, seed.foreign]) {
    await login(page, email);
    await expect(page).toHaveURL(/\/dostop-zavrnjen(?:\?|$)/);
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

test("customer search and customer and vehicle edits persist in the same organization", async ({ page }) => {
  await login(page, seed.reception);
  await page.goto("/dashboard/stranke");
  await page.getByRole("searchbox", { name: /Išči po imenu/ }).fill("Ana Preizkus");
  await expect(page.getByRole("link", { name: "Ana Preizkus" })).toBeVisible();
  await page.getByRole("link", { name: "Ana Preizkus" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/stranke/${seed.customer}$`));

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
  await page.getByRole("button", { name: "Ročni vnos" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ročni vnos" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Iskanje" }).fill("Ana Preizkus");
  await dialog.getByRole("button", { name: /Ana Preizkus/ }).click();
  await dialog.getByRole("button", { name: /Test Model.*VIN/ }).click();
  await expect(dialog.getByText(/Izbrana stranka: Ana Preizkus.*izbrano vozilo/)).toBeVisible();
  await dialog.getByRole("textbox", { name: "Storitev / kaj stranka želi" }).fill("Preizkus telefonskega sprejema");
  await dialog.getByRole("button", { name: "Ustvari povpraševanje" }).click();
  await expect(dialog.getByRole("status")).toContainText("Povpraševanje je shranjeno");
});

test("manual intake creates a new customer and vehicle for the same case", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  const name = mobile ? "Ročni Preizkus Mobilno" : "Ročni Preizkus Namizje";
  const phone = mobile ? "+38640777555" : "+38640777444";
  const vin = mobile ? "TST00000000000005" : "TST00000000000004";
  await login(page, seed.reception);
  await page.getByRole("button", { name: "Ročni vnos" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ročni vnos" });
  await dialog.getByRole("button", { name: "Telefon", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Ime in priimek *" }).fill(name);
  await dialog.getByRole("textbox", { name: "Telefon" }).fill(phone);
  await dialog.getByRole("textbox", { name: "VIN / številka šasije" }).fill(vin);
  await dialog.getByRole("textbox", { name: "Znamka" }).fill("Test");
  await dialog.getByRole("textbox", { name: "Model" }).fill("Novo");
  await dialog.getByRole("textbox", { name: "Storitev / kaj stranka želi" }).fill("Pregled vozila v izoliranem testu");
  await dialog.getByRole("button", { name: "Ustvari povpraševanje" }).click();
  await expect(dialog.getByRole("status")).toContainText("Povpraševanje je shranjeno");
  await dialog.getByRole("button", { name: "Zapri" }).click();
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
  await page.getByRole("button", { name: "Ustvari povezavo za dopolnitev" }).click();
  const link = await page.getByRole("textbox", { name: "Povezava za dopolnitev" }).inputValue();
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:3000\/dopolnitev#token=/);

  await page.goto(link);
  await expect(page).not.toHaveURL(/#token=/);
  await page.getByLabel("VIN").fill(mobile ? "TST00000000000003" : "TST00000000000002");
  await page.getByLabel("Znamka").fill("Test");
  await page.getByLabel("Model").fill("Dopolnjen");
  await page.getByRole("button", { name: "Pošlji podatke" }).click();
  await expect(page.getByRole("status")).toContainText("Podatki so dopolnjeni");

  await page.goto(`/dashboard/primeri/${caseId}`);
  await expect(page.getByText("Status: preparing_offer")).toBeVisible();
});
