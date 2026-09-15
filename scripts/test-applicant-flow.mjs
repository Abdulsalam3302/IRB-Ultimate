/** Styled applicant workflow fixture. APIs are intercepted; no model calls, email or database writes. */
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
const output = await mkdtemp(path.join(tmpdir(), "irb-applicant-flow-"));
const provider = "";
const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push({ name, passed: true });
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const keys = [
  "researchObjectives",
  "methodology",
  "sampleSize",
  "targetPopulation",
  "inclusionCriteria",
  "exclusionCriteria",
  "dataCollectionMethods",
  "informedConsentProcess",
  "riskAssessment",
  "benefitAssessment",
  "confidentialityMeasures",
  "conflictOfInterest",
];
const user = {
  id: 123,
  openId: "email:synthetic",
  name: "Synthetic Applicant",
  email: "synthetic@example.invalid",
  role: "user",
  isOwner: false,
  authLevel: "aal1",
};
const protocol = Object.fromEntries(
  keys.map(key => [
    key,
    key === "sampleSize" ? "12" : `Synthetic study statement for ${key}.`,
  ])
);
const appTemplate = {
  id: 42,
  applicantId: 123,
  researchType: "retrospective",
  irbCategory: "full_board",
  researchTitle: "Synthetic local usability fixture",
  principalInvestigator: "Synthetic Applicant",
  piEmail: user.email,
  piInstitution: "Synthetic Institution",
  piDepartment: "Research",
  retrospectiveDataSource: "Deidentified synthetic fixtures",
  status: "stage2_pending",
  ...protocol,
  rejectionFileUrl: "",
  stage1AiScore: null,
  stage1Passed: false,
  stage1AiFeedback: null,
  stage2AiScore: 0,
  stage2Passed: false,
  stage2AiFeedback: JSON.stringify({
    feedback: "[AI_UNAVAILABLE] Provider temporarily unavailable",
    score: 0,
    passed: false,
    recommendations: keys.map(key => `${key} is missing`),
  }),
  submittedAt: null,
  submissionCount: 1,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};
const ready = {
  canSubmit: true,
  missingFields: [],
  blockers: [],
  alreadySubmitted: false,
  ai: { stage1: "not_reviewed", stage2: "unavailable" },
};
const sourceFiles = [
  "client/src/pages/ApplyStage1.tsx",
  "client/src/pages/ApplyStage2.tsx",
  "client/src/pages/SubmitApplication.tsx",
  "client/src/pages/PasswordRecovery.tsx",
  "client/src/lib/draftSaver.ts",
  "client/src/hooks/useStage2Draft.ts",
  "client/src/components/Stage2ReviewResult.tsx",
  "client/src/lib/aiReviewPresentation.ts",
  "client/src/lib/stage2AgentBridge.ts",
  "client/src/pages/ApplicationDetail.tsx",
  "client/src/components/SubmissionScreeningPanel.tsx",
  "client/src/components/WebMcpProvider.tsx",
  "shared/applicationWorkflow.ts",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async file => [
      file,
      createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
    ])
  )
);
await symlink(
  path.join(root, "node_modules"),
  path.join(output, "node_modules"),
  "dir"
);
await writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' +
    path.join(root, "client/src/main.tsx") +
    '"></script></body></html>'
);
const server = await createServer({
  configFile: false,
  envDir: false,
  root: output,
  publicDir: path.join(root, "client/public"),
  cacheDir: path.join(output, ".vite"),
  plugins: [
    {
      name: "synthetic-fixture-tailwind-source",
      enforce: "pre",
      transform(code, id) {
        // Tailwind's automatic scan follows the disposable Vite root. Preserve the
        // actual stylesheet and explicitly include the unchanged application files.
        if (id.split("?")[0] === path.join(root, "client/src/main.tsx"))
          return `import { StrictMode } from "react";\n${code.replace("<trpc.Provider", "<StrictMode><trpc.Provider").replace("</trpc.Provider>", "</trpc.Provider></StrictMode>")}`;
        if (id.split("?")[0] === path.join(root, "client/src/index.css")) {
          return `${code}\n@source ${JSON.stringify(path.join(root, "client/src"))};\n`;
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  logLevel: "error",
  envPrefix: "IRB_SYNTHETIC_FIXTURE_UNUSED_",
  define: Object.fromEntries(
    Object.entries({
      VITE_SUPABASE_URL: provider,
      VITE_SUPABASE_ANON_KEY: "sb_publishable_synthetic_invalid",
      VITE_API_URL: "",
      VITE_PUBLIC_SITE_URL: "",
      VITE_PUBLIC_ANALYTICS_ENABLED: "1",
    }).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
  ),
  resolve: {
    alias: {
      "@": path.join(root, "client/src"),
      "@shared": path.join(root, "shared"),
      "@assets": path.join(root, "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { strict: true, allow: [root, output], deny: ["**/.env*", "**/.*"] },
  },
});
let browser;
let base;
async function fixture(lang, options = {}) {
  const state = {
    app: structuredClone(appTemplate),
    readiness: structuredClone(ready),
    saves: [],
    savesInFlight: 0,
    maxSavesInFlight: 0,
    reviews: 0,
    suggestions: 0,
    submissions: 0,
    stage1Saves: 0,
    stage1Reviews: 0,
    stage1Enhancements: 0,
    procedures: [],
    errors: [],
    unexpected: [],
    recovery: [],
    saveDelay: 150,
    ...options,
  };
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addInitScript(
    lang => localStorage.setItem("irb-lang", lang),
    lang
  );
  await context.addInitScript(() => {
    window.__irbFixtureTools = {};
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(tool) {
          window.__irbFixtureTools[tool.name] = tool;
        },
        unregisterTool(name) {
          delete window.__irbFixtureTools[name];
        },
      },
    });
  });
  await context.route("**/*", async route => {
    const req = route.request(),
      url = new URL(req.url());
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (url.origin !== base) {
      state.unexpected.push(`external:${url.origin}`);
      return route.abort();
    }
    if (url.pathname === "/api/auth/recovery-status")
      return json({ available: state.recoveryAvailable !== false });
    if (
      url.pathname === "/api/auth/forgot-password" ||
      url.pathname === "/api/auth/reset-password"
    ) {
      state.recovery.push({
        path: url.pathname,
        input: req.postDataJSON(),
        referrer: req.headers().referer || "",
      });
      await pause(150);
      return json(
        state.recoveryError
          ? { error: "PRIVATE_PROVIDER_INTERNAL_ERROR" }
          : { ok: true },
        state.recoveryError || 200
      );
    }
    if (url.pathname.startsWith("/api/trpc/")) {
      const names = url.pathname.slice(10).split(",");
      const input =
        req.method() === "POST"
          ? req.postDataJSON()
          : JSON.parse(url.searchParams.get("input") || "{}");
      const results = await Promise.all(
        names.map(async (name, index) => {
          state.procedures.push(name);
          const args =
            (url.searchParams.get("batch") === "1" ? input[index] : input)
              ?.json || {};
          let data;
          if (name === "auth.me") data = user;
          else if (name === "application.getById") data = state.app;
          else if (name === "application.getSubmissionReadiness")
            data = state.readiness;
          else if (name === "application.saveStage2") {
            state.saves.push(structuredClone(args));
            state.savesInFlight++;
            state.maxSavesInFlight = Math.max(
              state.savesInFlight,
              state.maxSavesInFlight
            );
            await pause(state.saveDelay);
            state.savesInFlight--;
            if (state.saveFail)
              return {
                error: {
                  json: {
                    message: "Synthetic unavailable",
                    code: -32603,
                    data: {
                      code: "INTERNAL_SERVER_ERROR",
                      httpStatus: 503,
                      path: name,
                    },
                  },
                },
              };
            Object.assign(state.app, args);
            data = { success: true };
          } else if (name === "application.runStage2Review") {
            state.reviews++;
            await pause(700);
            data = state.reviewResult || {
              status: "unavailable",
              score: null,
              passed: false,
              issues: [],
              recommendations: [],
              unavailableReason: "provider_unavailable",
            };
          } else if (
            name === "application.aiResolveField" ||
            name === "application.aiAutoComplete"
          ) {
            state.suggestions++;
            await pause(650);
            data = name.endsWith("aiResolveField")
              ? {
                  fieldName: args.fieldName,
                  enhancedValue: "Suggested synthetic methodology",
                }
              : { methodology: "Suggested synthetic methodology" };
          } else if (name === "application.submit") {
            state.submissions++;
            await pause(state.submissionDelay || 150);
            state.app.status = "under_review";
            state.readiness = {
              ...ready,
              canSubmit: false,
              alreadySubmitted: true,
            };
            data = { assignedMembers: 0, success: true };
          } else if (name === "application.saveStage1") {
            state.stage1Saves++;
            Object.assign(state.app, args);
            data = { success: true };
          } else if (name === "application.aiEnhanceStage1") {
            state.stage1Enhancements++;
            await pause(650);
            const fields = {
              researchTitle: "AI proposed title",
              piInstitution: "AI proposed institution",
            };
            Object.assign(state.app, fields);
            data = {
              fields,
              review: {
                status: "completed",
                score: 60,
                passed: false,
                feedback: "Synthetic advisory assessment",
                recommendations: [],
                issues: [],
                fieldScores: [],
              },
            };
          } else if (name === "application.runStage1Review") {
            state.stage1Reviews++;
            data = {
              status: "unavailable",
              score: null,
              passed: false,
              issues: [],
              recommendations: [],
            };
          } else if (name === "aiSwarm.amOwner") data = { isOwner: false };
          else if (name === "notifications.getUnreadCount") data = 0;
          else data = [];
          return { result: { data: { json: data } } };
        })
      );
      return json(url.searchParams.get("batch") === "1" ? results : results[0]);
    }
    if (url.pathname.startsWith("/api/")) {
      state.unexpected.push(url.pathname);
      return json({}, 404);
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => state.errors.push(error.message));
  const navigate = async path => {
    await page.goto(base + path, { waitUntil: "networkidle" });
  };
  const finish = async name => {
    check(
      `${lang} ${name}: no uncaught browser exception`,
      state.errors.length === 0
    );
    check(
      `${lang} ${name}: no unexpected external/API traffic`,
      state.unexpected.length === 0
    );
    await context.close();
  };
  return { state, page, context, navigate, finish };
}
try {
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const lang of ["en", "ar"]) {
    const isAr = lang === "ar";
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.app.status = "submitted";
      state.app.submittedAt = null;
      await f.navigate("/application/42");
      const resume = page.getByRole("button", {
        name: isAr ? "متابعة تحرير الطلب" : "Continue editing",
        exact: true,
      });
      await resume.waitFor();
      check(
        `${lang} legacy AI-passed draft exposes an owner editing action`,
        await resume.isEnabled()
      );
      check(
        `${lang} legacy detail mobile has no horizontal overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      await resume.click();
      await page.waitForURL("**/apply/42/stage2");
      await page.locator("#methodology").waitFor();
      check(
        `${lang} legacy submitted-without-timestamp draft remains editable without automatic review or submission`,
        (await page.locator("#methodology").isEnabled()) &&
          state.reviews === 0 &&
          state.submissions === 0
      );
      await page
        .locator("#methodology")
        .fill("Edited legacy preparation draft");
      await page
        .getByRole("button", {
          name: isAr ? "حفظ المسودة" : "Save draft",
          exact: true,
        })
        .click();
      await pause(350);
      check(
        `${lang} legacy preparation changes use the normal ordered save queue`,
        state.app.methodology === "Edited legacy preparation draft" &&
          state.saves.length === 1 &&
          state.submissions === 0
      );
      await f.finish("legacy passed draft compatibility");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.app.status = "submitted";
      state.app.submittedAt = "2026-09-15T10:00:00.000Z";
      await f.navigate("/application/42");
      check(
        `${lang} timestamped submitted record does not offer resume editing`,
        (await page
          .getByRole("button", {
            name: isAr ? "متابعة تحرير الطلب" : "Continue editing",
            exact: true,
          })
          .count()) === 0
      );
      await f.navigate("/apply/42/stage2");
      await page.locator("#methodology").waitFor();
      check(
        `${lang} timestamped submitted record keeps protocol and save action locked`,
        (await page.locator("#methodology").isDisabled()) &&
          (await page
            .getByRole("button", {
              name: isAr ? "حفظ المسودة" : "Save draft",
              exact: true,
            })
            .isDisabled())
      );
      await page.waitForFunction(() =>
        Boolean(window.__irbFixtureTools.irb_update_stage2_draft)
      );
      const rejected = await page.evaluate(async () => {
        try {
          await window.__irbFixtureTools.irb_update_stage2_draft.execute({
            applicationId: 42,
            fields: { methodology: "Forbidden post-submission edit" },
          });
          return false;
        } catch {
          return true;
        }
      });
      check(
        `${lang} browser agent cannot reopen timestamped submitted content`,
        rejected &&
          state.saves.length === 0 &&
          state.submissions === 0 &&
          state.app.methodology === protocol.methodology
      );
      await f.finish("timestamped submission freeze");
    }

    {
      const f = await fixture(lang, { saveDelay: 600 });
      const { page, state } = f;
      await f.navigate("/apply/42/stage2");
      await page.locator("#methodology").waitFor();
      check(
        `${lang} all12 protocol controls labeled and required`,
        (await page.locator("#stage2-form [required]").count()) === 12 &&
          (await page.locator("#stage2-form label[for]").count()) === 12
      );
      check(
        `${lang} short sample size preserved`,
        (await page.locator("#sampleSize").inputValue()) === "12"
      );
      check(
        `${lang} legacy outage has no score or false missing feedback`,
        (await page.locator('[data-testid="ai-review-score"]').count()) === 0 &&
          !/AI_UNAVAILABLE|Major Revision|methodology is missing/.test(
            await page.locator("body").innerText()
          )
      );
      check(
        `${lang} optional tools lazy and no model calls on load`,
        state.reviews === 0 &&
          !state.procedures.some(name =>
            /Literature|calculateSampleSize|aiAutoComplete/.test(name)
          )
      );
      check(
        `${lang} mobile no horizontal overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      await page.screenshot({
        path: path.join(output, `${lang}-stage2-initial.png`),
        fullPage: true,
      });
      check(
        `${lang} actual styled form control usable`,
        await page
          .locator("#methodology")
          .evaluate(
            node =>
              node.getBoundingClientRect().width >= 260 &&
              node.getBoundingClientRect().height >= 64
          )
      );
      await page.screenshot({
        path: path.join(output, `${lang}-stage2.png`),
        fullPage: true,
      });
      await page.locator("#methodology").fill("First burst");
      await page.locator("#methodology").fill("First complete edit");
      await pause(350);
      check(`${lang} autosave debounced`, state.saves.length === 0);
      await page.waitForFunction(
        () =>
          document
            .getElementById("draft-save-status")
            .textContent.includes("Saving") ||
          document
            .getElementById("draft-save-status")
            .textContent.includes("جارٍ الحفظ")
      );
      await page.locator("#methodology").fill("Latest typed while saving");
      await page.waitForFunction(
        () =>
          document
            .getElementById("draft-save-status")
            .textContent.includes("All changes saved") ||
          document
            .getElementById("draft-save-status")
            .textContent.includes("كل التغييرات محفوظة")
      );
      check(
        `${lang} pending edit drained serially`,
        state.saves.length === 2 &&
          state.maxSavesInFlight === 1 &&
          state.app.methodology === "Latest typed while saving"
      );
      await page.locator("#riskAssessment").fill("Synthetic saved without AI");
      await page.locator("#stage2-form").evaluate(form => {
        form.requestSubmit();
        form.requestSubmit();
      });
      await pause(800);
      check(
        `${lang} form submission saves only, no duplicate write or review`,
        state.reviews === 0 && state.saves.length === 3
      );
      await page
        .getByRole("button", {
          name: isAr
            ? "مراجعة بالذكاء الاصطناعي (اختيارية)"
            : "AI review (optional)",
          exact: true,
        })
        .evaluate(button => {
          button.click();
          button.click();
        });
      await page
        .locator("#confidentialityMeasures")
        .fill("Typed during review");
      await pause(1000);
      check(
        `${lang} review called exactly once and pending edits preserved`,
        state.reviews === 1 &&
          (await page.locator("#confidentialityMeasures").inputValue()) ===
            "Typed during review"
      );
      check(
        `${lang} outage produces no score`,
        (await page.locator('[data-testid="ai-review-score"]').count()) === 0
      );
      await page
        .getByRole("button", {
          name: isAr ? "متابعة إلى التقديم" : "Continue to submission",
          exact: true,
        })
        .click();
      await page.waitForURL("**/apply/42/submit");
      const final = page.getByRole("button", {
        name: isAr ? "تقديم الطلب للمراجعة" : "Submit application for review",
        exact: true,
      });
      await final.waitFor();
      check(
        `${lang} complete application can submit without AI score`,
        (await final.isEnabled()) && state.submissions === 0
      );
      await page.screenshot({
        path: path.join(output, `${lang}-submit.png`),
        fullPage: true,
      });
      await final.evaluate(button => {
        button.click();
        button.click();
      });
      await page.waitForURL("**/application/42");
      check(
        `${lang} final submission explicit and deduplicated`,
        state.submissions === 1
      );
      check(
        `${lang} zero assigned reviewers truthfully queued`,
        (await page
          .getByText(
            isAr
              ? "تم تقديم الطلب وأُضيف إلى قائمة انتظار المراجعة البشرية."
              : "Application submitted and queued for human review.",
            { exact: true }
          )
          .count()) === 1
      );
      await f.finish("ordered saves and final submission");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      await f.navigate("/apply/42/stage2");
      await page
        .locator("summary")
        .filter({
          hasText: isAr
            ? "أدوات ومرفقات اختيارية"
            : "Optional tools and attachments",
        })
        .click();
      await page.locator("#suggest-target").selectOption("methodology");
      await page
        .getByRole("button", {
          name: isAr ? "طلب اقتراحات" : "Request suggestions",
          exact: true,
        })
        .click();
      await page
        .locator("#methodology")
        .fill("New human edit while suggestion pending");
      await page.getByRole("dialog").waitFor();
      check(
        `${lang} AI suggestion requires explicit selection`,
        !(await page
          .getByRole("dialog")
          .locator('input[type="checkbox"]')
          .isChecked()) &&
          (await page
            .getByRole("button", {
              name: isAr ? "تطبيق المحدد" : "Apply selected",
              exact: true,
            })
            .isDisabled())
      );
      await page.getByRole("dialog").locator('input[type="checkbox"]').check();
      await page
        .getByRole("button", {
          name: isAr ? "تطبيق المحدد" : "Apply selected",
          exact: true,
        })
        .click();
      check(
        `${lang} accepting stale AI proposal preserves new human edit`,
        (await page.locator("#methodology").inputValue()) ===
          "New human edit while suggestion pending" && state.suggestions === 1
      );
      await f.finish("suggestion acceptance race");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.app.screening = { status: "pending" };
      state.app.status = "under_review";
      await f.navigate("/application/42");
      await page
        .getByRole("heading", {
          name: isAr
            ? "حالة فحص الطلب المقدّم"
            : "Submitted application screening",
          exact: true,
        })
        .waitFor();
      check(
        `${lang} submitted screening runs in background without resubmission`,
        (await page
          .getByText(
            isAr ? "بانتظار الفحص الاسترشادي" : "Advisory screening queued",
            { exact: true }
          )
          .count()) === 1 && state.submissions === 0
      );
      state.app.screening = {
        status: "escalated",
        outcome: "human_review_required",
        stage2: {
          status: "unavailable",
          score: null,
          passed: false,
          issues: [],
        },
      };
      await page
        .getByRole("button", {
          name: isAr ? "تحديث الحالة" : "Refresh status",
          exact: true,
        })
        .click();
      await page
        .getByText(
          isAr
            ? "مطلوب متابعة المراجعة البشرية"
            : "Human review follow-up required",
          { exact: true }
        )
        .waitFor();
      await page
        .locator("summary")
        .filter({ hasText: isAr ? "ملاحظات المرحلة 2" : "Stage 2 feedback" })
        .click();
      check(
        `${lang} submitted outage no fabricated score or approval`,
        (await page.locator('[data-testid="ai-review-score"]').count()) === 0 &&
          (await page
            .getByText(isAr ? "غير متاحة" : "Unavailable", { exact: true })
            .count()) === 1
      );
      check(
        `${lang} application detail mobile no overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      await page.screenshot({
        path: path.join(output, `${lang}-screening.png`),
        fullPage: true,
      });
      await f.finish("background screening presentation");
    }
    {
      const f = await fixture(lang, { submissionDelay: 800 });
      const { page, state } = f;
      await f.navigate("/apply/42/stage2");
      await page.waitForFunction(() =>
        Boolean(window.__irbFixtureTools.irb_read_stage2_draft)
      );
      await page
        .locator("#methodology")
        .fill("Latest human draft for agent read");
      const read = await page.evaluate(() =>
        window.__irbFixtureTools.irb_read_stage2_draft.execute({
          applicationId: 42,
        })
      );
      check(
        `${lang} browser tool sees current unsaved owned editor`,
        read.fields.methodology === "Latest human draft for agent read"
      );
      await page.evaluate(() =>
        window.__irbFixtureTools.irb_update_stage2_draft.execute({
          applicationId: 42,
          fields: { riskAssessment: "Human-authorized agent clarification" },
        })
      );
      check(
        `${lang} browser tool updates controlled UI through same save queue`,
        (await page.locator("#riskAssessment").inputValue()) ===
          "Human-authorized agent clarification" &&
          state.app.riskAssessment === "Human-authorized agent clarification" &&
          state.maxSavesInFlight === 1
      );
      await page
        .locator("#methodology")
        .fill("Exact current version to submit");
      const pending = page.evaluate(() =>
        window.__irbFixtureTools.irb_submit_application.execute({
          applicationId: 42,
          confirmSubmission: true,
        })
      );
      await page.waitForFunction(
        () =>
          document.getElementById("methodology").disabled ||
          document.getElementById("methodology").closest("fieldset").disabled
      );
      check(
        `${lang} agent submission locks editing before final mutation`,
        await page.locator("#methodology").isDisabled()
      );
      const rejected = await page.evaluate(async () => {
        try {
          await window.__irbFixtureTools.irb_update_stage2_draft.execute({
            applicationId: 42,
            fields: { methodology: "late agent mutation" },
          });
          return false;
        } catch {
          return true;
        }
      });
      check(`${lang} agent cannot change protocol during submission`, rejected);
      await pending;
      check(
        `${lang} agent submits flushed version once and leaves successful form readonly`,
        state.submissions === 1 &&
          state.app.methodology === "Exact current version to submit" &&
          (await page.locator("#methodology").isDisabled())
      );
      await f.finish("browser agent submission lease");
    }
    {
      const f = await fixture(lang, { saveFail: true });
      const { page, state } = f;
      await f.navigate("/apply/42/stage2");
      await page.locator("#methodology").fill("Keep my unsaved protocol");
      await page
        .getByRole("button", {
          name: isAr ? "متابعة إلى التقديم" : "Continue to submission",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: isAr ? "إعادة الحفظ" : "Retry save",
          exact: true,
        })
        .waitFor();
      check(
        `${lang} failed save blocks navigation and retains text`,
        page.url().endsWith("/stage2") &&
          (await page.locator("#methodology").inputValue()) ===
            "Keep my unsaved protocol"
      );
      state.saveFail = false;
      await page
        .getByRole("button", {
          name: isAr ? "إعادة الحفظ" : "Retry save",
          exact: true,
        })
        .click();
      await pause(450);
      check(
        `${lang} retry saves retained draft`,
        state.app.methodology === "Keep my unsaved protocol"
      );
      await f.finish("failed save recovery");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.app.stage1AiScore = 50;
      state.app.stage1AiFeedback = JSON.stringify({
        status: "completed",
        score: 50,
        passed: false,
        feedback: "Synthetic advisory assessment",
        recommendations: [],
        issues: [],
        fieldScores: [],
      });
      await f.navigate("/apply/42/stage1");
      await page.locator("#researchTitle").fill("Original human title");
      await page
        .getByRole("button", {
          name: isAr ? "تحسين AI" : "AI Enhance",
          exact: true,
        })
        .click();
      await pause(200);
      await page
        .locator("#researchTitle")
        .fill("Typed while enhancement pending");
      await page
        .getByText(
          isAr ? "أعد المراجعة قبل التقديم" : "Please review before submitting",
          { exact: true }
        )
        .waitFor();
      check(
        `${lang} Stage1 enhancement starts from saved current facts`,
        state.stage1Saves === 1 && state.stage1Enhancements === 1
      );
      check(
        `${lang} Stage1 enhancement preserves typing made while waiting`,
        (await page.locator("#researchTitle").inputValue()) ===
          "Typed while enhancement pending" &&
          (await page.locator("#piInstitution").inputValue()) ===
            "AI proposed institution"
      );
      await page
        .locator("#piInstitution")
        .fill("New human institutional correction");
      await page
        .getByRole("button", {
          name: isAr ? "تراجع عن التحسين" : "Undo AI enhance",
          exact: true,
        })
        .click();
      check(
        `${lang} undo only reverses AI edits without erasing newer human corrections`,
        (await page.locator("#researchTitle").inputValue()) ===
          "Typed while enhancement pending" &&
          (await page.locator("#piInstitution").inputValue()) ===
            "New human institutional correction"
      );
      await f.finish("Stage1 enhancement race");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.app.stage1AiScore = 0;
      state.app.stage1AiFeedback = appTemplate.stage2AiFeedback;
      await f.navigate("/apply/42/stage1");
      await page.locator("#researchTitle").waitFor();
      check(
        `${lang} Stage1 outage has no zero or punitive override`,
        (await page.locator('[data-testid="ai-review-score"]').count()) === 0 &&
          !/RED FLAGGED|100\/100|suspended|Major Revision/.test(
            await page.locator("body").innerText()
          )
      );
      await page
        .getByRole("button", {
          name: isAr
            ? "حفظ ومتابعة إلى المرحلة الثانية"
            : "Save and continue to Stage 2",
          exact: true,
        })
        .click();
      await page.waitForURL("**/apply/42/stage2");
      check(
        `${lang} Stage1 next saves without model or score gate`,
        state.stage1Saves === 1 && state.stage1Reviews === 0
      );
      await f.finish("Stage1 advisory progression");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      state.readiness = {
        ...ready,
        canSubmit: false,
        missingFields: [
          {
            field: "methodology",
            stage: 2,
            labelEn: "Study design and methodology",
            labelAr: "تصميم الدراسة ومنهجيتها",
          },
        ],
      };
      await f.navigate("/apply/42/submit");
      const link = page.getByRole("link", {
        name: isAr ? "تصميم الدراسة ومنهجيتها" : "Study design and methodology",
        exact: true,
      });
      await link.waitFor();
      check(
        `${lang} named missing field and submission disabled`,
        (await link.getAttribute("href")) === "/apply/42/stage2#methodology" &&
          (await page
            .getByRole("button", {
              name: isAr
                ? "تقديم الطلب للمراجعة"
                : "Submit application for review",
              exact: true,
            })
            .isDisabled())
      );
      await link.click();
      await page.locator("#methodology").waitFor();
      await pause(100);
      check(
        `${lang} missing-field link focuses actual editable control`,
        await page
          .locator("#methodology")
          .evaluate(node => document.activeElement === node)
      );
      await f.finish("readiness requirements");
    }
    {
      const f = await fixture(lang, { recoveryAvailable: false });
      const { page, state } = f;
      await f.navigate("/forgot-password");
      await page
        .getByRole("link", {
          name: isAr ? "التواصل مع الدعم" : "Contact support",
          exact: true,
        })
        .waitFor();
      check(
        `${lang} disabled recovery service does not accept or promise an email request`,
        (await page.locator('form button[type="submit"]').isDisabled()) &&
          state.recovery.length === 0
      );
      await f.finish("unavailable recovery service");
    }
    {
      const f = await fixture(lang);
      const { page, state } = f;
      await f.navigate("/auth");
      await page
        .getByRole("button", {
          name: isAr ? "نسيت كلمة المرور؟" : "Forgot your password?",
          exact: true,
        })
        .click();
      await page.locator("#recovery-email").fill("synthetic@example.invalid");
      await page.locator("form").evaluate(form => {
        form.requestSubmit();
        form.requestSubmit();
      });
      await page
        .getByRole("status")
        .filter({ hasText: isAr ? "إذا كان البريد" : "If the address" })
        .waitFor();
      check(
        `${lang} recovery request generic and deduplicated`,
        state.recovery.length === 1 &&
          state.recovery[0].path === "/api/auth/forgot-password"
      );
      const token = "a".repeat(64);
      await f.navigate(`/reset-password#token=${token}`);
      await page.locator("#new-password").waitFor();
      check(
        `${lang} token cleared from URL and not persisted`,
        page.url().endsWith("/reset-password") &&
          !(
            await page.evaluate(() =>
              JSON.stringify({ ...localStorage, ...sessionStorage })
            )
          ).includes(token)
      );
      await page.locator("#new-password").fill("Synthetic-new-password!");
      await page.locator("#confirm-password").fill("Synthetic-new-password!");
      await page.locator("form").evaluate(form => {
        form.requestSubmit();
        form.requestSubmit();
      });
      await page
        .getByRole("status")
        .filter({
          hasText: isAr ? "تم تغيير كلمة المرور" : "Your password was changed",
        })
        .waitFor();
      check(
        `${lang} reset sends captured token only once with no referrer`,
        state.recovery.length === 2 &&
          state.recovery[1].input.token === token &&
          state.recovery[1].referrer === ""
      );
      check(
        `${lang} successful reset clears password controls`,
        (await page.locator('input[type="password"]').count()) === 0
      );
      check(
        `${lang} reset route noindex`,
        (
          await page.locator('meta[name="robots"]').getAttribute("content")
        ).includes("noindex")
      );
      await page.screenshot({
        path: path.join(output, `${lang}-password-reset.png`),
        fullPage: true,
      });
      await f.navigate("/reset-password");
      check(
        `${lang} bare reset link cannot submit`,
        (await page.locator("form").count()) === 0
      );
      check(
        `${lang} recovery paths excluded from analytics`,
        !state.procedures.includes("analytics.ingest")
      );
      await f.navigate(`/reset-password?token=${"b".repeat(64)}`);
      await page.locator("#new-password").waitFor();
      check(
        `${lang} legacy query reset link stripped`,
        page.url().endsWith("/reset-password")
      );
      state.recoveryError = 400;
      await page.locator("#new-password").fill("Synthetic-retry-password!");
      await page.locator("#confirm-password").fill("Synthetic-retry-password!");
      await page.locator("form").evaluate(form => form.requestSubmit());
      await page.getByRole("alert").waitFor();
      check(
        `${lang} invalid reset redacts server error and clears passwords`,
        !(await page.getByRole("alert").innerText()).includes(
          "PRIVATE_PROVIDER"
        ) &&
          (await page.locator("#new-password").inputValue()) === "" &&
          (await page.locator("#confirm-password").inputValue()) === ""
      );
      await f.finish("password recovery privacy");
    }
  }
  await writeFile(
    path.join(output, "receipt.json"),
    JSON.stringify(
      { passed: true, checks, sourceHashes, artifacts: output },
      null,
      2
    )
  );
  process.stdout.write(
    JSON.stringify({ passed: true, checks: checks.length, artifacts: output }) +
      "\n"
  );
} catch (error) {
  await writeFile(
    path.join(output, "receipt.json"),
    JSON.stringify(
      {
        passed: false,
        checks,
        sourceHashes,
        error: String(error),
        artifacts: output,
      },
      null,
      2
    )
  );
  throw error;
} finally {
  if (browser) await browser.close();
  await server.close();
}
