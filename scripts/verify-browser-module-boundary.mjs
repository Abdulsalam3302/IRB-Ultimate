/** Run after a production build: node scripts/verify-browser-module-boundary.mjs */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Serve only the compiled public files on an ephemeral loopback port. No real
// accounts, providers, or database are touched by the fault-injection checks.
const publicRoot = fileURLToPath(new URL("../dist/public/", import.meta.url));
for (const [file, title] of [
  ["index.html", "Online IRB &amp; Research Ethics Approval in Saudi Arabia"],
  ["resources/index.html", "IRB Guides, Checklists and Templates for Saudi Researchers"],
]) {
  const html = await readFile(path.join(publicRoot, file), "utf8");
  assert.ok(html.includes(`<title>${title} | IRB Saudi Arabia</title>`));
  assert.ok(html.includes("data-page-schema"));
}
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify([{ result: { data: { json: null } } }]));
    return;
  }
  const resource = pathname === "/resources" ? "/resources/index.html" : pathname === "/" ? "/index.html" : "/workspace.html";
  const filename = path.resolve(publicRoot, `.${pathname.startsWith("/assets/") ? pathname : resource}`);
  if (!filename.startsWith(publicRoot)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const contents = await readFile(filename);
    const extension = path.extname(filename);
    response.writeHead(200, {
      "Content-Type": extension === ".js" ? "application/javascript" : extension === ".css" ? "text/css" : "text/html",
      "Cache-Control": "no-store",
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const scenario of ["healthy", "tools-unavailable", "route-unavailable"]) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.registeredTestTools = [];
      navigator.modelContext = {
        registerTool(tool) { window.registeredTestTools.push(tool.name); },
        unregisterTool() {},
      };
    });
    const page = await context.newPage();
    const requestedModules = [];
    page.on("request", request => requestedModules.push(request.url()));
    const uncaught = [];
    page.on("pageerror", error => uncaught.push(error.message));
    let blocked = 0;
    if (scenario !== "healthy") {
      const chunk = scenario === "tools-unavailable" ? "WebMcpProvider" : "Auth";
      await page.route(`**/assets/${chunk}-*.js`, async route => {
        blocked++;
        await route.abort("failed");
      });
    }
    await page.goto(`${origin}/auth`, { waitUntil: "networkidle" });
    assert.equal(requestedModules.some(url => /\/assets\/seo-/.test(url)), false);
    if (scenario === "route-unavailable") {
      await page.getByRole("heading", { name: "The page update could not load." }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Reload Page" }).count(), 1);
    } else {
      const email = page.locator('input[type="email"]');
      await email.waitFor({ state: "visible" });
      await email.fill("researcher@example.invalid");
      const toolsWarning = page.getByRole("status").filter({ hasText: "Browser agent tools could not load" });
      if (scenario === "tools-unavailable") {
        await toolsWarning.waitFor({ state: "visible" });
        assert.equal(await email.inputValue(), "researcher@example.invalid");
      } else {
        await page.waitForFunction(() => window.registeredTestTools.includes("irb_platform_guidance"));
        assert.equal(await toolsWarning.count(), 0);
      }
    }
    assert.deepEqual(uncaught, []);
    assert.equal(blocked, scenario === "healthy" ? 0 : 1);
    console.log(JSON.stringify({ scenario, passed: true, blockedModuleRequests: blocked }));
    await context.close();
  }

  for (const scenario of ["metadata-route-race", "metadata-language-race", "metadata-public-route-race", "metadata-public-unavailable"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let releaseMetadata;
    let requestedMetadata;
    const blocked = new Promise(resolve => { releaseMetadata = resolve; });
    const observed = new Promise(resolve => { requestedMetadata = resolve; });
    await page.route("**/assets/seo-*.js", async route => {
      requestedMetadata();
      await blocked;
      if (scenario === "metadata-public-unavailable") await route.abort("failed");
      else await route.continue();
    });
    if (scenario.startsWith("metadata-public-")) {
      // Preserve the initial page's real static tags while its metadata module
      // is delayed, then ensure a different public route cannot inherit them.
      const html = await readFile(path.join(publicRoot, "resources/index.html"), "utf8");
      // A configured production build already has its canonical. Only supply
      // one for an origin-free local build; duplicate fixture tags would not
      // represent the generated page and would make cleanup assertions invalid.
      const initialHtml = /<link\b[^>]*\brel=["']canonical["']/i.test(html)
        ? html
        : html.replace("</head>", `<link rel="canonical" href="${origin}/resources"></head>`);
      await page.route(`${origin}/resources`, route => route.fulfill({
        contentType: "text/html",
        body: initialHtml,
      }));
      await page.goto(`${origin}/resources`, { waitUntil: "domcontentloaded" });
    } else {
      await page.goto(`${origin}/auth`, { waitUntil: "networkidle" });
      assert.equal(await page.locator('link[rel="canonical"], script[data-page-schema]').count(), 0);
      await page.evaluate(() => history.pushState(null, "", "/resources"));
    }
    await observed;
    if (scenario.startsWith("metadata-public-")) {
      assert.match(await page.title(), /^IRB Guides/);
      assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
      await page.evaluate(() => history.pushState(null, "", "/policy"));
      await page.waitForFunction(() => document.title === "Workspace | IRB Saudi Arabia");
      assert.equal(await page.locator('link[rel="canonical"], script[data-page-schema]').count(), 0);
      assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
      releaseMetadata();
      if (scenario === "metadata-public-unavailable") {
        await page.waitForTimeout(200);
        assert.equal(await page.title(), "Workspace | IRB Saudi Arabia");
        assert.equal(await page.locator('link[rel="canonical"], script[data-page-schema]').count(), 0);
        assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
      } else {
        await page.waitForFunction(() => document.title.startsWith("Platform use and research review policy"));
        assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "index, follow");
      }
    } else if (scenario === "metadata-route-race") {
      // Simulate public discovery tags left by an earlier public page.
      await page.evaluate(() => {
        const canonical = document.createElement("link");
        canonical.rel = "canonical";
        canonical.href = `${location.origin}/resources`;
        document.head.appendChild(canonical);
        const schema = document.createElement("script");
        schema.dataset.pageSchema = "true";
        document.head.appendChild(schema);
        assertOneCanonical();
        history.pushState(null, "", "/auth");

        function assertOneCanonical() {
          if (document.head.querySelectorAll('link[rel="canonical"]').length !== 1)
            throw new Error("The public-to-private fixture must start with exactly one canonical");
        }
      });
      await page.waitForFunction(() => document.title === "Workspace | IRB Saudi Arabia");
      assert.equal(await page.locator('link[rel="canonical"], script[data-page-schema]').count(), 0);
      releaseMetadata();
      await page.waitForResponse(response => /\/assets\/seo-/.test(response.url()));
      await page.waitForTimeout(100);
      assert.equal(await page.title(), "Workspace | IRB Saudi Arabia");
      assert.equal(await page.locator('link[rel="canonical"], script[data-page-schema]').count(), 0);
      assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
    } else {
      await page.getByRole("button", { name: "العربية", exact: true }).click();
      releaseMetadata();
      await page.waitForFunction(() => document.title.startsWith("أدلة وقوائم تحقق"));
      assert.equal(await page.locator('meta[property="og:locale"]').getAttribute("content"), "ar_SA");
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "index, follow");
    }
    console.log(JSON.stringify({ scenario, passed: true }));
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
