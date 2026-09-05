import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const captured = vi.hoisted(() => ({ options: [] as any[], clients: [] as SupabaseClient[] }));
vi.mock("@supabase/supabase-js", async importOriginal => {
  const original = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...original, createClient: (...args: Parameters<typeof original.createClient>) => {
    captured.options.push(args[2]);
    const client = original.createClient(...args); captured.clients.push(client as SupabaseClient); return client;
  } };
});

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const key = "sb-synthetic-project-auth-token";
const ownedKeys = [key, `${key}-user`, `${key}-code-verifier`, `${key}-flows-code-verifier`, `${key}-flow-${"a".repeat(32)}-code-verifier`];
let local: MemoryStorage, session: MemoryStorage;
let module: typeof import("./supabase");
const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "synthetic@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-09-05T00:00:00Z" };
function authSession(label = "initial") {
  return { access_token: `synthetic-${label}-access`, refresh_token: `synthetic-${label}-refresh`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
}
function seed() {
  for (const store of [local, session]) {
    store.setItem(key, JSON.stringify(authSession()));
    store.setItem(`${key}-user`, JSON.stringify({ user }));
    store.setItem(`${key}-code-verifier`, '"synthetic-pkce"');
    store.setItem(`${key}-flows-code-verifier`, JSON.stringify(["a".repeat(32)]));
    store.setItem(`${key}-flow-${"a".repeat(32)}-code-verifier`, '"synthetic-flow-pkce"');
    store.setItem("theme", "dark"); store.setItem("sb-other-project-auth-token", "other-project-session");
    store.setItem(`${key}-preferred-language`, "ar");
  }
}
function expectClean() {
  for (const store of [local, session]) {
    for (const owned of ownedKeys) expect(store.getItem(owned)).toBeNull();
    expect(store.getItem("theme")).toBe("dark");
    expect(store.getItem("sb-other-project-auth-token")).toBe("other-project-session");
    expect(store.getItem(`${key}-preferred-language`)).toBe("ar");
  }
}
beforeEach(async () => {
  vi.resetModules(); captured.options.length = 0; captured.clients.length = 0;
  vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic-project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "sb_publishable_synthetic_public_fixture_000000");
  local = new MemoryStorage(); session = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  module = await import("./supabase");
});
afterEach(async () => {
  for (const client of captured.clients) await client.auth.dispose();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("Supabase logout retires the real SDK client locally", () => {
  it.each(["503", "offline"])("clears only project credentials when remote logout is %s", async mode => {
    seed();
    const fetch = vi.fn(async () => { if (mode === "offline") throw new TypeError("Synthetic offline"); return new Response(JSON.stringify({ code: "unexpected_failure", message: "Synthetic outage" }), { status: 503 }); });
    vi.stubGlobal("fetch", fetch);
    const client = module.getSupabase(); await client.auth.initialize();
    const stop = vi.spyOn(client.auth, "stopAutoRefresh"), dispose = vi.spyOn(client.auth, "dispose");
    await module.signOutSupabase();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/auth/v1/logout?scope=local");
    expect(stop).toHaveBeenCalled(); expect(dispose).toHaveBeenCalled(); expectClean();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
  it("bounds an unresponsive logout even when fetch ignores cancellation", async () => {
    seed(); const client = module.getSupabase(); await client.auth.initialize();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const logout = module.signOutSupabase();
    await vi.advanceTimersByTimeAsync(module.SUPABASE_SIGN_OUT_TIMEOUT_MS + 10);
    await logout; expectClean();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
  it("aborts an in-flight refresh and discards a late provider success without restoring storage", async () => {
    seed(); const client = module.getSupabase(); await client.auth.initialize();
    let release!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    const started = Promise.withResolvers<void>();
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/token")) { signal = init?.signal ?? undefined; started.resolve(); return new Promise<Response>(resolve => { release = resolve; }); }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetch);
    const refreshing = client.auth.refreshSession(); await started.promise;
    await module.signOutSupabase();
    expect(signal?.aborted).toBe(true); expectClean();
    release(new Response(JSON.stringify(authSession("rotated")), { status: 200, headers: { "Content-Type": "application/json" } }));
    await refreshing; expectClean();
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("/token"))).toHaveLength(1);
  });
  it("fences a retired storage adapter from both restoring credentials and deleting a later explicit sign-in", async () => {
    seed(); const oldClient = module.getSupabase(); await oldClient.auth.initialize();
    const oldStorage = captured.options[0].auth.storage;
    await module.signOutSupabase(); expectClean();
    const replacement = module.getSupabase(); await replacement.auth.initialize();
    expect(replacement).not.toBe(oldClient);
    const freshStorage = captured.options[1].auth.storage;
    freshStorage.setItem(key, JSON.stringify(authSession("fresh-login")));
    oldStorage.setItem(key, JSON.stringify(authSession("stale-refresh")));
    oldStorage.setItem(`${key}-code-verifier`, "stale-pkce");
    oldStorage.removeItem(key);
    expect(JSON.parse(local.getItem(key)!).refresh_token).toBe("synthetic-fresh-login-refresh");
    expect(local.getItem(`${key}-code-verifier`)).toBeNull();
    expect(oldStorage.getItem(key)).toBeNull();
  });
  it("coalesces concurrent logout calls and clears orphaned PKCE slots", async () => {
    seed(); local.setItem(`${key}-flow-orphan-code-verifier`, "orphan");
    const client = module.getSupabase(); await client.auth.initialize();
    const signOut = vi.spyOn(client.auth, "signOut");
    await Promise.all([module.signOutSupabase(), module.signOutSupabase()]);
    expect(signOut).toHaveBeenCalledTimes(1); expectClean();
    expect(local.getItem(`${key}-flow-orphan-code-verifier`)).toBeNull();
  });
  it("retires a client whose initial session recovery is still waiting for the provider", async () => {
    seed(); local.setItem(key, JSON.stringify({ ...authSession(), expires_at: 1 }));
    const started = Promise.withResolvers<void>(); let signal: AbortSignal | undefined;
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined; started.resolve(); return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetch);
    const client = module.getSupabase(); await started.promise;
    await module.signOutSupabase(); await client.auth.initialize();
    expect(signal?.aborted).toBe(true); expectClean();
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels a refresh whose headers arrived but response body is stalled", async () => {
    seed(); const client = module.getSupabase(); await client.auth.initialize();
    const started = Promise.withResolvers<void>(); const cancel = vi.fn();
    const fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/token")) {
        return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ pull() { started.resolve(); }, cancel }), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetch);
    const refreshing = client.auth.refreshSession(); await started.promise;
    await module.signOutSupabase(); await refreshing;
    expect(cancel).toHaveBeenCalledTimes(1); expectClean();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
  it("does not let a stale memory fallback shadow storage after browser persistence recovers", async () => {
    const client = module.getSupabase(); await client.auth.initialize();
    const adapter = captured.options[0].auth.storage;
    const set = vi.spyOn(local, "setItem").mockImplementationOnce(() => { throw new DOMException("Synthetic storage quota", "QuotaExceededError"); });
    adapter.setItem(key, JSON.stringify(authSession("memory-fallback")));
    expect(JSON.parse(adapter.getItem(key)).refresh_token).toBe("synthetic-memory-fallback-refresh");
    set.mockRestore();
    adapter.setItem(key, JSON.stringify(authSession("persisted-later")));
    expect(JSON.parse(adapter.getItem(key)).refresh_token).toBe("synthetic-persisted-later-refresh");
    await module.signOutSupabase(); expect(local.getItem(key)).toBeNull(); expect(adapter.getItem(key)).toBeNull();
  });
  it("rejects an oversized auth response without leaving its body open", async () => {
    const client = module.getSupabase(); await client.auth.initialize();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1_000_001)); }, cancel,
    }), { status: 200 })));
    await expect(captured.options[0].global.fetch("https://synthetic-project.supabase.co/auth/v1/user")).rejects.toThrow("Auth response exceeds the allowed size");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
