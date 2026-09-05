// Storage helpers — STORAGE_PROVIDER selects an explicit backend, or auto
// prefers configured Supabase Storage, then Forge, S3 and development disk.
// A selected remote provider never downgrades to disk on failure.
//
// The local fallback means the platform works out-of-the-box without any
// cloud credentials — useful for local dev and small private deploys.
// Files saved to ./uploads/ are served by the Express app via
// registerLocalUploadsRoute() in server/_core/index.ts.

import { ENV } from './_core/env';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

const PROJECT_ROOT = process.cwd();
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, "uploads"));

type StorageConfig = { baseUrl: string; apiKey: string };

function hasForgeCredentials(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function hasS3Credentials(): boolean {
  return Boolean(
    process.env.AWS_REGION &&
    process.env.S3_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export type StorageProvider = "supabase" | "forge" | "s3" | "local";

export function resolveStorageProvider(): StorageProvider {
  const provider = ENV.storageProvider || "auto";
  if (provider !== "auto" && !["supabase", "forge", "s3", "local"].includes(provider)) {
    throw new Error("Invalid storage provider configuration");
  }
  if (provider === "supabase" || (provider === "auto" && (ENV.supabaseStorageBucket || ENV.supabaseSecretKey))) {
    if (!ENV.supabaseUrl || !ENV.supabaseStorageBucket || !ENV.supabaseSecretKey) {
      throw new Error("Supabase private storage configuration is incomplete");
    }
    return "supabase";
  }
  if (provider === "forge" || (provider === "auto" && hasForgeCredentials())) {
    if (!hasForgeCredentials()) throw new Error("Forge storage configuration is incomplete");
    return "forge";
  }
  if (provider === "s3" || (provider === "auto" && hasS3Credentials())) {
    if (!hasS3Credentials()) throw new Error("S3 storage configuration is incomplete");
    return "s3";
  }
  if (ENV.isProduction && process.env.ALLOW_LOCAL_STORAGE !== "true") {
    throw new Error("Private durable storage is not configured");
  }
  return "local";
}

function getForgeConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Forge credentials missing");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function normalizeStorageKey(relKey: string): string {
  if (!relKey || relKey.length > 512 || relKey.startsWith("/") || relKey.includes("\\") || /[^A-Za-z0-9._/-]/.test(relKey) || relKey.split("/").some(part => !part || part.startsWith("."))) {
    throw new Error("Invalid storage key");
  }
  return relKey;
}
const normalizeKey = normalizeStorageKey;

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Storage download failed (${response.status})`);
  const payload = await response.json();
  if (typeof payload.url !== "string" || !payload.url.startsWith("https://")) throw new Error("Storage returned an invalid URL");
  return payload.url;
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ─── Forge driver ─────────────────────────────────────────────────────────
async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Storage upload failed (${response.status})`);
  }
  const url = (await response.json()).url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Storage returned an invalid URL");
  return { key, url };
}

async function forgeGet(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  return { key, url: await buildDownloadUrl(baseUrl, key, apiKey) };
}

// ─── Local-disk driver ────────────────────────────────────────────────────
//
// Writes to <project>/uploads/<sanitised-key>. Returned URL is
// /uploads/<sanitised-key>, served by the Express static middleware
// registered in server/_core/index.ts.

const sanitiseKey = normalizeStorageKey;

async function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType: string
): Promise<{ key: string; url: string }> {
  const safeKey = sanitiseKey(relKey);
  // If the caller didn't include any path component, drop into a date
  // partition so files don't all sit in one mega-directory.
  const key = safeKey.includes("/")
    ? safeKey
    : `misc/${new Date().toISOString().slice(0, 10)}/${randomBytes(6).toString("hex")}-${safeKey}`;
  const target = path.resolve(UPLOADS_DIR, key);
  // Defence in depth: refuse to write outside UPLOADS_DIR.
  if (!target.startsWith(UPLOADS_DIR + path.sep) && target !== UPLOADS_DIR) {
    throw new Error("Refusing to write outside uploads directory");
  }
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const buf =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
  await fs.writeFile(target, buf, { mode: 0o600 });
  return { key, url: `/uploads/${key}` };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = sanitiseKey(relKey);
  return { key, url: `/uploads/${key}` };
}

// ─── Public API ───────────────────────────────────────────────────────────
//
// A configured remote backend must succeed; failures never downgrade to disk.
// Production local disk requires an explicit operator setting and durable volume.

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  normalizeStorageKey(relKey);
  const provider = resolveStorageProvider();
  if (provider === "supabase") {
    const { supabasePut } = await import("./storage.supabase");
    return supabasePut(relKey, data, contentType);
  }
  if (provider === "forge") return forgePut(relKey, data, contentType);
  if (provider === "s3") {
    const { s3Put } = await import("./storage.s3");
    return s3Put(relKey, data, contentType);
  }
  return localPut(relKey, data, contentType);
}

export async function storageGet(
  relKey: string,
  expiresInSec?: number
): Promise<{ key: string; url: string }> {
  normalizeStorageKey(relKey);
  const provider = resolveStorageProvider();
  if (provider === "supabase") {
    const { supabaseGetUrl } = await import("./storage.supabase");
    return supabaseGetUrl(relKey, expiresInSec);
  }
  if (provider === "forge") return forgeGet(relKey);
  if (provider === "s3") {
    const { s3GetUrl } = await import("./storage.s3");
    return s3GetUrl(relKey, expiresInSec);
  }
  return localGet(relKey);
}

/** Extract a storage key from a stored /uploads path or signed object URL. */
export function storageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/uploads/")) {
    return url.slice("/uploads/".length).split("?")[0] || null;
  }
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, "");
    const certIdx = path.indexOf("certificates/");
    if (certIdx >= 0) return path.slice(certIdx).split("?")[0] || null;
  } catch {
    /* not a URL */
  }
  if (url.startsWith("certificates/")) return url.split("?")[0] || null;
  return null;
}

export const UPLOADS_DIR_PATH = UPLOADS_DIR;
