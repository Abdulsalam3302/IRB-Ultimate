import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { assertSafeEgress } from "./ssrfGuard";
import { Semaphore } from "./concurrency";
const notificationWork = new Semaphore(2, 8, 3000);

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

// SA-29: notification content includes user-supplied text (support
// tickets, application titles). Strip control characters (keep \n and \t)
// so a hostile payload can't smuggle terminal escapes or protocol framing
// into the downstream notification channel.
const trimValue = (value: string): string =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * is unconfigured, busy, or unavailable. The payload stays in-app; external
 * pushes carry a generic sign-in notice only. Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  validatePayload(payload);

  // Optional transport must never turn an already committed application
  // transition into an apparent failure when no integration is configured.
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return false;
  return notificationWork.run(async () => {
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    if (new URL(endpoint).protocol !== "https:") return false;
    await assertSafeEgress(endpoint);
  } catch { return false; }

  // 5 second hard timeout. Without this, a stuck connection to the Forge
  // gateway hangs any tRPC mutation that calls notifyOwner — submit,
  // directApproval, finalDecision, support.create all become unresponsive.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      // Research titles, support text, identifiers and reasons remain in the
      // authenticated application. An external push channel gets no case data.
      body: JSON.stringify({ title: "Research ethics platform event", content: "An event needs your attention. Sign in to your authorized dashboard to review the details." }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      console.warn(`[Notification] Delivery unavailable (HTTP ${response.status})`);
      return false;
    }

    await response.body?.cancel();
    return true;
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      console.warn("[Notification] Owner notification timed out after 5s");
    } else {
      console.warn("[Notification] Delivery unavailable");
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
  }).catch(() => false);
}
