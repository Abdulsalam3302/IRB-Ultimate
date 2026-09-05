import { describe, expect, it, vi } from "vitest";
import { BUCKET_MAX_BYTES, BUCKET_MIME_TYPES, probeConfigFromEnv, verifySupabaseStorage, type ProbeConfig } from "../scripts/verify-supabase-storage";

const config: ProbeConfig = {
  origin: "https://synthetic-storage.supabase.co", bucket: "irb-private",
  secretKey: "sb_secret_" + "server_test".repeat(4), publishableKey: "sb_publishable_" + "public_test".repeat(4),
  syntheticUserToken: "synthetic.user.signature", syntheticUserId: "00000000-0000-4000-8000-000000000001",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const forbidden = () => json({ code: "AccessDenied", message: "sensitive provider diagnostic" }, 403);

function provider(options: { publicBucket?: boolean; permissiveActor?: string; wrongIdentity?: boolean; identityExpires?: boolean; failCleanup?: boolean; brokenList?: boolean; oversizeBody?: boolean; duplicateAllowed?: boolean; foreignSigning?: boolean; networkFailure?: boolean; legacyErrors?: boolean; expirationBroken?: boolean } = {}) {
  const objects = new Map<string, string>();
  const calls: Array<{ url: URL; init: RequestInit; headers: Headers }> = [];
  let timestamp = Date.parse("2026-09-05T08:00:00Z");
  let signedAt = 0;
  let signedKey = "";
  let userChecks = 0;
  const fakeFetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input)); const headers = new Headers(init.headers);
    calls.push({ url, init, headers });
    expect(url.origin).toBe(config.origin);
    expect(init.redirect).toBe("error");
    const server = headers.get("apikey") === config.secretKey;
    const actor = server ? "server" : headers.get("authorization") ? "authenticated" : headers.has("apikey") ? "publishable" : "anonymous";
    const allow = server || options.permissiveActor === actor;
    const body = typeof init.body === "string" ? init.body : "";
    const data = headers.get("content-type") === "application/json" ? JSON.parse(body || "{}") : {};
    if (url.pathname === "/auth/v1/settings") return json({ external: { email: true } });
    if (url.pathname === "/auth/v1/user") return options.identityExpires && ++userChecks > 1 ? forbidden() : json({ id: options.wrongIdentity ? "other-user" : config.syntheticUserId, role: "authenticated", is_anonymous: false });
    if (url.pathname.includes("/bucket/")) return json({ id: config.bucket, public: !!options.publicBucket, file_size_limit: BUCKET_MAX_BYTES, allowed_mime_types: BUCKET_MIME_TYPES });
    if (url.pathname.includes("/object/list/")) {
      if (!allow) return options.brokenList ? json({ code: "InvalidRequest" }, 400) : json([]);
      return json([...objects.keys()].filter(key => key.startsWith(`${data.prefix}/`)).map(key => ({ name: key.split("/").pop() })));
    }
    if (init.method === "DELETE") {
      expect(server).toBe(true);
      for (const key of data.prefixes) expect(key).toMatch(/^irb-storage-probe\/[0-9a-f-]{36}\/(server-clean|anonymous-attempt|publishable-attempt|authenticated-attempt)\.txt$/);
      if (options.failCleanup) return json({ message: config.secretKey }, 500);
      for (const key of data.prefixes) objects.delete(key);
      return json([]);
    }
    if (url.pathname.includes("/object/sign/")) {
      if (init.method === "POST") {
        if (!allow) return forbidden();
        signedAt = timestamp;
        signedKey = url.pathname.split(`/object/sign/${config.bucket}/`)[1];
        return json({ signedURL: `${options.foreignSigning ? "https://evil.example" : ""}/object/sign/${config.bucket}/${signedKey}?token=synthetic.signed.token` });
      }
      if (!options.expirationBroken && timestamp >= signedAt + 2000) return forbidden();
      return new Response(objects.get(signedKey) || "missing");
    }
    const key = url.pathname.split(`/object/${config.bucket}/`)[1];
    if (url.pathname.includes("/object/public/")) return allow ? new Response("leaked object") : forbidden();
    if (init.method === "POST") {
      if (!allow) return options.legacyErrors ? json({ statusCode: "403", error: "Unauthorized" }, 400) : forbidden();
      expect(headers.get("x-upsert")).toBe("false");
      if (objects.has(key) && !options.duplicateAllowed) return options.legacyErrors ? json({ code: "already_exists" }, 400) : json({ code: "ResourceAlreadyExists" }, 409);
      objects.set(key, body);
      if (options.networkFailure) throw new Error(`request timed out ${config.secretKey} synthetic.signed.token`);
      if (options.oversizeBody) return new Response("x".repeat(65_537));
      return json({ Key: `${config.bucket}/${key}` });
    }
    return allow ? new Response(objects.get(key)) : forbidden();
  });
  return { objects, calls, fetch: fakeFetch as unknown as typeof fetch, egress: vi.fn(async () => new URL(config.origin)), now: () => timestamp,
    sleep: async (ms: number) => { timestamp += ms; } };
}

describe("synthetic storage activation operator probe", () => {
  it("completes all scopes, proves expiry and exact cleanup, and emits no keys, token, or signed URL", async () => {
    const remote = provider();
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("PASS");
    expect(result.requests).toBe(27);
    expect(result.checks.find(c => c.name === "server.expired_link_denied")?.status).toBe("PASS");
    expect(result.checks.find(c => c.name === "authenticated.synthetic_identity_validated")?.status).toBe("PASS");
    expect(result.checks.find(c => c.name === "cleanup.own_prefix_empty")?.status).toBe("PASS");
    expect(remote.objects.size).toBe(0);
    const serialized = JSON.stringify(result);
    for (const sensitive of [config.secretKey, config.publishableKey, config.syntheticUserToken, config.syntheticUserId, "synthetic.signed.token", "?token=", "sensitive provider diagnostic"]) expect(serialized).not.toContain(sensitive);
    expect(remote.calls.filter(call => call.headers.has("authorization")).every(call => call.headers.get("authorization") === `Bearer ${config.syntheticUserToken}`)).toBe(true);
    expect(remote.calls.filter(call => call.headers.get("apikey") === config.secretKey).every(call => !call.headers.has("authorization"))).toBe(true);
  });

  it("reports missing authenticated scope as PARTIAL rather than passing", async () => {
    const remote = provider();
    const result = await verifySupabaseStorage({ ...config, syntheticUserToken: undefined, syntheticUserId: undefined }, remote);
    expect(result.status).toBe("PARTIAL");
    expect(result.checks.find(c => c.name === "authenticated.direct_access")?.status).toBe("NOT_VERIFIED");
    expect(remote.calls.some(call => call.headers.has("authorization"))).toBe(false);
    expect(remote.objects.size).toBe(0);
  });

  it("does not claim authenticated denial with the wrong identity", async () => {
    const remote = provider({ wrongIdentity: true });
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("PARTIAL");
    expect(result.checks.some(c => c.name.startsWith("authenticated.") && c.status === "PASS")).toBe(false);
    expect(remote.calls.filter(call => call.headers.has("authorization"))).toHaveLength(1);
  });

  it("does not treat a token expiring during negative checks as full authorization proof", async () => {
    const result = await verifySupabaseStorage(config, provider({ identityExpires: true }));
    expect(result.status).toBe("PARTIAL");
    expect(result.checks.find(c => c.name === "authenticated.identity_still_valid")?.status).toBe("NOT_VERIFIED");
  });

  it.each(["anonymous", "publishable", "authenticated"])("detects permissive %s access and removes its unexpected upload", async permissiveActor => {
    const remote = provider({ permissiveActor });
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("FAIL");
    expect(result.checks.find(c => c.name === `${permissiveActor}.upload_denied`)?.status).toBe("FAIL");
    expect(result.checks.find(c => c.name === `${permissiveActor}.list_denied`)?.status).toBe("FAIL");
    expect(remote.objects.size).toBe(0);
  });

  it("refuses writes to a public bucket", async () => {
    const remote = provider({ publicBucket: true });
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("FAIL");
    expect(remote.calls).toHaveLength(1);
    expect(remote.objects.size).toBe(0);
  });

  it("marks malformed negative requests unverified rather than treating HTTP 400 as permission denial", async () => {
    const remote = provider({ brokenList: true });
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("PARTIAL");
    expect(result.checks.find(c => c.name === "publishable.list_denied")?.status).toBe("NOT_VERIFIED");
  });

  it("recognizes documented legacy duplicate and access-denial codes without displaying their bodies", async () => {
    const result = await verifySupabaseStorage(config, provider({ legacyErrors: true }));
    expect(result.status).toBe("PASS");
  });

  it.each([{ networkFailure: true }, { oversizeBody: true }, { duplicateAllowed: true }, { foreignSigning: true }])("cleans exact synthetic keys after uncertain or invalid upload/signing result", async options => {
    const remote = provider(options);
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("FAIL");
    expect(result.checks.find(c => c.name === "cleanup.own_prefix_empty")?.status).toBe("PASS");
    expect(remote.objects.size).toBe(0);
    expect(JSON.stringify(result)).not.toContain(config.secretKey);
  });

  it("fails the receipt and supplies only its synthetic cleanup prefix when deletion cannot be verified", async () => {
    const remote = provider({ failCleanup: true });
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("FAIL");
    expect(result.checks.find(c => c.name === "cleanup.own_prefix_empty")?.status).toBe("FAIL");
    expect(result.syntheticPrefix).toMatch(/^irb-storage-probe\/[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain(config.secretKey);
  });

  it("does not count a still-working expired link as a pass", async () => {
    const result = await verifySupabaseStorage(config, provider({ expirationBroken: true }));
    expect(result.status).toBe("FAIL");
    expect(result.checks.find(c => c.name === "server.expired_link_denied")?.status).toBe("FAIL");
  });

  it("fails closed before network on unsafe egress", async () => {
    const remote = provider();
    remote.egress.mockRejectedValueOnce(new Error(`private address ${config.secretKey}`));
    const result = await verifySupabaseStorage(config, remote);
    expect(result.status).toBe("FAIL");
    expect(remote.calls).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(config.secretKey);
  });

  it("bounds a stalled upload response and still cleans its exact attempted object", async () => {
    vi.useFakeTimers();
    try {
      const remote = provider();
      const normalFetch = remote.fetch;
      remote.fetch = (async (input, init) => {
        const result = await normalFetch(input, init);
        if (init?.method === "POST" && String(input).endsWith("/server-clean.txt")) return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted private upload")), { once: true });
        });
        return result;
      }) as typeof fetch;
      const pending = verifySupabaseStorage(config, remote);
      await vi.advanceTimersByTimeAsync(8000);
      const result = await pending;
      expect(result.status).toBe("FAIL");
      expect(result.checks.find(c => c.name === "cleanup.own_prefix_empty")?.status).toBe("PASS");
      expect(remote.objects.size).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("requires explicit server and public keys and rejects malformed endpoint/token config", () => {
    const env = { SUPABASE_URL: config.origin, SUPABASE_STORAGE_BUCKET: config.bucket, SUPABASE_SECRET_KEY: config.secretKey, SUPABASE_PUBLISHABLE_KEY: config.publishableKey };
    expect(probeConfigFromEnv(env).origin).toBe(config.origin);
    for (const patch of [{ SUPABASE_SECRET_KEY: config.publishableKey }, { SUPABASE_URL: "http://localhost:54321" }, { SUPABASE_PUBLISHABLE_KEY: "" }, { SUPABASE_STORAGE_BUCKET: "../unsafe" }, { SUPABASE_STORAGE_PROBE_USER_TOKEN: "Bearer malformed" }, { SUPABASE_STORAGE_PROBE_USER_ID: "person@example.com" }]) expect(() => probeConfigFromEnv({ ...env, ...patch })).toThrow();
  });
});
