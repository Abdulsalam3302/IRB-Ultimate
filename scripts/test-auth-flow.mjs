/** Actual-source browser regression. All API/provider traffic is synthetic and intercepted.
 * Run: node scripts/test-auth-flow.mjs
 * No database, credentials, repository dotenv, or external network is required.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(path.join(tmpdir(), "irb-auth-flow-"));
const provider = "https://synthetic-auth.supabase.invalid";
const subject = "11111111-1111-4111-8111-111111111111";
const otherSubject = "22222222-2222-4222-8222-222222222222";
const storageKey = "sb-synthetic-auth-auth-token";
const checks = [];
const sourceFiles = ["client/src/pages/Auth.tsx", "client/src/pages/Profile.tsx", "client/src/components/StaffMfaNotice.tsx", "client/src/components/MfaSettings.tsx", "client/src/lib/institutionalAuth.ts", "client/src/lib/mfa.ts", "client/src/lib/supabase.ts", "client/src/main.tsx"];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
const user = (id = subject, extra = {}) => ({ id: 123, openId: `sb:${id}`, name: "Synthetic Reviewer", email: "synthetic@example.invalid", role: "admin", authLevel: "aal1", staffMfaRequired: true, isOwner: false, createdAt: "2026-01-01T00:00:00.000Z", ...extra });
const providerUser = id => ({ id, aud: "authenticated", role: "authenticated", email: "synthetic@example.invalid", app_metadata: { provider: "email" }, user_metadata: {}, factors: [{ id: "factor-synthetic", factor_type: "totp", status: "verified", friendly_name: "Synthetic authenticator" }] });
const token = (id, aal = "aal1") => [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", iss: `${provider}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), aal, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })).toString("base64url"), "synthetic-signature-not-for-server-use"].join(".");
const session = (id, aal = "aal1") => ({ access_token: token(id, aal), refresh_token: "synthetic-refresh-not-valid", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: providerUser(id) });
const check = (name, condition) => { assert.ok(condition, name); checks.push({ name, passed: true }); };
await symlink(path.join(root, "node_modules"), path.join(output, "node_modules"), "dir");
await writeFile(path.join(output, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + path.join(root, "client/src/main.tsx") + '"></script></body></html>');
const server = await createServer({
  configFile: false, envDir: false, root: output, publicDir: path.join(root, "client/public"), cacheDir: path.join(output, ".vite"),
  plugins: [
    { name: "synthetic-fixture-tailwind-source", enforce: "pre", transform(code, id) {
      // Tailwind's automatic scan follows the disposable Vite root. Preserve the
      // actual stylesheet and explicitly include the unchanged application files.
      if (id.split("?")[0] === path.join(root, "client/src/index.css")) {
        return `${code}\n@source ${JSON.stringify(path.join(root, "client/src"))};\n`;
      }
    } },
    react(), tailwindcss(),
  ], logLevel: "error",
  envPrefix: "IRB_SYNTHETIC_FIXTURE_UNUSED_",
  define: Object.fromEntries(Object.entries({ VITE_SUPABASE_URL: provider, VITE_SUPABASE_ANON_KEY: "sb_publishable_synthetic_invalid", VITE_API_URL: "", VITE_PUBLIC_SITE_URL: "" }).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
  resolve: { alias: { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared"), "@assets": path.join(root, "attached_assets") }, dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 0, fs: { strict: true, allow: [root, output], deny: ["**/.env*", "**/.*"] } },
});
let browser;
let base;
async function fixture(lang, options = {}) {
  const state = { settings: 0, native: 0, registration: 0, providerLogin: 0, bridges: 0, factors: 0, challenge: 0, verify: 0, unexpected: [], procedures: [], errors: [], currentUser: options.user ?? null, ...options };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(({ lang, storageKey, saved }) => {
    localStorage.setItem("irb-lang", lang);
    if (saved) localStorage.setItem(storageKey, JSON.stringify(saved));
  }, { lang, storageKey, saved: options.providerSubject ? session(options.providerSubject) : null });
  await context.route("**/*", async route => {
    const req = route.request(); const url = new URL(req.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.origin === provider) {
      if (url.pathname === "/auth/v1/settings") { state.settings++; return json(state.settingsUnavailable ? {} : { external: { email: true, google: false, apple: false, linkedin_oidc: false } }, state.settingsUnavailable ? 503 : 200); }
      if (url.pathname === "/auth/v1/token") { state.providerLogin++; return state.providerSuccess ? json(session(subject)) : json({ code: "invalid_credentials", msg: "Invalid login credentials" }, 400); }
      if (url.pathname === "/auth/v1/logout") return json({});
      if (url.pathname === "/auth/v1/user") { state.factors++; return json(providerUser(options.providerSubject || subject)); }
      if (url.pathname.endsWith("/challenge")) { state.challenge++; return json({ id: "synthetic-challenge", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 120 }); }
      if (url.pathname.endsWith("/verify")) { state.verify++; return json(session(subject, "aal2")); }
      state.unexpected.push(`provider:${url.pathname}`); return route.abort();
    }
    if (url.origin !== base) { state.unexpected.push("external request blocked"); return route.abort(); }
    if (url.pathname === "/api/auth/login") { state.native++; if (state.nativeDelay) await new Promise(resolve => setTimeout(resolve, state.nativeDelay)); return json(state.nativeSuccess ? { ok: true } : { code: "INVALID_CREDENTIALS" }, state.nativeSuccess ? 200 : 401); }
    if (url.pathname === "/api/auth/register") { state.registration++; return json({ code: "EMAIL_EXISTS" }, 409); }
    if (url.pathname === "/api/auth/supabase/session") {
      state.bridges++;
      if (state.bridgeFail) return json({ error: "Synthetic session rejection" }, 401);
      const authorization = req.headers().authorization || "";
      const aal = JSON.parse(Buffer.from(authorization.slice(7).split(".")[1], "base64url").toString()).aal;
      state.currentUser = user(subject, { authLevel: aal });
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/trpc/")) {
      const names = url.pathname.slice("/api/trpc/".length).split(",");
      const responses = names.map(name => {
        state.procedures.push(name);
        const data = name === "auth.me" ? state.currentUser : name === "aiSwarm.amOwner" ? { isOwner: state.currentUser?.isOwner === true } : name === "admin.stats" ? { total: 0, approved: 0, pending: 0, rejected: 0 } : [];
        return { result: { data: { json: data } } };
      });
      return json(url.searchParams.get("batch") === "1" ? responses : responses[0]);
    }
    if (url.pathname.startsWith("/api/")) { state.unexpected.push(`api:${url.pathname}`); return json({}, 404); }
    return route.continue();
  });
  const page = await context.newPage(); page.on("pageerror", error => state.errors.push(error.message));
  page.setDefaultTimeout(15_000);
  const navigate = async pathname => { await page.goto(base + pathname, { waitUntil: "networkidle" }); };
  const finish = async name => {
    check(`${lang} ${name}: no uncaught browser exception`, state.errors.length === 0);
    check(`${lang} ${name}: no unexpected external/API request`, state.unexpected.length === 0);
    await context.close();
  };
  return { state, context, page, navigate, finish };
}

try {
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const lang of ["en", "ar"]) {
    const more = lang === "ar" ? "خيارات أخرى لتسجيل الدخول" : "More sign-in options";
    const back = lang === "ar" ? "العودة لتسجيل الدخول بالبريد" : "Back to email sign-in";
    {
      const f = await fixture(lang, { nativeDelay: 150 }); const { page, state } = f;
      await f.navigate("/auth");
      check(`${lang} default login has no account-type radios`, await page.locator('input[type="radio"]').count() === 0);
      check(`${lang} default login has no institutional terminology`, !/institutional|مؤسس/.test(await page.locator("body").innerText()));
      check(`${lang} provider discovery deferred on ordinary login`, state.settings === 0);
      check(`${lang} mobile auth does not overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const layout = await page.evaluate(() => {
        const header = document.querySelector("header").getBoundingClientRect();
        const main = document.querySelector("main").getBoundingClientRect();
        const form = document.querySelector("form").getBoundingClientRect();
        const input = document.querySelector("#email").getBoundingClientRect();
        return { headerBottom: header.bottom, mainTop: main.top, formWidth: form.width, inputWidth: input.width, inputHeight: input.height, mainPadding: parseFloat(getComputedStyle(document.querySelector("main")).paddingLeft) };
      });
      check(`${lang} actual Tailwind layout stacks header above content`, layout.headerBottom <= layout.mainTop + 1 && layout.mainPadding >= 20);
      check(`${lang} mobile login keeps usable form and input width`, layout.formWidth >= 300 && layout.formWidth <= 390 && layout.inputWidth >= 250 && layout.inputHeight >= 34);
      await page.locator("#email").fill("synthetic@example.invalid"); await page.locator("#password").fill("Synthetic-password-only!");
      await page.locator("form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      await page.getByRole("alert").waitFor();
      check(`${lang} duplicate native submission guarded`, state.native === 1);
      check(`${lang} wrong native password never falls through to provider`, state.providerLogin === 0 && state.bridges === 0 && state.settings === 0);
      check(`${lang} failed native password cleared`, await page.locator("#password").inputValue() === "");
      await page.locator("#password").fill("Do-not-cross-identity-boundary");
      await page.getByRole("button", { name: more }).click();
      await page.locator("#email").waitFor();
      check(`${lang} explicit connected option fetches capabilities`, state.settings === 1);
      check(`${lang} changing identity flow clears credentials`, await page.locator("#email").inputValue() === "" && await page.locator("#password").inputValue() === "");
      await page.locator("#email").fill("synthetic@example.invalid"); await page.locator("#password").fill("Synthetic-provider-password!");
      await page.locator('form button[type="submit"]').click(); await page.getByRole("alert").waitFor();
      check(`${lang} connected credentials target only provider`, state.providerLogin === 1 && state.native === 1 && state.bridges === 0);
      await page.getByRole("button", { name: back }).click();
      check(`${lang} return to ordinary login clears credentials`, await page.locator("#email").inputValue() === "" && await page.locator("#password").inputValue() === "");
      await page.screenshot({ path: path.join(output, `auth-${lang}.png`), fullPage: true });
      await f.finish("credential isolation");
    }
    {
      const f = await fixture(lang, { settingsUnavailable: true });
      await f.navigate("/auth?method=connected");
      check(`${lang} connected deep link discovers capabilities`, f.state.settings === 1);
      check(`${lang} unavailable provider hides unusable password form`, await f.page.locator("#email").count() === 0);
      await f.page.getByRole("button", { name: back }).click();
      check(`${lang} native login remains usable through provider outage`, await f.page.locator("#email").isEnabled());
      await f.finish("provider outage");
    }
    {
      const f = await fixture(lang, { providerSuccess: true, bridgeFail: true });
      await f.navigate("/auth?method=connected&next=%2Fadmin");
      await f.page.locator("#email").fill("synthetic@example.invalid"); await f.page.locator("#password").fill("Synthetic-provider-password!");
      await f.page.locator('form button[type="submit"]').click(); await f.page.getByRole("alert").waitFor();
      check(`${lang} rejected session bridge stays on login`, new URL(f.page.url()).pathname === "/auth" && f.state.bridges === 1 && f.state.native === 0);
      check(`${lang} rejected bridge does not leave provider auth persisted`, await f.page.evaluate(key => localStorage.getItem(key) === null, storageKey));
      await f.finish("session bridge rejection");
    }
    {
      const owner = user(subject, { name: "Synthetic Owner", isOwner: true, staffMfaRequired: false });
      const f = await fixture(lang, { user: owner });
      await f.navigate("/profile"); await f.page.getByRole("heading", { name: "Synthetic Owner", exact: true }).waitFor();
      check(`${lang} owner Profile contains no account security card`, await f.page.locator("#account-security").count() === 0);
      check(`${lang} owner Profile does not initialize provider MFA`, f.state.factors === 0 && f.state.settings === 0);
      await f.navigate("/admin");
      check(`${lang} owner bypass follows authoritative server requirement flag`, f.state.procedures.includes("admin.stats") && await f.page.locator("#account-security").count() === 0);
      await f.finish("owner presentation");
    }
    {
      const f = await fixture(lang, { user: user(), providerSubject: otherSubject });
      await f.navigate("/admin");
      await f.page.locator("#account-security").waitFor();
      check(`${lang} nonowner staff remains gated without AAL2`, !f.state.procedures.includes("admin.stats"));
      check(`${lang} different provider identity cannot list or mutate MFA`, f.state.factors === 0 && f.state.challenge === 0 && f.state.verify === 0);
      const link = await f.page.locator('a[href*="method=connected"]').getAttribute("href");
      check(`${lang} staff reauthentication preserves target route`, link.includes("next=%2Fadmin"));
      await f.finish("MFA subject isolation");
    }
    {
      const f = await fixture(lang, { user: user(), providerSubject: subject });
      await f.navigate("/admin"); await f.page.locator("#mfa-code").waitFor();
      check(`${lang} matching staff identity exposes in-place challenge`, f.state.factors > 0 && !f.state.procedures.includes("admin.stats"));
      await f.page.locator("#mfa-code").fill("123456"); await f.page.locator('#account-security form button[type="submit"]').click();
      await f.page.locator("#account-security").waitFor({ state: "detached" });
      check(`${lang} verified challenge bridges once and unlocks staff view`, f.state.challenge === 1 && f.state.verify === 1 && f.state.bridges === 1 && f.state.currentUser.authLevel === "aal2");
      await f.finish("MFA challenge completion");
    }
  }
} catch (error) {
  checks.push({ name: error instanceof Error ? error.message : "Browser fixture failed", passed: false }); process.exitCode = 1;
} finally {
  await browser?.close(); await server.close();
  const unchanged = (await Promise.all(sourceFiles.map(async file => createHash("sha256").update(await readFile(path.join(root, file))).digest("hex") === sourceHashes[file]))).every(Boolean);
  const receipt = { testedAt: new Date().toISOString(), scope: "actual React routes and Supabase SDK; loopback Vite with all APIs/provider responses intercepted; no server authorization or live-provider proof", sourceHashes, sourceUnchangedDuringRun: unchanged, checks };
  await writeFile(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed), sourceUnchangedDuringRun: unchanged, receipt: path.join(output, "receipt.json") }, null, 2));
  if (!unchanged) process.exitCode = 1;
}
