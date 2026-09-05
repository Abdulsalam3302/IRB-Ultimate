import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOAuthCallbackAttempt,
  clearOAuthCallbackParameters,
} from "./oauthCallback";

function setup(
  original = "https://irb.example.test/auth/callback?code=synthetic-code&next=%2Fprofile"
) {
  const autoExchange = vi.fn(),
    exchangeCodeForSession = vi.fn();
  const currentUrl = vi.fn(() => original.replace("code=synthetic-code&", ""));
  const initialize = vi.fn(async () => {
    autoExchange();
    return { error: null as unknown };
  });
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: "synthetic-user-jwt",
        user: { id: "new-subject" },
      },
    },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const bridge = vi.fn().mockResolvedValue(undefined);
  const client = {
    auth: { initialize, getSession, signOut, exchangeCodeForSession },
  } as unknown as Pick<SupabaseClient, "auth">;
  const run = createOAuthCallbackAttempt(client, original, {
    bridge,
    currentUrl,
  });
  return {
    run,
    autoExchange,
    exchangeCodeForSession,
    initialize,
    getSession,
    signOut,
    bridge,
    currentUrl,
  };
}

describe("OAuth callback completion", () => {
  it("leaves the SDK as sole code exchange owner and bridges exactly once across repeated effects", async () => {
    const test = setup();
    await Promise.all([test.run(), test.run()]);
    await test.run();
    expect(test.autoExchange).toHaveBeenCalledTimes(1);
    expect(test.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(test.getSession).toHaveBeenCalledTimes(1);
    expect(test.bridge).toHaveBeenCalledExactlyOnceWith("synthetic-user-jwt");
  });
  it("checks SDK initialization errors before looking at an existing stored identity", async () => {
    const test = setup();
    test.initialize.mockResolvedValue({
      error: new Error("private provider diagnostic"),
    });
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    expect(test.getSession).not.toHaveBeenCalled();
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("refuses a missing-verifier callback when the SDK retained an old session without consuming the code", async () => {
    const test = setup();
    test.currentUrl.mockReturnValue(
      "https://irb.example.test/auth/callback?code=synthetic-code"
    );
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    expect(test.getSession).not.toHaveBeenCalled();
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it.each([
    "?next=%2Fprofile",
    "?code=",
    "?code=synthetic-code&code=other",
    "?code=synthetic-code&error=access_denied",
    "?code=synthetic-code#error_description=private-provider-diagnostic",
    "#access_token=old-token",
  ])(
    "never accepts old stored sessions for absent, ambiguous or errored callback parameters: %s",
    suffix => {
      const test = setup(`https://irb.example.test/auth/callback${suffix}`);
      return expect(test.run())
        .rejects.toThrow("OAUTH_CALLBACK_FAILED")
        .then(() => {
          expect(test.initialize).not.toHaveBeenCalled();
          expect(test.getSession).not.toHaveBeenCalled();
          expect(test.bridge).not.toHaveBeenCalled();
        });
    }
  );
  it("rejects missing session tokens without claiming a successful callback", async () => {
    const test = setup();
    test.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("redacts session errors and keeps failed attempts from being silently retried", async () => {
    const test = setup();
    test.getSession.mockRejectedValue(
      new Error("sensitive request diagnostic")
    );
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    expect(test.getSession).toHaveBeenCalledTimes(1);
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it("clears the new provider session locally after platform bridge rejection", async () => {
    const test = setup();
    test.bridge.mockRejectedValue(new Error("private bridge response"));
    await expect(test.run()).rejects.toThrow("OAUTH_CALLBACK_FAILED");
    expect(test.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
  it.each([
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
  ])("removes query-string %s credentials even on rejected callbacks", key => {
    expect(
      clearOAuthCallbackParameters(
        `https://irb.example.test/auth/callback?${key}=sensitive-fixture&next=%2Fprofile`
      )
    ).toBe("/auth/callback?next=%2Fprofile");
  });

  it("removes callback credentials and provider diagnostics from history while retaining navigation intent", () => {
    expect(
      clearOAuthCallbackParameters(
        "https://irb.example.test/auth/callback?code=private&state=private&sb_flow_id=private&error=private&error_description=private&next=%2Fprofile#access_token=private"
      )
    ).toBe("/auth/callback?next=%2Fprofile");
  });
});
