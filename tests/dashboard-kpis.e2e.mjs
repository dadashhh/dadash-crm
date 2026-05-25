import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.DADASH_E2E_URL || "https://dadash.co/#dashboard";
const email = process.env.DADASH_E2E_EMAIL;
const password = process.env.DADASH_E2E_PASSWORD;

assert.ok(email, "Set DADASH_E2E_EMAIL for the dashboard E2E test.");
assert.ok(password, "Set DADASH_E2E_PASSWORD for the dashboard E2E test.");

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/mot de passe|password/i).fill(password);
  await page.getByRole("button", { name: /se connecter|sign in/i }).click();

  await page.getByText(/voir le tableau de bord/i).click({ timeout: 8000 }).catch(() => {});
  await page.getByText("Chargement des données...").waitFor({ state: "detached", timeout: 5000 });

  const body = await page.locator("body").innerText();
  assert.match(body, /CA Brut/i, "Dashboard KPI cards should be visible.");
  assert.doesNotMatch(body, /CA Brut\\s*0\\s*CHF/i, "CA Brut should not be masked as 0 CHF.");
  assert.doesNotMatch(body, /Panier moyen\\s*0\\s*CHF/i, "Panier moyen should not be masked as 0 CHF.");
  assert.doesNotMatch(body, /Aucune donnée/i, "Metrics chart should render data.");
} finally {
  await browser.close();
}
