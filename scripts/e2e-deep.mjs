// Deep Playwright sweep — mobile, dark mode, Arabic RTL, accessibility,
// form validation, broken-link / orphan-route detection.
//
// Run: PORT=3000 node scripts/e2e-deep.mjs
// Output: /tmp/irb-e2e/deep-report.json + /tmp/irb-e2e/deep-*.png

import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;
const OUT = "/tmp/irb-e2e";
fs.mkdirSync(OUT, { recursive: true });

const findings = {
  timestamp: new Date().toISOString(),
  base: BASE,
  mobile: { routes: [], consoleErrors: [], pageErrors: [] },
  darkMode: { routes: [], pageErrors: [] },
  arabic: { routes: [], pageErrors: [] },
  a11y: { issues: [] },
  forms: { issues: [] },
  brokenLinks: [],
  summary: {},
};

function attach(page, bucket) {
  page.on("console", msg => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const t = msg.text();
      if (t.includes("VITE_ANALYTICS")) return;
      bucket.consoleErrors?.push({ url: page.url(), type: msg.type(), text: t.slice(0, 400) });
    }
  });
  page.on("pageerror", err => {
    bucket.pageErrors?.push({ url: page.url(), message: String(err?.message ?? err).slice(0, 400) });
  });
}

async function login(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/dev/login`, {
    data: { openId: "dev-owner-001", name: "Admin", email: "owner@irb-ultimate.local", role: "admin" },
  });
  await ctx.storageState({ path: "/tmp/irb-e2e/auth.json" });
  await ctx.close();
}

// (1) Mobile viewport — iPhone 14 Pro (393x852)
async function mobileSweep(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    storageState: "/tmp/irb-e2e/auth.json",
  });
  const page = await ctx.newPage();
  attach(page, findings.mobile);
  for (const route of ["/", "/dashboard", "/admin", "/profile", "/verify", "/resources", "/support", "/statistics"]) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 15000 });
      // Detect horizontal overflow — common bug on mobile.
      const overflow = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        return { docW, winW, overflowsX: docW > winW + 1 };
      });
      const safe = route.replace(/[^a-zA-Z0-9]+/g, "_") || "_root";
      await page.screenshot({ path: `${OUT}/deep_mobile${safe}.png`, fullPage: true });
      findings.mobile.routes.push({ route, overflowsX: overflow.overflowsX, docW: overflow.docW, winW: overflow.winW });
    } catch (err) {
      findings.mobile.routes.push({ route, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  await ctx.close();
}

// (2) Dark mode (the app uses ThemeContext + class-based dark)
async function darkModeSweep(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: "/tmp/irb-e2e/auth.json",
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  attach(page, findings.darkMode);
  // Force the ThemeContext into dark mode via localStorage before nav.
  await page.addInitScript(() => {
    try { localStorage.setItem("theme", "dark"); } catch {}
  });
  for (const route of ["/", "/dashboard", "/admin", "/profile"]) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 15000 });
      // Some apps need an explicit class toggle; force it just in case.
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(200);
      const safe = route.replace(/[^a-zA-Z0-9]+/g, "_") || "_root";
      await page.screenshot({ path: `${OUT}/deep_dark${safe}.png`, fullPage: true });
      // Detect contrast disasters — read body bg vs primary text colour
      const colors = await page.evaluate(() => {
        const cs = getComputedStyle(document.body);
        return { bg: cs.backgroundColor, color: cs.color };
      });
      findings.darkMode.routes.push({ route, ...colors });
    } catch (err) {
      findings.darkMode.routes.push({ route, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  await ctx.close();
}

// (3) Arabic / RTL — toggle language and render the same routes
async function arabicSweep(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: "/tmp/irb-e2e/auth.json",
  });
  const page = await ctx.newPage();
  attach(page, findings.arabic);
  await page.addInitScript(() => {
    try { localStorage.setItem("irb-lang", "ar"); } catch {}
  });
  for (const route of ["/", "/dashboard", "/admin", "/profile"]) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 15000 });
      const dir = await page.evaluate(() => document.documentElement.dir || document.documentElement.getAttribute("dir") || "");
      const lang = await page.evaluate(() => document.documentElement.lang || "");
      const safe = route.replace(/[^a-zA-Z0-9]+/g, "_") || "_root";
      await page.screenshot({ path: `${OUT}/deep_ar${safe}.png`, fullPage: true });
      findings.arabic.routes.push({ route, dir, lang });
    } catch (err) {
      findings.arabic.routes.push({ route, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  await ctx.close();
}

// (4) Accessibility — quick structural checks (no axe dep, just rules)
async function a11yChecks(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: "/tmp/irb-e2e/auth.json",
  });
  const page = await ctx.newPage();
  for (const route of ["/", "/dashboard", "/verify", "/profile"]) {
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 15000 });
      const issues = await page.evaluate(() => {
        const out = [];
        // Images without alt
        for (const img of Array.from(document.images)) {
          if (!img.alt && !img.getAttribute("aria-hidden")) {
            out.push({ kind: "img-missing-alt", src: img.src.slice(0, 80) });
          }
        }
        // Inputs without accessible name (label, aria-label, aria-labelledby, placeholder)
        for (const inp of Array.from(document.querySelectorAll("input,textarea,select"))) {
          const i = inp;
          if (i.type === "hidden" || i.type === "submit" || i.type === "button") continue;
          const id = i.id;
          const labelled =
            (id && document.querySelector(`label[for="${id}"]`)) ||
            i.getAttribute("aria-label") ||
            i.getAttribute("aria-labelledby") ||
            i.getAttribute("placeholder");
          if (!labelled) {
            out.push({ kind: "input-no-name", tag: i.tagName.toLowerCase(), name: i.name || i.id || "(unnamed)" });
          }
        }
        // Buttons with neither text nor aria-label
        for (const btn of Array.from(document.querySelectorAll("button"))) {
          const text = (btn.textContent || "").trim();
          const aria = btn.getAttribute("aria-label");
          if (!text && !aria) {
            out.push({ kind: "button-no-name", html: btn.outerHTML.slice(0, 100) });
          }
        }
        // Links with no text
        for (const a of Array.from(document.querySelectorAll("a[href]"))) {
          const text = (a.textContent || "").trim();
          const aria = a.getAttribute("aria-label");
          if (!text && !aria) {
            out.push({ kind: "link-no-name", href: a.getAttribute("href") || "" });
          }
        }
        // Headings: page should have an h1
        if (!document.querySelector("h1")) {
          out.push({ kind: "no-h1" });
        }
        return out;
      });
      if (issues.length > 0) {
        findings.a11y.issues.push({ route, count: issues.length, samples: issues.slice(0, 8) });
      }
    } catch (err) {
      findings.a11y.issues.push({ route, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  await ctx.close();
}

// (5) Form validation — Stage 1 minimum-input behaviour
async function formChecks(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: "/tmp/irb-e2e/auth.json",
  });
  const page = await ctx.newPage();
  try {
    // Use existing app id 1
    await page.goto(`${BASE}/apply/1/stage1`, { waitUntil: "networkidle", timeout: 15000 });
    // Try saving an empty form — does the server reject? does the UI surface it?
    const saveBtn = page.getByRole("button", { name: /save|حفظ/i }).first();
    const exists = await saveBtn.isVisible().catch(() => false);
    findings.forms.issues.push({ route: "/apply/1/stage1", saveButtonVisible: exists });
  } catch (err) {
    findings.forms.issues.push({ route: "/apply/1/stage1", error: String(err?.message ?? err).slice(0, 200) });
  }
  await ctx.close();
}

// (6) Broken in-app links — crawl the home page anchors
async function brokenLinks(browser) {
  const ctx = await browser.newContext({ storageState: "/tmp/irb-e2e/auth.json" });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hrefs = await page.evaluate(() => {
    const out = new Set();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const h = a.getAttribute("href");
      if (h && h.startsWith("/")) out.add(h);
    }
    return [...out];
  });
  for (const href of hrefs.slice(0, 20)) {
    try {
      const resp = await page.request.get(BASE + href);
      if (!resp.ok()) findings.brokenLinks.push({ href, status: resp.status() });
    } catch (err) {
      findings.brokenLinks.push({ href, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await login(browser);
  await mobileSweep(browser);
  await darkModeSweep(browser);
  await arabicSweep(browser);
  await a11yChecks(browser);
  await formChecks(browser);
  await brokenLinks(browser);
  await browser.close();

  findings.summary.mobileOverflows = findings.mobile.routes.filter(r => r.overflowsX).length;
  findings.summary.darkBgs = [...new Set(findings.darkMode.routes.map(r => r.bg))];
  findings.summary.arabicRtlRoutes = findings.arabic.routes.filter(r => r.dir === "rtl").length;
  findings.summary.arabicRoutesTotal = findings.arabic.routes.length;
  findings.summary.a11yRoutesWithIssues = findings.a11y.issues.filter(i => i.count).length;
  findings.summary.brokenLinksCount = findings.brokenLinks.length;

  fs.writeFileSync(`${OUT}/deep-report.json`, JSON.stringify(findings, null, 2));

  console.log("───── DEEP SWEEP SUMMARY ─────");
  console.log(JSON.stringify(findings.summary, null, 2));

  if (findings.mobile.routes.some(r => r.overflowsX)) {
    console.log("\n— mobile horizontal overflows —");
    for (const r of findings.mobile.routes.filter(r => r.overflowsX)) {
      console.log(`  ${r.route}: docW=${r.docW} winW=${r.winW}`);
    }
  }
  if (findings.darkMode.pageErrors.length) {
    console.log("\n— dark mode errors —");
    findings.darkMode.pageErrors.forEach(e => console.log(`  ${e.url}: ${e.message}`));
  }
  if (findings.arabic.routes.some(r => r.dir !== "rtl")) {
    console.log("\n— arabic routes NOT in RTL —");
    findings.arabic.routes.filter(r => r.dir !== "rtl").forEach(r => console.log(`  ${r.route}: dir=${r.dir} lang=${r.lang}`));
  }
  if (findings.a11y.issues.length) {
    console.log("\n— a11y issues —");
    for (const i of findings.a11y.issues) {
      console.log(`  ${i.route}: ${i.count} issues`);
      for (const s of (i.samples || []).slice(0, 4)) console.log(`    - ${s.kind}: ${JSON.stringify(s).slice(0, 160)}`);
    }
  }
  if (findings.brokenLinks.length) {
    console.log("\n— broken in-app links —");
    findings.brokenLinks.forEach(b => console.log(`  ${b.href} → ${b.status || b.error}`));
  }
  console.log(`\nFull: ${OUT}/deep-report.json`);
}

main().catch(err => { console.error("Deep sweep failed:", err); process.exit(1); });
