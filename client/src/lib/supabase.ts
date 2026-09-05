import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite exposes environment values as strings; trim deployment whitespace once.
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const publicKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
// The configured public key may be a legacy anon JWT or a modern sb_publishable_ key.
export const isSupabaseAuthEnabled = Boolean(supabaseUrl && publicKey);

export type SocialAuthProvider = "google" | "apple" | "linkedin_oidc";

export const SUPABASE_SIGN_OUT_TIMEOUT_MS = 2000;
type AuthLifecycle = { client: SupabaseClient; storageKey: string; active: boolean; readable: boolean; requests: Set<AbortController>; memory: Map<string, string> };
let lifecycle: AuthLifecycle | null = null;
let signingOut: Promise<void> | null = null;

function browserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try { return typeof window === "undefined" ? null : window[kind]; } catch { return null; }
}
function ownsAuthKey(key: string, storageKey: string): boolean {
  return key === storageKey || key === `${storageKey}-user` || key === `${storageKey}-code-verifier` ||
    key === `${storageKey}-flows-code-verifier` || (key.startsWith(`${storageKey}-flow-`) && key.endsWith("-code-verifier"));
}
function clearProjectStorage(state: AuthLifecycle) {
  state.memory.clear();
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    const storage = browserStorage(kind);
    if (!storage) continue;
    const keys = [state.storageKey, `${state.storageKey}-user`, `${state.storageKey}-code-verifier`, `${state.storageKey}-flows-code-verifier`];
    try { for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key && ownsAuthKey(key, state.storageKey)) keys.push(key); } } catch { /* Still attempt the known keys. */ }
    for (const key of new Set(keys)) { try { storage.removeItem(key); } catch { /* Browser storage may be disabled. */ } }
  }
}

/** Race cancellation too: a custom fetch must not defeat the logout deadline
 * by ignoring AbortSignal. The retired instance's storage adapter is separately
 * fenced, so a response already being decoded cannot restore credentials.
 */
async function authFetch(state: AuthLifecycle, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const isAuth = url.origin === new URL(supabaseUrl).origin && url.pathname.startsWith("/auth/v1/");
  const isLogout = isAuth && url.pathname === "/auth/v1/logout";
  // SDK transport exceptions trigger refresh retries. A local terminal response
  // stops that loop when this client was explicitly retired; it is never sent
  // over the network or represented as a provider revocation result.
  const signedOutLocally = () => new Response(JSON.stringify({ code: "client_signed_out", message: "This client was signed out locally." }), { status: 401, headers: { "Content-Type": "application/json" } });
  if (!state.active && !isLogout) return signedOutLocally();
  const controller = new AbortController();
  state.requests.add(controller);
  const sourceSignal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const signal = sourceSignal ? AbortSignal.any([sourceSignal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), isLogout ? SUPABASE_SIGN_OUT_TIMEOUT_MS : 30_000);
  let abort!: () => void;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await globalThis.fetch(input, { ...init, signal });
        if (!isAuth || !response.body) return response;
        if (signal.aborted) { void response.body.cancel().catch(() => {}); throw new DOMException("Auth request cancelled", "AbortError"); }
        // Auth endpoints return small JSON responses. Track the whole response,
        // not only headers, so stalled/oversized bodies cannot outlive logout.
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1_000_000) { void reader.cancel().catch(() => {}); throw new Error("Auth response exceeds the allowed size"); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); reader = undefined; }
        const body = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
      })(),
      new Promise<never>((_resolve, reject) => {
        abort = () => { void reader?.cancel().catch(() => {}); reject(new DOMException("Auth request cancelled", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } catch (error) {
    if (!state.active && !isLogout) return signedOutLocally();
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); state.requests.delete(controller);
  }
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseAuthEnabled) {
    throw new Error("Supabase auth is not configured");
  }
  if (!lifecycle) {
    // Match Supabase's default namespace so existing sessions are retained.
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
    const state = { storageKey, active: true, readable: true, requests: new Set<AbortController>(), memory: new Map<string, string>() } as AuthLifecycle;
    state.client = createClient(supabaseUrl, publicKey, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        storageKey,
        storage: {
          getItem(key) {
            if (!state.readable) return null;
            if (state.memory.has(key)) return state.memory.get(key)!;
            try { return browserStorage("localStorage")?.getItem(key) ?? null; } catch { return null; }
          },
          setItem(key, value) {
            if (!state.active) return;
            try { const storage = browserStorage("localStorage"); if (storage) { storage.setItem(key, value); state.memory.delete(key); return; } } catch { /* Use bounded client-lifetime memory if persistence is unavailable. */ }
            state.memory.set(key, value);
          },
          removeItem(key) {
            state.memory.delete(key);
            // A delayed teardown from an old instance must not erase a later
            // explicit sign-in performed through its replacement client.
            if (!state.readable) return;
            try { browserStorage("localStorage")?.removeItem(key); } catch { /* Storage disabled. */ }
          },
        },
      },
      global: { fetch: (input, init) => authFetch(state, input, init) },
    });
    lifecycle = state;
    // Initialization can finish after logout began. Dispose again then so its
    // late visibility/refresh setup cannot revive the retired client.
    void state.client.auth.initialize().then(async () => { if (!state.active) await state.client.auth.dispose(); }).catch(() => {});
  }
  return lifecycle.client;
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseAuthEnabled) return;
  if (signingOut) return signingOut;
  getSupabase();
  const state = lifecycle!;
  // Synchronous write fence precedes any yield. stop/dispose alone explicitly
  // do not stop in-flight SDK refreshes from saving to storage (auth-js2.115).
  state.active = false;
  for (const request of state.requests) request.abort();
  signingOut = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await state.client.auth.stopAutoRefresh();
      await state.client.auth.dispose();
      await Promise.race([
        state.client.auth.signOut({ scope: "local" }).catch(() => {}),
        new Promise<void>(resolve => { timer = setTimeout(resolve, SUPABASE_SIGN_OUT_TIMEOUT_MS); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      state.readable = false;
      for (const request of state.requests) request.abort();
      clearProjectStorage(state);
      await state.client.auth.dispose().catch(() => {});
      if (lifecycle === state) lifecycle = null;
    }
  })().finally(() => { signingOut = null; });
  return signingOut;
}
