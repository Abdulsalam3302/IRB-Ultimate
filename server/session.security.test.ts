import { describe, expect, it, vi } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const";
vi.mock("./db", () => ({ getDb: async () => null, getUserByOpenId: vi.fn() }));
import { sdk } from "./_core/sdk";

describe("session authority and revocation", () => {
  it("preserves verified MFA assurance and caps privileged sessions at one hour", async () => {
    const token = await sdk.createSessionToken("institutional-staff", { authLevel: "aal2", expiresInMs: 14 * 24 * 60 * 60_000 });
    const payload = decodeJwt(token);
    expect(payload.authLevel).toBe("aal2");
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(3600);
    expect((await sdk.verifySession(token))?.authLevel).toBe("aal2");
    expect((await sdk.verifySession(await sdk.createSessionToken("ordinary-login")))?.authLevel).toBe("aal1");
  });
  it("accepts its own empty-display-name session and revokes exactly that session", async () => {
    const first = await sdk.createSessionToken("researcher-one");
    const second = await sdk.createSessionToken("researcher-one");
    expect((await sdk.verifySession(first))?.openId).toBe("researcher-one");
    await sdk.revokeRequestSession({ headers: { cookie: `${COOKIE_NAME}=${first}` } } as any);
    expect(await sdk.verifySession(first)).toBeNull();
    expect(await sdk.verifySession(second)).not.toBeNull();
  });
  it("rejects legacy tokens lacking an expiry or session ID", async () => {
    const token = await new SignJWT({ openId: "attacker", appId: ENV.appId, name: "Name" })
      .setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(ENV.cookieSecret));
    expect(await sdk.verifySession(token)).toBeNull();
  });
  it("rejects cross-application tokens even with the same signing secret", async () => {
    const token = await sdk.signSession({ openId: "attacker", name: "Name", appId: "different-app" });
    expect(await sdk.verifySession(token)).toBeNull();
  });
});
