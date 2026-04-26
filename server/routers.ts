import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { runStage1AiReview, runStage2AiReview, aiAutoCompleteFields, aiResolveField, aiFixAllComments, calculateSampleSize, aiEnhanceStage1Fields } from "./aiReview";
import { generateCertificatePdf } from "./certificate";
import { generateRetractionCertificatePdf } from "./retractionCertificate";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import * as emailService from "./emailService";
import { searchLiterature } from "./literature";

// ─── Application Router ─────────────────────────────────────────────────────

const applicationRouter = router({
  create: protectedProcedure.mutation(async ({ ctx }) => {
    const id = await db.createApplication({
      applicantId: ctx.user.id,
      status: "draft",
    });
    await db.addAuditLog({
      applicationId: id,
      userId: ctx.user.id,
      action: "application_created",
      details: "New application draft created",
    });
    return { id };
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        const member = await db.getCommitteeMemberByUserId(ctx.user.id);
        if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      }
      const applicant = await db.getUserById(app.applicantId);
      const authors = await db.getAuthorsByApplication(input.id);
      return { ...app, applicantName: applicant?.name, applicantEmail: applicant?.email, authors };
    }),

  myApplications: protectedProcedure.query(async ({ ctx }) => {
    return db.getApplicationsByApplicant(ctx.user.id);
  }),

  // Phase 0: Save Declaration
  saveDeclaration: protectedProcedure
    .input(z.object({
      id: z.number(),
      declarationHonesty: z.boolean(),
      declarationNbceCertification: z.boolean(),
      declarationConsentTruth: z.boolean(),
      declarationAcceptPolicy: z.boolean(),
      nbceCertificateUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // All declarations must be true
      if (!input.declarationHonesty || !input.declarationNbceCertification || !input.declarationConsentTruth || !input.declarationAcceptPolicy) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All declarations must be accepted to proceed" });
      }

      await db.updateApplication(input.id, {
        declarationHonesty: input.declarationHonesty,
        declarationNbceCertification: input.declarationNbceCertification,
        declarationConsentTruth: input.declarationConsentTruth,
        declarationAcceptPolicy: input.declarationAcceptPolicy,
        nbceCertificateUrl: input.nbceCertificateUrl || null,
        declarationCompletedAt: new Date(),
        status: "declaration_pending",
      });

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
      id: z.number(),
      researchType: z.string(),
      irbCategory: z.string(),
      researchTitle: z.string(),
      principalInvestigator: z.string(),
      piEmail: z.string().email(),
      piInstitution: z.string(),
      piDepartment: z.string(),
      fundingSource: z.string().optional(),
      estimatedDuration: z.string().optional(),
      questionnaireFileUrl: z.string().optional(),
      retrospectiveDataSource: z.string().optional(),
      clinicalTrialDetails: z.string().optional(),
      supplementaryFilesJson: z.string().optional(),
      labHeadApproval: z.boolean().optional(),
      labHeadName: z.string().optional(),
      labHeadEmail: z.string().optional(),
      labHeadPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      if (input.researchType === "survey_questionnaire" && !input.questionnaireFileUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Questionnaire file is required for Survey/Questionnaire research type" });
      }
      if (input.researchType === "retrospective" && !input.retrospectiveDataSource) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data source is required for Retrospective Study research type" });
      }

      await db.updateApplication(input.id, {
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
        status: "stage1_pending",
      });

      return { success: true };
    }),

  // Run AI review for Stage 1
  runStage1Review: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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

      await db.updateApplication(input.id, {
        stage1AiScore: result.score,
        stage1AiFeedback: JSON.stringify({
          feedback: result.feedback,
          recommendations: result.recommendations,
          fieldScores: result.fieldScores,
          hasRedFlags: result.hasRedFlags,
        }),
        stage1Passed: result.passed,
        status: result.passed ? "stage2_pending" : "stage1_failed",
      });

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "stage1_ai_review",
        details: `Score: ${result.score}/100 - ${result.passed ? "PASSED" : "FAILED"}${result.hasRedFlags ? " (RED FLAGS)" : ""}`,
      });

      try {
        await emailService.notifyAiReviewResult(ctx.user.id, input.id, 1, result.passed, result.score);
      } catch (e) { /* best-effort */ }

      return result;
    }),

  // Save draft (auto-save)
  saveDraft: protectedProcedure
    .input(z.object({
      id: z.number(),
      researchObjectives: z.string().optional(),
      methodology: z.string().optional(),
      sampleSize: z.string().optional(),
      targetPopulation: z.string().optional(),
      inclusionCriteria: z.string().optional(),
      exclusionCriteria: z.string().optional(),
      dataCollectionMethods: z.string().optional(),
      informedConsentProcess: z.string().optional(),
      riskAssessment: z.string().optional(),
      benefitAssessment: z.string().optional(),
      confidentialityMeasures: z.string().optional(),
      conflictOfInterest: z.string().optional(),
      rejectionFileUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const updates: Record<string, any> = {};
      const fields = ["researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures", "conflictOfInterest", "rejectionFileUrl"];
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updates[f] = (input as any)[f];
      }
      if (Object.keys(updates).length > 0) {
        await db.updateApplication(input.id, updates);
      }
      return { success: true };
    }),

  // AI auto-complete fields (aims for 100/100)
  aiAutoComplete: protectedProcedure
    .input(z.object({
      id: z.number(),
      existingFields: z.record(z.string(), z.string()),
      stage: z.enum(["stage1", "stage2"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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
  // client can update form + result card in a single render.
  aiEnhanceStage1: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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

      // 2) Persist.
      await db.updateApplication(input.id, {
        researchTitle: merged.researchTitle,
        principalInvestigator: merged.principalInvestigator,
        piInstitution: merged.piInstitution,
        piDepartment: merged.piDepartment,
        fundingSource: merged.fundingSource,
        estimatedDuration: merged.estimatedDuration,
      });

      // 3) Re-run Stage 1 review against the enhanced data.
      const review = await runStage1AiReview({
        researchType: app.researchType || "",
        irbCategory: app.irbCategory || "",
        researchTitle: merged.researchTitle,
        principalInvestigator: merged.principalInvestigator,
        piInstitution: merged.piInstitution,
        piDepartment: merged.piDepartment,
        fundingSource: merged.fundingSource,
        estimatedDuration: merged.estimatedDuration,
      });

      // 4) Persist the new review.
      await db.updateApplication(input.id, {
        stage1AiScore: review.score,
        stage1AiFeedback: JSON.stringify({
          feedback: review.feedback,
          recommendations: review.recommendations,
          fieldScores: review.fieldScores,
          hasRedFlags: review.hasRedFlags,
        }),
        stage1Passed: review.passed,
        status: review.passed ? "stage2_pending" : "stage1_failed",
      });

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "stage1_ai_enhance",
        details: `AI Enhance & Re-review: score ${review.score}/100 — ${review.passed ? "PASSED" : "FAILED"}`,
      });

      return { fields: merged, review };
    }),

  // AI resolve single field
  aiResolveField: protectedProcedure
    .input(z.object({
      id: z.number(),
      fieldName: z.string(),
      currentValue: z.string(),
      feedback: z.string(),
      context: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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

  // Sample size calculator
  calculateSampleSize: protectedProcedure
    .input(z.object({
      studyType: z.string(),
      confidenceLevel: z.number(),
      marginOfError: z.number(),
      populationSize: z.number().optional(),
      expectedProportion: z.number().optional(),
      effectSize: z.string().optional(),
      power: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return calculateSampleSize(input);
    }),

  // AI review feedback
  submitAiFeedback: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
      stage: z.number(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
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
      id: z.number(),
      researchObjectives: z.string(),
      methodology: z.string(),
      sampleSize: z.string(),
      targetPopulation: z.string(),
      inclusionCriteria: z.string(),
      exclusionCriteria: z.string(),
      dataCollectionMethods: z.string(),
      informedConsentProcess: z.string(),
      riskAssessment: z.string(),
      benefitAssessment: z.string(),
      confidentialityMeasures: z.string(),
      conflictOfInterest: z.string(),
      rejectionFileUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateApplication(input.id, {
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
      });

      return { success: true };
    }),

  // Run AI review for Stage 2 (with color-coded field scores)
  runStage2Review: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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

      await db.updateApplication(input.id, {
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
      });

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "stage2_ai_review",
        details: `Score: ${result.score}/100 - ${result.passed ? "PASSED" : "FAILED"}${result.hasRedFlags ? " (RED FLAGS)" : ""}`,
      });

      try {
        await emailService.notifyAiReviewResult(ctx.user.id, input.id, 2, result.passed, result.score);
      } catch (e) { /* best-effort */ }

      return result;
    }),

  // Final submission - triggers committee assignment
  submit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (app.status !== "submitted") throw new TRPCError({ code: "BAD_REQUEST", message: "Application must pass both AI reviews before submission" });

      // Committee assignment is an admin/operations concern, not the
      // applicant's. We always accept the submission. If there are
      // fewer than 5 active members right now, the application sits in
      // `pending_admin` until an admin invites more reviewers, at which
      // point the cron / admin "expire and reassign" job picks it up.
      const activeMembers = await db.getActiveCommitteeMembers();
      const shuffled = [...activeMembers].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(5, activeMembers.length));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      for (const member of selected) {
        await db.createReviewAssignment({
          applicationId: input.id,
          committeeMemberId: member.id,
          assignedBy: "system",
          status: "pending",
          expiresAt,
        });
        await db.updateCommitteeMember(member.id, {
          totalAssignments: member.totalAssignments + 1,
        });
      }

      // If we got 5 reviewers, normal flow. Otherwise queue for admin.
      const nextStatus = selected.length >= 5 ? "under_review" : "pending_admin";
      await db.updateApplication(input.id, {
        status: nextStatus,
        submittedAt: new Date(),
      });

      // Tell the admin if we couldn't fully assign. Best-effort —
      // don't fail submission on notification failure.
      if (selected.length < 5) {
        try {
          await db.addAuditLog({
            applicationId: input.id,
            userId: ctx.user.id,
            action: "queued_for_committee_assignment",
            details: `Submitted with only ${activeMembers.length} active committee members; awaiting admin to invite more (need ${5 - activeMembers.length} more).`,
          });
        } catch { /* best-effort */ }
      }

      // Save version snapshot
      try {
        const latestVersion = await db.getLatestVersionNumber(input.id);
        const prevVersions = await db.getApplicationVersions(input.id);
        const prevSnapshot = prevVersions.length > 0 ? JSON.parse(prevVersions[0].snapshot) : {};
        const currentSnapshot: Record<string, any> = {
          researchType: app.researchType, irbCategory: app.irbCategory, researchTitle: app.researchTitle,
          principalInvestigator: app.principalInvestigator, piEmail: app.piEmail, piInstitution: app.piInstitution,
          piDepartment: app.piDepartment, fundingSource: app.fundingSource, estimatedDuration: app.estimatedDuration,
          researchObjectives: app.researchObjectives, methodology: app.methodology, sampleSize: app.sampleSize,
          targetPopulation: app.targetPopulation, inclusionCriteria: app.inclusionCriteria, exclusionCriteria: app.exclusionCriteria,
          dataCollectionMethods: app.dataCollectionMethods, informedConsentProcess: app.informedConsentProcess,
          riskAssessment: app.riskAssessment, benefitAssessment: app.benefitAssessment,
          confidentialityMeasures: app.confidentialityMeasures, conflictOfInterest: app.conflictOfInterest,
        };
        const changedFields = Object.keys(currentSnapshot).filter(k => currentSnapshot[k] !== prevSnapshot[k]);
        await db.saveApplicationVersion({
          applicationId: input.id,
          version: latestVersion + 1,
          snapshot: JSON.stringify(currentSnapshot),
          status: "under_review",
          stage1AiScore: app.stage1AiScore,
          stage2AiScore: app.stage2AiScore,
          changedFields: JSON.stringify(changedFields),
        });
      } catch (e) { console.warn("[Version] Failed to save snapshot:", e); }

      await db.addAuditLog({
        applicationId: input.id,
        userId: ctx.user.id,
        action: "application_submitted",
        details: `Assigned to ${selected.length} committee members`,
      });

      try {
        await emailService.notifyApplicationSubmitted(ctx.user.id, input.id, app.researchTitle || "Untitled");
        for (const member of selected) {
          await emailService.notifyCommitteeAssigned(member.id, input.id, app.researchTitle || "Untitled");
        }
      } catch (e) { /* notification is best-effort */ }

      return { success: true, assignedMembers: selected.length };
    }),

  // Proceed despite Stage 1 AI score (red flag)
  proceedDespiteStage1: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateApplication(input.id, {
        proceedDespiteStage1: true,
        proceedDespiteStage1Reason: input.reason,
        stage1Passed: true,
        status: "stage2_pending",
      });

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
      id: z.number(),
      reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateApplication(input.id, {
        proceedDespiteStage2: true,
        proceedDespiteStage2Reason: input.reason,
        stage2Passed: true,
        status: "submitted",
      });

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

  // Fix All Comments — batch AI resolve for all flagged fields
  fixAllComments: protectedProcedure
    .input(z.object({
      id: z.number(),
      fields: z.record(z.string(), z.string()),
      fieldScores: z.array(z.object({
        field: z.string(),
        score: z.number(),
        color: z.string(),
        feedback: z.string(),
        suggestion: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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
      fileName: z.string(),
      fileData: z.string(),
      contentType: z.string(),
      applicationId: z.number().optional(),
      category: z.enum(["questionnaire", "supplementary", "nbce_certificate", "rejection_file", "additional_document", "other"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      // Drop the redundant "uploads/" prefix — the storage layer
      // already partitions under /uploads/<key> for the local driver
      // and namespaces by bucket for S3/Forge. Without this fix, local
      // URLs ended up as /uploads/uploads/<userId>/...
      const fileKey = `${ctx.user.id}/${Date.now()}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);

      // Save file metadata to DB
      try {
        await db.addFileUpload({
          applicationId: input.applicationId || null,
          userId: ctx.user.id,
          fileName: input.fileName,
          fileKey,
          fileUrl: url,
          mimeType: input.contentType,
          fileSize: buffer.length,
          category: (input.category || "other") as any,
        });
      } catch (e) {
        console.error("[File Upload] Failed to save metadata:", e);
      }

      return { url, fileKey };
    }),

  // Version history
  getVersions: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id && ctx.user.role !== "admin") {
        const member = await db.getCommitteeMemberByUserId(ctx.user.id);
        if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.getApplicationVersions(input.applicationId);
    }),
});

// ─── Authors Router ─────────────────────────────────────────────────────────

const authorsRouter = router({
  getByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      return db.getAuthorsByApplication(input.applicationId);
    }),

  add: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
      name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      institution: z.string().optional(),
      department: z.string().optional(),
      country: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

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
    .input(z.object({ id: z.number(), applicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.applicantId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.removeAuthor(input.id);
      return { success: true };
    }),
});

// ─── Verification Router (Public) ──────────────────────────────────────────

const verifyRouter = router({
  verifyIrb: publicProcedure
    .input(z.object({ irbNumber: z.string() }))
    .query(async ({ input }) => {
      const app = await db.getApplicationByIrbNumber(input.irbNumber.trim().toUpperCase());
      if (!app) {
        return { found: false as const };
      }

      // Hidden applications cannot be verified
      if (app.status === "hidden") {
        return { found: false as const };
      }

      // Retracted applications show retraction info
      if (app.status === "retracted") {
        const applicant = await db.getUserById(app.applicantId);
        return {
          found: true as const,
          retracted: true as const,
          irbNumber: app.irbNumber,
          researchTitle: app.researchTitle,
          principalInvestigator: app.principalInvestigator,
          piInstitution: app.piInstitution,
          approvedAt: app.approvedAt,
          retractedAt: app.retractedAt,
          retractionReason: app.retractionReason,
          retractionCertificateUrl: app.retractionCertificateUrl,
          applicantName: applicant?.name,
        };
      }

      // Only approved applications show full details
      if (app.status !== "approved") {
        return { found: false as const };
      }

      const applicant = await db.getUserById(app.applicantId);
      const authors = await db.getAuthorsByApplication(app.id);
      return {
        found: true as const,
        retracted: false as const,
        irbNumber: app.irbNumber,
        researchTitle: app.researchTitle,
        researchType: app.researchType,
        irbCategory: app.irbCategory,
        principalInvestigator: app.principalInvestigator,
        piInstitution: app.piInstitution,
        piDepartment: app.piDepartment,
        fundingSource: app.fundingSource,
        estimatedDuration: app.estimatedDuration,
        approvedAt: app.approvedAt,
        stage1AiScore: app.stage1AiScore,
        stage2AiScore: app.stage2AiScore,
        certificateUrl: app.certificateUrl,
        applicantName: applicant?.name,
        authors,
      };
    }),
});

// ─── Support Ticket Router ──────────────────────────────────────────────────

const supportRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string(),
      email: z.string().email(),
      subject: z.string(),
      category: z.enum(["issue", "suggestion", "question", "other"]),
      message: z.string(),
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
        await notifyOwner({
          title: `New Support Ticket: ${input.subject}`,
          content: `From: ${input.name} (${input.email})\nCategory: ${input.category}\n\n${input.message}`,
        });
      } catch (e) { /* best-effort */ }

      return { id, success: true };
    }),

  all: adminProcedure.query(async () => {
    return db.getAllSupportTickets();
  }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateSupportTicket(input.id, { status: input.status as any });
      return { success: true };
    }),
});

// ─── Review Router ──────────────────────────────────────────────────────────

const reviewRouter = router({
  myPendingReviews: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getCommitteeMemberByUserId(ctx.user.id);
    if (!member) return [];
    await db.expireOldReviews();
    const reviews = await db.getPendingReviewsByMember(member.id);
    const enriched = await Promise.all(reviews.map(async (r) => {
      const app = await db.getApplicationById(r.applicationId);
      return { ...r, application: app };
    }));
    return enriched;
  }),

  myAllReviews: protectedProcedure.query(async ({ ctx }) => {
    const member = await db.getCommitteeMemberByUserId(ctx.user.id);
    if (!member) return [];
    const reviews = await db.getReviewsByCommitteeMember(member.id);
    const enriched = await Promise.all(reviews.map(async (r) => {
      const app = await db.getApplicationById(r.applicationId);
      return { ...r, application: app };
    }));
    return enriched;
  }),

  getByApplication: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const reviews = await db.getReviewsByApplication(input.applicationId);
      const enriched = await Promise.all(reviews.map(async (r) => {
        const allMembers = await db.getAllCommitteeMembers();
        const memberInfo = allMembers.find(m => m.id === r.committeeMemberId);
        let userName = "Committee Member";
        if (memberInfo) {
          const user = await db.getUserById(memberInfo.userId);
          userName = user?.name || "Committee Member";
        }
        return { ...r, memberName: userName };
      }));
      return enriched;
    }),

  submitReview: protectedProcedure
    .input(z.object({
      reviewId: z.number(),
      decision: z.enum(["approved", "rejected"]),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getCommitteeMemberByUserId(ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "You are not a committee member" });

      const review = await db.getReviewAssignmentById(input.reviewId);
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      if (review.committeeMemberId !== member.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (review.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "This review has already been completed or expired" });

      if (new Date() > review.expiresAt) {
        await db.updateReviewAssignment(input.reviewId, { status: "expired" });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Review period has expired" });
      }

      const now = new Date();
      const responseTimeMs = now.getTime() - review.assignedAt.getTime();

      await db.updateReviewAssignment(input.reviewId, {
        status: input.decision,
        comments: input.comments || null,
        respondedAt: now,
      });

      const newTotalResponses = member.totalResponses + 1;
      const newAvgTime = Math.round(((member.averageResponseTimeMs || 0) * member.totalResponses + responseTimeMs) / newTotalResponses);
      await db.updateCommitteeMember(member.id, {
        totalResponses: newTotalResponses,
        totalApprovals: input.decision === "approved" ? member.totalApprovals + 1 : member.totalApprovals,
        totalRejections: input.decision === "rejected" ? member.totalRejections + 1 : member.totalRejections,
        averageResponseTimeMs: newAvgTime,
      });

      await db.addAuditLog({
        applicationId: review.applicationId,
        userId: ctx.user.id,
        action: `review_${input.decision}`,
        details: input.comments || `Committee member ${input.decision} the application`,
      });

      const approvals = await db.countApprovalsByApplication(review.applicationId);
      const rejections = await db.countRejectionsByApplication(review.applicationId);

      try {
        const appForNotif = await db.getApplicationById(review.applicationId);
        if (appForNotif) {
          await emailService.notifyReviewReceived(appForNotif.applicantId, review.applicationId, input.decision, approvals, approvals + rejections);
        }
      } catch (e) { /* best-effort */ }

      if (approvals >= 3) {
        await db.updateApplication(review.applicationId, { status: "pending_admin" });
        await db.addAuditLog({
          applicationId: review.applicationId,
          userId: ctx.user.id,
          action: "moved_to_admin",
          details: `${approvals} approvals received, moved to admin for final decision`,
        });
        try {
          const appForNotif = await db.getApplicationById(review.applicationId);
          if (appForNotif) {
            await emailService.notifyPendingAdmin(appForNotif.applicantId, review.applicationId);
          }
        } catch (e) { /* best-effort */ }
      } else if (rejections >= 3) {
        const app = await db.getApplicationById(review.applicationId);
        if (app && app.submissionCount >= 2) {
          await db.updateApplication(review.applicationId, { status: "permanently_rejected" });
        } else {
          await db.updateApplication(review.applicationId, {
            status: "rejected",
            rejectionReason: "Majority of committee members rejected the application",
          });
        }
      }

      return { success: true, approvals, rejections };
    }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────

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

  // Direct approval - admin can approve any application at any stage
  directApproval: adminProcedure
    .input(z.object({
      applicationId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (["approved", "permanently_rejected", "retracted", "hidden"].includes(app.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify this application" });
      }

      const irbNumber = await db.generateIrbNumber();
      const applicant = await db.getUserById(app.applicantId);

      const updatedApp = { ...app, irbNumber, approvedAt: new Date() };
      let certUrl = "";
      try {
        certUrl = await generateCertificatePdf(updatedApp as any, applicant?.name || "", applicant?.email || "");
      } catch (e) {
        console.error("Certificate generation failed:", e);
      }

      await db.updateApplication(input.applicationId, {
        status: "approved",
        irbNumber,
        adminNotes: input.notes || "Direct approval by admin",
        approvedAt: new Date(),
        certificateUrl: certUrl || null,
      });

      await db.addAuditLog({
        applicationId: input.applicationId,
        userId: ctx.user.id,
        action: "admin_direct_approval",
        details: `Direct approval by admin. IRB Number: ${irbNumber}`,
      });

      try {
        await emailService.notifyAdminApproved(app.applicantId, input.applicationId, irbNumber);
        await emailService.notifyCertificateIssued(app.applicantId, input.applicationId, irbNumber);
      } catch (e) { /* best-effort */ }

      return { success: true, irbNumber, certificateUrl: certUrl };
    }),

  finalDecision: adminProcedure
    .input(z.object({
      applicationId: z.number(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.decision === "approved") {
        const irbNumber = await db.generateIrbNumber();
        const applicant = await db.getUserById(app.applicantId);

        const updatedApp = { ...app, irbNumber, approvedAt: new Date() };
        let certUrl = "";
        try {
          certUrl = await generateCertificatePdf(updatedApp as any, applicant?.name || "", applicant?.email || "");
        } catch (e) {
          console.error("Certificate generation failed:", e);
        }

        await db.updateApplication(input.applicationId, {
          status: "approved",
          irbNumber,
          adminNotes: input.notes || null,
          approvedAt: new Date(),
          certificateUrl: certUrl || null,
        });

        await db.addAuditLog({
          applicationId: input.applicationId,
          userId: ctx.user.id,
          action: "admin_approved",
          details: `IRB Number: ${irbNumber}`,
        });

        try {
          await emailService.notifyAdminApproved(app.applicantId, input.applicationId, irbNumber);
          await emailService.notifyCertificateIssued(app.applicantId, input.applicationId, irbNumber);
        } catch (e) { /* best-effort */ }

        return { success: true, irbNumber, certificateUrl: certUrl };
      } else {
        if (app.submissionCount >= 2) {
          await db.updateApplication(input.applicationId, {
            status: "permanently_rejected",
            adminNotes: input.notes || null,
            rejectionReason: input.notes || "Application rejected by admin",
          });
        } else {
          await db.updateApplication(input.applicationId, {
            status: "rejected",
            adminNotes: input.notes || null,
            rejectionReason: input.notes || "Application rejected by admin",
          });
        }

        await db.addAuditLog({
          applicationId: input.applicationId,
          userId: ctx.user.id,
          action: "admin_rejected",
          details: input.notes || "Rejected by admin",
        });

        try {
          const canResubmit = app.submissionCount < 2;
          await emailService.notifyAdminRejected(app.applicantId, input.applicationId, input.notes || "Application rejected by admin", canResubmit);
        } catch (e) { /* best-effort */ }

        return { success: true };
      }
    }),

  // Retract an approved application (generates red/white retraction PDF)
  retractApplication: adminProcedure
    .input(z.object({
      applicationId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved applications can be retracted" });
      }

      const applicant = await db.getUserById(app.applicantId);
      let retractionUrl = "";
      try {
        retractionUrl = await generateRetractionCertificatePdf(app, applicant?.name || "", input.reason);
      } catch (e) {
        console.error("Retraction certificate generation failed:", e);
      }

      await db.updateApplication(input.applicationId, {
        status: "retracted",
        retractionReason: input.reason,
        retractedAt: new Date(),
        retractionCertificateUrl: retractionUrl || null,
      });

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
      applicationId: z.number(),
      reason: z.string().optional(),
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
      applicationId: z.number(),
      reason: z.string().optional(),
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
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (app.submissionCount >= 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum resubmissions reached" });

      await db.updateApplication(input.applicationId, {
        status: "resubmission_required",
      });

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
      applicationId: z.number(),
      committeeMemberId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.createReviewAssignment({
        applicationId: input.applicationId,
        committeeMemberId: input.committeeMemberId,
        assignedBy: "admin",
        status: "pending",
        expiresAt,
      });

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
      userId: z.number(),
      specialization: z.string().optional(),
      title: z.string().optional(),
      institution: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getCommitteeMemberByUserId(input.userId);
      if (existing) {
        if (!existing.isActive) {
          await db.updateCommitteeMember(existing.id, { isActive: true });
          return { id: existing.id };
        }
        throw new TRPCError({ code: "CONFLICT", message: "User is already a committee member" });
      }
      const id = await db.addCommitteeMember({
        userId: input.userId,
        specialization: input.specialization || null,
        title: input.title || null,
        institution: input.institution || null,
      });
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "committee_member_added",
        details: `User #${input.userId} added as committee member`,
      });
      return { id };
    }),

  removeCommitteeMember: adminProcedure
    .input(z.object({ id: z.number() }))
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
    return db.getAllUsers();
  }),

  searchUsers: adminProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return db.searchUsersByEmail(input.query);
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      await db.updateUserRole(input.userId, input.role);
      await db.addAuditLog({
        userId: ctx.user.id,
        action: "user_role_changed",
        details: `User ${input.userId} role changed to ${input.role}`,
      });
      return { success: true };
    }),

  userCount: adminProcedure.query(async () => {
    return db.getUserCount();
  }),

  auditLog: adminProcedure
    .input(z.object({ applicationId: z.number().optional() }).optional())
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
    .input(z.object({ months: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db.getMonthlyAnalytics(input?.months || 12);
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
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.createReviewAssignment({
          applicationId: review.applicationId,
          committeeMemberId: newMember.id,
          assignedBy: "system",
          status: "pending",
          expiresAt,
        });
        await db.updateCommitteeMember(newMember.id, {
          totalAssignments: newMember.totalAssignments + 1,
        });
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
    .input(z.object({ id: z.number() }))
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
      year: z.number().optional(),
      month: z.number().optional(),
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
      const avgDays = avgProcessingDays.length > 0 ? avgProcessingDays.reduce((a, b) => a + b, 0) / avgProcessingDays.length : 0;

      const memberStats = await Promise.all(members.map(async (m) => {
        const user = await db.getUserById(m.userId);
        return {
          name: user?.name || "Unknown",
          totalAssignments: m.totalAssignments,
          totalResponses: m.totalResponses,
          totalApprovals: m.totalApprovals,
          totalRejections: m.totalRejections,
          responseRate: m.totalAssignments > 0 ? Math.round((m.totalResponses / m.totalAssignments) * 100) : 0,
          avgResponseHours: m.averageResponseTimeMs ? Math.round(m.averageResponseTimeMs / (1000 * 60 * 60) * 10) / 10 : 0,
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
        avgProcessingDays: Math.round(avgDays * 10) / 10,
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
});

// ─── Literature Router ─────────────────────────────────────────────────────
// Cross-checks proposals against PubMed, ClinicalTrials.gov, Semantic Scholar,
// OpenAlex (and Elicit when configured). Each source is queried in parallel
// and individual failures degrade gracefully.

const literatureRouter = router({
  // Free-form search — useful for the resource centre / browsing.
  search: publicProcedure
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
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const app = await db.getApplicationById(input.applicationId);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      // Allow: applicant, admin, or any committee member assigned to the app.
      // Reviewers see literature so they have prior-art context before voting.
      const isOwner = app.applicantId === ctx.user.id;
      const isAdmin = ctx.user.role === "admin";
      let isAssignedReviewer = false;
      if (!isOwner && !isAdmin) {
        const member = await db.getCommitteeMemberByUserId(ctx.user.id);
        if (member) {
          const reviews = await db.getReviewsByApplication(input.applicationId);
          isAssignedReviewer = reviews.some(
            r => r.committeeMemberId === member.id
          );
        }
      }
      if (!isOwner && !isAdmin && !isAssignedReviewer) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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

// ─── Main Router ────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  application: applicationRouter,
  authors: authorsRouter,
  review: reviewRouter,
  admin: adminRouter,
  verify: verifyRouter,
  support: supportRouter,
  notification: notificationRouter,
  reports: reportsRouter,
  publicStats: publicStatsRouter,
  literature: literatureRouter,
});

export type AppRouter = typeof appRouter;
