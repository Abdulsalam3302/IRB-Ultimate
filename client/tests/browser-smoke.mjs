import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.env.IRB_SMOKE_BASE_URL || "http://127.0.0.1:3017";
const origin = new URL(base);
assert(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "This smoke test is restricted to isolated local environments");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const page = await context.newPage();
const exceptions = [];
const thirdParty = [];
page.on("pageerror", error => exceptions.push(error.message));
page.on("request", request => { if (new URL(request.url()).origin !== origin.origin && /^https?:/.test(request.url())) thirdParty.push(request.url()); });
const checks = [];
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
  assert.match(await page.locator("h1").innerText(), /research|ethics/i);
  assert(!(await page.locator("body").innerText()).includes("Official NBCE"));
  checks.push("English homepage renders and government-affiliation claim absent");
  await page.screenshot({ path: "/tmp/irb-frontend-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /العربية/ }).first().click();
  await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
  assert.match(await page.locator("h1").innerText(), /أخلاقيات|البحث/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Homepage overflows mobile width");
  checks.push("Arabic RTL mobile homepage renders without horizontal overflow");
  await page.screenshot({ path: "/tmp/irb-frontend-arabic-mobile.png", fullPage: true });
  for (const path of ["/resources", "/policy", "/disclaimer", "/support", "/verify", "/registry", "/statistics"]) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.locator("h1").waitFor();
    assert.match(await page.locator("html").getAttribute("lang"), /ar/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} overflows mobile width`);
    checks.push(`Arabic mobile ${path} renders`);
  }
  await page.goto(`${base}/auth?next=%2F%5Cattacker.example`, { waitUntil: "networkidle" });
  await page.locator('#email').waitFor();
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  checks.push("Auth route is usable on mobile and noindex without a public canonical");
  for (const path of ["/format/not-a-template", "/not-a-real-page"]) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").innerText(), "404");
    assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
    checks.push(`${path} has safe 404 UI and noindex`);
  }
  await page.route("**/api/trpc/**", route => route.abort("failed"));
  for (const [path, unavailable] of [["/registry", /السجل غير متاح/], ["/statistics", /الإحصائيات غير متاحة/]]) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.locator('[role="alert"]').filter({ hasText: unavailable }).waitFor({ timeout: 20_000 });
    checks.push(`${path} reports unavailable during an API outage`);
  }
  const restricted = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await restricted.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { get() { throw new DOMException("Storage disabled", "SecurityError"); } });
  });
  const privatePage = await restricted.newPage();
  privatePage.on("pageerror", error => exceptions.push(error.message));
  await privatePage.goto(base, { waitUntil: "networkidle" });
  await privatePage.locator("h1").waitFor();
  await privatePage.getByRole("button", { name: /العربية/ }).first().click();
  await privatePage.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
  checks.push("Public UI and language toggle work when browser storage is denied");
  await restricted.close();
  assert.deepEqual(exceptions, [], "Browser runtime errors");
  assert.deepEqual(thirdParty, [], "Public browsing loaded third-party requests");
  const receipt = { at: new Date().toISOString(), base, checks, browserErrors: exceptions, thirdPartyRequests: thirdParty, evidenceScope: "Local production-mode public route smoke; no real login, model provider, certificate issuance, or native WebMCP invocation" };
  await fs.writeFile("/tmp/irb-frontend-browser-smoke.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
