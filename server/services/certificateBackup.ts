import * as fs from "node:fs/promises";
import * as path from "node:path";
import { storagePut, UPLOADS_DIR_PATH } from "../storage";

export const CERT_BACKUP_RETENTION_DAYS = 30;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function backupsRoot(): string {
  return path.join(UPLOADS_DIR_PATH, "certificate-backups");
}

/**
 * Day-folder keys older than retentionDays (UTC calendar days).
 * Used by the pruner and unit tests — no I/O.
 */
export function expiredBackupDayKeys(
  keys: string[],
  now: Date,
  retentionDays = CERT_BACKUP_RETENTION_DAYS,
): string[] {
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - retentionDays);
  return keys.filter(k => {
    if (!DAY_RE.test(k)) return false;
    const t = Date.parse(`${k}T00:00:00Z`);
    return Number.isFinite(t) && t < cutoff;
  });
}

export async function backupCertificateArtifact(
  storageKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  const day = utcDayKey();
  const base = path.basename(storageKey.replace(/\\/g, "/"));
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  const destDir = path.join(backupsRoot(), day);
  await fs.mkdir(destDir, { recursive: true });
  await fs.writeFile(path.join(destDir, base), buf);

  if (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
    try {
      await storagePut(`certificate-backups/${day}/${base}`, buf, contentType);
    } catch (err) {
      console.warn("[cert-backup] S3 copy failed; disk copy retained", err);
    }
  }
}

export async function pruneCertificateBackups(
  now = new Date(),
  retentionDays = CERT_BACKUP_RETENTION_DAYS,
): Promise<{ removed: string[] }> {
  const root = backupsRoot();
  let names: string[] = [];
  try {
    names = await fs.readdir(root);
  } catch {
    return { removed: [] };
  }
  const expired = expiredBackupDayKeys(names, now, retentionDays);
  for (const day of expired) {
    await fs.rm(path.join(root, day), { recursive: true, force: true });
  }
  return { removed: expired };
}

async function copyLiveCertificatesIntoToday(): Promise<number> {
  const live = path.join(UPLOADS_DIR_PATH, "certificates");
  let files: string[] = [];
  try {
    files = await fs.readdir(live);
  } catch {
    return 0;
  }
  let copied = 0;
  for (const name of files) {
    if (name.startsWith(".")) continue;
    const src = path.join(live, name);
    const stat = await fs.stat(src).catch(() => null);
    if (!stat?.isFile()) continue;
    const buf = await fs.readFile(src);
    const type = name.endsWith(".pdf")
      ? "application/pdf"
      : name.endsWith(".html")
        ? "text/html; charset=utf-8"
        : "application/octet-stream";
    await backupCertificateArtifact(`certificates/${name}`, buf, type);
    copied += 1;
  }
  return copied;
}

let _started = false;

/** Daily snapshot of generated certificates (last 30 days). Safe to call at boot. */
export function startCertificateBackupScheduler(): void {
  if (_started) return;
  _started = true;
  const run = () => {
    void (async () => {
      try {
        const copied = await copyLiveCertificatesIntoToday();
        const { removed } = await pruneCertificateBackups();
        console.log(`[cert-backup] snapshotted ${copied} file(s); pruned ${removed.length} day folder(s)`);
      } catch (err) {
        console.warn("[cert-backup] run failed", err);
      }
    })();
  };
  run();
  const dayMs = 24 * 60 * 60 * 1000;
  setInterval(run, dayMs).unref();
}
