import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getInstitutionalAuthCapabilities,
  signInInstitutional,
} from "./institutionalAuth";

vi.mock("./supabase", () => ({
  isSupabaseAuthEnabled: true,
  supabaseUrl: "https://identity.example.test",
}));

function setup() {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: {
      user: { id: "new-institutional-subject" },
      session: {
        access_token: "test-user-jwt",
        user: { id: "new-institutional-subject" },
      },
    },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const bridge = vi.fn().mockResolvedValue(undefined);
  const signUp = vi.fn();
  const client = {
    auth: { signInWithPassword, signOut, signUp },
  } as unknown as Pick<SupabaseClient, "auth">;
  return { client, signInWithPassword, signOut, signUp, bridge };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("institutional password sign-in boundaries", () => {
  it("signs in the selected provider account and bridges only its user token without registering it", async () => {
    const test = setup();
    await expect(
      signInInstitutional(
        test.client,
        " staff@example.test ",
        "untouched password ",
        test.bridge
      )
    ).resolves.toEqual({ ok: true });
    expect(test.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: "staff@example.test",
      password: "untouched password ",
    });
    expect(test.bridge).toHaveBeenCalledExactlyOnceWith("test-user-jwt");
    expect(test.signUp).not.toHaveBeenCalled();
    expect(test.signOut).not.toHaveBeenCalled();
  });
  it("does not bridge or fall back after incorrect institutional credentials", async () => {
    const test = setup();
    test.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        code: "invalid_credentials",
        message: "sensitive provider diagnostic",
      },
    });
    await expect(
      signInInstitutional(test.client, "a@example.test", "wrong", test.bridge)
    ).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(test.bridge).not.toHaveBeenCalled();
    expect(test.signUp).not.toHaveBeenCalled();
    expect(test.signInWithPassword).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ status: 429, message: "provider throttling detail" }, "RATE_LIMITED"],
    [
      { code: "email_not_confirmed", message: "private account information" },
      "SIGNIN_FAILED",
    ],
  ])(
    "exposes only a safe error category for provider errors",
    async (error, code) => {
      const test = setup();
      test.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error,
      });
      await expect(
        signInInstitutional(test.client, "a@example.test", "test", test.bridge)
      ).resolves.toEqual({ ok: false, code });
      expect(test.bridge).not.toHaveBeenCalled();
    }
  );
  it("redacts thrown network or SDK diagnostics", async () => {
    const test = setup();
    test.signInWithPassword.mockRejectedValue(
      new Error("request body contains private data")
    );
    await expect(
      signInInstitutional(test.client, "a@example.test", "test", test.bridge)
    ).resolves.toEqual({ ok: false, code: "NETWORK_ERROR" });
    expect(test.bridge).not.toHaveBeenCalled();
  });
  it.each([
    { user: { id: "new-institutional-subject" }, session: null },
    {
      user: { id: "another-identity" },
      session: {
        access_token: "test-user-jwt",
        user: { id: "new-institutional-subject" },
      },
    },
  ])(
    "requires a complete consistent provider session before the bridge",
    async data => {
      const test = setup();
      test.signInWithPassword.mockResolvedValue({ data, error: null });
      await expect(
        signInInstitutional(test.client, "a@example.test", "test", test.bridge)
      ).resolves.toEqual({ ok: false, code: "SIGNIN_FAILED" });
      expect(test.bridge).not.toHaveBeenCalled();
    }
  );
  it("reports no platform success and clears only the new local provider session if the bridge rejects", async () => {
    const test = setup();
    test.bridge.mockRejectedValue(new Error("sensitive bridge response"));
    await expect(
      signInInstitutional(test.client, "a@example.test", "test", test.bridge)
    ).resolves.toEqual({ ok: false, code: "SESSION_BRIDGE_FAILED" });
    expect(test.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
});

describe("institutional provider capability discovery", () => {
  it("uses a public apikey without app cookies and requires exact enabled flags", async () => {
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", " sb_publishable_fixture ");
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          external: {
            email: true,
            google: true,
            apple: "true",
            linkedin_oidc: false,
          },
        }),
      });
    vi.stubGlobal("fetch", fetch);
    await expect(getInstitutionalAuthCapabilities()).resolves.toEqual({
      available: true,
      email: true,
      socialProviders: ["google"],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://identity.example.test/auth/v1/settings",
      expect.objectContaining({
        credentials: "omit",
        headers: { apikey: "sb_publishable_fixture" },
      })
    );
  });
  it.each([{}, { external: { google: false, email: false } }])(
    "does not infer email support from a reachable project",
    async settings => {
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "sb_publishable_fixture");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => settings })
      );
      await expect(getInstitutionalAuthCapabilities()).resolves.toEqual({
        available: true,
        email: false,
        socialProviders: [],
      });
    }
  );
  it("fails closed when the identity tenant is unavailable", async () => {
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "sb_publishable_fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection unavailable"))
    );
    await expect(getInstitutionalAuthCapabilities()).resolves.toEqual({
      available: false,
      email: false,
      socialProviders: [],
    });
  });
});
