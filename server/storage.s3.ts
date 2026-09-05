// Lazy-loaded S3 helper. Only imported by server/storage.ts when both
// AWS_REGION and S3_BUCKET (and credentials) are configured — keeps the
// AWS SDK off the hot startup path for local dev.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import { normalizeStorageKey } from "./storage";

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

function bucket(): string {
  return process.env.S3_BUCKET!;
}

const sanitiseKey = normalizeStorageKey;

export async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const safeKey = sanitiseKey(relKey);
  const key = safeKey.includes("/")
    ? safeKey
    : `misc/${new Date().toISOString().slice(0, 10)}/${randomBytes(6).toString("hex")}-${safeKey}`;
  const body =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
      // SA-28: force download + defeat MIME sniffing when the object is
      // fetched via a (pre)signed URL. Certificates open inline; every
      // user upload is treated as an attachment.
      ContentDisposition: contentType === "application/pdf" && key.startsWith("certificates/")
        ? "inline"
        : "attachment",
      Metadata: { "x-content-type-options": "nosniff" },
    })
  );
  // 7-day signed URL — long enough for an applicant to download a
  // certificate they were emailed yesterday, short enough that a leaked
  // URL doesn't last forever.
  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 300 }
  );
  return { key, url };
}

export async function s3GetUrl(
  relKey: string,
  expiresInSec = 300
): Promise<{ key: string; url: string }> {
  const key = sanitiseKey(relKey);
  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: Math.max(60, Math.min(expiresInSec, 900)) }
  );
  return { key, url };
}
