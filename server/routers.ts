import { safeLogError } from "./_core/safeLog";
import { randomBytes } from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, staffProcedure, adminProcedure, aiProcedure, ownerProcedure, isPlatformOwner, router } from "./_core/trpc";
import { assertStaffMfa } from "./_core/staffAuth";
import { inspectLlmBudget, reserveLlmCall } from "./_core/budget";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { runStage1AiReview, runStage2AiReview, aiAutoCompleteFields, aiResolveField, aiFixAllComments, calculateSampleSize, aiEnhanceStage1Fields } from "./aiReview";
import { runSwarmPanel, SWARM_LLM_CALLS_PER_RUN } from "./aiSwarmReview";
import { generateAndStoreCertificatePdf } from "./certificateV2";
import { generateRetractionCertificatePdf } from "./retractionCertificate";
import { notifyOwner } from "./_core/notification";
import { runAcceleratedPipeline } from "./services/acceleratedReview.pipeline";
import { chatApplicationTurn } from "./services/chatApplication.service";
import { IRB_REQUIREMENTS } from "./services/irb.validation";
import { storagePut } from "./storage";
import { scanUploadedFile } from "./services/uploadScanner";
import { assertUploadArchiveSafe } from "./services/uploadArchiveGuard";
import * as emailService from "./emailService";
import { searchLiterature } from "./literature";
import {
  classifyUa,
  requestIpHash,
  resolveCoarseGeo,
  stripPath,
} from "./_core/analyticsGeo";
import { CERT_DOWNLOAD_TTL_SEC } from "@shared/const";


// ─── Shared access helpers ──────────────────────────────────────────────────
// Returns the application if the caller may view it (owner, admin, or
// committee member assigned to this specific application). Throws 404 if
// the app is missing and 403 otherwise. Centralised so committee member
// access cannot accidentally degrade to "any committee member sees any app".
async function loadApplicationForViewer(ctx: { user: { id: number; role: string; authLevel?: string } }, applicationId: number) {
  const app = await db.getApplicationById(applicationId);
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
  if (app.applicantId === ctx.user.id) return app;
  assertStaffMfa(ctx.user);
  if (ctx.user.role === "admin") return app;
  const member = await db.getCommitteeMemberByUserId(ctx.user.id);
  if (member?.isActive && member.appointedAt && member.qualificationReference) {
    const reviews = await db.getReviewsByApplication(applicationId);
    if (reviews.some(r => r.committeeMemberId === member.id && r.status !== "expired" && r.expiresAt.getTime() > Date.now())) return app;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

// SA-04: URL fields submitted by applicants must be limited to safe shapes.
// We accept:
//   - server-relative /uploads/... or /api/... keys
//   - absolute http:// or https:// links (http kept for dev/localhost; in
//     prod the CSP + httpOnly cookies block any active-content abuse)
// Reject javascript:, data:, file:, vbscript:, blob:, plus control chars
// (newlines / NULs) that header-inject. URL parser does the heavy lifting
// so we don't have to maintain a fragile regex.
const uploadedUrl = z
  .string()
  .max(2048)
  .refine(s => {
    if (!s) return true;
    // Reject control chars (NUL / tab / newlines / DEL) — used for
    // header-injection and log poisoning. Codepoint scan instead of a
    // regex so the source file stays ASCII-clean.
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x20 || c === 0x7f) return false;
    }
    // Server-relative paths.
    if (s.startsWith("/uploads/") || s.startsWith("/api/")) return true;
    // Anything else must parse as a URL with an http(s) protocol + host.
    try {
      const u = new URL(s);
      return (u.protocol === "http:" || u.protocol === "https:") && !!u.host;
    } catch {
      return false;
    }
  }, { message: "URL must be a /uploads/ path or http(s):// link" });

async function assertOwnedUploadReferences(userId: number, applicationId: number, urls: Array<string | undefined>) {
  for (const url of urls.filter((value): value is string => Boolean(value))) {
    const file = await db.getFileUploadByUrl(url);
    if (!file || file.userId !== userId || (file.applicationId !== null && file.applicationId !== applicationId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Documents must be uploaded through this account for this application." });
    }
    if (file.applicationId === null && !(await db.bindOwnedUpload(file.id, userId, applicationId))) throw new TRPCError({ code: "CONFLICT", message: "Document was attached to another application. Upload it again for this application." });
  }
}

function supplementaryUploadUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = z.array(z.object({ name: z.string().max(512), url: uploadedUrl })).max(25).parse(JSON.parse(raw));
    return parsed.map(file => file.url);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Supplementary documents must be a valid list of uploaded files." });
  }
}

// Statuses where the applicant must not be able to silently re-write
// answers (would otherwise corrupt the submission already in the
// reviewer / admin pipeline, or undo a terminal decision).
const APPLICANT_EDIT_LOCKED_STATUSES = new Set([
  "submitted",
  "under_review",
  "pending_admin",
  "approved",
  "rejected",
  "permanently_rejected",
  "retracted",
  "hidden",
]);

function assertApplicantCanEdit(app: { status: string }): void {
  if (APPLICANT_EDIT_LOCKED_STATUSES.has(app.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This application can no longer be edited at this stage.",
    });
  }
}

// File upload limits
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file
const UPLOAD_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const UPLOAD_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"], "image/webp": ["webp"], "text/plain": ["txt"], "text/csv": ["csv"],
  "application/msword": ["doc"], "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};
const FILENAME_SAFE_RE = /[^A-Za-z0-9._-]+/g;
function sanitizeUploadFileName(input: string): string {
  const sanitized = input.trim().replace(FILENAME_SAFE_RE, "_").replace(/^[_\.]+/, "");
  if (sanitized.length <= 160) return sanitized || "file";
  const dot = sanitized.lastIndexOf(".");
  const extension = dot > 0 ? sanitized.slice(dot) : "";
  return sanitized.slice(0, 160 - extension.length) + extension;
}

// SA-27: magic-byte validation — the declared Content-Type is attacker
// controlled, so verify the actual file signature before storing. Text
// types have no signature; for those we reject NUL bytes (binary smuggled
// as text) and leading active-content markers.
function matchesMagicBytes(buffer: Buffer, contentType: string): boolean {
  const startsWith = (sig: number[], offset = 0) =>
    buffer.length >= offset + sig.length &&
    sig.every((b, i) => buffer[offset + i] === b);

  switch (contentType) {
    case "application/pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith([0x47, 0x49, 0x46, 0x38]); // GIF8
    case "image/webp":
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8); // RIFF….WEBP
    case "application/msword":
    case "application/vnd.ms-excel":
      // Legacy OLE compound file
      return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // OOXML = ZIP container
      return startsWith([0x50, 0x4b, 0x03, 0x04]);
    case "text/plain":
    case "text/csv": {
      const head = buffer.subarray(0, Math.min(buffer.length, 8192));
      if (head.includes(0)) return false; // binary payload disguised as text
      const lead = head.toString("utf8", 0, Math.min(head.length, 256)).trimStart().toLowerCase();
      return !lead.startsWith("<!doctype") && !lead.startsWith("<html") &&
        !lead.startsWith("<script") && !lead.startsWith("<svg") && !lead.startsWith("<?xml");
    }
    default:
      return false;
  }
}

// Cap co-investigators per application — unbounded rows are a storage /
// export-bloat vector, and no legitimate study lists more than this.
const MAX_AUTHORS_PER_APPLICATION = 25;

// ─── Application Router ─────────────────────────────────────────────────────

const applicationRouter = router({
  create: protectedProcedure
    .input(z.object({
      intakeChannel: z.enum(["traditional", "chatbot"]).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
    // Cap open drafts per user so a script can't insert unbounded
    // applications + audit rows (the general limiter alone allows ~200/min).
    const MAX_OPEN_DRAFTS = parseInt(process.env.MAX_OPEN_DRAFTS_PER_USER ?? "25", 10);
    const mine = await db.getApplicationsByApplicant(ctx.user.id);
    const openDrafts = mine.filter(a =>
      ["draft", "declaration_pending", "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed"].includes(a.status),
    ).length;
    if (openDrafts >= MAX_OPEN_DRAFTS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You have ${openDrafts} unfinished applications. Please submit or delete some before starting a new one.`,
      });
    }
    const intakeChannel = input?.intakeChannel === "chatbot" ? "chatbot" : "traditional";
    const id = await db.createApplication({
      applicantId: ctx.user.id,
      status: "draft",
      intakeChannel,
    });
    await db.addAuditLog({
      applicationId: id,
      userId: ctx.user.id,
      action: "application_created",
      details: intakeChannel === "chatbot" ? "New chatbot application draft created" : "New application draft created",
    });
    return { id };
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const app = await loadApplicationForViewer(ctx, input.id);
      const applicant = await db.getUserById(app.applicantId);
      const authors = await db.getAuthorsByApplication(input.id);
      return { ...app, applicantName: applicant?.name, applicantEmail: applicant?.email, authors };
    }),

  myApplications: protectedProcedure.query(async ({ ctx }) => {
    return db.getApplicationsByApplicant(ctx.user.id);
  }),

  // Alias for older SPA builds / fallbacks when chatApplication.* is missing.
  sendChatMessage: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })).max(16),
      lang: z.enum(["ar", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return chatApplicationTurn({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        messages: input.messages,
        langHint: input.lang,
      });
    }),

  // Phase 0: Save Declaration
  saveDeclaration: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      declarationHonesty: z.boolean(),
      declarationNbceCertification: z.boolean(),
      declarationConsentTruth: z.boolean(),
      declarationAcceptPolicy: z.boolean(),
      nbceCertificateUrl: uploadedUrl.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);
      await assertOwnedUploadReferences(ctx.user.id, input.id, [input.nbceCertificateUrl]);

      // All declarations must be true
      if (!input.declarationHonesty || !input.declarationNbceCertification || !input.declarationConsentTruth || !input.declarationAcceptPolicy) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All declarations must be accepted to proceed" });
      }

      // Don't regress the application to "declaration_pending" if it has
      // already moved past Phase 0 — preserves the in-flight workflow.
      const shouldRegressStatus = app.status === "draft" || app.status === "declaration_pending";
      await db.updateEditableApplication(input.id, ctx.user.id, {
        declarationHonesty: input.declarationHonesty,
        declarationNbceCertification: input.declarationNbceCertification,
        declarationConsentTruth: input.declarationConsentTruth,
        declarationAcceptPolicy: input.declarationAcceptPolicy,
        nbceCertificateUrl: input.nbceCertificateUrl || null,
        declarationCompletedAt: new Date(),
        ...(shouldRegressStatus ? { status: "declaration_pending" as const } : {}),
      }, app);

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "declaration_completed",
        details: "Phase 0 declaration of honesty and consent completed",
      });

      return { success: true };
    }),

  // Stage 1: Save research type info with research-type-specific fields
  saveStage1: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      researchType: z.enum(IRB_REQUIREMENTS.studyTypes),
      irbCategory: z.enum(IRB_REQUIREMENTS.irbCategories),
      researchTitle: z.string().trim().min(1).max(2000),
      principalInvestigator: z.string().max(255),
      piEmail: z.string().email(),
      piInstitution: z.string().max(255),
      piDepartment: z.string().max(255),
      fundingSource: z.string().max(255).optional(),
      estimatedDuration: z.string().max(128).optional(),
      questionnaireFileUrl: uploadedUrl.optional(),
      retrospectiveDataSource: z.string().max(20_000).optional(),
      clinicalTrialDetails: z.string().max(20_000).optional(),
      supplementaryFilesJson: z.string().max(20_000).optional(),
      labHeadApproval: z.boolean().optional(),
      labHeadName: z.string().max(255).optional(),
      labHeadEmail: z.string().max(320).optional(),
      labHeadPhone: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);
      await assertOwnedUploadReferences(ctx.user.id, input.id, [input.questionnaireFileUrl, ...supplementaryUploadUrls(input.supplementaryFilesJson)]);

      if (input.researchType === "survey_questionnaire" && !input.questionnaireFileUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Questionnaire file is required for Survey/Questionnaire research type" });
      }
      if (input.researchType === "retrospective" && !input.retrospectiveDataSource) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data source is required for Retrospective Study research type" });
      }

      await db.updateEditableApplication(input.id, ctx.user.id, {
        researchType: input.researchType as any,
        irbCategory: input.irbCategory as any,
        researchTitle: input.researchTitle,
        principalInvestigator: input.principalInvestigator,
        piEmail: input.piEmail,
        piInstitution: input.piInstitution,
        piDepartment: input.piDepartment,
        fundingSource: input.fundingSource || null,
        estimatedDuration: input.estimatedDuration || null,
        questionnaireFileUrl: input.questionnaireFileUrl || null,
        retrospectiveDataSource: input.retrospectiveDataSource || null,
        clinicalTrialDetails: input.clinicalTrialDetails || null,
        supplementaryFilesJson: input.supplementaryFilesJson || null,
        labHeadApproval: input.labHeadApproval ?? null,
        labHeadName: input.labHeadName || null,
        labHeadEmail: input.labHeadEmail || null,
        labHeadPhone: input.labHeadPhone || null,
        // Only seed the status when the app is still in early stages;
        // otherwise leave the existing status intact so we don't drop a
        // pass back to "pending".
        ...((app.status === "draft" || app.status === "declaration_pending" || app.status === "stage1_pending" || app.status === "stage1_failed")
          ? { status: "stage1_pending" as const }
          : {}),
      }, app);

      return { success: true };
    }),

  // Run AI review for Stage 1 — SA-03: reserved against per-user daily budget.
  runStage1Review: aiProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const result = await runStage1AiReview({
        researchType: app.researchType || "",
        irbCategory: app.irbCategory || "",
        researchTitle: app.researchTitle || "",
        principalInvestigator: app.principalInvestigator || "",
        piInstitution: app.piInstitution || "",
        piDepartment: app.piDepartment || "",
        fundingSource: app.fundingSource || "",
        estimatedDuration: app.estimatedDuration || "",
      });

      // When the AI provider is unreachable the helper returns a sentinel
      // score of 0 with a "[AI_UNAVAILABLE]" feedback line. We must NOT
      // overwrite the applicant's prior valid score with that — surface
      // the outage in-memory only and leave the DB alone.
      const isAiUnavailable = typeof result.feedback === "string"
        && result.feedback.startsWith("[AI_UNAVAILABLE]");

      if (!isAiUnavailable) {
        await db.updateEditableApplication(input.id, ctx.user.id, {
          stage1AiScore: result.score,
          stage1AiFeedback: JSON.stringify({
            feedback: result.feedback,
            recommendations: result.recommendations,
            fieldScores: result.fieldScores,
            hasRedFlags: result.hasRedFlags,
          }),
          stage1Passed: result.passed,
          status: result.passed ? "stage2_pending" : "stage1_failed",
        }, app);

        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage1_ai_review",
          details: `Score: ${result.score}/100 - ${result.passed ? "PASSED" : "FAILED"}${result.hasRedFlags ? " (RED FLAGS)" : ""}`,
        });

        try {
          await emailService.notifyAiReviewResult(ctx.user.id, input.id, 1, result.passed, result.score);
        } catch (e) { /* best-effort */ }
      } else {
        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage1_ai_review_unavailable",
          details: "AI provider unreachable — prior review preserved.",
        });
      }

      return result;
    }),

  // Save draft (auto-save)
  saveDraft: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      researchObjectives: z.string().max(20_000).optional(),
      methodology: z.string().max(20_000).optional(),
      sampleSize: z.string().max(20_000).optional(),
      targetPopulation: z.string().max(20_000).optional(),
      inclusionCriteria: z.string().max(20_000).optional(),
      exclusionCriteria: z.string().max(20_000).optional(),
      dataCollectionMethods: z.string().max(20_000).optional(),
      informedConsentProcess: z.string().max(20_000).optional(),
      riskAssessment: z.string().max(20_000).optional(),
      benefitAssessment: z.string().max(20_000).optional(),
      confidentialityMeasures: z.string().max(20_000).optional(),
      conflictOfInterest: z.string().max(20_000).optional(),
      rejectionFileUrl: uploadedUrl.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);
      await assertOwnedUploadReferences(ctx.user.id, input.id, [input.rejectionFileUrl]);

      const updates: Record<string, any> = {};
      const fields = ["researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures", "conflictOfInterest", "rejectionFileUrl"];
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updates[f] = (input as any)[f];
      }
      if (Object.keys(updates).length > 0) {
        await db.updateEditableApplication(input.id, ctx.user.id, updates, app);
      }
      return { success: true };
    }),

  // AI auto-complete fields (aims for 100/100) — SA-03 budget-bound.
  aiAutoComplete: aiProcedure
    .input(z.object({
      id: z.number().int().positive(),
      // SA-35: bound the existingFields map so a hostile payload can't
      // explode prompt token usage. 64 fields × 8 KB each ≈ 500 KB cap on
      // the inbound side, which after JSON.stringify still fits inside our
      // LLM token budget without breaching the AI budget reservation.
      existingFields: z
        .record(z.string().max(64), z.string().max(8000))
        .refine(o => Object.keys(o).length <= 64, "too many fields")
        .refine(
          o => Object.values(o).reduce((a, v) => a + v.length, 0) <= 200_000,
          "fields exceed total length cap",
        ),
      stage: z.enum(["stage1", "stage2"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      // For Stage 2 auto-complete, pass Stage 1 gateway facts so the
      // generated text references the same PI / institution / funding
      // / duration the applicant declared on Stage 1, instead of
      // generic boilerplate.
      let stage1Summary: string | undefined;
      if (app.stage1AiFeedback) {
        try {
          const parsed = JSON.parse(app.stage1AiFeedback);
          stage1Summary = String(parsed.feedback || "").slice(0, 800);
        } catch {}
      }
      const result = await aiAutoCompleteFields({
        researchType: app.researchType || "",
        researchTitle: app.researchTitle || "",
        existingFields: input.existingFields,
        stage: input.stage,
        stage1Context: input.stage === "stage1" ? undefined : {
          principalInvestigator: app.principalInvestigator || undefined,
          piInstitution: app.piInstitution || undefined,
          piDepartment: app.piDepartment || undefined,
          fundingSource: app.fundingSource || undefined,
          estimatedDuration: app.estimatedDuration || undefined,
          irbCategory: app.irbCategory || undefined,
          stage1AiScore: app.stage1AiScore ?? null,
          stage1FeedbackSummary: stage1Summary,
        },
      });
      return result;
    }),

  // Stage 1 AI Enhance & Re-review — one-click flow:
  //   1) AI rewrites the gateway fields to address the current review.
  //   2) Persist the enhanced fields.
  //   3) Re-run Stage 1 AI review against the enhanced fields.
  //   4) Persist the new score + feedback.
  // Returns both the enhanced fields and the new review result so the
  // client can update form + result card in a single render. SA-03 budget-bound.
  aiEnhanceStage1: aiProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const stage1Fields = {
        researchTitle: app.researchTitle || "",
        principalInvestigator: app.principalInvestigator || "",
        piInstitution: app.piInstitution || "",
        piDepartment: app.piDepartment || "",
        fundingSource: app.fundingSource || "",
        estimatedDuration: app.estimatedDuration || "",
      };

      // 1) Polish/expand the existing values via the dedicated editor
      // function (does not invent data, does not refuse sloppy-but-real
      // input). Pulls the previous AI feedback summary so the rewrite
      // directly addresses what the reviewer flagged.
      let prevSummary = "";
      if (app.stage1AiFeedback) {
        try {
          const parsed = JSON.parse(app.stage1AiFeedback);
          prevSummary = String(parsed.feedback || "").slice(0, 1200);
        } catch {}
      }
      const merged = await aiEnhanceStage1Fields({
        researchType: app.researchType || "",
        irbCategory: app.irbCategory || "",
        current: stage1Fields,
        stage1FeedbackSummary: prevSummary,
      });

      // 2) Persist and invalidate old review results.
      const enhancedApp = await db.updateEditableApplication(input.id, ctx.user.id, {
        researchTitle: merged.researchTitle,
        principalInvestigator: merged.principalInvestigator,
        piInstitution: merged.piInstitution,
        piDepartment: merged.piDepartment,
        fundingSource: merged.fundingSource,
        estimatedDuration: merged.estimatedDuration,
      }, app);

      // 3) Re-run Stage 1 review against the enhanced data.
      // Skip literature on the post-enhance re-review — we already paid that
      // cost (or raced it) on the applicant's prior review; shaves seconds.
      const review = await runStage1AiReview({
        researchType: app.researchType || "",
        irbCategory: app.irbCategory || "",
        researchTitle: merged.researchTitle,
        principalInvestigator: merged.principalInvestigator,
        piInstitution: merged.piInstitution,
        piDepartment: merged.piDepartment,
        fundingSource: merged.fundingSource,
        estimatedDuration: merged.estimatedDuration,
        skipLiterature: true,
      });

      // 4) Persist the new review (skip if AI was unavailable).
      const isAiEnhanceUnavailable = typeof review.feedback === "string"
        && review.feedback.startsWith("[AI_UNAVAILABLE]");
      if (!isAiEnhanceUnavailable) {
        await db.updateEditableApplication(input.id, ctx.user.id, {
          stage1AiScore: review.score,
          stage1AiFeedback: JSON.stringify({
            feedback: review.feedback,
            recommendations: review.recommendations,
            fieldScores: review.fieldScores,
            hasRedFlags: review.hasRedFlags,
          }),
          stage1Passed: review.passed,
          status: review.passed ? "stage2_pending" : "stage1_failed",
        }, enhancedApp);

        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage1_ai_enhance",
          details: `AI Enhance & Re-review: score ${review.score}/100 — ${review.passed ? "PASSED" : "FAILED"}`,
        });
      } else {
        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage1_ai_enhance_unavailable",
          details: "AI provider unreachable during enhance — prior review preserved.",
        });
      }

      return { fields: merged, review };
    }),

  // AI resolve single field — SA-03 budget-bound. SA-34: cap every text
  // input so a 1 MB payload can't burn the LLM token budget on one call.
  aiResolveField: aiProcedure
    .input(z.object({
      id: z.number().int().positive(),
      fieldName: z.string().max(128),
      currentValue: z.string().max(20_000),
      feedback: z.string().max(4000),
      context: z
        .record(z.string().max(64), z.string().max(8000))
        .refine(o => Object.keys(o).length <= 32, "too many context fields")
        .optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const result = await aiResolveField({
        fieldName: input.fieldName,
        currentValue: input.currentValue,
        feedback: input.feedback,
        researchType: app.researchType || "",
        researchTitle: app.researchTitle || "",
        context: input.context || {},
      });

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "ai_resolve_field",
        details: `AI resolved field: ${input.fieldName}`,
      });

      return result;
    }),

  // Sample size calculator — SA-33: bound every numeric input so a hostile
  // payload can't trigger Infinity/NaN math or pre-allocate huge buffers.
  calculateSampleSize: protectedProcedure
    .input(z.object({
      studyType: z.string().max(64),
      confidenceLevel: z.number().int().min(80).max(99),
      marginOfError: z.number().min(0.01).max(50),
      populationSize: z.number().int().min(1).max(1_000_000_000).optional(),
      expectedProportion: z.number().min(0.001).max(0.999).optional(),
      effectSize: z.string().max(64).optional(),
      power: z.number().min(0.5).max(0.999).optional(),
    }))
    .mutation(async ({ input }) => {
      return calculateSampleSize(input);
    }),

  // AI review feedback — SA-32: require that the caller can actually view
  // the application, otherwise any logged-in user could pollute another
  // application's audit log. Also cap the comment so it can't be a 1 MB
  // log-bomb (SA-34).

  // Per-user LLM call budget for the dashboard footer. Lets the SPA show
  // "42/60 AI calls remaining today" so users know what's left before
  // the next UTC midnight rollover. Read-only, no budget consumed.
  aiBudget: protectedProcedure.query(async ({ ctx }) => {
    return inspectLlmBudget(ctx.user.id);
  }),
  submitAiFeedback: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      stage: z.number().int().min(1).max(2),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await loadApplicationForViewer(ctx, input.applicationId);
      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: `ai_feedback_stage${input.stage}`,
        details: `Rating: ${input.rating}/5${input.comment ? " - " + input.comment : ""}`,
      });
      return { success: true };
    }),

  // Stage 2: Save research details
  saveStage2: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      researchObjectives: z.string().max(20_000),
      methodology: z.string().max(20_000),
      sampleSize: z.string().max(20_000),
      targetPopulation: z.string().max(20_000),
      inclusionCriteria: z.string().max(20_000),
      exclusionCriteria: z.string().max(20_000),
      dataCollectionMethods: z.string().max(20_000),
      informedConsentProcess: z.string().max(20_000),
      riskAssessment: z.string().max(20_000),
      benefitAssessment: z.string().max(20_000),
      confidentialityMeasures: z.string().max(20_000),
      conflictOfInterest: z.string().max(20_000),
      rejectionFileUrl: uploadedUrl.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);
      await assertOwnedUploadReferences(ctx.user.id, input.id, [input.rejectionFileUrl]);

      await db.updateEditableApplication(input.id, ctx.user.id, {
        researchObjectives: input.researchObjectives,
        methodology: input.methodology,
        sampleSize: input.sampleSize,
        targetPopulation: input.targetPopulation,
        inclusionCriteria: input.inclusionCriteria,
        exclusionCriteria: input.exclusionCriteria,
        dataCollectionMethods: input.dataCollectionMethods,
        informedConsentProcess: input.informedConsentProcess,
        riskAssessment: input.riskAssessment,
        benefitAssessment: input.benefitAssessment,
        confidentialityMeasures: input.confidentialityMeasures,
        conflictOfInterest: input.conflictOfInterest,
        rejectionFileUrl: input.rejectionFileUrl || null,
      }, app);

      return { success: true };
    }),

  // Run AI review for Stage 2 (with color-coded field scores) — SA-03 budget-bound.
  runStage2Review: aiProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const result = await runStage2AiReview({
        researchType: app.researchType || "",
        irbCategory: app.irbCategory || "",
        researchTitle: app.researchTitle || "",
        researchObjectives: app.researchObjectives || "",
        methodology: app.methodology || "",
        sampleSize: app.sampleSize || "",
        targetPopulation: app.targetPopulation || "",
        inclusionCriteria: app.inclusionCriteria || "",
        exclusionCriteria: app.exclusionCriteria || "",
        dataCollectionMethods: app.dataCollectionMethods || "",
        informedConsentProcess: app.informedConsentProcess || "",
        riskAssessment: app.riskAssessment || "",
        benefitAssessment: app.benefitAssessment || "",
        confidentialityMeasures: app.confidentialityMeasures || "",
        conflictOfInterest: app.conflictOfInterest || "",
      });

      const isAiUnavailable2 = typeof result.feedback === "string"
        && result.feedback.startsWith("[AI_UNAVAILABLE]");

      if (!isAiUnavailable2) {
        await db.updateEditableApplication(input.id, ctx.user.id, {
          stage2AiScore: result.score,
          stage2AiFeedback: JSON.stringify({
            feedback: result.feedback,
            recommendations: result.recommendations,
            fieldSuggestions: result.fieldSuggestions,
            fieldScores: result.fieldScores,
            hasRedFlags: result.hasRedFlags,
          }),
          stage2AiFieldScores: JSON.stringify(result.fieldScores || []),
          stage2Passed: result.passed,
          status: result.passed ? "submitted" : "stage2_failed",
        }, app);

        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage2_ai_review",
          details: `Score: ${result.score}/100 - ${result.passed ? "PASSED" : "FAILED"}${result.hasRedFlags ? " (RED FLAGS)" : ""}`,
        });

        try {
          await emailService.notifyAiReviewResult(ctx.user.id, input.id, 2, result.passed, result.score);
        } catch (e) { /* best-effort */ }
      } else {
        await db.addAuditLog({
          applicationId: input.id,
          userId: ctx.user.id,
          action: "stage2_ai_review_unavailable",
          details: "AI provider unreachable — prior review preserved.",
        });
      }

      return result;
    }),

  // Final submission - triggers committee assignment
  submit: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { app, selected, activeMemberCount } = await db.submitApplicationForReview(input.id, ctx.user.id);
      // Tell the admin if we couldn't fully assign. Best-effort —
      // don't fail submission on notification failure.
      if (selected.length < 5) {
        const needed = 5 - selected.length;
        try {
          await db.addAuditLog({
            applicationId: input.id,
            userId: ctx.user.id,
            action: "queued_for_committee_assignment",
            details: `Submitted with only ${activeMemberCount} active committee members; awaiting admin to invite more (need ${needed} more).`,
          });
        } catch { /* best-effort */ }
        // In-app notification for the applicant — they shouldn't be in
        // the dark about why the app is parked.
        try {
          await emailService.createNotification({
            userId: ctx.user.id,
            applicationId: input.id,
            type: "general",
            title: "Application queued — awaiting committee",
            message: `Your application "${(app.researchTitle || "Untitled").slice(0, 80)}" has been submitted successfully. The platform currently has ${activeMemberCount} active reviewer${activeMemberCount === 1 ? "" : "s"}; ${needed} more are needed before review begins. The admin team has been alerted; you'll be notified the moment your reviewers are assigned.`,
          });
        } catch { /* best-effort */ }
        // Wake the platform owner so they can invite reviewers.
        try {
          await notifyOwner({
            title: "IRB application queued for committee assignment",
            content: `Application #${input.id} ("${(app.researchTitle || "Untitled").slice(0, 80)}") was submitted with only ${activeMemberCount}/5 active committee members. Invite ${needed} more reviewer${needed === 1 ? "" : "s"} from the admin dashboard to start the review.`,
          });
        } catch { /* best-effort */ }
      }

      try {
        await emailService.notifyApplicationSubmitted(ctx.user.id, input.id, app.researchTitle || "Untitled");
        for (const member of selected) {
          await emailService.notifyCommitteeAssigned(member.id, input.id, app.researchTitle || "Untitled");
        }
      } catch (e) { /* notification is best-effort */ }

      // AI findings support the appointed human committee; they never issue approval.
      // Failures must not block the applicant's successful submit.
      let accelerated: Awaited<ReturnType<typeof runAcceleratedPipeline>> | null = null;
      try {
        accelerated = await runAcceleratedPipeline(input.id, ctx.user.id);
      } catch (e) {
        console.error("[Accelerated] pipeline failed after submit", safeLogError(e));
        try {
          await notifyOwner({
            title: "IRB accelerated review pipeline failed",
            content: `Application #${input.id} submitted but the digital swarm pipeline threw. Manual owner action is required.`,
          });
        } catch { /* best-effort */ }
      }

      return { success: true, assignedMembers: selected.length, accelerated };
    }),

  // Proceed despite Stage 1 AI score (red flag)
  proceedDespiteStage1: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      reason: z.string().trim().min(1, "Please provide a reason.").max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      await db.updateEditableApplication(input.id, ctx.user.id, {
        proceedDespiteStage1: true,
        proceedDespiteStage1Reason: input.reason,
        stage1Passed: false,
        status: "stage2_pending",
      }, app);

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "proceed_despite_stage1",
        details: `RED FLAG: Proceeded despite AI Stage 1 score. Reason: ${input.reason}`,
      });

      try {
        await emailService.notifyProceedDespiteScore(ctx.user.id, input.id, 1, input.reason);
      } catch (e) { /* best-effort */ }

      return { success: true };
    }),

  // Proceed despite Stage 2 AI score (red flag)
  proceedDespiteStage2: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      reason: z.string().trim().min(1, "Please provide a reason.").max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      await db.updateEditableApplication(input.id, ctx.user.id, {
        proceedDespiteStage2: true,
        proceedDespiteStage2Reason: input.reason,
        stage2Passed: false,
        status: "submitted",
      }, app);

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "proceed_despite_stage2",
        details: `RED FLAG: Proceeded despite AI Stage 2 score. Reason: ${input.reason}`,
      });

      try {
        await emailService.notifyProceedDespiteScore(ctx.user.id, input.id, 2, input.reason);
      } catch (e) { /* best-effort */ }

      return { success: true };
    }),

  // Fix All Comments — batch AI resolve for all flagged fields. SA-03
  // budget-bound. SA-34: every string is capped so a hostile payload can't
  // amplify token usage on a single call.
  fixAllComments: aiProcedure
    .input(z.object({
      id: z.number().int().positive(),
      fields: z
        .record(z.string().max(64), z.string().max(20_000))
        .refine(o => Object.keys(o).length <= 64, "too many fields"),
      fieldScores: z
        .array(z.object({
          field: z.string().max(128),
          score: z.number().int().min(0).max(100),
          color: z.string().max(32),
          feedback: z.string().max(4000),
          suggestion: z.string().max(8000),
        }))
        .max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const result = await aiFixAllComments({
        researchType: app.researchType || "",
        researchTitle: app.researchTitle || "",
        fields: input.fields,
        fieldScores: input.fieldScores as any,
      });

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "ai_fix_all_comments",
        details: "AI batch-resolved all flagged fields",
      });

      return result;
    }),

  // Upload file to S3
  uploadFile: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      fileData: z.string().min(1).max(28_000_000), // ~21 MB after base64 decode
      contentType: z.string().min(1).max(128),
      applicationId: z.number().int().positive().optional(),
      category: z.enum(["questionnaire", "supplementary", "nbce_certificate", "rejection_file", "additional_document", "other"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Enforce ownership BEFORE writing to storage, so an attacker cannot
      // pollute another user's application file list.
      if (input.applicationId !== undefined) {
        const app = await db.getApplicationById(input.applicationId);
        if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
        if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
        assertApplicantCanEdit(app);
      }

      const usage = await db.getUserUploadUsage(ctx.user.id);
      if (usage.count >= 500 || usage.bytes >= 250 * 1024 * 1024) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Upload allowance reached. Contact support to review your storage needs." });

      // Strict MIME allow-list — uploaded files are served back from same
      // origin (or signed S3 URLs); HTML / SVG with active content would
      // be stored-XSS otherwise.
      const contentType = input.contentType.toLowerCase().split(";")[0].trim();
      if (!UPLOAD_ALLOWED_MIME.has(contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File type "${contentType}" is not allowed. Permitted: PDF, images (PNG/JPG/GIF/WEBP), text, CSV, Word, Excel.`,
        });
      }
      const extension = input.fileName.trim().split(".").pop()?.toLowerCase() || "";
      if (!UPLOAD_EXTENSIONS[contentType]?.includes(extension)) throw new TRPCError({ code: "BAD_REQUEST", message: "Filename extension must match the declared document type." });

      if (input.fileData.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input.fileData) || !/^[^=]*={0,2}$/.test(input.fileData)) throw new TRPCError({ code: "BAD_REQUEST", message: "File must use canonical base64 encoding." });
      const buffer = Buffer.from(input.fileData, "base64");
      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Empty file" });
      }
      if (buffer.length > UPLOAD_MAX_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `File too large. Maximum size is ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)} MB.`,
        });
      }
      if (usage.bytes + buffer.length > 250 * 1024 * 1024) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Upload would exceed your storage allowance." });

      // SA-27: the declared MIME must match the actual bytes.
      if (!matchesMagicBytes(buffer, contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File content does not match the declared file type. Please upload the original, unmodified file.",
        });
      }

      // ZIP container expansion and structural limits are enforced before scanner work.
      assertUploadArchiveSafe(buffer, contentType);

      // Request cancellation stops a queued/active scan. No bytes enter storage
      // until the configured daemon has returned a complete clean verdict.
      const cancellation = new AbortController();
      const cancelUpload = () => cancellation.abort();
      ctx.req.once?.("aborted", cancelUpload);
      ctx.res.once?.("close", cancelUpload);
      if (ctx.req.aborted || ctx.res.destroyed) cancelUpload();
      let scan;
      try {
        scan = await scanUploadedFile(buffer, cancellation.signal, ctx.user.id);
      } finally {
        ctx.req.off?.("aborted", cancelUpload);
        ctx.res.off?.("close", cancelUpload);
      }
      if (cancellation.signal.aborted || ctx.req.aborted || ctx.res.destroyed) throw new TRPCError({ code: "CLIENT_CLOSED_REQUEST", message: "Upload request was cancelled." });

      const safeFileName = sanitizeUploadFileName(input.fileName);
      // Cryptographically random suffix — the local-disk driver serves
      // /uploads/* with only this path as the auth gate when sessions
      // aren't bound. Math.random is not strong enough for that.
      const randomSuffix = randomBytes(8).toString("hex");
      // Drop the redundant "uploads/" prefix — the storage layer
      // already partitions under /uploads/<key> for the local driver
      // and namespaces by bucket for S3/Forge.
      const fileKey = `${ctx.user.id}/${Date.now()}-${randomSuffix}-${safeFileName}`;
      const stored = await storagePut(fileKey, buffer, contentType);

      // Save file metadata to DB
      const fileId = await db.addFileUpload({
          applicationId: input.applicationId || null,
          userId: ctx.user.id,
          fileName: safeFileName,
          fileKey: stored.key,
          fileUrl: "",
          mimeType: contentType,
          fileSize: buffer.length,
          category: (input.category || "other") as any,
        });
      await db.addAuditLog({ applicationId: input.applicationId || null, userId: ctx.user.id, action: "file_upload_stored", details: `Upload #${fileId}; malware scan ${scan.status}${scan.status === "skipped" ? " under configured development/pilot policy" : " using ClamAV"}.` });

      return { url: `/api/irb/files/${fileId}`, fileKey: stored.key, scanStatus: scan.status };
    }),

  // Version history
  getVersions: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await loadApplicationForViewer(ctx, input.applicationId);
      return db.getApplicationVersions(input.applicationId);
    }),
});

// ─── Authors Router ─────────────────────────────────────────────────────────

const authorsRouter = router({
  getByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await loadApplicationForViewer(ctx, input.applicationId);
      return db.getAuthorsByApplication(input.applicationId);
    }),

  add: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      name: z.string().trim().min(1).max(255),
      email: z.string().email().max(320),
      phone: z.string().max(64).optional(),
      institution: z.string().max(255).optional(),
      department: z.string().max(255).optional(),
      country: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);

      const existing = await db.getAuthorsByApplication(input.applicationId);
      if (existing.length >= MAX_AUTHORS_PER_APPLICATION) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `An application can list at most ${MAX_AUTHORS_PER_APPLICATION} co-investigators.`,
        });
      }

      const id = await db.addResearchAuthor({
        applicationId: input.applicationId,
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        institution: input.institution || null,
        department: input.department || null,
        country: input.country || "Saudi Arabia",
      });
      return { id };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), applicationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      assertApplicantCanEdit(app);
      await db.removeAuthor(input.id, input.applicationId);
      return { success: true };
    }),
});

// ─── Verification Router (Public) ──────────────────────────────────────────

const verifyRouter = router({
  verifyIrb: publicProcedure
    .input(z.object({ irbNumber: z.string().min(6).max(64) }))
    .query(async ({ input }) => {
      // SA-11: public verification returns only the minimum needed to confirm
      // authenticity. Department, funding source, AI scores, applicant name,
      // author list, and full duration are PII / business-sensitive and are
      // NOT for unauthenticated callers — they're available to the applicant,
      // admin, and assigned reviewers via authenticated endpoints.
      // Long-lived signed certificate URLs are NEVER returned here — use
      // verify.certificateDownload for a short-lived URL on demand.
      const app = await db.getApplicationByIrbNumber(input.irbNumber.trim().toUpperCase());
      if (!app) return { found: false as const };
      if (app.status === "hidden" || !app.humanDecisionAt || !app.humanDecisionByUserId) return { found: false as const };

      if (app.status === "retracted") {
        return {
          found: true as const,
          retracted: true as const,
          irbNumber: app.irbNumber,
          researchTitle: app.researchTitle,
          principalInvestigator: app.principalInvestigator,
          piInstitution: app.piInstitution,
          approvedAt: app.approvedAt,
          retractedAt: app.retractedAt,
          // Reason is shown — it's the whole point of the public retraction
          // notice — but we cap its length to defeat exfil-via-reason vectors.
          retractionReason: "Approval has been withdrawn. Contact the responsible committee for details.",
          hasRetractionCertificate: Boolean(app.retractionCertificateUrl),
        };
      }

      if (app.status !== "approved") return { found: false as const };

      return {
        found: true as const,
        retracted: false as const,
        irbNumber: app.irbNumber,
        researchTitle: app.researchTitle,
        researchType: app.researchType,
        irbCategory: app.irbCategory,
        principalInvestigator: app.principalInvestigator,
        piInstitution: app.piInstitution,
        approvedAt: app.approvedAt,
        hasCertificate: Boolean(app.certificateUrl),
      };
    }),

  /** Mint a short-lived download URL for a publicly verified certificate. */
  certificateDownload: publicProcedure
    .input(z.object({
      irbNumber: z.string().min(6).max(64),
      kind: z.enum(["certificate", "retraction"]).default("certificate"),
    }))
    .mutation(async ({ input }) => {
      const app = await db.getApplicationByIrbNumber(input.irbNumber.trim().toUpperCase());
      if (!app || app.status === "hidden" || !app.humanDecisionAt || !app.humanDecisionByUserId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found" });
      }
      const stored =
        input.kind === "retraction"
          ? app.status === "retracted"
            ? app.retractionCertificateUrl
            : null
          : app.status === "approved"
            ? app.certificateUrl
            : null;
      if (!stored || !app.irbNumber) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not available" });
      }
      return { url: `/api/export/public-certificate/${encodeURIComponent(app.irbNumber)}`, expiresInSec: CERT_DOWNLOAD_TTL_SEC };
    }),
});

// ─── Support Ticket Router ──────────────────────────────────────────────────

const supportRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(200),
      email: z.string().email().max(320),
      subject: z.string().trim().min(1).max(200),
      category: z.enum(["issue", "suggestion", "question", "other"]),
      message: z.string().trim().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createSupportTicket({
        name: input.name,
        email: input.email,
        subject: input.subject,
        category: input.category,
        message: input.message,
        userId: ctx.user?.id || null,
      });

      try {
        // SA-29: the full message stays in the DB ticket; the notification
        // carries only a short preview so a hostile payload can't abuse the
        // notification channel. Control chars are stripped downstream too.
        const preview = input.message.replace(/\s+/g, " ").slice(0, 300);
        await notifyOwner({
          title: `New Support Ticket: ${input.subject.slice(0, 120)}`,
          content: `From: ${input.name} (${input.email})\nCategory: ${input.category}\n\nPreview: ${preview}${input.message.length > 300 ? "…" : ""}\n\nOpen the admin panel → Support to read and respond.`,
        });
      } catch (e) { /* best-effort */ }

      return { id, success: true };
    }),

  all: adminProcedure.query(async () => {
    return db.getAllSupportTickets();
  }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateSupportTicket(input.id, { status: input.status as any });
      return { success: true };
    }),
});

// ─── Review Router ──────────────────────────────────────────────────────────

const reviewRouter = router({
  myPendingReviews: staffProcedure.query(async ({ ctx }) => {
    const member = await db.getCommitteeMemberByUserId(ctx.user.id);
    if (!member?.isActive || !member.appointedAt || !member.qualificationReference) return [];
    await db.expireOldReviews();
    const reviews = await db.getPendingReviewsByMember(member.id);
    const enriched = await Promise.all(reviews.map(async (r) => {
      const app = await db.getApplicationById(r.applicationId);
      return { ...r, application: app };
    }));
    return enriched;
  }),

  myAllReviews: staffProcedure.query(async ({ ctx }) => {
    const member = await db.getCommitteeMemberByUserId(ctx.user.id);
    if (!member?.isActive || !member.appointedAt || !member.qualificationReference) return [];
    const reviews = (await db.getReviewsByCommitteeMember(member.id)).filter(r => r.status !== "expired" && r.expiresAt.getTime() > Date.now());
    const enriched = await Promise.all(reviews.map(async (r) => {
      const app = await db.getApplicationById(r.applicationId);
      return { ...r, application: app };
    }));
    return enriched;
  }),

  getByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await loadApplicationForViewer(ctx, input.applicationId);
      const reviews = await db.getReviewsByApplication(input.applicationId);
      // Single fetch of committee members + users to avoid the N+1 that
      // bites the admin dashboard on large review lists.
      const allMembers = await db.getAllCommitteeMembers();
      const memberById = new Map(allMembers.map(m => [m.id, m]));
      const userIds = Array.from(new Set(reviews
        .map(r => memberById.get(r.committeeMemberId)?.userId)
        .filter((u): u is number => typeof u === "number")));
      const userById = new Map<number, { name?: string | null }>();
      await Promise.all(userIds.map(async (uid) => {
        const u = await db.getUserById(uid);
        if (u) userById.set(uid, { name: u.name });
      }));
      return reviews.map((r) => {
        const memberInfo = memberById.get(r.committeeMemberId);
        const memberName = memberInfo
          ? (userById.get(memberInfo.userId)?.name || "Committee Member")
          : "Committee Member";
        return { ...r, memberName };
      });
    }),

  submitReview: staffProcedure
    .input(z.object({
      reviewId: z.number().int().positive(),
      decision: z.enum(["approved", "rejected"]),
      comments: z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.recordHumanReview({ ...input, userId: ctx.user.id });
      try {
        await emailService.notifyReviewReceived(result.applicantId, result.applicationId, input.decision, result.approvals, result.approvals + result.rejections);
      } catch { /* Review is durable; notifications are best effort. */ }
      return { success: true, approvals: result.approvals, rejections: result.rejections };

    }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────

async function storeDecisionCertificate(app: Awaited<ReturnType<typeof db.finalizeApplicationDecision>>) {
  const applicant = await db.getUserById(app.applicantId);
  let certificateUrl: string | null = null;
  try {
    const generated = await generateAndStoreCertificatePdf({ app, applicantName: applicant?.name ?? null, applicantEmail: applicant?.email ?? null });
    const attached = await db.attachDecisionCertificate(app, generated);
    if (attached) certificateUrl = generated;
  } catch (error) {
    console.error("[Certificate] Decision recorded; PDF generation requires retry", safeLogError(error));
  }
  try {
    if (app.status === "approved" && app.irbNumber) {
      await emailService.notifyAdminApproved(app.applicantId, app.id, app.irbNumber);
      if (certificateUrl) await emailService.notifyCertificateIssued(app.applicantId, app.id, app.irbNumber);
    } else {
      await emailService.notifyAdminRejected(app.applicantId, app.id, app.rejectionReason || "Committee rejected the application", app.submissionCount < 2);
    }
  } catch { /* Decision is durable; notifications are best effort. */ }
  return { success: true, irbNumber: app.irbNumber, certificateUrl, certificatePending: !certificateUrl };
}

const adminRouter = router({
  allApplications: adminProcedure.query(async () => {
    const apps = await db.getAllApplications();
    const enriched = await Promise.all(apps.map(async (app) => {
      const applicant = await db.getUserById(app.applicantId);
      return { ...app, applicantName: applicant?.name, applicantEmail: applicant?.email };
    }));
    return enriched;
  }),

  stats: adminProcedure.query(async () => {
    return db.getApplicationStats();
  }),

  // Compatibility entry point with the same human authority gates as finalDecision.
  directApproval: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      notes: z.string().max(2000).optional(),
      // SA-10: typed-confirmation defeats CSRF / mis-click. The client must
      // echo back the exact string `APPROVE-<applicationId>`. A
      // CSRF-induced auto-submit can't guess the right value, and a
      // typo'd click can't accidentally mint an IRB number.
      confirm: z.string().max(20_000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirm !== `APPROVE-${input.applicationId}`) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirmation token missing or incorrect",
        });
      }
      const approved = await db.finalizeApplicationDecision({ applicationId: input.applicationId, actorUserId: ctx.user.id, decision: "approved", notes: input.notes, direct: true });
      return storeDecisionCertificate(approved);

    }),

  finalDecision: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().max(20000).optional(),
      // SA-10 (parity with directApproval): the client must echo back
      // `DECIDE-<applicationId>`. A CSRF-induced auto-submit or a stray
      // click can't mint an IRB number or reject a study by accident.
      confirm: z.string().max(20_000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirm !== `DECIDE-${input.applicationId}`) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirmation token missing or incorrect",
        });
      }
      const decided = await db.finalizeApplicationDecision({ applicationId: input.applicationId, actorUserId: ctx.user.id, decision: input.decision, notes: input.notes });
      return storeDecisionCertificate(decided);

    }),

  // Retract an approved application (generates red/white retraction PDF)
  retractApplication: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      reason: z.string().trim().min(10).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved applications can be retracted" });
      }

      const changed = await db.transitionApplicationStatus(input.applicationId, ["approved"], {
        status: "retracted", retractionReason: input.reason, retractedAt: new Date(), retractionCertificateUrl: null,
      });
      if (!changed) throw new TRPCError({ code: "CONFLICT", message: "Application decision changed. Refresh and try again." });
      const applicant = await db.getUserById(app.applicantId);
      let retractionUrl = "";
      try {
        const retracted = await db.getApplicationById(app.id);
        retractionUrl = await generateRetractionCertificatePdf(retracted!, applicant?.name || "", input.reason);
        await db.transitionApplicationStatus(app.id, ["retracted"], { retractionCertificateUrl: retractionUrl });
      } catch (e) {
        console.error("Retraction certificate generation failed:", safeLogError(e));
      }

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "admin_retracted",
        details: `Retraction reason: ${input.reason}`,
      });

      try {
        await emailService.notifyApplicationRetracted(app.applicantId, input.applicationId, input.reason, app.irbNumber || "");
      } catch (e) { /* best-effort */ }

      return { success: true, retractionCertificateUrl: retractionUrl };
    }),

  // Hide an application (not verifiable)
  hideApplication: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      reason: z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      await db.updateApplication(input.applicationId, {
        status: "hidden",
        adminNotes: input.reason || "Hidden by admin",
      });

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "admin_hidden",
        details: input.reason || "Application hidden by admin",
      });

      try {
        await emailService.notifyApplicationHidden(app.applicantId, input.applicationId, input.reason || "Hidden by admin");
      } catch (e) { /* best-effort */ }

      return { success: true };
    }),

  // Delete an application (soft delete - moves to hidden/deleted state)
  deleteApplication: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      reason: z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      // We use "hidden" status for deleted items too, but mark in audit log
      await db.updateApplication(input.applicationId, {
        status: "hidden",
        adminNotes: `DELETED: ${input.reason || "Deleted by admin"}`,
      });

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "admin_deleted",
        details: input.reason || "Application deleted by admin",
      });

      try {
        await emailService.notifyApplicationDeleted(app.applicantId, input.applicationId, input.reason || "Deleted by admin");
      } catch (e) { /* best-effort */ }

      return { success: true };
    }),

  allowResubmission: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.status !== "rejected" || app.submissionCount >= 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a rejected first submission can be opened for revision." });
      const changed = await db.transitionApplicationStatus(input.applicationId, ["rejected"], {
        status: "resubmission_required", stage1Passed: false, stage2Passed: false,
        stage1AiScore: null, stage2AiScore: null, stage1AiFeedback: null, stage2AiFeedback: null, stage2AiFieldScores: null,
        proceedDespiteStage1: false, proceedDespiteStage2: false,
        proceedDespiteStage1Reason: null, proceedDespiteStage2Reason: null,
        certificateUrl: null,
      });
      if (!changed) throw new TRPCError({ code: "CONFLICT", message: "Application changed. Refresh and try again." });

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "resubmission_allowed",
        details: "Admin allowed resubmission",
      });

      return { success: true };
    }),

  manualAssign: adminProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      committeeMemberId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.assignHumanReviewer(input.applicationId, input.committeeMemberId);

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "manual_assignment",
        details: `Admin manually assigned committee member #${input.committeeMemberId}`,
      });

      return { success: true };
    }),

  allCommitteeMembers: adminProcedure.query(async () => {
    const members = await db.getAllCommitteeMembers();
    const enriched = await Promise.all(members.map(async (m) => {
      const user = await db.getUserById(m.userId);
      return { ...m, userName: user?.name, userEmail: user?.email };
    }));
    return enriched;
  }),

  addCommitteeMember: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      qualificationReference: z.string().trim().min(10).max(2000),
      specialization: z.string().max(20_000).optional(),
      title: z.string().max(20_000).optional(),
      institution: z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(input.userId);
      if (!user || user.loginMethod === "digital_reviewer" || user.loginMethod === "deleted" || user.openId.startsWith("digital-reviewer:")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a verified human account may be appointed." });
      const appointment = { qualificationReference: input.qualificationReference, appointedByUserId: ctx.user.id, appointedAt: new Date(), isActive: true };
      const existing = await db.getCommitteeMemberByUserId(input.userId);
      let memberId: number;
      if (existing) {
        await db.updateCommitteeMember(existing.id, { ...appointment, specialization: input.specialization || null, title: input.title || null, institution: input.institution || null });
        memberId = existing.id;
      } else {
        memberId = await db.addCommitteeMember({ userId: input.userId, ...appointment, specialization: input.specialization || null, title: input.title || null, institution: input.institution || null });
      }
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "committee_member_added",
        details: `User #${input.userId} added as committee member (id #${memberId})`,
      });

      return { id: memberId };
    }),

  removeCommitteeMember: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.removeCommitteeMember(input.id);
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "committee_member_removed",
        details: `Committee member #${input.id} deactivated`,
      });
      return { success: true };
    }),

  allUsers: adminProcedure.query(async () => {
    const users = await db.getAllUsers();
    // Flag the platform-owner row so the UI can show an Owner badge and
    // suppress the demote action against it.
    return users.map(u => ({ ...u, isOwner: isPlatformOwner(u) }));
  }),

  searchUsers: adminProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const users = await db.searchUsersByEmail(input.query);
      return users.map(u => ({ ...u, isOwner: isPlatformOwner(u) }));
    }),

  // OWNER-ONLY: promoting/demoting between admin and user is reserved for
  // the platform owner. Admins can do everything else but cannot change
  // roles — so a compromised or rogue admin can't mint more admins or strip
  // the owner. Secondary admins get the same FORBIDDEN as any non-owner.
  updateUserRole: ownerProcedure
    .input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      // Refuse to demote the platform owner account itself.
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (target && isPlatformOwner(target) && input.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform owner cannot be demoted" });
      }
      await db.updateUserRole(input.userId, input.role);
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "user_role_changed",
        details: `User ${input.userId} role changed to ${input.role}`,
      });
      return { success: true };
    }),

  // OWNER-ONLY: purge dev test accounts (@example.com) and their data.
  // Hard-scoped in the DB layer; can never delete a real account.
  purgeTestAccounts: ownerProcedure.mutation(async ({ ctx }) => {
    const result = await db.purgeExampleTestAccounts();
    await db.addAuditLog({
      userId: ctx.user.id,
      action: "test_accounts_purged",
      details: `Removed ${result.users} @example.com test account(s) and ${result.applications} application(s).`,
    });
    return result;
  }),

  userCount: adminProcedure.query(async () => {
    return db.getUserCount();
  }),

  auditLog: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.applicationId) {
        return db.getAuditLogByApplication(input.applicationId);
      }
      return db.getFullAuditLog();
    }),

  supportTickets: adminProcedure.query(async () => {
    return db.getAllSupportTickets();
  }),

  // Analytics endpoints
  monthlyAnalytics: adminProcedure
    .input(z.object({ months: z.number().int().min(1).max(60).optional() }).optional())
    .query(async ({ input }) => {
      return db.getMonthlyAnalytics(input?.months || 12);
    }),

  periodAnalytics: adminProcedure
    .input(z.object({
      granularity: z.enum(["day", "week", "month", "quarter", "year"]).default("month"),
    }).optional())
    .query(async ({ input }) => {
      return db.getPeriodAnalytics(input?.granularity || "month");
    }),

  statusDistribution: adminProcedure.query(async () => {
    return db.getStatusDistribution();
  }),

  researchTypeDistribution: adminProcedure.query(async () => {
    return db.getResearchTypeDistribution();
  }),

  // Expire and reassign reviews (cron-like endpoint)
  expireAndReassignReviews: adminProcedure.mutation(async ({ ctx }) => {
    const expired = await db.expireAndGetExpiredReviews();
    let reassigned = 0;

    for (const review of expired) {
      const app = await db.getApplicationById(review.applicationId);
      if (!app || app.status !== "under_review") continue;

      // Find a new committee member not already assigned
      const existingAssignments = await db.getReviewsByApplication(review.applicationId);
      const assignedMemberIds = existingAssignments.map(r => r.committeeMemberId);
      const activeMembers = await db.getActiveCommitteeMembers();
      const available = activeMembers.filter(m => !assignedMemberIds.includes(m.id));

      if (available.length > 0) {
        const newMember = available[Math.floor(Math.random() * available.length)];
        try {
          await db.assignHumanReviewer(review.applicationId, newMember.id);
        } catch (error) {
          if (error instanceof TRPCError && error.code === "CONFLICT") continue;
          throw error;
        }
        reassigned++;

        try {
          await emailService.notifyCommitteeAssigned(newMember.id, review.applicationId, app.researchTitle || "Untitled");
        } catch (e) { /* best-effort */ }
      }
    }

    await db.addAuditLog({
      userId: ctx.user.id,
      action: "cron_expire_reassign",
      details: `Expired ${expired.length} reviews, reassigned ${reassigned}`,
    });

    return { expired: expired.length, reassigned };
  }),
  // ─── Continuing-review cron — runs daily, sends a reminder for any
  //   approved IRB whose anniversary is within `daysAhead` (default 30)
  //   and creates an in-app notification + audit entry. Idempotent
  //   within a 7-day window so the same applicant isn't spammed.
  continuingReviewSweep: adminProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(365).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const all = await db.getApplicationsByStatus("approved");
      let dueSoon = 0;
      let notified = 0;
      for (const app of all) {
        if (!app.approvedAt || !app.humanDecisionAt) continue;
        const anniversary = new Date(app.approvedAt);
        anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
        if (anniversary.getTime() - Date.now() > input.daysAhead * 86_400_000) continue;
        dueSoon++;
        if (await db.enqueueContinuingReviewReminder(app.id, ctx.user.id, input.daysAhead)) notified++;
      }
      return { dueSoon, notified };
    }),
});

// ─── Notification Router ───────────────────────────────────────────────────

const notificationRouter = router({
  myNotifications: protectedProcedure.query(async ({ ctx }) => {
    return emailService.getUserNotifications(ctx.user.id);
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return emailService.getUnreadCount(ctx.user.id);
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await emailService.markNotificationRead(input.id, ctx.user.id);
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await emailService.markAllRead(ctx.user.id);
    return { success: true };
  }),
});

// ─── Reports Router (Admin) ────────────────────────────────────────────────

const reportsRouter = router({
  performance: adminProcedure
    .input(z.object({
      period: z.enum(["monthly", "annual"]),
      year: z.number().int().min(1900).max(3000).optional(),
      month: z.number().int().min(1).max(12).optional(),
    }))
    .query(async ({ input }) => {
      const stats = await db.getApplicationStats();
      const allApps = await db.getAllApplications();
      const members = await db.getAllCommitteeMembers();

      const now = new Date();
      const year = input.year || now.getFullYear();
      const month = input.month || (now.getMonth() + 1);

      const filtered = allApps.filter(app => {
        const d = new Date(app.createdAt);
        if (input.period === "monthly") {
          return d.getFullYear() === year && (d.getMonth() + 1) === month;
        }
        return d.getFullYear() === year;
      });

      const approved = filtered.filter(a => a.status === "approved").length;
      const rejected = filtered.filter(a => ["rejected", "permanently_rejected"].includes(a.status)).length;
      const pending = filtered.filter(a => ["under_review", "pending_admin", "submitted"].includes(a.status)).length;

      const avgProcessingDays = filtered
        .filter(a => a.approvedAt && a.submittedAt)
        .map(a => (new Date(a.approvedAt!).getTime() - new Date(a.submittedAt!).getTime()) / (1000 * 60 * 60 * 24));
      const avgDays = avgProcessingDays.length > 0 ? avgProcessingDays.reduce((a, b) => a + b, 0) / avgProcessingDays.length : null;

      const memberStats = await Promise.all(members.map(async (m) => {
        const user = await db.getUserById(m.userId);
        return {
          name: user?.name || "Unknown",
          totalAssignments: m.totalAssignments,
          totalResponses: m.totalResponses,
          totalApprovals: m.totalApprovals,
          totalRejections: m.totalRejections,
          responseRate: m.totalAssignments > 0 ? Math.round((m.totalResponses / m.totalAssignments) * 100) : 0,
          avgResponseHours: m.totalResponses > 0 && m.averageResponseTimeMs != null ? Math.round(m.averageResponseTimeMs / (1000 * 60 * 60) * 10) / 10 : null,
        };
      }));

      const typeDistribution: Record<string, number> = {};
      filtered.forEach(a => {
        const t = a.researchType || "unknown";
        typeDistribution[t] = (typeDistribution[t] || 0) + 1;
      });

      return {
        period: input.period,
        year,
        month: input.period === "monthly" ? month : undefined,
        totalApplications: filtered.length,
        approved,
        rejected,
        pending,
        approvalRate: filtered.length > 0 ? Math.round((approved / filtered.length) * 100) : 0,
        avgProcessingDays: avgDays == null ? null : Math.round(avgDays * 10) / 10,
        memberStats,
        typeDistribution,
        overallStats: stats,
      };
    }),
});

// ─── Public Stats Router ───────────────────────────────────────────────────

const publicStatsRouter = router({
  getStats: publicProcedure.query(async () => {
    return db.getPublicStats();
  }),

  // Public, paginated registry of approved IRBs. PII-light projection;
  // search by title / PI / institution / IRB number, filter by research
  // type and approval year. Read-only, no auth required.
  registrySearch: publicProcedure
    .input(z.object({
      query: z.string().max(500).optional(),
      researchType: z.string().max(64).optional(),
      year: z.number().int().min(1900).max(3000).optional(),
      page: z.number().int().min(1).max(1000).optional(),
      pageSize: z.number().int().min(1).max(50).optional(),
    }))
    .query(async ({ input }) => db.searchPublicRegistry(input)),

  registryStats: publicProcedure.query(async () => db.getRegistryStats()),
});

// ─── Adverse Events Router ─────────────────────────────────────────────────
// Required by NCBE for any active human-subjects study. Applicants file
// AE reports; admins review and acknowledge or escalate.

const adverseEventsRouter = router({
  report: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      occurredAt: z.string().datetime().or(z.date()),
      severity: z.enum(["mild", "moderate", "serious", "life_threatening", "fatal"]),
      expected: z.boolean().optional(),
      relatedToStudy: z.enum(["unrelated", "possibly", "probably", "definitely", "unknown"]),
      description: z.string().min(20).max(10000),
      actionTaken: z.string().max(10000).optional(),
      outcome: z.enum(["recovered", "recovering", "ongoing", "permanent_disability", "death", "unknown"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      // Applicant on the study OR an admin can file. Co-investigators
      // would need to be added; not in scope for MVP.
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
      if (new Date(input.occurredAt).getTime() > Date.now() + 300_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Adverse-event occurrence time cannot be in the future." });
      const isCritical = ["serious", "life_threatening", "fatal"].includes(input.severity);
      const id = await db.createAdverseEvent({
        status: isCritical ? "escalated" : "reported",
        applicationId: input.applicationId,
        reportedByUserId: ctx.user.id,
        occurredAt: new Date(input.occurredAt as any),
        severity: input.severity,
        expected: input.expected ?? false,
        relatedToStudy: input.relatedToStudy,
        description: input.description,
        actionTaken: input.actionTaken || null,
        outcome: input.outcome || null,
      });
      // Auto-escalate serious / life-threatening / fatal events to
      // admin attention via notification + audit.
      try {
        await db.addAuditLog({
          applicationId: input.applicationId,
          userId: ctx.user.id,
          action: "adverse_event_reported",
          details: `${input.severity}, related=${input.relatedToStudy}${isCritical ? " — ESCALATED" : ""}`,
        });
        if (isCritical) {
          await notifyOwner({
            title: `IRB adverse event — ${input.severity.toUpperCase()}`,
            content: `Application #${input.applicationId} ("${(app.researchTitle || "Untitled").slice(0, 80)}") reported a ${input.severity} adverse event. Open the admin panel for details.`,
          });
        }
      } catch { /* best-effort */ }
      return { id, escalated: isCritical };
    }),

  byApplication: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
      return db.getAdverseEventsByApplication(input.applicationId);
    }),

  // Admin queue
  all: adminProcedure.query(async () => db.getAllAdverseEvents()),

  // Admin updates an AE — change status, add notes
  adminUpdate: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["reported", "under_review", "acknowledged", "escalated", "closed"]).optional(),
      adminNotes: z.string().max(20000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.updateAdverseEvent(input.id, {
        status: input.status,
        adminNotes: input.adminNotes,
      });
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "ae_admin_update",
        details: `AE #${input.id} → ${input.status || "(notes only)"}`,
      });
      return { success: true };
    }),
});

// ─── Amendments Router ─────────────────────────────────────────────────────
// Change requests against an active or in-review study. Each amendment
// carries a typed change set; admins approve or reject.

const amendmentsRouter = router({
  submit: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      type: z.enum(["minor", "moderate", "major"]),
      title: z.string().min(3).max(255),
      rationale: z.string().min(10).max(20000),
      changedFields: z.record(
        z.string().max(20_000),
        z.object({ before: z.string().max(20_000).optional(), after: z.string() })
      ).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
      // Amendments only make sense post-approval (or at least after
      // submission). Block on draft / declaration_pending.
      if (!["under_review", "pending_admin", "approved"].includes(app.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amendments apply only to active submitted or approved studies." });
      }
      const id = await db.createAmendment({
        applicationId: input.applicationId,
        requestedByUserId: ctx.user.id,
        type: input.type,
        title: input.title,
        rationale: input.rationale,
        changedFieldsJson: input.changedFields ? JSON.stringify(input.changedFields) : null,
      });
      try {
        await db.addAuditLog({
          applicationId: input.applicationId,
          userId: ctx.user.id,
          action: "amendment_submitted",
          details: `${input.type} — ${input.title.slice(0, 80)}`,
        });
        await notifyOwner({
          title: `IRB amendment submitted (${input.type})`,
          content: `Application #${input.applicationId}: "${input.title.slice(0, 80)}". Review in the admin panel.`,
        });
      } catch { /* best-effort */ }
      return { id };
    }),

  byApplication: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
      return db.getAmendmentsByApplication(input.applicationId);
    }),

  all: adminProcedure.query(async () => db.getAllAmendments()),

  adminDecide: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      decision: z.enum(["approved", "rejected"]),
      adminNotes: z.string().max(20000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.decideAmendment({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
});

// ─── Literature Router ─────────────────────────────────────────────────────
// Cross-checks proposals against PubMed, ClinicalTrials.gov, Semantic Scholar,
// OpenAlex (and Elicit when configured). Each source is queried in parallel
// and individual failures degrade gracefully.

const literatureRouter = router({
  // Free-form search — useful for the resource centre / browsing.
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(500),
        perSource: z.number().int().min(1).max(10).optional(),
      })
    )
    .query(async ({ input }) => {
      return searchLiterature(input.query, { perSource: input.perSource });
    }),

  // Application-scoped search — owner or admin only. Builds a query
  // from the proposal's title + objectives so it's directly relevant.
  searchByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      await loadApplicationForViewer(ctx, input.applicationId);
      const query = [app.researchTitle, app.researchObjectives]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 400) || (app.researchType ?? "");
      if (query.length < 2) {
        return {
          query: "",
          fetchedAt: new Date().toISOString(),
          totals: {},
          items: [],
          errors: { input: "Application has no title or objectives yet" },
        };
      }
      return searchLiterature(query, { perSource: 4 });
    }),
});

// ─── AI Swarm Review Router (owner-only, hidden from public) ────────────────
// AI panels offer advisory findings across specialty perspectives.
// Their output cannot approve studies or replace a qualified human committee.

const aiSwarmRouter = router({
  // The only non-owner-gated endpoint: lets the SPA decide whether to
  // render the owner console at all. Returns a bare boolean — leaks
  // nothing about the feature to non-owners beyond its existence in the
  // bundled client code.
  amOwner: protectedProcedure.query(({ ctx }) => ({
    isOwner: isPlatformOwner(ctx.user),
  })),

  byApplication: ownerProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await db.getAiSwarmReviewsByApplication(input.applicationId);
      // Watchdog: if the process restarted mid-deliberation, rows could be
      // stuck in "running" forever. Anything older than 15 minutes is dead.
      const STALE_MS = 15 * 60_000;
      const now = Date.now();
      for (const row of rows) {
        if (row.status === "running" && now - row.createdAt.getTime() > STALE_MS) {
          row.status = "failed";
          row.errorMessage = "Deliberation timed out (server restarted or provider hung). Run the audit again.";
          await db.updateAiSwarmReview(row.id, {
            status: "failed",
            errorMessage: row.errorMessage,
            completedAt: new Date(),
          });
        }
      }
      return rows;
    }),

  run: ownerProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      // A swarm audit needs substance to audit — require at least a
      // completed Stage 1 (gateway) data set.
      if (["draft", "declaration_pending"].includes(app.status) || !app.researchTitle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The application must complete Stage 1 before a swarm audit can run.",
        });
      }
      // One deliberation at a time per application — a second concurrent
      // run would double-spend budget and confuse the report history.
      const existing = await db.getAiSwarmReviewsByApplication(input.applicationId);
      const RUNNING_FRESH_MS = 15 * 60_000;
      if (existing.some(r => r.status === "running" && Date.now() - r.createdAt.getTime() < RUNNING_FRESH_MS)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A swarm audit is already deliberating on this application. Wait for it to finish.",
        });
      }

      // SA-03: a full dual-panel run costs SWARM_LLM_CALLS_PER_RUN LLM
      // calls. Reserve them all up front against the owner's daily
      // budget — no refund on failure (deliberate, same policy as
      // aiProcedure) so retry pressure can't amplify spend.
      for (let i = 0; i < SWARM_LLM_CALLS_PER_RUN; i++) {
        const check = await reserveLlmCall(ctx.user.id);
        if (!check.ok) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `A swarm audit needs ${SWARM_LLM_CALLS_PER_RUN} AI calls; your remaining daily budget is too low. Resets at ${check.resetAt}.`,
          });
        }
      }

      const runGroup = randomBytes(8).toString("hex");
      const rowIds: number[] = [];
      for (const panel of [1, 2]) {
        rowIds.push(await db.createAiSwarmReview({
          applicationId: input.applicationId,
          requestedByUserId: ctx.user.id,
          runGroup,
          panel,
          status: "running",
        }));
      }

      const requesterId = ctx.user.id;
      // Deliberation takes 1-2 minutes — far past the ~30s proxy timeout
      // in front of the API. Respond immediately and finish in the
      // background; the client polls byApplication for the "running" →
      // "completed"/"failed" transition. Safe here because the API runs
      // on a long-lived Node process (Railway), never on serverless.
      void (async () => {
        try {
          // The two panels run concurrently and never see each other's output.
          const [panel1, panel2] = await Promise.all([
            runSwarmPanel(app, 0),
            runSwarmPanel(app, 1),
          ]);

          const results = [panel1, panel2];
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.unavailable) {
              await db.updateAiSwarmReview(rowIds[i], {
                status: "failed",
                errorMessage: r.summary,
                completedAt: new Date(),
              });
            } else {
              await db.updateAiSwarmReview(rowIds[i], {
                status: "completed",
                verdict: r.verdict,
                score: r.score,
                report: JSON.stringify(r),
                completedAt: new Date(),
              });
            }
          }

          await db.addAuditLog({
            applicationId: input.applicationId,
            userId: requesterId,
            action: "ai_swarm_review_run",
            details: `Dual-panel swarm audit (${runGroup}): Panel 1 ${panel1.unavailable ? "UNAVAILABLE" : `${panel1.verdict.toUpperCase()} ${panel1.score}/100`}, Panel 2 ${panel2.unavailable ? "UNAVAILABLE" : `${panel2.verdict.toUpperCase()} ${panel2.score}/100`}. Advisory assessment only; qualified human committee decision required.`,
          });
        } catch (err) {
          console.error("[AI Swarm] background run failed:", safeLogError(err));
          for (const id of rowIds) {
            try {
              await db.updateAiSwarmReview(id, {
                status: "failed",
                errorMessage: "Swarm deliberation crashed unexpectedly. Check server logs and run again.",
                completedAt: new Date(),
              });
            } catch { /* best-effort */ }
          }
        }
      })();

      return { runGroup, accepted: true as const };
    }),
});

// ─── Analytics (public ingest + owner metrics) ─────────────────────────────

const analyticsRouter = router({
  ingest: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      path: z.string().min(1).max(255),
      eventType: z.enum(["pageview", "heartbeat", "leave"]),
      dwellMs: z.number().int().min(0).max(120_000).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const path = stripPath(input.path);
      // Skip self-noise from the owner dashboard.
      if (path.startsWith("/admin/observability")) return { ok: true as const };
      const geo = await resolveCoarseGeo(ctx.req);
      const ua = typeof ctx.req.headers["user-agent"] === "string"
        ? ctx.req.headers["user-agent"]
        : undefined;
      await db.ingestAnalyticsEvent({
        sessionId: input.sessionId,
        path,
        eventType: input.eventType,
        dwellMs: input.dwellMs,
        userId: ctx.user?.id ?? null,
        ipHash: requestIpHash(ctx.req),
        country: geo.country,
        region: geo.region,
        city: geo.city,
        uaClass: classifyUa(ua),
      });
      return { ok: true as const };
    }),

  metrics: ownerProcedure.query(async () => db.getObservabilityMetrics()),
});

const chatApplicationRouter = router({
  sendMessage: protectedProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })).max(16),
      lang: z.enum(["ar", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return chatApplicationTurn({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        messages: input.messages,
        langHint: input.lang,
      });
    }),
  history: protectedProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (app.applicantId !== ctx.user.id) assertStaffMfa(ctx.user);
      const rows = await db.getChatApplicationMessages(input.applicationId, app.applicantId);
      const { listMissingRequirements } = await import("./services/irb.validation");
      return {
        messages: rows
          .filter(r => r.role === "user" || r.role === "assistant")
          .map(r => ({ role: r.role as "user" | "assistant", content: r.content })),
        missing: listMissingRequirements(app),
      };
    }),
});

// ─── Main Router ────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const u = opts.ctx.user;
      if (!u) return null;
      // Surface owner status so the client can show the Owner badge and
      // gate promote/demote (owner-only) in the UI. Authoritative checks
      // still happen server-side on ownerProcedure.
      const { passwordHash: _passwordHash, ...safeUser } = u;
      return {
        ...safeUser,
        authLevel: u.authLevel ?? "aal1",
        staffMfaRequired: ENV.isProduction && process.env.STAFF_MFA_REQUIRED !== "false",
        isOwner: isPlatformOwner(u),
      };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      try {
        await sdk.revokeRequestSession(ctx.req);
      } catch {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Session revocation is temporarily unavailable. Please retry signing out." });
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // ORCID linking — applicant types their iD; we validate format and
    // store. `verified=false` until the OAuth dance is wired (separate
    // Bundle once ORCID developer credentials are obtained).
    setOrcid: protectedProcedure
      .input(z.object({ orcidId: z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, "Format must be 0000-0000-0000-0000").nullable() }))
      .mutation(async ({ ctx, input }) => {
        await db.setUserOrcid(ctx.user.id, input.orcidId, false);
        return { success: true, verified: false };
      }),
    // PDPL: right of access — everything we store about the caller, as a
    // JSON bundle the client downloads. Never includes password hashes.
    exportMyData: protectedProcedure.query(async ({ ctx }) => {
      return db.exportUserData(ctx.user.id);
    }),
    // PDPL: right to erasure — typed confirmation required. Drafts are
    // hard-deleted; submitted/approved applications are regulatory records
    // and are retained (per the platform policy shown in the UI). The
    // account itself is anonymised and every session stops resolving.
    deleteMyAccount: protectedProcedure
      .input(z.object({ confirm: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (input.confirm !== "DELETE-MY-ACCOUNT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Confirmation phrase missing or incorrect" });
        }
        if (isPlatformOwner(ctx.user)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The platform owner account cannot self-delete. Transfer ownership first.",
          });
        }
        const result = await db.eraseUserAccount(ctx.user.id);
        await db.addAuditLog({
          userId: ctx.user.id,
          action: "account_self_deleted",
          details: `Drafts removed: ${result.deletedDraftApplications}; regulatory records retained: ${result.retainedRegulatoryApplications}`,
        }).catch(() => {});
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true, ...result };
      }),
  }),
  application: applicationRouter,
  chatApplication: chatApplicationRouter,
  authors: authorsRouter,
  review: reviewRouter,
  admin: adminRouter,
  verify: verifyRouter,
  support: supportRouter,
  notification: notificationRouter,
  reports: reportsRouter,
  publicStats: publicStatsRouter,
  literature: literatureRouter,
  adverseEvents: adverseEventsRouter,
  amendments: amendmentsRouter,
  aiSwarm: aiSwarmRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
