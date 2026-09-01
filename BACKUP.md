# Backup & restore — IRB Ultimate

Daily MySQL backup via `scripts/backup.sh`, restore via `scripts/restore.sh`.
Backups are gzipped SQL dumps with optional encryption and optional S3 upload.

## What gets backed up

A full logical dump of the `irb_platform` (or whatever `DATABASE_URL` points to)
database — schema, data, routines, triggers, events. Uploaded files in S3 are
NOT covered by this script (S3 has its own versioning + lifecycle); the local
`uploads/` fallback directory is also not covered here — if you're running with
the local-disk fallback, see "Files & uploads" below.

## Quick start (local / dev)

```bash
# Snapshot into ./backups/ with no encryption (dev only)
DATABASE_URL='mysql://root@127.0.0.1:3306/irb_platform' \
  bash scripts/backup.sh

# Restore the latest snapshot
DATABASE_URL='mysql://root@127.0.0.1:3306/irb_platform' \
  bash scripts/restore.sh ./backups/irb-irb_platform-*.sql.gz
```

## Production setup

The recommended posture for **real** production is **encrypted + off-host**:

```bash
# .env (production server)
DATABASE_URL=mysql://user:pass@host:3306/irb_platform
BACKUP_DIR=/var/lib/irb/backups          # persistent volume
BACKUP_RETENTION_DAYS=30                  # local prune horizon
BACKUP_PASSPHRASE=<64-char-random>        # OR use BACKUP_GPG_RECIPIENT
BACKUP_S3_BUCKET=irb-ultimate-backups     # separate bucket from uploads
BACKUP_S3_PREFIX=mysql/irb_platform
AWS_REGION=me-central-1                   # KSA-adjacent; consider STC Cloud for true KSA-resident
AWS_ACCESS_KEY_ID=...                     # IAM user scoped to s3:PutObject on the backup bucket ONLY
AWS_SECRET_ACCESS_KEY=...
```

Notes:

- **Encryption is non-optional in prod.** Without `BACKUP_PASSPHRASE` or
  `BACKUP_GPG_RECIPIENT` the dump is plaintext and the script warns. A leaked
  unencrypted dump = a full PHI breach.
- **Use a separate bucket** for backups, not the file-upload bucket. Give the
  app's IAM user no read/write access to it. Give the backup IAM user no
  access to the upload bucket.
- **Enable S3 versioning + object-lock** on the backup bucket so an attacker
  who pops the production host can't `aws s3 rm` your history.
- **Enable S3 lifecycle** to transition objects to Glacier after ~30 days and
  expire after your retention requirement (Saudi PDPL is generally 5y for
  medical records — check with your DPO).
- **Test restore quarterly.** A backup nobody has restored is a placebo.

## Scheduling

### Railway / Render cron

Both expose a cron-jobs feature. Create a daily job:

```
schedule: "0 3 * * *"            # 03:00 UTC daily
command:  "bash scripts/backup.sh"
```

Make sure the cron task inherits the same env vars as the web service
(including `DATABASE_URL` and the `BACKUP_*` set above).

### Linux systemd (self-hosted)

Drop this in `/etc/systemd/system/irb-backup.service`:

```ini
[Unit]
Description=IRB Ultimate daily MySQL backup
After=network-online.target

[Service]
Type=oneshot
User=irb
EnvironmentFile=/etc/irb/backup.env
WorkingDirectory=/opt/irb
ExecStart=/usr/bin/env bash scripts/backup.sh
```

And `/etc/systemd/system/irb-backup.timer`:

```ini
[Unit]
Description=Daily timer for irb-backup.service

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true                          # catches up missed runs after downtime

[Install]
WantedBy=timers.target
```

`systemctl enable --now irb-backup.timer`.

### Crontab (POSIX)

```cron
0 3 * * *  cd /opt/irb && /usr/bin/env bash scripts/backup.sh >> /var/log/irb-backup.log 2>&1
```

## Restore drill (do this once a quarter)

```bash
# 1. Spin up a throwaway MySQL
mysql -e "CREATE DATABASE irb_restore_drill;"

# 2. Restore the most recent encrypted snapshot
DATABASE_URL='mysql://root@127.0.0.1:3306/irb_restore_drill' \
BACKUP_PASSPHRASE="$(cat /run/secrets/irb-backup-pass)" \
CONFIRM=yes \
  bash scripts/restore.sh /var/lib/irb/backups/irb-irb_platform-LATEST.sql.gz.enc

# 3. Sanity-check
mysql irb_restore_drill -e "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM applications;"

# 4. Drop the drill DB
mysql -e "DROP DATABASE irb_restore_drill;"
```

If the row counts match what you expect from prod, the chain works. If they
don't, fix the script BEFORE you need it.

## Files & uploads

The backup script handles MySQL only. Three cases for files:

| Where files live | Backup strategy |
|---|---|
| S3 / R2 (recommended for prod) | Enable bucket versioning + lifecycle. No script needed. |
| `BUILT_IN_FORGE_API_URL` | Provider's responsibility. Document the SLA. |
| Local `uploads/` (dev fallback) | Add `tar -czf` of `uploads/` to the backup script if you ever run prod this way (do not — it doesn't survive container restarts). |

## What this script does NOT do

- Does not back up Sentry, mail queue, or AI prompt history. None of those
  are sources of truth.
- Does not snapshot the running Node process — restore brings up a fresh
  process against the restored DB.
- Does not exfiltrate keys. The script never logs `DATABASE_URL`,
  `BACKUP_PASSPHRASE`, or AWS credentials.

## When this script fails

Common cases:

- `mysqldump: command not found` — install mysql-client / mariadb-client.
- `Access denied` — the DB user needs at least `SELECT, SHOW VIEW, RELOAD,
  PROCESS, LOCK TABLES, EVENT, TRIGGER` on the target database.
- S3 `403` — IAM user lacks `s3:PutObject` on `arn:aws:s3:::$BUCKET/$PREFIX/*`.
- Restore stalls — the dump is large; pipe through `pv` to see throughput.

If the script aborts mid-run, the partial dump file is deleted automatically.


## Certificate file backups (last 30 days)

Generated IRB certificates (PDF, or HTML-print fallback when Playwright/Chromium
is unavailable on Render free RAM) are snapshotted daily:

1. **On each issue** the artifact is copied to `uploads/certificate-backups/YYYY-MM-DD/`
   and, if `S3_BUCKET` + AWS keys are set, also to `s3://$S3_BUCKET/certificate-backups/YYYY-MM-DD/`.
2. **At API boot** (and every 24h) `startCertificateBackupScheduler()` copies any
   files still under `uploads/certificates/` into today's folder, then **prunes**
   day folders older than 30 days.

### Operator path

- **Preferred (production):** configure `S3_BUCKET` / `AWS_*` so certificates and
  their 30-day copies live off-box. Enable bucket versioning.
- **Render free / disk fallback:** files live on the instance under
  `uploads/certificate-backups/`. This does **not** survive disk-less deploys —
  attach a persistent disk or use S3.
- Verify: `GET /api/health` (`appVersion` 2.1.0+) and list
  `uploads/certificate-backups/` after issuing a certificate.
- Word download: `GET /api/export/certificate/:id?format=docx` (signed-in owner/admin).
  HTML print fallback: `?format=html` or automatic when PDF generation fails.
