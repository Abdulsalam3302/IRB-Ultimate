import * as db from "../db";
import { ENV } from "../_core/env";
import { generateAndStoreCertificatePdf } from "../certificateV2";
import {
  decideAcceleratedOutcome,
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

export const OWNER_ALERT_NOT_PASSED =
  "AI Swarm auto review NOT passed — human intervention required";

const REVIEWABLE = new Set(["under_review", "pending_admin", "submitted"]);

export async function applyOfficialDigitalApproval(opts: {
  applicationId: number;
  actorUserId: number;
  via: string;
  swarm: SwarmReviewResult;
  bots: BotPanelResult;
}): Promise<AcceleratedReviewOutcome> {
  const { applicationId, actorUserId, via, swarm, bots } = opts;
  const app = await db.getApplicationById(applicationId);
  if (!app) throw new Error("Application not found");

  if (app.status === "approved" && app.irbNumber) {
    return { action: "auto_approved", irbNumber: app.irbNumber };
  }

  if (!REVIEWABLE.has(app.status)) {
    const reason =
      "Accelerated review passed but application is not in a reviewable status";
    await notifyOwnerAccelerated(applicationId, OWNER_ALERT_NOT_PASSED, reason);
    return { action: "owner_alert", reason };
  }

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

  await db.updateApplication(applicationId, {
    status: "approved",
    irbNumber,
    approvedAt: new Date(),
    certificateUrl: certUrl || null,
    adminNotes: `Official digital approval under Dr. Abdulsalam Aleid via ${via}. Swarm=${swarm.passed}, Bots=${bots.passed}.`,
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
    `Application #${applicationId} approved as ${irbNumber} under Dr. Abdulsalam Aleid. Swarm=${swarm.passed}, Bots=${bots.passed}.`,
  );

  try {
    await emailService.notifyAdminApproved(app.applicantId, applicationId, irbNumber);
    await emailService.notifyCertificateIssued(app.applicantId, applicationId, irbNumber);
  } catch {
    /* best-effort */
  }

  return { action: "auto_approved", irbNumber };
}

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
  let bots: BotPanelResult = { passed: false, unanimous: false, approvals: 0, reviewers: [] };
  const first = decideAcceleratedOutcome(swarm.passed, null);
  if (first === "run_bots") {
    bots = runBotPanelReview(app);
  }
  const decision = decideAcceleratedOutcome(swarm.passed, first === "run_bots" ? bots : null);

  try {
    await db.createAiSwarmReview({
      applicationId,
      requestedByUserId: actorUserId,
      runGroup: `accelerated-${Date.now()}`,
      panel: 1,
      status: "completed",
      verdict: swarm.passed ? "pass" : "fail",
      score: swarm.overallScore,
      report: JSON.stringify({ kind: "accelerated_heuristic", swarm, bots, decision }),
      completedAt: new Date(),
    });
  } catch (err) {
    console.warn("[Accelerated] swarm persist failed", err);
  }

  await db.addAuditLog({
    applicationId,
    userId: actorUserId,
    action: "accelerated_digital_review",
    details: JSON.stringify({
      swarmPassed: swarm.passed,
      swarmScore: swarm.overallScore,
      botsRan: first === "run_bots",
      botsPassed: bots.passed,
      botApprovals: bots.approvals,
      decision,
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

  if (decision === "auto_approve") {
    const via = swarm.passed ? "AI Swarm pass" : "unanimous digital reviewers (4/4)";
    const outcome = await applyOfficialDigitalApproval({
      applicationId,
      actorUserId,
      via,
      swarm,
      bots,
    });
    return { swarm, bots, outcome };
  }

  await notifyOwnerAccelerated(
    applicationId,
    OWNER_ALERT_NOT_PASSED,
    `${OWNER_ALERT_NOT_PASSED} Application #${applicationId}. Neither the AI Swarm nor the four designated digital reviewers reached a pass.`,
  );

  return { swarm, bots, outcome: { action: "owner_alert", reason: OWNER_ALERT_NOT_PASSED } };
}
