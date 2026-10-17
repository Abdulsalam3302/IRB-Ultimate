# Backup and recovery — IRB Saudi Arabia

`scripts/backup.sh` creates a complete logical MySQL/MariaDB database snapshot. `scripts/restore.sh` restores a verified snapshot into an explicitly selected, existing database. These utilities do not schedule themselves, provision offsite storage, or establish a recovery guarantee. The web process's certificate-copy scheduler is separate from database backups.

## Coverage and recovery material

The database dump includes schema, data, routines, triggers and events from the database selected by `DATABASE_URL`. This includes applications, immutable submission versions, decisions, audit records, account/session state, request limits, AI budgets, the encrypted mail outbox and other database tables. Uploaded objects and certificate files stored in Supabase, S3 or another storage provider are not included in the SQL archive.

Protect object storage separately with a verified backup/export and provider retention controls. Object versioning is useful when supported but does not establish an independent backup or prove that deleted objects can be recovered. Verify the actual provider policy and restoration path.

Store the backup decryption material separately from the archives. Preserve the durable `MAIL_ENCRYPTION_KEY` separately as well: restoring the outbox rows alone does not decrypt their recipients, reset links or attachments. Document the required deployment settings and their recovery process without copying credentials into a release receipt or repository.

## Requirements and encryption

Both scripts require Node.js, a compatible MySQL or MariaDB client, and an explicitly injected `DATABASE_URL`. They never source `.env`. Use the project's Node 24 runtime and an existing database name consisting of letters, numbers or underscores, at most 64 characters. URL-encode credentials and inject secrets through the operator's secret store; do not paste them into a shell command, command history or shared log.

Remote database connections require a readable provider CA certificate in `BACKUP_DB_SSL_CA`. The scripts require certificate and hostname verification and reject an explicit insecure remote TLS setting. An isolated loopback database can run without TLS. `MYSQLDUMP_BIN` and `MYSQL_BIN` can select compatible dump and restore executables.

Backups require one of:

- `BACKUP_GPG_RECIPIENT`: a previously verified GPG recipient; `gpg` must be installed and its recovery key available to the recovery operator.
- `BACKUP_PASSPHRASE`: at least 20 characters, generated and stored securely. This produces an authenticated AES-256-GCM `.sql.gz.enc` archive with the `IRBBK01` header, a random salt and IV, and PBKDF2-SHA256 at 600,000 iterations.

When both are supplied, GPG takes precedence. A `.sha256` sidecar accompanies every completed archive. Plaintext `.sql.gz` archives require `ALLOW_UNENCRYPTED_BACKUP=true`; use that exception only for disposable synthetic tests. Historical CBC `.enc` files are not accepted as the current authenticated format.

The utilities use private temporary directories, `umask 077`, and cleanup traps. Database snapshot contents exist temporarily before encryption, so the backup execution host and its temporary storage must also be trusted and protected. The scripts log the selected database name, hostname, destination and safe errors; keep operational logs access controlled.

## Run a backup

Inject these settings privately before running the script:

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | Source database, with verified transport |
| `BACKUP_DB_SSL_CA` | Readable provider CA certificate for any remote source |
| `BACKUP_PASSPHRASE` or `BACKUP_GPG_RECIPIENT` | Archive encryption and separate recovery material |
| `BACKUP_DIR` | Private persistent destination; defaults to `./backups` |
| `BACKUP_RETENTION_DAYS` | Local pruning horizon, default 30; 0 disables pruning, maximum 3650 |
| `BACKUP_S3_BUCKET` | Optional offsite upload target; requires AWS CLI and restricted credentials |
| `BACKUP_S3_PREFIX` | Optional target prefix, default `irb-ultimate/mysql` |

Run from the checkout with the protected environment already loaded:

```sh
bash scripts/backup.sh
```

The utility completes the dump, compression, encryption and checksum before publishing the local archive. If S3 is selected, it uploads both archive and checksum with AES256 server-side encryption. An upload failure returns a failure status and retains the completed local copy. Check both objects and their permissions before recording an offsite success.

Use a backup identity restricted to the approved destination; the web application should not be able to erase the independent backup. Enable provider versioning, deletion protection or object lock where supported and institutionally approved. `BACKUP_RETENTION_DAYS` only prunes matching local archives after a successful run; remote lifecycle retention is configured separately. Retention periods and legal holds must follow the responsible institution's approved policy. No universal IRB or medical-record duration is implied here.

## Scheduling and alerting

A separate scheduler must run the backup command on a persistent, trusted host with a compatible database client. A daily timer is one possible operating policy; choose the frequency from the approved recovery point objective. Verify current provider pricing before creating a hosted cron service. The free web-service configuration does not establish a daily database backup.

For a host that already has systemd, a service and timer can run the command:

```ini
# /etc/systemd/system/irb-backup.service
[Unit]
Description=IRB Saudi Arabia encrypted database backup
After=network-online.target

[Service]
Type=oneshot
User=irb
EnvironmentFile=/etc/irb/backup.env
WorkingDirectory=/opt/irb
ExecStart=/usr/bin/env bash scripts/backup.sh
```

```ini
# /etc/systemd/system/irb-backup.timer
[Unit]
Description=IRB Saudi Arabia daily backup schedule

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Restrict the environment file and archive directory to the backup operator, enable the timer on the chosen host, and route nonzero exits and overdue successful receipts to a monitored operator channel. A scheduler configuration or timer status is not evidence that an archive completed. Record archive time, checksum, local/offsite completion, latest successful restore, and measured recovery point/time. Alert before the acceptable backup age is exceeded.

## Restore drill

Restore only into a new isolated database with no outbound email/model credentials. Never use the production database as a drill target. Before invoking the utility, review the destination hostname and database name independently of the source. Supply the selected target via `DATABASE_URL` and the matching decryption material and remote CA through protected environment injection.

For an already created isolated target named `irb_restore_test`, run:

```sh
RESTORE_CONFIRM_DB=irb_restore_test \
  bash scripts/restore.sh /private/backups/exact-approved-archive.sql.gz.enc
```

`RESTORE_CONFIRM_DB` must equal the exact target database name; `CONFIRM=yes` does not authorize restoration. Pass one exact archive path with its adjacent `.sha256` sidecar. Do not use a wildcard that could expand to several snapshots. For a GPG archive select its `.sql.gz.gpg` path and make the appropriate private key available. Plaintext synthetic fixtures additionally require `ALLOW_UNENCRYPTED_BACKUP=true`.

The utility copies the input into a private workspace, verifies the checksum, authenticates/decrypts the entire archive, validates gzip and decompression, and rejects SQL database-switching directives before making database writes. It then restores matching objects into the confirmed target. Once SQL execution begins, a database failure can leave a partial target; inspect or recreate the isolated target before retrying. This is not an atomic rollback mechanism.

Compare restored table and row counts, application/version/decision relationships, audit and authorization state, and representative object references against a snapshot manifest. Verify private object recovery and access denial separately. Compare immutable snapshot hashes rather than a changing live source. Record any unsupported layer and the elapsed recovery time. A successful SQL import alone does not prove a complete disaster recovery capability.

After a real incident restore, rotate `JWT_SECRET` before reopening access because restored session revocations may be older than current tokens. Reconcile mail outbox/provider receipts before enabling outbound delivery, and review AI spend, rate limits and audit intervals against external evidence. See [the operations runbook](docs/operations-runbook.md).

## Certificate convenience copies

`server/services/certificateBackup.ts` writes private local day-folder copies under `UPLOADS_DIR/certificate-backups/YYYY-MM-DD/`. When the selected storage provider is remote, it also attempts a copy through that provider. A failed remote copy leaves the local cache and a safe warning; it is not an offsite success receipt.

The scheduler runs after database initialization, at API startup and each 24 hours while the process is running. It copies files still present in the local `certificates/` directory and prunes local day folders older than its 30-day cache horizon. It does not enumerate or back up the entire remote bucket, and it does not prune remote copies. Local copies on an ephemeral service can disappear on restart or deploy. Configure the authoritative object's independent recovery and retention accordingly.

## Failures

Treat any nonzero exit or missing/overdue archive receipt as a failed backup. Check client availability and provider-supported dump permissions, CA access, database quota/connectivity, free disk space, encryption material, and destination upload permissions without printing credentials or raw research data. Failed temporary dumps are cleaned up; completed encrypted local archives remain after an offsite upload failure. Do not bypass encryption or TLS checks to clear an alert.
