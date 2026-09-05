import { chromium } from "playwright";
let browser;
try {
  browser = await chromium.launch({ headless: true, timeout: 20_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
  await context.route("**/*", route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.setContent('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>Synthetic readiness</title><body><h1>نموذج تجريبي</h1><p>Document runtime readiness. No research data.</p></body></html>');
  const pdf = await page.pdf({ format: "A4", timeout: 15_000 });
  if (pdf.subarray(0, 5).toString() !== "%PDF-" || pdf.length < 1000) throw new Error("Invalid PDF output");
  console.log(JSON.stringify({ check: "pdf-runtime", ok: true, bytes: pdf.length }));
} catch (error) {
  const text = error instanceof Error ? error.message : "";
  const reason = /Executable doesn't exist/i.test(text) ? "browser-executable-unavailable"
    : /Host system is missing dependencies|error while loading shared libraries/i.test(text) ? "browser-system-dependencies-unavailable"
    : "browser-launch-or-render-failed";
  console.error(JSON.stringify({ check: "pdf-runtime", ok: false, reason }));
  process.exitCode = 1;
} finally { await browser?.close().catch(() => {}); }
