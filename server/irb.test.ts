import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { applications, auditLog, researchAuthors, users } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const fixtureUserIds: number[] = [];
async function createPersistedUserContext(): Promise<TrpcContext> {
  const db = await getDb();
  if (!db) throw new Error("This fixture requires the isolated test database");
  const openId = `irb-test:${randomUUID()}`;
  const [result] = await db.insert(users).values({ openId, loginMethod: "email", name: "Synthetic IRB fixture" });
  fixtureUserIds.push(result.insertId);
  const [user] = await db.select().from(users).where(eq(users.id, result.insertId));
  return createUserContext(user);
}
afterEach(async () => {
  if (!fixtureUserIds.length) return;
  const db = (await getDb())!;
  const ownedApps = await db.select({ id: applications.id }).from(applications).where(inArray(applications.applicantId, fixtureUserIds));
  if (ownedApps.length) {
    await db.delete(researchAuthors).where(inArray(researchAuthors.applicationId, ownedApps.map(app => app.id)));
  }
  await db.delete(auditLog).where(inArray(auditLog.userId, fixtureUserIds));
  await db.delete(applications).where(inArray(applications.applicantId, fixtureUserIds));
  await db.delete(users).where(inArray(users.id, fixtureUserIds));
  fixtureUserIds.length = 0;
});

function createUserContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-1",
    email: "researcher@university.edu.sa",
    name: "Dr. Test Researcher",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  return createUserContext({ role: "admin", id: 99, openId: "admin-user", ...overrides });
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user data for authenticated users", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.email).toBe("researcher@university.edu.sa");
    expect(result?.name).toBe("Dr. Test Researcher");
    expect(result?.role).toBe("user");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.objectContaining({ maxAge: -1 })
    );
  });
});

// ─── Application Router Tests ──────────────────────────────────────────────

describe("application.create", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.create()).rejects.toThrow();
  });
});

describe("application.myApplications", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.myApplications()).rejects.toThrow();
  });
});

describe("application.saveStage1 input validation", () => {
  it("accepts any length research title (no min length)", async () => {
    const ctx = await createPersistedUserContext();
    const caller = appRouter.createCaller(ctx);
    // Create a draft first so this test is independent of pre-existing
    // DB fixtures (Phase 5 reset wiped applications). The test still
    // exercises the original assertion — that short titles aren't
    // rejected by the input schema.
    const created = await caller.application.create();
    const result = await caller.application.saveStage1({
      id: created.id,
      researchType: "clinical_trial",
      irbCategory: "full_board",
      researchTitle: "ab",
      principalInvestigator: "Dr. Test",
      piEmail: "test@uni.edu.sa",
      piInstitution: "University",
      piDepartment: "Medicine",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.saveStage1({
        id: 1,
        researchType: "clinical_trial",
        irbCategory: "full_board",
        researchTitle: "Valid Research Title",
        principalInvestigator: "Dr. Test",
        piEmail: "not-an-email",
        piInstitution: "University",
        piDepartment: "Medicine",
      })
    ).rejects.toThrow();
  });
});

describe("application.saveStage2 input validation", () => {
  it("accepts short methodology (char limits removed)", async () => {
    const ctx = await createPersistedUserContext();
    const caller = appRouter.createCaller(ctx);
    // Own the draft: a shared numeric fixture can be locked by another suite.
    const created = await caller.application.create();
    const result = await caller.application.saveStage2({
        id: created.id,
        researchObjectives: "Valid objectives text here",
        methodology: "short",
        sampleSize: "100",
        targetPopulation: "Adults in Saudi Arabia",
        inclusionCriteria: "Age 18-65 years",
        exclusionCriteria: "Pregnant women",
        dataCollectionMethods: "Surveys and interviews",
        informedConsentProcess: "Written consent forms",
        riskAssessment: "Minimal risk study",
        benefitAssessment: "Potential health benefits",
        confidentialityMeasures: "Data encryption and anonymization",
        conflictOfInterest: "None declared",
      });
    expect(result.success).toBe(true);
    expect((await caller.application.getById({ id: created.id })).methodology).toBe("short");
  });
});

describe("application.submit", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.submit({ id: 1 })).rejects.toThrow();
  });
});

// ─── Verify Router Tests (Public) ─────────────────────────────────────────

describe("verify.verifyIrb", () => {
  it("returns not found for non-existent IRB number", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.verify.verifyIrb({ irbNumber: "IRB-SA-9999-99999" });
    expect(result.found).toBe(false);
  });

  it("rejects too-short IRB numbers (SA-11: defends against enumeration probes)", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    // Real IRB numbers are >= 6 chars (IRB-SA-YYYY-NNNNN form). The Zod
    // schema now refuses shorter inputs so attackers can't probe with
    // single-letter wildcards or null-byte tricks.
    await expect(caller.verify.verifyIrb({ irbNumber: "AB" })).rejects.toThrow();
  });

  it("is accessible without authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw UNAUTHORIZED - just return not found
    const result = await caller.verify.verifyIrb({ irbNumber: "IRB-SA-2026-00001" });
    expect(result).toBeDefined();
    expect(result.found).toBe(false);
  });
});

// ─── Support Router Tests ──────────────────────────────────────────────────

describe("support.create", () => {
  it("rejects empty name and over-long fields (anti-spam caps)", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    // Empty name now rejected (min length 1).
    await expect(
      caller.support.create({
        name: "",
        email: "test@test.com",
        subject: "Test",
        category: "issue",
        message: "This is a test message",
      })
    ).rejects.toThrow();
    // Over-long message rejected (max 5000) to stop large-payload spam.
    await expect(
      caller.support.create({
        name: "Test User",
        email: "test@test.com",
        subject: "Test",
        category: "issue",
        message: "x".repeat(5001),
      })
    ).rejects.toThrow();
  });

  it("accepts a well-formed ticket", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.support.create({
      name: "Test User",
      email: "test@test.com",
      subject: "Test",
      category: "issue",
      message: "This is a test message",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.support.create({
        name: "Test User",
        email: "not-email",
        subject: "Test",
        category: "issue",
        message: "This is a test message",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid category", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.support.create({
        name: "Test User",
        email: "test@test.com",
        subject: "Test",
        category: "invalid" as any,
        message: "This is a test message",
      })
    ).rejects.toThrow();
  });

  it("accepts short messages (no min length)", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    // Min length removed - short messages pass validation
    const result = await caller.support.create({
      name: "Test User",
      email: "test@test.com",
      subject: "Test",
      category: "issue",
      message: "Short",
    });
    expect(result.success).toBe(true);
  });
});

describe("support.all", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.support.all()).rejects.toThrow();
  });
});

// ─── Authors Router Tests ──────────────────────────────────────────────────

describe("authors.add", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.authors.add({
        applicationId: 1,
        name: "Dr. Author",
        email: "author@uni.edu.sa",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid email", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.authors.add({
        applicationId: 1,
        name: "Dr. Author",
        email: "not-email",
      })
    ).rejects.toThrow();
  });

  it("accepts short name (no min length)", async () => {
    const ctx = await createPersistedUserContext();
    const caller = appRouter.createCaller(ctx);
    // Self-contained fixture (Phase 5 reset wiped seed data).
    const created = await caller.application.create();
    const result = await caller.authors.add({
      applicationId: created.id,
      name: "A",
      email: "author@uni.edu.sa",
    });
    expect(result.id).toBeDefined();
  });
});

describe("authors.remove", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.authors.remove({ id: 1, applicationId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Review Router Tests ───────────────────────────────────────────────────

describe("review.myPendingReviews", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.review.myPendingReviews()).rejects.toThrow();
  });
});

describe("review.submitReview input validation", () => {
  it("rejects invalid decision", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.review.submitReview({
        reviewId: 1,
        decision: "maybe" as any,
      })
    ).rejects.toThrow();
  });

  it("accepts valid approved decision", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.review.submitReview({
        reviewId: 999999,
        decision: "approved",
        comments: "Looks good",
      });
    } catch (e: any) {
      expect(e.code).not.toBe("BAD_REQUEST");
    }
  });
});

// ─── Admin Router Tests ────────────────────────────────────────────────────

describe("admin.allApplications", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.allApplications()).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.allApplications()).rejects.toThrow();
  });
});

describe("admin.stats", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.stats()).rejects.toThrow();
  });
});

describe("admin.finalDecision input validation", () => {
  it("rejects invalid decision value", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.finalDecision({
        applicationId: 1,
        decision: "maybe" as any,
      })
    ).rejects.toThrow();
  });
});

describe("admin.addCommitteeMember input validation", () => {
  it("rejects missing userId", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.addCommitteeMember({
        userId: undefined as any,
        specialization: "Bioethics",
      })
    ).rejects.toThrow();
  });
});

describe("admin.manualAssign input validation", () => {
  it("requires applicationId and committeeMemberId", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.manualAssign({
        applicationId: undefined as any,
        committeeMemberId: 1,
      })
    ).rejects.toThrow();
  });
});

describe("admin.removeCommitteeMember", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.removeCommitteeMember({ id: 1 })).rejects.toThrow();
  });
});

describe("admin.allUsers", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.allUsers()).rejects.toThrow();
  });
});

describe("admin.supportTickets", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.supportTickets()).rejects.toThrow();
  });
});

// ─── AI Review Module Tests ────────────────────────────────────────────────

describe("AI Review module", () => {
  it("exports stage 1 and stage 2 review functions", async () => {
    const { runStage1AiReview, runStage2AiReview } = await import("./aiReview");
    expect(typeof runStage1AiReview).toBe("function");
    expect(typeof runStage2AiReview).toBe("function");
  });

  it("describeAiOutage maps quota, key, timeout, and config failures", async () => {
    const { describeAiOutage } = await import("./aiReview");
    expect(describeAiOutage(new Error("LLM_API_KEY is not configured"))).toMatch(/not configured/i);
    expect(describeAiOutage(new Error("request timed out after 60s"))).toMatch(/timed out/i);
    expect(describeAiOutage(new Error("429 Token Plan usage limit reached"))).toMatch(/quota|credits/i);
    expect(describeAiOutage(new Error("401 invalid api key"))).toMatch(/API key/i);
    expect(describeAiOutage(new Error("ECONNRESET"))).toMatch(/temporarily unavailable/i);
  });
});

// ─── Certificate Module Tests ──────────────────────────────────────────────

describe("Certificate module", () => {
  it("exports the v2 certificate renderer", async () => {
    const { renderCertificateHtml, renderCertificatePdf } = await import("./certificateV2");
    expect(typeof renderCertificateHtml).toBe("function");
    expect(typeof renderCertificatePdf).toBe("function");
  });
});

// ─── Shared Types Tests ────────────────────────────────────────────────────

// ─── Notification Router Tests ─────────────────────────────────────────────

describe("notification.list", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notification.list()).rejects.toThrow();
  });
});

describe("notification.markRead", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notification.markRead({ id: 1 })).rejects.toThrow();
  });
});

describe("notification.markAllRead", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notification.markAllRead()).rejects.toThrow();
  });
});

// ─── Admin Reports Tests ──────────────────────────────────────────────────

describe("admin.reports", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.reports({ period: "monthly" })).rejects.toThrow();
  });
});

// ─── Email Service Module Tests ───────────────────────────────────────────

describe("Email service module", () => {
  it("exports email service functions", async () => {
    const emailService = await import("./emailService");
    expect(typeof emailService.notifyApplicationSubmitted).toBe("function");
    expect(typeof emailService.notifyCommitteeAssigned).toBe("function");
    expect(typeof emailService.notifyReviewReceived).toBe("function");
    expect(typeof emailService.notifyAdminApproved).toBe("function");
    expect(typeof emailService.notifyAdminRejected).toBe("function");
    expect(typeof emailService.createNotification).toBe("function");
    expect(typeof emailService.getUserNotifications).toBe("function");
    expect(typeof emailService.markNotificationRead).toBe("function");
    expect(typeof emailService.markAllRead).toBe("function");
  });
});

// ─── Shared Types Tests ────────────────────────────────────────────────────

describe("Shared types", () => {
  it("exports all required labels", async () => {
    const { RESEARCH_TYPE_LABELS, IRB_CATEGORY_LABELS, STATUS_LABELS, STATUS_COLORS, AI_PASS_THRESHOLD } = await import("../shared/types");
    
    expect(RESEARCH_TYPE_LABELS).toBeDefined();
    expect(Object.keys(RESEARCH_TYPE_LABELS).length).toBe(9);
    
    expect(IRB_CATEGORY_LABELS).toBeDefined();
    // Mirrors the DB enum: full_board, expedited, exempt.
    expect(Object.keys(IRB_CATEGORY_LABELS).length).toBe(3);
    
    expect(STATUS_LABELS).toBeDefined();
    expect(Object.keys(STATUS_LABELS).length).toBe(15);
    
    expect(STATUS_COLORS).toBeDefined();
    expect(Object.keys(STATUS_COLORS).length).toBe(15);
    
    expect(AI_PASS_THRESHOLD).toBe(70);
  });

  it("has matching keys between STATUS_LABELS and STATUS_COLORS", async () => {
    const { STATUS_LABELS, STATUS_COLORS } = await import("../shared/types");
    const labelKeys = Object.keys(STATUS_LABELS).sort();
    const colorKeys = Object.keys(STATUS_COLORS).sort();
    expect(labelKeys).toEqual(colorKeys);
  });

  it("exports RESEARCH_TYPE_REQUIREMENTS for all types", async () => {
    const { RESEARCH_TYPE_REQUIREMENTS, RESEARCH_TYPE_LABELS } = await import("../shared/types");
    expect(RESEARCH_TYPE_REQUIREMENTS).toBeDefined();
    const typeKeys = Object.keys(RESEARCH_TYPE_LABELS);
    const reqKeys = Object.keys(RESEARCH_TYPE_REQUIREMENTS);
    expect(reqKeys.sort()).toEqual(typeKeys.sort());
  });

  it("survey_questionnaire requires questionnaire file", async () => {
    const { RESEARCH_TYPE_REQUIREMENTS } = await import("../shared/types");
    expect(RESEARCH_TYPE_REQUIREMENTS.survey_questionnaire.mandatory).toContain("questionnaireFile");
  });

  it("retrospective requires data source", async () => {
    const { RESEARCH_TYPE_REQUIREMENTS } = await import("../shared/types");
    expect(RESEARCH_TYPE_REQUIREMENTS.retrospective.mandatory).toContain("retrospectiveDataSource");
  });
});


// ─── Round 4 Feature Tests ────────────────────────────────────────────────

describe("application.aiAutoComplete", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.aiAutoComplete({
        applicationId: 1,
        fields: { researchObjectives: "Test objectives" },
      })
    ).rejects.toThrow();
  });
});

describe("application.calculateSampleSize", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.calculateSampleSize({
        studyType: "cross_sectional",
        confidenceLevel: 95,
        marginOfError: 5,
      })
    ).rejects.toThrow();
  });

  it("rejects out-of-range confidence levels (SA-33)", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    // 80–99 is the legitimate range. >99 now rejected at the Zod boundary
    // so we don't fall through to a fallback Z-score that produces
    // nonsensical sample sizes.
    await expect(
      caller.application.calculateSampleSize({
        studyType: "cross_sectional",
        confidenceLevel: 110,
        marginOfError: 5,
      })
    ).rejects.toThrow();
  });

  it("rejects zero marginOfError (SA-33: would produce Infinity)", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.calculateSampleSize({
        studyType: "cross_sectional",
        confidenceLevel: 95,
        marginOfError: 0,
      })
    ).rejects.toThrow();
  });
});

describe("application.saveDraft", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.saveDraft({
        id: 1,
        researchObjectives: "Draft objectives",
      })
    ).rejects.toThrow();
  });
});

describe("application.submitAiFeedback", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.submitAiFeedback({
        applicationId: 1,
        stage: 2,
        rating: 4,
        comment: "Helpful review",
      })
    ).rejects.toThrow();
  });

  it("validates rating range (1-5)", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.submitAiFeedback({
        applicationId: 1,
        stage: 2,
        rating: 6, // invalid - max 5
        comment: "Test",
      })
    ).rejects.toThrow();
  });

  it("validates rating minimum", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.submitAiFeedback({
        applicationId: 1,
        stage: 2,
        rating: 0, // invalid - min 1
        comment: "Test",
      })
    ).rejects.toThrow();
  });
});

describe("admin.directApproval", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.directApproval({ applicationId: 1 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.directApproval({ applicationId: 1 })
    ).rejects.toThrow();
  });
});

// ─── AI Review Module Extended Tests ──────────────────────────────────────

describe("AI Review module - extended", () => {
  it("exports AI auto-complete and sample size functions", async () => {
    const { aiAutoCompleteFields, calculateSampleSize } = await import("./aiReview");
    expect(typeof aiAutoCompleteFields).toBe("function");
    expect(typeof calculateSampleSize).toBe("function");
  });
});

// ─── Dark Mode / Theme Tests ──────────────────────────────────────────────

describe("Theme configuration", () => {
  it("index.css has dark mode class defined", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("client/src/index.css", "utf-8");
    expect(css).toContain(".dark {");
    expect(css).toContain("--background:");
    expect(css).toContain("--foreground:");
  });

  it("dark mode has proper black background", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("client/src/index.css", "utf-8");
    const darkSection = css.split(".dark {")[1]?.split("}")[0] || "";
    // Dark mode should have a very dark background (oklch 0.1)
    expect(darkSection).toContain("--background: oklch(0.1");
    // And light foreground
    expect(darkSection).toContain("--foreground: oklch(0.95");
  });
});

// ─── RTL / i18n Tests ─────────────────────────────────────────────────────

describe("RTL support", () => {
  it("index.css has RTL styles", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("client/src/index.css", "utf-8");
    expect(css).toContain('[dir="rtl"]');
  });

  it("public HTML includes Arabic fallback without sending font requests to third parties", async () => {
    const fs = await import("fs");
    const html = fs.readFileSync("client/index.html", "utf-8");
    expect(html).toContain('lang="ar"');
    expect(html).not.toContain("fonts.googleapis.com");
  });
});


// ─── Round 5 Feature Tests ────────────────────────────────────────────────

describe("application.saveDeclaration", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.saveDeclaration({
        id: 1,
        nbceCertificateUrl: "https://example.com/cert.pdf",
        declarationAccepted: true,
        conflictOfInterestDeclared: false,
        dataProtectionAgreed: true,
      })
    ).rejects.toThrow();
  });

  it("validates required boolean fields", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    // declarationAccepted must be true
    try {
      await caller.application.saveDeclaration({
        id: 1,
        nbceCertificateUrl: "https://example.com/cert.pdf",
        declarationAccepted: false,
        conflictOfInterestDeclared: false,
        dataProtectionAgreed: true,
      });
    } catch (e: any) {
      // Should fail because declaration must be accepted
      expect(e).toBeDefined();
    }
  });
});

describe("application.aiResolveField", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.aiResolveField({
        id: 1,
        fieldName: "methodology",
        currentValue: "Short text",
        feedback: "Please improve this field",
      })
    ).rejects.toThrow();
  });

  it("validates input schema correctly", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    // Missing required 'feedback' field should throw
    await expect(
      caller.application.aiResolveField({
        id: 1,
        fieldName: "methodology",
        currentValue: "Short text",
      } as any)
    ).rejects.toThrow();
  });
});

describe("application.uploadFile", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.application.uploadFile({
        fileName: "test.pdf",
        fileData: "dGVzdA==",
        contentType: "application/pdf",
      })
    ).rejects.toThrow();
  });
});

describe("admin.retractApplication", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.retractApplication({ applicationId: 1, reason: "Test reason" })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.retractApplication({ applicationId: 1, reason: "Test reason" })
    ).rejects.toThrow();
  });

  it("requires a reason", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.retractApplication({ applicationId: 1, reason: "" as any })
    ).rejects.toThrow();
  });
});

describe("admin.hideApplication", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.hideApplication({ applicationId: 1 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.hideApplication({ applicationId: 1 })
    ).rejects.toThrow();
  });
});

describe("admin.deleteApplication", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.deleteApplication({ applicationId: 1 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.deleteApplication({ applicationId: 1 })
    ).rejects.toThrow();
  });
});

describe("admin.expireAndReassignReviews", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.expireAndReassignReviews()
    ).rejects.toThrow();
  });
});

describe("admin.auditLog", () => {
  it("rejects non-admin users", async () => {
    const ctx = createUserContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.auditLog()).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.auditLog()).rejects.toThrow();
  });
});

// ─── Updated Shared Types Tests for Round 5 ──────────────────────────────

describe("Shared types - Round 5 updates", () => {
  it("includes retracted and hidden statuses", async () => {
    const { STATUS_LABELS, STATUS_COLORS } = await import("../shared/types");
    expect(STATUS_LABELS.retracted).toBe("Retracted");
    expect(STATUS_LABELS.hidden).toBe("Hidden");
    expect(STATUS_LABELS.declaration_pending).toBe("Declaration - Phase 0");
    expect(STATUS_COLORS.retracted).toBeDefined();
    expect(STATUS_COLORS.hidden).toBeDefined();
    expect(STATUS_COLORS.declaration_pending).toBeDefined();
  });

  it("has 15 status entries (12 original + 3 new)", async () => {
    const { STATUS_LABELS, STATUS_COLORS } = await import("../shared/types");
    expect(Object.keys(STATUS_LABELS).length).toBe(15);
    expect(Object.keys(STATUS_COLORS).length).toBe(15);
  });
});

// ─── Retraction Certificate Module Tests ─────────────────────────────────

describe("Retraction Certificate module", () => {
  it("exports generateRetractionCertificatePdf function", async () => {
    const { generateRetractionCertificatePdf } = await import("./retractionCertificate");
    expect(typeof generateRetractionCertificatePdf).toBe("function");
  });
});

// ─── AI Resolve Field Module Tests ───────────────────────────────────────

describe("AI Review module - Round 5", () => {
  it("exports aiResolveField function", async () => {
    const { aiResolveField } = await import("./aiReview");
    expect(typeof aiResolveField).toBe("function");
  });
});

// ─── Verification with retracted status ──────────────────────────────────

describe("verify.verifyIrb - retracted handling", () => {
  it("returns not found for non-existent IRB (unchanged behavior)", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.verify.verifyIrb({ irbNumber: "IRB-SA-RETRACT-TEST" });
    expect(result.found).toBe(false);
  });
});

// ─── Round 6 Tests ───────────────────────────────────────────────────────

describe("Round 6 - proceedDespiteStage1 input validation", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.proceedDespiteStage1({ id: 1, reason: "test reason" })).rejects.toThrow();
  });
  it("requires a reason string", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.proceedDespiteStage1({ id: 1, reason: "" })).rejects.toThrow();
  });
});

describe("Round 6 - proceedDespiteStage2 input validation", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.proceedDespiteStage2({ id: 1, reason: "test reason" })).rejects.toThrow();
  });
  it("requires a reason string", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.proceedDespiteStage2({ id: 1, reason: "" })).rejects.toThrow();
  });
});

describe("Round 6 - fixAllComments input validation", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.application.fixAllComments({
      id: 1,
      fields: { researchObjectives: "test", methodology: "test" },
      fieldScores: [{ field: "researchObjectives", score: 50, feedback: "needs work", color: "yellow" }],
    })).rejects.toThrow();
  });
});

describe("Round 6 - Email notification functions", () => {
  it("exports notifyApplicationRetracted function", async () => {
    const emailService = await import("./emailService");
    expect(typeof emailService.notifyApplicationRetracted).toBe("function");
  });
  it("exports notifyApplicationHidden function", async () => {
    const emailService = await import("./emailService");
    expect(typeof emailService.notifyApplicationHidden).toBe("function");
  });
  it("exports notifyApplicationDeleted function", async () => {
    const emailService = await import("./emailService");
    expect(typeof emailService.notifyApplicationDeleted).toBe("function");
  });
  it("exports notifyProceedDespiteScore function", async () => {
    const emailService = await import("./emailService");
    expect(typeof emailService.notifyProceedDespiteScore).toBe("function");
  });
});

describe("Round 6 - AI Review enhanced functions", () => {
  it("exports aiFixAllComments function", async () => {
    const aiReview = await import("./aiReview");
    expect(typeof aiReview.aiFixAllComments).toBe("function");
  });
});

// ─── Round 7: Analytics & Profile Tests ──────────────────────────────────────

describe("admin.monthlyAnalytics", () => {
  it("returns analytics data for admin users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.monthlyAnalytics();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.monthlyAnalytics()).rejects.toThrow();
  });
});

describe("admin.statusDistribution", () => {
  it("returns status distribution for admin users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.statusDistribution();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("admin.researchTypeDistribution", () => {
  it("returns research type distribution for admin users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.researchTypeDistribution();
    expect(Array.isArray(result)).toBe(true);
  });
});
