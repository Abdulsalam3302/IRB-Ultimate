import { canEditApplication } from "../../shared/applicationWorkflow";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Application } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "../_core/env";
import { reserveLlmCall } from "../_core/budget";
import { runStage1AiReview, runStage2AiReview, stageReviewPreflight, normalizeReviewJson, STAGE1_REVIEW_FIELDS, type AiReviewResult } from "../aiReview";
import { STAGE2_FIELDS } from "./irb.validation";

export const STAGE_REVIEW_VERSION = "2026-09-15.2";
const CACHE_TTL_MS = 24 * 60 * 60_000;
const REVIEW_DEADLINE_MS = 39_000;
const inFlight = new Map<string, Promise<AiReviewResult>>();

export function stageReviewInput(stage: 1 | 2, application: Application) {
  const fields = stage === 1 ? STAGE1_REVIEW_FIELDS : ["researchType", "irbCategory", "researchTitle", ...STAGE2_FIELDS];
  return Object.fromEntries(fields.map(field => [field, application[field as keyof Application] ?? ""])) as Record<string, string>;
}

export function stageReviewFingerprint(stage: 1 | 2, data: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify({ version: STAGE_REVIEW_VERSION, stage, model: ENV.llmModel, data })).digest("hex");
}

function cachedReview(stage: 1 | 2, app: Application, fingerprint: string): AiReviewResult | null {
  try {
    const raw = stage === 1 ? app.stage1AiFeedback : app.stage2AiFeedback;
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.status !== "completed" || saved.reviewVersion !== STAGE_REVIEW_VERSION || saved.inputFingerprint !== fingerprint || typeof saved.reviewedAt !== "string") return null;
    const age = Date.now() - Date.parse(saved.reviewedAt);
    if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS) return null;
    // Revalidate durable cache data; older/provider-shaped output is never upgraded.
    const { score, feedback, recommendations, hasRedFlags, fieldSuggestions } = saved;
    const fieldScores = saved.fieldScores?.map(({ field, score, feedback, suggestion }: Record<string, unknown>) => ({ field, score, feedback, suggestion }));
    const validated = normalizeReviewJson({ score, feedback, recommendations, hasRedFlags, fieldSuggestions, fieldScores }, stage === 1 ? STAGE1_REVIEW_FIELDS : STAGE2_FIELDS);
    return { ...validated, status: "completed", issues: [], passed: validated.score >= 70 && !validated.hasRedFlags, fieldScores: saved.fieldScores, reviewedAt: saved.reviewedAt, cached: true };
  } catch { return null; }
}

/** Shared bounded evaluator for authorized interactive requests and immutable submitted jobs.
 * It never writes applications, moves workflow status, or grants committee authority.
 */
export async function evaluateStageSnapshot(stage: 1 | 2, app: Application, userId: number): Promise<AiReviewResult> {
  const data = stageReviewInput(stage, app);
  const preflight = stageReviewPreflight(stage, data);
  if (preflight) return preflight;
  const cached = cachedReview(stage, app, stageReviewFingerprint(stage, data));
  if (cached) return cached;
  const deadline = Date.now() + REVIEW_DEADLINE_MS;
  let result: AiReviewResult = { status: "unavailable", score: null, passed: false, issues: [], hasRedFlags: false, fieldScores: [], recommendations: [], unavailableReason: "timeout", retryable: true, feedback: "AI review took too long. Your saved draft and previous completed assessment are unchanged. Retry later or continue to human review." };
  for (let index = 0; ; index++) {
    let budget;
    try { budget = await reserveLlmCall(userId); }
    catch (error) { if (index > 0) break; throw error; }
    if (!budget.ok) {
      if (index > 0) break; // Preserve the truthful first unavailable result.
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `AI review allowance reached. Your draft is saved. Retry after ${budget.resetAt} or continue to human review.` });
    }
    const remaining = deadline - Date.now();
    if (remaining < 6500) break; // Slow accounting must not start work after the bounded review window.
    const options = { timeoutMs: Math.max(1000, Math.min(index === 0 ? 24_000 : 10_000, remaining - 5500)), skipLiterature: index > 0 };
    result = stage === 1
      ? await runStage1AiReview(data as unknown as Parameters<typeof runStage1AiReview>[0], options)
      : await runStage2AiReview(data as unknown as Parameters<typeof runStage2AiReview>[0], options);
    if (result.status !== "unavailable" || !result.retryable || index >= 1 || deadline - Date.now() < 7000) break;
  }
  return result.status === "completed" ? { ...result, reviewedAt: new Date().toISOString(), cached: false } : result;
}

/** Ownership, preflight and exact-current-content reuse precede paid model reservations. */
export async function runApplicationStageReview(stage: 1 | 2, applicationId: number, userId: number): Promise<AiReviewResult> {
  const app = await db.getApplicationById(applicationId);
  if (!app) throw new TRPCError({ code: "NOT_FOUND" });
  if (app.applicantId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  if (!canEditApplication(app)) throw new TRPCError({ code: "CONFLICT", message: "This application is no longer editable. Refresh to view its current review status." });
  const data = stageReviewInput(stage, app);
  const preflight = stageReviewPreflight(stage, data);
  if (preflight) return preflight;
  const fingerprint = stageReviewFingerprint(stage, data);
  const previous = cachedReview(stage, app, fingerprint);
  if (previous) return previous;
  const key = `${userId}:${applicationId}:${stage}:${fingerprint}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= 24) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI reviews are busy. Your draft is saved; retry shortly." });

  const attempt = async () => {
    const result = await evaluateStageSnapshot(stage, app, userId);
    if (result.status !== "completed") {
      // No numeric score, pass flag or stage transition is persisted for outages.
      await db.addAuditLog({ applicationId, userId, action: `stage${stage}_ai_review_unavailable`, details: "No validated AI assessment was recorded; saved application and prior completed review preserved." });
      return result;
    }
    const completed = { ...result, reviewedAt: new Date().toISOString(), cached: false };
    const payload = JSON.stringify({ ...completed, reviewVersion: STAGE_REVIEW_VERSION, inputFingerprint: fingerprint });
    await db.updateEditableApplication(applicationId, userId, stage === 1 ? {
      stage1AiScore: completed.score, stage1AiFeedback: payload, stage1Passed: completed.passed,
      status: completed.passed ? "stage2_pending" : "stage1_failed",
    } : {
      stage2AiScore: completed.score, stage2AiFeedback: payload, stage2AiFieldScores: JSON.stringify(completed.fieldScores ?? []), stage2Passed: completed.passed,
      status: completed.passed ? "stage2_pending" : "stage2_failed",
    }, app);
    await db.addAuditLog({ applicationId, userId, action: `stage${stage}_ai_review`, details: `Advisory score ${completed.score}/100; ${completed.passed ? "passed preparation checks" : "needs review"}. No official decision issued.` });
    return completed;
  };
  const promise = attempt();
  inFlight.set(key, promise);
  try { return await promise; }
  finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}
