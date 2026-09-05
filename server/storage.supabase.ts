/** Server-only Supabase Storage REST adapter. Application authorization and
 * malware scanning happen before this boundary; no client upload grants are issued.
 * Provision the bucket private with no anon/authenticated storage policies.
 */
import { ENV } from "./_core/env";
import { assertSafeEgress } from "./_core/ssrfGuard";
import { readBoundedText } from "./_core/httpSafety";
import { Semaphore } from "./_core/concurrency";
import { normalizeStorageKey } from "./storage";

export const SUPABASE_STORAGE_MAX_BYTES = 15 * 1024 * 1024;
export const SUPABASE_STORAGE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const storageSemaphore = new Semaphore(2, 4, 5000);
type Config = { origin: string; baseUrl: string; bucket: string; secretKey: string };

function configuration(): Config {
  let url: URL;
  try { url = new URL(ENV.supabaseUrl); }
  catch { throw new Error("Invalid Supabase storage configuration"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" || url.port) {
    throw new Error("Supabase storage requires an HTTPS project origin");
  }
  const bucket = ENV.supabaseStorageBucket;
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) throw new Error("Invalid private storage bucket configuration");
  // Modern server-only keys, never publishable/anon/user JWTs. Supporting
  // only this type avoids silently using an end-user credential as a service key.
  const secretKey = ENV.supabaseSecretKey;
  if (!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(secretKey)) {
    throw new Error("Supabase storage requires a server-only secret key");
  }
  return { origin: url.origin, baseUrl: `${url.origin}/storage/v1`, bucket, secretKey };
}

/** Signature checking is defense in depth, not a replacement for ClamAV.
 * OOXML and legacy Office checks recognize their container, as the upload route does.
 */
function validatedBody(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  const bytes = typeof data === "string" ? Buffer.byteLength(data, "utf8") : data.byteLength;
  if (!bytes || bytes > SUPABASE_STORAGE_MAX_BYTES) throw new Error("Storage object size is outside the allowed limit");
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.isBuffer(data)
    ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (contentType.length > 128 || /[\r\n]/.test(contentType)) throw new Error("Invalid storage content type");
  const mime = contentType.toLowerCase().split(";")[0].trim();
  const ext = key.split(".").pop()?.toLowerCase();
  const prefix = (signature: number[], offset = 0) => signature.every((byte, i) => body[offset + i] === byte);
  let valid = false;
  switch (mime) {
    case "application/pdf": valid = ext === "pdf" && prefix([0x25, 0x50, 0x44, 0x46, 0x2d]); break;
    case "image/png": valid = ext === "png" && prefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
    case "image/jpeg": valid = ["jpg", "jpeg"].includes(ext || "") && prefix([0xff, 0xd8, 0xff]); break;
    case "image/gif": valid = ext === "gif" && /^GIF8[79]a/.test(body.subarray(0, 6).toString("ascii")); break;
    case "image/webp": valid = ext === "webp" && prefix([0x52, 0x49, 0x46, 0x46]) && prefix([0x57, 0x45, 0x42, 0x50], 8); break;
    case "application/msword":
    case "application/vnd.ms-excel":
      valid = ext === (mime === "application/msword" ? "doc" : "xls") && prefix([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); break;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      valid = ext === (mime.includes("wordprocessingml") ? "docx" : "xlsx") && prefix([0x50, 0x4b, 0x03, 0x04]); break;
    case "text/plain":
    case "text/csv":
    case "text/html": {
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); }
      catch { throw new Error("Storage text must be valid UTF-8"); }
      valid = !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
      if (mime === "text/html") {
        // Printable HTML is an explicitly typed certificate renderer fallback,
        // never an applicant upload. Signed downloads always force attachment.
        valid = valid && ext === "html" && /^(certificates|certificate-backups)\//.test(key) && /^\s*(<!doctype html|<html)\b/i.test(text);
      } else {
        valid = valid && ext === (mime === "text/csv" ? "csv" : "txt") && !/^\s*(<!doctype|<html|<script|<svg|<\?xml)/i.test(text);
      }
      break;
    }
  }
  if (!valid) throw new Error("Storage content does not match the permitted document type");
  return { body, mime };
}

async function request(config: Config, suffix: string, signal: AbortSignal, init: RequestInit = {}): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const response = await fetch(`${config.baseUrl}${suffix}`, {
    ...init,
    headers: { ...init.headers, apikey: config.secretKey, Accept: "application/json" },
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Never include response bodies, request URLs, key names, or tokens in errors.
    throw new Error(`Private storage request failed (${response.status})`);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    await response.body?.cancel();
    throw new Error("Private storage returned an invalid response");
  }
  const result: unknown = JSON.parse(await readBoundedText(response, MAX_RESPONSE_BYTES));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Private storage returned an invalid response");
  return result as Record<string, unknown>;
}

async function privateBucket(config: Config, signal: AbortSignal): Promise<void> {
  const bucket = await request(config, `/bucket/${config.bucket}`, signal);
  if (bucket.id !== config.bucket || bucket.public !== false) {
    throw new Error("Storage bucket must be private");
  }
}

async function signedDownload(config: Config, key: string, signal: AbortSignal, expiresIn = 300): Promise<string> {
  const lifetime = Number.isFinite(expiresIn) ? Math.max(60, Math.min(300, Math.floor(expiresIn))) : 300;
  const path = `/object/sign/${config.bucket}/${key}`;
  const result = await request(config, path, signal, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: lifetime }),
  });
  if (typeof result.signedURL !== "string" || result.signedURL.length > 16_384) throw new Error("Invalid private download response");
  const raw = result.signedURL;
  const url = new URL(raw.startsWith("/object/") ? config.baseUrl + raw : raw, config.origin);
  if (url.origin !== config.origin || url.username || url.password || url.hash || url.pathname !== `/storage/v1${path}` ||
      url.searchParams.getAll("token").length !== 1 || !/^[A-Za-z0-9._-]+$/.test(url.searchParams.get("token") || "") ||
      [...url.searchParams.keys()].some(name => name !== "token")) {
    throw new Error("Invalid private download response");
  }
  url.searchParams.set("download", key.split("/").pop()!);
  return url.href;
}

async function operation<T>(fn: (config: Config, signal: AbortSignal) => Promise<T>): Promise<T> {
  const config = configuration();
  return storageSemaphore.run(async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Private storage operation timed out")); }, SUPABASE_STORAGE_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([deadline, (async () => {
        await assertSafeEgress(config.origin);
        controller.signal.throwIfAborted();
        await privateBucket(config, controller.signal);
        return fn(config, controller.signal);
      })()]);
    } catch {
      // Fetch, DNS, malformed JSON and provider errors may contain secrets or
      // object names; the boundary exposes a constant safe operational error.
      throw new Error("Private storage operation failed; please retry later");
    } finally { clearTimeout(timer!); controller.abort(); }
  });
}

export async function supabasePut(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<{ key: string; url: string }> {
  const key = normalizeStorageKey(relKey);
  const { body, mime } = validatedBody(key, data, contentType);
  return operation(async (config, signal) => {
    const result = await request(config, `/object/${config.bucket}/${key}`, signal, {
      method: "POST",
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=0, no-store", "x-upsert": "false" },
      body: body as unknown as BodyInit,
    });
    if (result.Key !== `${config.bucket}/${key}`) throw new Error("Invalid storage upload receipt");
    return { key, url: await signedDownload(config, key, signal) };
  });
}

export async function supabaseGetUrl(relKey: string, expiresInSec = 300): Promise<{ key: string; url: string }> {
  const key = normalizeStorageKey(relKey);
  return operation(async (config, signal) => ({ key, url: await signedDownload(config, key, signal, expiresInSec) }));
}

/** Delete through Storage API, then confirm exact absence using a server-only list. */
export async function supabaseDelete(relKey: string): Promise<void> {
  const key = normalizeStorageKey(relKey);
  return operation(async (config, signal) => {
    const headers = { apikey: config.secretKey, "Content-Type": "application/json", Accept: "application/json" };
    const removed = await fetch(`${config.baseUrl}/object/${config.bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: [key] }), signal, redirect: "error" });
    if (!removed.ok) { await removed.body?.cancel(); throw new Error("Private deletion failed"); }
    const result: unknown = JSON.parse(await readBoundedText(removed, MAX_RESPONSE_BYTES));
    if (!Array.isArray(result)) throw new Error("Invalid private deletion receipt");
    const prefix = key.slice(0, key.lastIndexOf("/"));
    const name = key.slice(key.lastIndexOf("/") + 1);
    const check = await fetch(`${config.baseUrl}/object/list/${config.bucket}`, { method: "POST", headers, body: JSON.stringify({ prefix: key.includes("/") ? prefix : "", search: name, limit: 2, offset: 0, sortBy: { column: "name", order: "asc" } }), signal, redirect: "error" });
    if (!check.ok) { await check.body?.cancel(); throw new Error("Private deletion cannot be verified"); }
    const matches: unknown = JSON.parse(await readBoundedText(check, MAX_RESPONSE_BYTES));
    // Exact filenames are unique. Any search result is conservative uncertainty,
    // avoiding paginated/truncated absence claims or misleading provider errors.
    if (!Array.isArray(matches) || matches.length !== 0) throw new Error("Private deletion cannot be verified");
  });
}
