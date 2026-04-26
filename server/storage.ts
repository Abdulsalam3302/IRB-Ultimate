// Storage helpers — three drivers, picked at runtime in this order:
//   1. Forge proxy (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY)
//   2. AWS S3 (AWS_REGION + S3_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
//   3. Local disk fallback (./uploads/, served at /uploads/<file>)
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
const UPLOADS_DIR = path.resolve(PROJECT_ROOT, "uploads");

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

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

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
  });
  return (await response.json()).url;
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
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const url = (await response.json()).url;
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

function sanitiseKey(key: string): string {
  // Strip any "../" sequences and disallow leading slashes / dotfiles.
  // Replace any non [a-zA-Z0-9._-/] with -.
  return normalizeKey(key)
    .replace(/\.\.+/g, "")
    .replace(/[^a-zA-Z0-9._\-/]/g, "-")
    .replace(/^\/+/, "");
}

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
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buf =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
  await fs.writeFile(target, buf);
  return { key, url: `/uploads/${key}` };
}

async function localGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = sanitiseKey(relKey);
  return { key, url: `/uploads/${key}` };
}

// ─── Public API ───────────────────────────────────────────────────────────
//
// Drivers are picked at call time so that flipping env vars takes effect
// without restart. Local-disk is the floor — uploads always succeed.

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (hasForgeCredentials()) {
    try {
      return await forgePut(relKey, data, contentType);
    } catch (err) {
      console.warn("[storage] Forge upload failed, falling back to local:", err);
    }
  }
  if (hasS3Credentials()) {
    // Lazy-loaded so we don't pay the AWS SDK init cost when unused.
    const { s3Put } = await import("./storage.s3");
    try {
      return await s3Put(relKey, data, contentType);
    } catch (err) {
      console.warn("[storage] S3 upload failed, falling back to local:", err);
    }
  }
  return localPut(relKey, data, contentType);
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  if (hasForgeCredentials()) {
    try {
      return await forgeGet(relKey);
    } catch (err) {
      console.warn("[storage] Forge get failed, falling back to local:", err);
    }
  }
  if (hasS3Credentials()) {
    const { s3GetUrl } = await import("./storage.s3");
    try {
      return await s3GetUrl(relKey);
    } catch (err) {
      console.warn("[storage] S3 get failed, falling back to local:", err);
    }
  }
  return localGet(relKey);
}

export const UPLOADS_DIR_PATH = UPLOADS_DIR;
