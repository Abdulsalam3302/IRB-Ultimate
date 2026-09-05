import { safeLogError } from "../_core/safeLog";
import * as db from "../db";
import { ENV } from "../_core/env";
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
  if (owner?.role === "admin") {
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

export async function applyOfficialDigitalApproval(opts: {
  applicationId: number;
  actorUserId: number;
  via: string;
  swarm: SwarmReviewResult;
  bots: BotPanelResult;
}): Promise<AcceleratedReviewOutcome> {
  // Retained as a compatibility boundary for older callers. AI evidence never
  // carries authority to change an approval state or create a certificate.
  const reason = "Qualified human committee review and an authorized recorded decision are required before IRB approval.";
  await db.addAuditLog({
    applicationId: opts.applicationId,
    userId: opts.actorUserId,
    action: "automated_approval_blocked",
    details: reason,
  });
  await notifyOwnerAccelerated(opts.applicationId, "Human committee decision required", reason);
  return { action: "owner_alert", reason };
}

/**
 * Advisory pre-screening. Automated checks route work but cannot issue an
 * ethics decision, manufacture committee votes, or generate approval documents.
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
    console.warn("[Accelerated] swarm persist failed", safeLogError(err));
  }

  await db.addAuditLog({
    applicationId,
    userId: actorUserId,
    action: "automated_advisory_review",
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
      action: "automated_specialty_check",
      details: JSON.stringify({
        reviewer: r.reviewer.name,
        specialty: r.reviewer.specialty,
        passed: r.passed,
        score: r.score,
      }),
    });
  }

  if (decision === "human_review") {
    const via = swarm.passed ? "automated completeness checks" : "automated specialty checklists";
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
    `${OWNER_ALERT_NOT_PASSED} Application #${applicationId}. Automated advisory checks found outstanding items. A qualified human committee must assess the application.`,
  );

  return { swarm, bots, outcome: { action: "owner_alert", reason: OWNER_ALERT_NOT_PASSED } };
}
