// Multi-privilege end-to-end sweep — drives the real HTTP server through
// the five access levels of the platform:
//
//   visitor  → public pages/endpoints only, must be denied everything else
//   applier  → register/login, full application journey (declaration →
//              stage 1 → stage 2 → submit)
//   reviewer → committee member: sees assigned reviews, votes
//   admin    → secondary admin: dashboards, final decision; must NOT see
//              the owner-only AI swarm endpoints
//   owner    → everything, including the AI swarm console endpoints
//
// Run:  PORT=3000 node scripts/e2e-roles.mjs
// Requires: dev server running with DEV_LOGIN_ENABLED=1 and
//           OWNER_OPEN_ID=dev-owner-001 (see .env.example).

const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name} ${detail ? `— ${detail}` : ""}`);
  }
}

// ── Minimal cookie-jar fetch client ────────────────────────────────────────
function makeClient() {
  const jar = new Map();
  const cookieHeader = () =>
    Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  async function request(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        ...(jar.size ? { cookie: cookieHeader() } : {}),
        ...(opts.headers || {}),
      },
      redirect: "manual",
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const idx = pair.indexOf("=");
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (v === "" || sc.toLowerCase().includes("max-age=-1")) jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  }
  // tRPC v11 + superjson envelope helpers
  async function query(proc, input) {
    const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    const res = await request(`/api/trpc/${proc}${qs}`);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  async function mutate(proc, input) {
    const res = await request(`/api/trpc/${proc}`, {
      method: "POST",
      body: JSON.stringify(input === undefined ? {} : { json: input }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  return { request, query, mutate, jar };
}

const data = r => r.body?.result?.data?.json;
const errCode = r => r.body?.error?.json?.data?.code ?? r.body?.error?.data?.code;

async function devLogin(client, { openId, name, email }) {
  const res = await client.request("/api/dev/login", {
    method: "POST",
    body: JSON.stringify({ openId, name, email }),
  });
  return res.status === 200 ? res.json() : Promise.reject(new Error(`dev login ${res.status}`));
}

// ── 1. VISITOR ─────────────────────────────────────────────────────────────
async function visitorSuite() {
  console.log("\n── VISITOR (unauthenticated) ──");
  const c = makeClient();

  const health = await c.request("/api/health");
  check("GET /api/health is 200", health.status === 200);

  const home = await c.request("/");
  check("Landing page serves", home.status === 200);

  const stats = await c.query("publicStats.getStats");
  check("Public stats readable", stats.status === 200 && data(stats) !== undefined);

  const registry = await c.query("publicStats.registrySearch", { page: 1, pageSize: 5 });
  check("Public registry readable", registry.status === 200);

  const verify = await c.query("verify.verifyIrb", { irbNumber: "IRB-NOPE-000000" });
  check("Verify unknown IRB → found:false", verify.status === 200 && data(verify)?.found === false);

  const me = await c.query("auth.me");
  check("auth.me is null for visitor", me.status === 200 && data(me) === null);

  const myApps = await c.query("application.myApplications");
  check("Applications denied (UNAUTHORIZED)", errCode(myApps) === "UNAUTHORIZED");

  const adminApps = await c.query("admin.allApplications");
  check("Admin endpoints denied", errCode(adminApps) === "FORBIDDEN" || errCode(adminApps) === "UNAUTHORIZED");

  const swarm = await c.query("aiSwarm.byApplication", { applicationId: 1 });
  check("AI swarm hidden from visitors", errCode(swarm) === "FORBIDDEN" || errCode(swarm) === "UNAUTHORIZED");

  const ticket = await c.mutate("support.create", {
    name: "Visiting Researcher", email: "visitor@example.org",
    subject: "E2E ping", category: "question", message: "Automated e2e support ticket.",
  });
  check("Support ticket can be filed anonymously", ticket.status === 200 && data(ticket)?.success === true);
}

// ── 2. APPLIER ─────────────────────────────────────────────────────────────
async function applierSuite() {
  console.log("\n── APPLIER (registered user) ──");
  const c = makeClient();
  const email = `applier-${Date.now()}@e2e.local`;

  const reg = await c.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "str0ng-passw0rd!", name: "Dr. E2E Applier" }),
  });
  check("Email/password registration works", reg.status === 200);

  const dupe = await c.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "str0ng-passw0rd!" }),
  });
  check("Duplicate registration rejected (409)", dupe.status === 409);

  const badLogin = await makeClient().request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  check("Wrong password rejected (401)", badLogin.status === 401);

  const fresh = makeClient();
  const login = await fresh.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "str0ng-passw0rd!" }),
  });
  check("Login with correct password works", login.status === 200);

  const me = await fresh.query("auth.me");
  check("auth.me returns the account", data(me)?.email === email);
  check("auth.me does not leak passwordHash", !data(me)?.passwordHash);

  // Application journey
  const created = await fresh.mutate("application.create");
  const appId = data(created)?.id;
  check("Application draft created", typeof appId === "number");

  const decl = await fresh.mutate("application.saveDeclaration", {
    id: appId,
    declarationHonesty: true, declarationNbceCertification: true,
    declarationConsentTruth: true, declarationAcceptPolicy: true,
  });
  check("Declaration saved", data(decl)?.success === true);

  const s1 = await fresh.mutate("application.saveStage1", {
    id: appId,
    researchType: "observational", irbCategory: "expedited",
    researchTitle: "Cross-sectional study of sleep quality among ICU nurses at a tertiary hospital in Riyadh (2026)",
    principalInvestigator: "Dr. E2E Applier, MD",
    piEmail: email, piInstitution: "King Saud University", piDepartment: "Critical Care Nursing",
    fundingSource: "Self-funded", estimatedDuration: "6 months",
  });
  check("Stage 1 saved", data(s1)?.success === true);

  // No LLM key locally → AI review returns the AI_UNAVAILABLE sentinel and
  // must NOT advance or persist a fake score.
  const review1 = await fresh.mutate("application.runStage1Review", { id: appId });
  const r1 = data(review1);
  check("Stage 1 AI outage handled gracefully", review1.status === 200 && (r1?.feedback ?? "").includes("[AI_UNAVAILABLE]"));

  const proceed1 = await fresh.mutate("application.proceedDespiteStage1", {
    id: appId, reason: "E2E: proceeding despite unavailable AI reviewer.",
  });
  check("Proceed-despite Stage 1 works", data(proceed1)?.success === true);

  const s2 = await fresh.mutate("application.saveStage2", {
    id: appId,
    researchObjectives: "Primary: quantify sleep quality (PSQI) among ICU nurses within 6 months.",
    methodology: "Cross-sectional survey using the validated PSQI instrument.",
    sampleSize: "Approximately 250 nurses (95% CI, 5% margin).",
    targetPopulation: "ICU nurses aged 22-60 at KSU Medical City.",
    inclusionCriteria: "1. Registered ICU nurse. 2. ≥6 months tenure.",
    exclusionCriteria: "1. Diagnosed sleep disorder. 2. Night-shift exemption.",
    dataCollectionMethods: "Anonymous online questionnaire over 8 weeks.",
    informedConsentProcess: "Electronic informed consent; voluntary; right to withdraw.",
    riskAssessment: "Minimal risk; psychological discomfort mitigated by skip options.",
    benefitAssessment: "Improved scheduling policy for nurse wellbeing.",
    confidentialityMeasures: "De-identified data, AES-256 at rest, access limited to PI.",
    conflictOfInterest: "None declared.",
  });
  check("Stage 2 saved", data(s2)?.success === true);

  const proceed2 = await fresh.mutate("application.proceedDespiteStage2", {
    id: appId, reason: "E2E: proceeding despite unavailable AI reviewer.",
  });
  check("Proceed-despite Stage 2 works", data(proceed2)?.success === true);

  const submit = await fresh.mutate("application.submit", { id: appId });
  check("Final submission accepted", data(submit)?.success === true);

  const appAfter = await fresh.query("application.getById", { id: appId });
  check("Submission queued for committee (pending_admin with 0 reviewers)",
    ["pending_admin", "under_review"].includes(data(appAfter)?.status), `status=${data(appAfter)?.status}`);

  // Privilege boundaries
  const adminDenied = await fresh.query("admin.allApplications");
  check("Applier denied admin endpoints", errCode(adminDenied) === "FORBIDDEN");
  const swarmDenied = await fresh.mutate("aiSwarm.run", { applicationId: appId });
  check("Applier denied AI swarm", errCode(swarmDenied) === "FORBIDDEN");
  const amOwner = await fresh.query("aiSwarm.amOwner");
  check("Applier amOwner=false", data(amOwner)?.isOwner === false);

  // Cross-tenant: another user must not read this application
  const intruder = makeClient();
  const intruderReg = await intruder.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `intruder-${Date.now()}@e2e.local`, password: "str0ng-passw0rd!" }),
  });
  check("Intruder registration works", intruderReg.status === 200, `status=${intruderReg.status}`);
  const stolen = await intruder.query("application.getById", { id: appId });
  check(
    "Other users cannot read the application",
    errCode(stolen) === "FORBIDDEN" || errCode(stolen) === "NOT_FOUND",
    `code=${errCode(stolen)}`
  );

  const logout = await fresh.mutate("auth.logout");
  check("Logout works", data(logout)?.success === true);
  const meAfter = await fresh.query("auth.me");
  check("Session cleared after logout", data(meAfter) === null);

  return { appId };
}

// ── 3. REVIEWER ────────────────────────────────────────────────────────────
async function reviewerSuite(ownerClient, appId) {
  console.log("\n── REVIEWER (committee member) ──");
  const c = makeClient();
  const email = `reviewer-${Date.now()}@e2e.local`;
  await devLogin(c, { openId: `dev-reviewer-${Date.now()}`, name: "Dr. Reviewer", email });

  const before = await c.query("review.myPendingReviews");
  check("Non-member sees empty review queue", Array.isArray(data(before)) && data(before).length === 0);

  // Owner/admin promotes them to the committee
  const meR = await c.query("auth.me");
  const reviewerUserId = data(meR)?.id;
  const added = await ownerClient.mutate("admin.addCommitteeMember", {
    userId: reviewerUserId, specialization: "Epidemiology", title: "Assoc. Prof.", institution: "KSU",
  });
  check("Admin can add committee member", typeof data(added)?.id === "number");

  // Assign them to the submitted application
  const assigned = await ownerClient.mutate("admin.manualAssign", {
    applicationId: appId, committeeMemberId: data(added).id,
  });
  check("Admin can manually assign reviewer", data(assigned)?.success === true);

  const pending = await c.query("review.myPendingReviews");
  const myReview = (data(pending) ?? []).find(r => r.applicationId === appId);
  check("Reviewer sees assigned review", Boolean(myReview));

  const appView = await c.query("application.getById", { id: appId });
  check("Assigned reviewer can read the application", data(appView)?.id === appId);

  const vote = await c.mutate("review.submitReview", {
    reviewId: myReview?.id, decision: "approved", comments: "Sound minimal-risk protocol. E2E vote.",
  });
  check("Reviewer can vote", data(vote)?.success === true);

  const voteAgain = await c.mutate("review.submitReview", {
    reviewId: myReview?.id, decision: "rejected", comments: "double vote attempt",
  });
  check("Double-voting blocked", errCode(voteAgain) === "BAD_REQUEST");

  const swarmDenied = await c.query("aiSwarm.byApplication", { applicationId: appId });
  check("Reviewer denied AI swarm", errCode(swarmDenied) === "FORBIDDEN");
}

// ── 4. ADMIN (secondary, non-owner) ────────────────────────────────────────
async function adminSuite(ownerClient, appId) {
  console.log("\n── ADMIN (secondary, non-owner) ──");
  const c = makeClient();
  await devLogin(c, { openId: `dev-admin-${Date.now()}`, name: "Secondary Admin", email: `admin2-${Date.now()}@e2e.local` });

  // Promote to admin via the owner
  const meA = await c.query("auth.me");
  const promo = await ownerClient.mutate("admin.updateUserRole", { userId: data(meA)?.id, role: "admin" });
  check("Owner can promote a user to admin", data(promo)?.success === true);

  const apps = await c.query("admin.allApplications");
  check("Admin sees all applications", Array.isArray(data(apps)) && data(apps).some(a => a.id === appId));

  const stats = await c.query("admin.stats");
  check("Admin stats readable", stats.status === 200);

  const audit = await c.query("admin.auditLog");
  check("Audit log readable", Array.isArray(data(audit)));

  // Owner-only surface must stay hidden from secondary admins
  const amOwner = await c.query("aiSwarm.amOwner");
  check("Secondary admin amOwner=false", data(amOwner)?.isOwner === false);
  const swarmRun = await c.mutate("aiSwarm.run", { applicationId: appId });
  check("Secondary admin denied swarm run", errCode(swarmRun) === "FORBIDDEN");
  const swarmList = await c.query("aiSwarm.byApplication", { applicationId: appId });
  check("Secondary admin denied swarm history", errCode(swarmList) === "FORBIDDEN");

  // Final decision — approve, mint IRB number + certificate
  const decision = await c.mutate("admin.finalDecision", {
    applicationId: appId, decision: "approved", notes: "E2E approval.",
  });
  const irbNumber = data(decision)?.irbNumber;
  check("Admin final approval mints IRB number", typeof irbNumber === "string" && irbNumber.length >= 6, JSON.stringify(data(decision) ?? errCode(decision)));

  // Public verification of the freshly approved IRB
  const v = await makeClient().query("verify.verifyIrb", { irbNumber });
  check("Approved IRB publicly verifiable", data(v)?.found === true && data(v)?.retracted === false);
  check("Public verify hides PII (no applicant email/scores)",
    data(v)?.applicantEmail === undefined && data(v)?.stage1AiScore === undefined);

  return { irbNumber };
}

// ── 5. OWNER ───────────────────────────────────────────────────────────────
async function ownerSuite(ownerClient, appId) {
  console.log("\n── OWNER (platform owner) ──");

  const amOwner = await ownerClient.query("aiSwarm.amOwner");
  check("Owner amOwner=true", data(amOwner)?.isOwner === true);

  const history = await ownerClient.query("aiSwarm.byApplication", { applicationId: appId });
  check("Owner can read swarm history", Array.isArray(data(history)));

  // The run is asynchronous (background deliberation): the mutation must
  // return immediately with accepted:true, and the rows must settle into
  // completed/failed. Without an LLM key locally they settle to FAILED
  // (graceful outage) — never a fake verdict, never a 500.
  const run = await ownerClient.mutate("aiSwarm.run", { applicationId: appId });
  const runGroup = data(run)?.runGroup;
  check("Swarm run accepted asynchronously", data(run)?.accepted === true && typeof runGroup === "string");

  let rows = [];
  for (let i = 0; i < 20; i++) {
    const h = await ownerClient.query("aiSwarm.byApplication", { applicationId: appId });
    rows = (data(h) ?? []).filter(r => r.runGroup === runGroup);
    if (rows.length === 2 && rows.every(r => r.status !== "running")) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  check("Swarm run persisted as two panel rows", rows.length === 2, `rows=${rows.length}`);
  check("Panel rows settle (completed/failed, no fake verdicts)",
    rows.every(r => ["completed", "failed"].includes(r.status)),
    JSON.stringify(rows.map(r => ({ status: r.status, verdict: r.verdict }))));

  // The swarm must not have mutated the application status.
  const app = await ownerClient.query("application.getById", { id: appId });
  check("Swarm is advisory — application status untouched", data(app)?.status === "approved", `status=${data(app)?.status}`);

  // Owner protection: cannot demote the owner
  const meO = await ownerClient.query("auth.me");
  check("Owner cannot change own role (guard)", errCode(await ownerClient.mutate("admin.updateUserRole", { userId: data(meO)?.id, role: "user" })) === "BAD_REQUEST");
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`E2E multi-role sweep against ${BASE}`);

  // Wait for server
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
    if (i === 59) { console.error("Server never came up"); process.exit(2); }
  }

  // Owner session used for privileged setup across suites
  const owner = makeClient();
  await devLogin(owner, { openId: "dev-owner-001", name: "Platform Owner", email: "owner@irb-ultimate.local" });

  await visitorSuite();
  const { appId } = await applierSuite();
  await reviewerSuite(owner, appId);
  const { irbNumber } = await adminSuite(owner, appId);
  await ownerSuite(owner, appId);

  console.log(`\n══════════════════════════════════`);
  console.log(`PASSED ${passed} · FAILED ${failed}`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
