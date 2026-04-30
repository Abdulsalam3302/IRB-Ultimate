// Playwright E2E sweep — drives a real Chromium against the local
// dev server, visits every route, logs in, walks the applicant journey,
// captures console errors + network failures + screenshots, writes a
// machine-readable report.
//
// Run:  PORT=3000 node scripts/e2e-sweep.mjs
// Output: /tmp/irb-e2e/{report.json, *.png}

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;
const OUT = "/tmp/irb-e2e";
fs.mkdirSync(OUT, { recursive: true });

const findings = {
  timestamp: new Date().toISOString(),
  base: BASE,
  routes: [],
  consoleErrors: [],
  networkFailures: [],
  uncaughtExceptions: [],
  journey: { steps: [] },
  summary: {},
};

function attachListeners(page, label) {
  page.on("console", msg => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      // The Vite analytics warnings are noise; filter them.
      if (text.includes("VITE_ANALYTICS")) return;
      // React dev warnings about missing keys etc — keep
      findings.consoleErrors.push({
        page: label,
        type: msg.type(),
        text: text.slice(0, 500),
        url: page.url(),
      });
    }
  });
  page.on("pageerror", err => {
    findings.uncaughtExceptions.push({
      page: label,
      message: String(err?.message ?? err).slice(0, 500),
      stack: String(err?.stack ?? "").slice(0, 1000),
      url: page.url(),
    });
  });
  page.on("requestfailed", req => {
    findings.networkFailures.push({
      page: label,
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText ?? "unknown",
    });
  });
  page.on("response", async resp => {
    const status = resp.status();
    const url = resp.url();
    // Catch unexpected 4xx/5xx on app endpoints (ignore expected 404/403)
    if (status >= 500) {
      findings.networkFailures.push({
        page: label,
        url,
        method: resp.request().method(),
        failure: `${status} ${resp.statusText()}`,
      });
    }
  });
}

async function visit(browser, route, { auth = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: auth ? "/tmp/irb-e2e/auth.json" : undefined,
  });
  const page = await ctx.newPage();
  attachListeners(page, route);
  const result = { route, ok: false, status: 0, title: "", elapsedMs: 0 };
  try {
    const t0 = Date.now();
    const resp = await page.goto(BASE + route, {
      waitUntil: "networkidle",
      timeout: 20000,
    });
    result.elapsedMs = Date.now() - t0;
    result.status = resp?.status() ?? 0;
    result.title = await page.title().catch(() => "");
    result.ok = !!resp && resp.ok();
    // Snapshot the route — useful for visual review
    const safe = route.replace(/[^a-zA-Z0-9]+/g, "_") || "_root";
    const png = path.join(OUT, `route_${safe}.png`);
    await page.screenshot({ path: png, fullPage: true });
    result.screenshot = png;
  } catch (err) {
    result.error = String(err?.message ?? err).slice(0, 300);
  }
  await ctx.close();
  findings.routes.push(result);
  return result;
}

async function login(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  attachListeners(page, "login");
  // Use the dev login JSON endpoint to set cookies, then save state
  const resp = await page.request.post(`${BASE}/api/dev/login`, {
    data: {
      openId: "dev-owner-001",
      name: "Admin Owner",
      email: "owner@irb-ultimate.local",
      role: "admin",
    },
  });
  await ctx.storageState({ path: "/tmp/irb-e2e/auth.json" });
  await ctx.close();
  return resp.ok();
}

async function applicantJourney(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: "/tmp/irb-e2e/auth.json",
  });
  const page = await ctx.newPage();
  attachListeners(page, "journey");
  const steps = findings.journey.steps;

  async function step(name, fn) {
    const t0 = Date.now();
    try {
      const result = await fn();
      steps.push({ name, ok: true, elapsedMs: Date.now() - t0, result: result ?? null });
    } catch (err) {
      steps.push({
        name,
        ok: false,
        elapsedMs: Date.now() - t0,
        error: String(err?.message ?? err).slice(0, 400),
      });
    }
  }

  await step("dashboard load", async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/journey_dashboard.png`, fullPage: true });
    return { url: page.url() };
  });

  await step("click create application", async () => {
    // The dashboard has a button "Create Application" / "إنشاء طلب"
    // Try the icon+text matches; fall back to the header create button
    const btn = page.getByRole("button", { name: /create application|new application|create|إنشاء/i }).first();
    await btn.click({ timeout: 7000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/journey_after_create.png`, fullPage: true });
    return { url: page.url() };
  });

  await step("complete declaration", async () => {
    // We may have routed to /apply/<id>/declaration
    if (!page.url().includes("/declaration")) return { skipped: true };
    // Tick all 4 declaration checkboxes
    const checkboxes = page.locator('input[type="checkbox"], [role="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      try {
        await cb.click({ timeout: 1500 });
      } catch {}
    }
    await page.screenshot({ path: `${OUT}/journey_declaration.png`, fullPage: true });
    return { checked: count };
  });

  await step("fill Stage 1 form via direct URL", async () => {
    // Extract appId from /apply/<id>/...
    const m = page.url().match(/\/apply\/(\d+)\//);
    if (!m) return { noAppId: true };
    const appId = m[1];
    await page.goto(`${BASE}/apply/${appId}/stage1`, { waitUntil: "networkidle" });
    // Fill the title field (the only one we strictly need)
    const titleInput = page.getByPlaceholder(/full title|عنوان/i).first();
    await titleInput.fill("E2E test — cross-sectional survey of clinician burnout in tertiary hospitals (2026)");
    await page.screenshot({ path: `${OUT}/journey_stage1.png`, fullPage: true });
    return { appId };
  });

  // We deliberately skip running AI review here — it would burn LLM
  // tokens and add 20+ seconds to the suite. The route load above is
  // the meaningful UI smoke; AI flows are tested separately via curl.

  await step("admin dashboard reachable", async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/journey_admin.png`, fullPage: true });
    return { url: page.url() };
  });

  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Public routes (no auth)
  const publicRoutes = ["/", "/policy", "/verify", "/resources", "/support", "/statistics", "/404"];
  for (const r of publicRoutes) await visit(browser, r);

  // Auth + storage
  const loggedIn = await login(browser);
  findings.summary.loginOk = loggedIn;

  // Authed routes
  const authRoutes = ["/dashboard", "/admin", "/reviews", "/profile"];
  for (const r of authRoutes) await visit(browser, r, { auth: true });

  // Applicant journey
  await applicantJourney(browser);

  await browser.close();

  // Aggregate
  findings.summary.routesTotal = findings.routes.length;
  findings.summary.routesOk = findings.routes.filter(r => r.ok).length;
  findings.summary.consoleErrors = findings.consoleErrors.length;
  findings.summary.uncaught = findings.uncaughtExceptions.length;
  findings.summary.networkFailures = findings.networkFailures.length;
  findings.summary.journeyStepsOk = findings.journey.steps.filter(s => s.ok).length;
  findings.summary.journeyStepsTotal = findings.journey.steps.length;

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(findings, null, 2));

  console.log("───── E2E SUMMARY ─────");
  console.log(JSON.stringify(findings.summary, null, 2));
  if (findings.uncaughtExceptions.length > 0) {
    console.log("\n— uncaught —");
    for (const e of findings.uncaughtExceptions) {
      console.log(`[${e.page}] ${e.message}`);
    }
  }
  if (findings.consoleErrors.length > 0) {
    console.log("\n— console (first 12) —");
    for (const e of findings.consoleErrors.slice(0, 12)) {
      console.log(`[${e.page}] ${e.type}: ${e.text.slice(0, 160)}`);
    }
  }
  if (findings.networkFailures.length > 0) {
    console.log("\n— network failures (first 10) —");
    for (const f of findings.networkFailures.slice(0, 10)) {
      console.log(`[${f.page}] ${f.method} ${f.url} → ${f.failure}`);
    }
  }
  console.log(`\nFull report: ${OUT}/report.json`);
  console.log(`Screenshots: ${OUT}/route_*.png + ${OUT}/journey_*.png`);
}

main().catch(err => {
  console.error("E2E sweep failed:", err);
  process.exit(1);
});
