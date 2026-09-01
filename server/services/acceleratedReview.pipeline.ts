import * as db from "../db";
import { ENV } from "../_core/env";
import { generateAndStoreCertificatePdf } from "../certificateV2";
import {
  runBotPanelReview,
  runSwarmReview,
  type BotPanelResult,
  type SwarmReviewResult,
} from "./acceleratedReview.service";
import * as emailService from "../emailService";
import { notifyOwner } from "../_core/notification";

export type AcceleratedReviewOutcome =
  | { action: "auto_approved"; irbNumber: string }
  | { action: "owner_alert"; reason: string };

export type AcceleratedPipelineResult = {
  swarm: SwarmReviewResult;
  bots: BotPanelResult;
  outcome: AcceleratedReviewOutcome;
};

async function notifyOwnerAccelerated(
  applicationId: number,
  title: string,
  content: string,
) {
  const owner = await db.getUserByEmail(ENV.ownerEmail);
  if (owner) {
    await emailService.createNotification({
      userId: owner.id,
      applicationId,
      type: "admin",
      title,
      message: content,
    });
  }
  try {
    await notifyOwner({ title, content });
  } catch {
    /* optional upstream */
  }
}

const REVIEWABLE = new Set(["under_review", "pending_admin", "submitted"]);

/**
 * Official NBCE digital pathway: AI Swarm OR unanimous 4-reviewer pass
 * issues approval. Both fail → owner alert for manual action.
 */
export async function runAcceleratedPipeline(
  applicationId: number,
  actorUserId: number,
): Promise<AcceleratedPipelineResult> {
  const app = await db.getApplicationById(applicationId);
  if (!app) throw new Error("Application not found");

  const swarm = runSwarmReview(app);
  const bots = runBotPanelReview(app);

  await db.addAuditLog({
    applicationId,
    userId: actorUserId,
    action: "accelerated_digital_review",
    details: JSON.stringify({
      swarmPassed: swarm.passed,
      swarmScore: swarm.overallScore,
      botsPassed: bots.passed,
      botApprovals: bots.approvals,
    }),
  });

  for (const r of bots.reviewers) {
    await db.addAuditLog({
      applicationId,
      userId: actorUserId,
      action: "digital_reviewer_decision",
      details: JSON.stringify({
        reviewer: r.reviewer.name,
        specialty: r.reviewer.specialty,
        passed: r.passed,
        score: r.score,
      }),
    });
  }

  const fastPath = swarm.passed || bots.passed;

  if (fastPath && !REVIEWABLE.has(app.status)) {
    const reason =
      "Accelerated review passed but application is not in a reviewable status";
    await notifyOwnerAccelerated(applicationId, "IRB review attention needed", reason);
    return { swarm, bots, outcome: { action: "owner_alert", reason } };
  }

  if (fastPath) {
    const irbNumber = await db.generateIrbNumber();
    const applicant = await db.getUserById(app.applicantId);
    let certUrl = "";
    try {
      certUrl = await generateAndStoreCertificatePdf({
        app: { ...app, irbNumber, approvedAt: new Date(), status: "approved" } as typeof app,
        applicantName: applicant?.name ?? null,
        applicantEmail: applicant?.email ?? null,
      });
    } catch (e) {
      console.error("[Accelerated] certificate generation failed", e);
    }

    const via = swarm.passed ? "AI Swarm pass" : "unanimous digital reviewers (4/4)";
    await db.updateApplication(applicationId, {
      status: "approved",
      irbNumber,
      approvedAt: new Date(),
      certificateUrl: certUrl || null,
      adminNotes: `Official digital approval via ${via}. Swarm=${swarm.passed}, Bots=${bots.passed}.`,
    });

    await db.addAuditLog({
      applicationId,
      userId: actorUserId,
      action: "accelerated_auto_approved",
      details: `IRB ${irbNumber} issued via ${via}`,
    });

    await notifyOwnerAccelerated(
      applicationId,
      "IRB auto-approved (official digital pathway)",
      `Application #${applicationId} approved as ${irbNumber}. Swarm=${swarm.passed}, Bots=${bots.passed}.`,
    );

    try {
      await emailService.notifyAdminApproved(app.applicantId, applicationId, irbNumber);
      await emailService.notifyCertificateIssued(app.applicantId, applicationId, irbNumber);
    } catch {
      /* best-effort */
    }

    return { swarm, bots, outcome: { action: "auto_approved", irbNumber } };
  }

  const reason =
    "Neither the AI Swarm nor the four designated digital reviewers reached a pass. Manual owner action is required.";
  await notifyOwnerAccelerated(
    applicationId,
    "IRB manual review required",
    `${reason} Application #${applicationId}.`,
  );

  return { swarm, bots, outcome: { action: "owner_alert", reason } };
}
