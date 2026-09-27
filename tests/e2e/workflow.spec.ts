import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Seed = { owner: string; reception: string; mechanic: string; foreign: string;
  customer: string; linkedCustomer: string; vehicle: string; caseId: string };
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
