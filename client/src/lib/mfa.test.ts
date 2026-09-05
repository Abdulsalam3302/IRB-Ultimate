import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mfaQrImage, requireMatchingSupabaseSession, verifyTotpAndBridge } from "./mfa";

function setup() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "identity-a" } } }, error: null });
  const challengeAndVerify = vi.fn().mockResolvedValue({ data: { access_token: "test-access-token", user: { id: "identity-a" } }, error: null });
  const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  const bridge = vi.fn().mockResolvedValue(undefined);
  const client = { auth: { getSession, mfa: { challengeAndVerify, getAuthenticatorAssuranceLevel } } } as unknown as Pick<SupabaseClient, "auth">;
  return { client, bridge, getSession, challengeAndVerify, getAuthenticatorAssuranceLevel };
}

describe("MFA session upgrade boundaries", () => {
  it("requires the same institutional identity before modifying MFA", async () => {
    const test = setup();
    await expect(verifyTotpAndBridge(test.client, "sb:another-identity", "factor-a", "123456", test.bridge)).rejects.toThrow("ACCOUNT_MISMATCH");
    expect(test.challengeAndVerify).not.toHaveBeenCalled();
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("does not treat a missing provider session as MFA enabled", async () => {
    const test = setup();
    test.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(requireMatchingSupabaseSession(test.client, "sb:identity-a")).rejects.toThrow("SIGNIN_REQUIRED");
  });
  it("bridges only after a successful code and confirmed aal2 for the same identity", async () => {
    const test = setup();
    await verifyTotpAndBridge(test.client, "sb:identity-a", "factor-a", "123456", test.bridge);
    expect(test.challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-a", code: "123456" });
    expect(test.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("test-access-token");
    expect(test.bridge).toHaveBeenCalledExactlyOnceWith("test-access-token");
  });
  it("does not bridge incorrect or unconfirmed codes", async () => {
    const test = setup();
    test.challengeAndVerify.mockResolvedValue({ data: null, error: new Error("Invalid code") });
    await expect(verifyTotpAndBridge(test.client, "sb:identity-a", "factor-a", "123456", test.bridge)).rejects.toThrow("VERIFICATION_FAILED");
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("requires aal2 rather than inferring it from enrollment", async () => {
    const test = setup();
    test.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    await expect(verifyTotpAndBridge(test.client, "sb:identity-a", "factor-a", "123456", test.bridge)).rejects.toThrow("ASSURANCE_NOT_CONFIRMED");
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("propagates a bridge failure without reporting platform success", async () => {
    const test = setup();
    test.bridge.mockRejectedValue(new Error("SESSION_BRIDGE_FAILED"));
    await expect(verifyTotpAndBridge(test.client, "sb:identity-a", "factor-a", "123456", test.bridge)).rejects.toThrow("BRIDGE_FAILED");
  });
  it("rejects malformed OTPs before calling any identity service", async () => {
    const test = setup();
    await expect(verifyTotpAndBridge(test.client, "sb:identity-a", "factor-a", "12ab56", test.bridge)).rejects.toThrow("INVALID_MFA_CODE");
    expect(test.getSession).not.toHaveBeenCalled();
  });
  it("keeps QR SVG in an image data URL and rejects arbitrary remote or active URLs", () => {
    expect(mfaQrImage('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(mfaQrImage('data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100%"></svg>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    for (const input of ["javascript:alert(1)", "https://attacker.example/qr", "data:text/html,<script></script>"]) expect(() => mfaQrImage(input)).toThrow("INVALID_MFA_QR");
  });
});
