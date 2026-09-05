import type { SupabaseClient } from "@supabase/supabase-js";

type AuthClient = Pick<SupabaseClient, "auth">;

export async function bridgeSupabaseSession(accessToken: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/auth/supabase/session", {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("SESSION_BRIDGE_FAILED");
  } catch {
    throw new Error("SESSION_BRIDGE_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

/** Reject stale provider sessions for another platform identity before any MFA mutation. */
export async function requireMatchingSupabaseSession(client: AuthClient, expectedOpenId: string) {
  const result = await client.auth.getSession();
  if (result.error || !result.data.session) throw new Error("INSTITUTIONAL_SIGNIN_REQUIRED");
  if (expectedOpenId !== `sb:${result.data.session.user.id}`) throw new Error("INSTITUTIONAL_ACCOUNT_MISMATCH");
  return result.data.session;
}

/** The server verifies the returned token's signature and AAL before granting any authority. */
export async function verifyTotpAndBridge(
  client: AuthClient,
  expectedOpenId: string,
  factorId: string,
  code: string,
  bridge: (token: string) => Promise<void> = bridgeSupabaseSession,
): Promise<void> {
  if (!/^\d{6}$/.test(code) || !factorId) throw new Error("INVALID_MFA_CODE");
  await requireMatchingSupabaseSession(client, expectedOpenId);
  const verification = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (verification.error || !verification.data?.access_token) throw new Error("MFA_VERIFICATION_FAILED");
  if (`sb:${verification.data.user.id}` !== expectedOpenId) throw new Error("INSTITUTIONAL_ACCOUNT_MISMATCH");
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(verification.data.access_token);
  if (assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("MFA_ASSURANCE_NOT_CONFIRMED");
  await bridge(verification.data.access_token);
}

/** QR content is displayed only in an image context, never inserted as live SVG/HTML. */
export function mfaQrImage(value: string): string {
  if (value.length > 500_000) throw new Error("INVALID_MFA_QR");
  if (/^data:image\/svg\+xml(?:;charset=utf-8|;utf-8|;utf8)?;base64,[A-Za-z0-9+/=]+$/i.test(value)) return value;
  const data = value.match(/^data:image\/svg\+xml(?:;charset=utf-8|;utf-8|;utf8)?,(.*)$/is);
  let svg = value;
  if (data) {
    try { svg = /^\s*</.test(data[1]) ? data[1] : decodeURIComponent(data[1]); } catch { throw new Error("INVALID_MFA_QR"); }
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw new Error("INVALID_MFA_QR");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
