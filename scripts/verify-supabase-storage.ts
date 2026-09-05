/** Operator probe: only synthetic objects under a fresh random prefix.
 * No dotenv loading, provisioning, research records, or credential/URL logging.
 * Run with Node 24: pnpm exec tsx scripts/verify-supabase-storage.ts
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { assertSafeEgress } from "../server/_core/ssrfGuard";
import { readBoundedText } from "../server/_core/httpSafety";

export const BUCKET_MAX_BYTES = 15 * 1024 * 1024;
export const BUCKET_MIME_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv",
  "application/msword", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/html",
] as const;
const CLEAN_TEXT = "IRB synthetic storage activation probe. No research or personal data.\n";
const MAIN_DEADLINE_MS = 60_000;
const CLEANUP_DEADLINE_MS = 20_000;
const REQUEST_DEADLINE_MS = 8000;
const MAX_REQUESTS = 30;
const TEST_SIGNATURE_SECONDS = 5;
type CheckState = "PASS" | "FAIL" | "NOT_VERIFIED";
type Check = { name: string; status: CheckState; httpStatus?: number; detail?: string };
export type ProbeConfig = { origin: string; bucket: string; secretKey: string; publishableKey: string; syntheticUserToken?: string; syntheticUserId?: string };
type Dependencies = { fetch: typeof fetch; egress: typeof assertSafeEgress; now: () => number; sleep: (ms: number) => Promise<void> };
export type ProbeReceipt = {
  status: "PASS" | "FAIL" | "PARTIAL"; startedAt: string; finishedAt: string;
  projectOrigin: string; bucket: string; syntheticPrefix: string; requests: number; checks: Check[];
  scope: string; limitations: string[];
};

export function probeConfigFromEnv(env: NodeJS.ProcessEnv): ProbeConfig {
  const origin = env.SUPABASE_URL?.trim() || "";
  const bucket = env.SUPABASE_STORAGE_BUCKET?.trim() || "";
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() || "";
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("Set SUPABASE_URL to an HTTPS project origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.port || url.search || url.hash) {
    throw new Error("Set SUPABASE_URL to an HTTPS project origin.");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) throw new Error("Set a valid SUPABASE_STORAGE_BUCKET.");
  if (!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(secretKey)) throw new Error("Set a modern server-only SUPABASE_SECRET_KEY.");
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(publishableKey)) throw new Error("Set a modern SUPABASE_PUBLISHABLE_KEY.");
  const syntheticUserToken = env.SUPABASE_STORAGE_PROBE_USER_TOKEN?.trim() || undefined;
  const syntheticUserId = env.SUPABASE_STORAGE_PROBE_USER_ID?.trim() || undefined;
  if (syntheticUserToken && (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(syntheticUserToken) || syntheticUserToken.length > 16_384)) {
    throw new Error("The optional synthetic-user token must be a bearer JWT.");
  }
  if (syntheticUserId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(syntheticUserId)) {
    throw new Error("The optional synthetic-user ID must be a UUID.");
  }
  return { origin: url.origin, bucket, secretKey, publishableKey, syntheticUserToken, syntheticUserId };
}

function parsed(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
type Reply = { status: number; ok: boolean; text: string; data: unknown };
function responseCodes(reply: Reply): string[] {
  const data = object(reply.data);
  return [data.code, data.error, data.statusCode, data.httpStatusCode].map(value => typeof value === "string" || typeof value === "number" ? String(value).toLowerCase() : "");
}
function denied(reply: Reply): boolean {
  if ([401, 403, 404].includes(reply.status)) return true;
  return reply.status === 400 && responseCodes(reply).some(code => ["401", "403", "404", "accessdenied", "unauthorized", "not_found", "nosuchkey"].includes(code));
}
function missingAnonymousAuthorization(reply: Reply, actor: string): boolean {
  const data = object(reply.data);
  return actor === "anonymous" && reply.status === 400 && data.code === "InvalidRequest" && data.error === "Error" &&
    String(data.statusCode) === "400" && data.message === "headers must have required property 'authorization'";
}
function expiredSignedDownload(reply: Reply): boolean {
  const data = object(reply.data);
  // Used only after an unchanged URL downloaded our exact bytes successfully
  // and its requested lifetime elapsed. Other InvalidJWT errors prove nothing
  // about expiry, and generic 400 / rate-limit / provider errors stay unverified.
  return denied(reply) || (reply.status === 400 && data.code === "InvalidJWT" && data.error === "InvalidJWT" && String(data.statusCode) === "400" &&
    ["jwt expired", "JWT expired", '"exp" claim timestamp check failed'].includes(String(data.message)));
}
function duplicateDenied(reply: Reply): boolean {
  return reply.status === 409 || (reply.status === 400 && responseCodes(reply).some(code => ["409", "resourcealreadyexists", "keyalreadyexists", "already_exists", "duplicate"].includes(code)));
}

export async function verifySupabaseStorage(input: ProbeConfig, overrides: Partial<Dependencies> = {}): Promise<ProbeReceipt> {
  // Revalidate programmatic callers too; only the environment reader accepts raw credentials.
  const config = probeConfigFromEnv({ SUPABASE_URL: input.origin, SUPABASE_STORAGE_BUCKET: input.bucket, SUPABASE_SECRET_KEY: input.secretKey,
    SUPABASE_PUBLISHABLE_KEY: input.publishableKey, SUPABASE_STORAGE_PROBE_USER_TOKEN: input.syntheticUserToken, SUPABASE_STORAGE_PROBE_USER_ID: input.syntheticUserId });
  const deps: Dependencies = { fetch: globalThis.fetch, egress: assertSafeEgress, now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), ...overrides };
  const started = deps.now();
  const prefix = `irb-storage-probe/${randomUUID()}`;
  const primaryKey = `${prefix}/server-clean.txt`;
  const attemptedKeys = new Set<string>();
  const checks: Check[] = [];
  let requests = 0;
  let deadline = started + MAIN_DEADLINE_MS;
  const api = `${config.origin}/storage/v1`;
  const serverHeaders = { apikey: config.secretKey };
  const publicHeaders = { apikey: config.publishableKey };
  const note = (name: string, status: CheckState, httpStatus?: number, detail?: string) => checks.push({ name, status, ...(httpStatus === undefined ? {} : { httpStatus }), ...(detail ? { detail } : {}) });

  async function request(url: string, headers: Record<string, string>, method = "GET", body?: string, contentType = "application/json"): Promise<Reply> {
    const target = new URL(url);
    if (target.origin !== config.origin || target.username || target.password || target.hash) throw new Error("probe destination rejected");
    if (++requests > MAX_REQUESTS || deps.now() >= deadline) throw new Error("probe budget exhausted");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("probe request deadline")); }, Math.max(1, Math.min(REQUEST_DEADLINE_MS, deadline - deps.now())));
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await deps.fetch(target, { method, redirect: "error", signal: controller.signal, cache: "no-store",
          headers: { ...headers, "Cache-Control": "no-store", ...(body === undefined ? {} : { "Content-Type": contentType }), ...(method === "POST" && contentType === "text/plain" ? { "x-upsert": "false" } : {}) }, body });
        const text = await readBoundedText(response, 65_536);
        return { status: response.status, ok: response.ok, text, data: parsed(text) };
      })()]);
    } finally { clearTimeout(timer!); controller.abort(); }
  }
  async function jsonRequest(suffix: string, headers: Record<string, string>, method: string, body: unknown) {
    return request(`${api}${suffix}`, headers, method, JSON.stringify(body));
  }
  async function required(name: string, action: () => Promise<Reply>, predicate: (reply: Reply) => boolean): Promise<Reply> {
    const reply = await action();
    const pass = predicate(reply);
    note(name, pass ? "PASS" : "FAIL", reply.status);
    if (!pass) throw new Error("probe prerequisite failed");
    return reply;
  }

  async function checkActor(name: string, headers: Record<string, string>) {
    const operations: Array<[string, () => Promise<Reply>, boolean]> = [
      ["direct_download", () => request(`${api}/object/${config.bucket}/${primaryKey}`, headers), false],
      ["public_download", () => request(`${api}/object/public/${config.bucket}/${primaryKey}`, headers), false],
      ["list", () => jsonRequest(`/object/list/${config.bucket}`, headers, "POST", { prefix, limit: 10, offset: 0, sortBy: { column: "name", order: "asc" } }), true],
      ["upload", () => {
        const key = `${prefix}/${name}-attempt.txt`; attemptedKeys.add(key);
        return request(`${api}/object/${config.bucket}/${key}`, headers, "POST", CLEAN_TEXT, "text/plain");
      }, false],
      ["sign", () => jsonRequest(`/object/sign/${config.bucket}/${primaryKey}`, headers, "POST", { expiresIn: 2 }), false],
    ];
    for (const [action, run, isList] of operations) {
      try {
        const reply = await run();
        const filteredEmpty = isList && reply.ok && Array.isArray(reply.data) && reply.data.length === 0;
        const status = filteredEmpty || denied(reply) || missingAnonymousAuthorization(reply, name) ? "PASS" : reply.ok ? "FAIL" : "NOT_VERIFIED";
        note(`${name}.${action}_denied`, status, reply.status, filteredEmpty ? "RLS returned an empty visible list." : undefined);
      } catch { note(`${name}.${action}_denied`, "NOT_VERIFIED", undefined, "Request failed or exceeded a bounded resource limit."); }
    }
  }

  try {
    // DNS rejection cannot result in a privileged request. Apply a deadline even
    // when the platform DNS resolver stalls; never print its raw diagnostics.
    let egressTimer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([deps.egress(config.origin), new Promise<never>((_, reject) => {
        egressTimer = setTimeout(() => reject(new Error("probe egress deadline")), REQUEST_DEADLINE_MS);
      })]);
    } finally { clearTimeout(egressTimer!); }
    await required("bucket.private_15MiB_mime_allowlist", () => request(`${api}/bucket/${config.bucket}`, serverHeaders), reply => {
      const b = object(reply.data);
      return reply.ok && b.id === config.bucket && b.public === false && Number(b.file_size_limit) === BUCKET_MAX_BYTES &&
        Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length === BUCKET_MIME_TYPES.length &&
        BUCKET_MIME_TYPES.every(mime => (b.allowed_mime_types as unknown[]).includes(mime));
    });
    await required("publishable_key.valid", () => request(`${config.origin}/auth/v1/settings`, publicHeaders), reply => reply.ok && Object.keys(object(reply.data)).length > 0);
    attemptedKeys.add(primaryKey);
    await required("server.synthetic_upload", () => request(`${api}/object/${config.bucket}/${primaryKey}`, serverHeaders, "POST", CLEAN_TEXT, "text/plain"), reply => reply.ok && object(reply.data).Key === `${config.bucket}/${primaryKey}`);
    await required("server.duplicate_denied", () => request(`${api}/object/${config.bucket}/${primaryKey}`, serverHeaders, "POST", "This must never overwrite the original.\n", "text/plain"), duplicateDenied);
    const signing = await required("server.short_download_signed", () => jsonRequest(`/object/sign/${config.bucket}/${primaryKey}`, serverHeaders, "POST", { expiresIn: TEST_SIGNATURE_SECONDS }), reply => reply.ok && typeof object(reply.data).signedURL === "string");
    const signedAt = deps.now();
    const rawUrl = object(signing.data).signedURL as string;
    if (rawUrl.length > 16_384) throw new Error("invalid signed URL");
    const signedUrl = new URL(rawUrl.startsWith("/object/") ? api + rawUrl : rawUrl, config.origin);
    if (signedUrl.origin !== config.origin || signedUrl.username || signedUrl.password || signedUrl.hash ||
        signedUrl.pathname !== `/storage/v1/object/sign/${config.bucket}/${primaryKey}` || signedUrl.searchParams.getAll("token").length !== 1 ||
        !/^[A-Za-z0-9._-]+$/.test(signedUrl.searchParams.get("token") || "") || [...signedUrl.searchParams.keys()].some(key => key !== "token")) throw new Error("invalid signed URL");
    await required("server.signed_download_original_bytes", () => request(signedUrl.href, {}), reply => reply.ok && reply.text === CLEAN_TEXT);
    await checkActor("anonymous", {});
    await checkActor("publishable", publicHeaders);
    await required("publishable_key.still_valid", () => request(`${config.origin}/auth/v1/settings`, publicHeaders), reply => reply.ok && Object.keys(object(reply.data)).length > 0);

    if (config.syntheticUserToken && config.syntheticUserId) {
      const userHeaders = { ...publicHeaders, Authorization: `Bearer ${config.syntheticUserToken}` };
      const user = await request(`${config.origin}/auth/v1/user`, userHeaders);
      const valid = user.ok && object(user.data).id === config.syntheticUserId && object(user.data).is_anonymous === false && object(user.data).role === "authenticated";
      note("authenticated.synthetic_identity_validated", valid ? "PASS" : "NOT_VERIFIED", user.status);
      if (valid) {
        await checkActor("authenticated", userHeaders);
        const after = await request(`${config.origin}/auth/v1/user`, userHeaders);
        const stillValid = after.ok && object(after.data).id === config.syntheticUserId && object(after.data).is_anonymous === false && object(after.data).role === "authenticated";
        note("authenticated.identity_still_valid", stillValid ? "PASS" : "NOT_VERIFIED", after.status,
          stillValid ? undefined : "Identity is no longer valid after the checks; expiry or revocation cannot count as permission-denial proof.");
      }
      else note("authenticated.direct_access", "NOT_VERIFIED", undefined, "The supplied test identity was not verified; no authenticated denial claim is made.");
    } else {
      note("authenticated.direct_access", "NOT_VERIFIED", undefined, "Supply both dedicated synthetic-user token and expected user UUID to exercise this scope.");
    }
    await deps.sleep(Math.max(0, signedAt + (TEST_SIGNATURE_SECONDS + 3) * 1000 - deps.now()));
    const expired = await request(signedUrl.href, {});
    note("server.expired_link_denied", expiredSignedDownload(expired) ? "PASS" : expired.ok ? "FAIL" : "NOT_VERIFIED", expired.status);
  } catch {
    note("probe.completed", "FAIL", undefined, "A prerequisite, provider response, network request, or deadline failed. Raw diagnostics are intentionally omitted.");
  } finally {
    if (attemptedKeys.size > 0) {
      deadline = deps.now() + CLEANUP_DEADLINE_MS;
      try {
        // Exact paths only: no bucket empty, recursive removal, wildcard, or
        // deletion based on a listing that could contain another run's objects.
        const keys = [...attemptedKeys];
        if (keys.some(key => !key.startsWith(`${prefix}/`) || key.slice(prefix.length + 1).includes("/"))) throw new Error("invalid cleanup scope");
        const removed = await jsonRequest(`/object/${config.bucket}`, serverHeaders, "DELETE", { prefixes: keys });
        if (!removed.ok) throw new Error("cleanup failed");
        const listing = await jsonRequest(`/object/list/${config.bucket}`, serverHeaders, "POST", { prefix, limit: 10, offset: 0, sortBy: { column: "name", order: "asc" } });
        note("cleanup.own_prefix_empty", listing.ok && Array.isArray(listing.data) && listing.data.length === 0 ? "PASS" : "FAIL", listing.status);
      } catch { note("cleanup.own_prefix_empty", "FAIL", undefined, "Cleanup is unverified. Inspect only this receipt's synthetic prefix and remove remaining probe objects."); }
    } else note("cleanup.no_objects_attempted", "PASS");
  }
  return {
    status: checks.some(check => check.status === "FAIL") ? "FAIL" : checks.some(check => check.status === "NOT_VERIFIED") ? "PARTIAL" : "PASS",
    startedAt: new Date(started).toISOString(), finishedAt: new Date(deps.now()).toISOString(), projectOrigin: config.origin, bucket: config.bucket,
    syntheticPrefix: prefix, requests, checks,
    scope: "Synthetic private-storage provider activation probe; no research records or application database changes.",
    limitations: ["A random-prefix behavioral probe does not replace review of all storage RLS policies.", "This does not verify the deployed app, malware scanner, residency, contracts, backups, or document semantics.", "The probe's five-second signing expiry is for verification only; application downloads are bounded to 60–300 seconds."],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await verifySupabaseStorage(probeConfigFromEnv(process.env));
    console.log(JSON.stringify(receipt, null, 2));
    process.exitCode = receipt.status === "PASS" ? 0 : receipt.status === "PARTIAL" ? 2 : 1;
  } catch {
    console.log(JSON.stringify({ status: "NOT_VERIFIED", reason: "Required configuration is missing or invalid. See docs/supabase-storage-activation.md. No success is claimed." }, null, 2));
    process.exitCode = 1;
  }
}
