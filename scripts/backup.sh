#!/usr/bin/env bash
# IRB Ultimate — daily MySQL backup.
#
# Reads DATABASE_URL from the environment, runs mysqldump into a gzip'd file,
# optionally encrypts it, optionally uploads to S3, and prunes old local
# backups.
#
# Required env:
#   DATABASE_URL              mysql://user:pass@host:port/db
#
# Optional env:
#   BACKUP_DIR                where to write locally (default ./backups)
#   BACKUP_RETENTION_DAYS     prune older local backups (default 30)
#   BACKUP_PASSPHRASE         if set, openssl-aes-256-cbc encrypts the dump
#   BACKUP_GPG_RECIPIENT      if set, gpg encrypts the dump (preferred over passphrase)
#   BACKUP_S3_BUCKET          if set, also upload to s3://$BUCKET/$BACKUP_S3_PREFIX/
#   BACKUP_S3_PREFIX          default "irb-ultimate/mysql"
#   AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  for S3 upload
#
# Exit codes:
#   0 success    1 misuse    2 dump failed    3 upload failed
#
# Cron example (Linux, daily 03:00 UTC):
#   0 3 * * * cd /app && /usr/bin/env bash scripts/backup.sh >> /var/log/irb-backup.log 2>&1

set -euo pipefail

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die()  { log "ERROR: $*" >&2; exit "${2:-1}"; }

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL not set" 1

# Parse mysql://user:pass@host:port/db using node — same regex MySQL2 uses.
# Falls back to a pure-bash parse if node is unavailable.
parse_url() {
  if command -v node >/dev/null 2>&1; then
    node -e '
      const u = new URL(process.env.DATABASE_URL);
      const out = {
        host: u.hostname,
        port: u.port || "3306",
        user: decodeURIComponent(u.username || ""),
        pass: decodeURIComponent(u.password || ""),
        db:   decodeURIComponent((u.pathname || "/").slice(1)),
      };
      // newline-delimited so shell can read line-by-line
      console.log([out.host, out.port, out.user, out.pass, out.db].join("\n"));
    '
  else
    # Bash fallback: mysql://user:pass@host:port/db
    local rest="${DATABASE_URL#mysql://}"
    local creds="${rest%%@*}"
    local hostpart="${rest#*@}"
    local user="${creds%%:*}"
    local pass="${creds#*:}"
    [ "$user" = "$pass" ] && pass=""
    local hostport="${hostpart%%/*}"
    local db="${hostpart#*/}"
    db="${db%%\?*}"
    local host="${hostport%%:*}"
    local port="${hostport#*:}"
    [ "$host" = "$port" ] && port="3306"
    printf '%s\n%s\n%s\n%s\n%s\n' "$host" "$port" "$user" "$pass" "$db"
  fi
}

# Read parse_url output line-by-line (POSIX / bash 3.2 compatible; macOS
# ships bash 3.2 which has no `mapfile`).
PARSED=$(parse_url)
DB_HOST=$(printf '%s\n' "$PARSED" | sed -n '1p')
DB_PORT=$(printf '%s\n' "$PARSED" | sed -n '2p')
DB_USER=$(printf '%s\n' "$PARSED" | sed -n '3p')
DB_PASS=$(printf '%s\n' "$PARSED" | sed -n '4p')
DB_NAME=$(printf '%s\n' "$PARSED" | sed -n '5p')

[ -n "$DB_HOST" ] && [ -n "$DB_NAME" ] || die "DATABASE_URL parsed empty (host=$DB_HOST db=$DB_NAME)" 1
command -v mysqldump >/dev/null 2>&1 || die "mysqldump not found in PATH" 1

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="${BACKUP_DIR}/irb-${DB_NAME}-${TS}"
DUMP_FILE="${BASE}.sql.gz"

log "Dumping ${DB_NAME}@${DB_HOST}:${DB_PORT} -> ${DUMP_FILE}"

# --single-transaction: consistent snapshot without table locks (InnoDB)
# --quick: stream rows row-by-row instead of buffering whole table in RAM
# --routines/--triggers/--events: include stored procedures, triggers, scheduler
# --set-gtid-purged=OFF: skip GTID bits — keeps the dump portable
# --column-statistics=0: silence the mysqldump 8 warning against MySQL 5.7 servers
# Password via MYSQL_PWD env: doesn't appear in `ps`, unlike -p<pass>
if ! MYSQL_PWD="$DB_PASS" mysqldump \
      --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
      --single-transaction --quick --routines --triggers --events \
      --set-gtid-purged=OFF --column-statistics=0 \
      "$DB_NAME" | gzip -9 > "$DUMP_FILE"; then
  rm -f "$DUMP_FILE"
  die "mysqldump failed" 2
fi

SIZE=$(wc -c < "$DUMP_FILE")
log "Dump complete: ${SIZE} bytes"
[ "$SIZE" -gt 0 ] || die "Dump file is empty — refusing to upload" 2

# Optional encryption.
FINAL_FILE="$DUMP_FILE"
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  ENC="${DUMP_FILE}.gpg"
  log "Encrypting (gpg, recipient=${BACKUP_GPG_RECIPIENT})"
  gpg --batch --yes --trust-model always --output "$ENC" \
      --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$DUMP_FILE"
  shred -u "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE"
  FINAL_FILE="$ENC"
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  ENC="${DUMP_FILE}.enc"
  log "Encrypting (openssl aes-256-cbc, passphrase)"
  # -pbkdf2 hardens key derivation against the old EVP_BytesToKey
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
      -in "$DUMP_FILE" -out "$ENC" \
      -pass env:BACKUP_PASSPHRASE
  shred -u "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE"
  FINAL_FILE="$ENC"
else
  log "WARN: backup is unencrypted. Set BACKUP_GPG_RECIPIENT or BACKUP_PASSPHRASE."
fi

# Optional S3 upload.
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 || die "aws CLI not found but BACKUP_S3_BUCKET is set" 3
  PREFIX="${BACKUP_S3_PREFIX:-irb-ultimate/mysql}"
  DEST="s3://${BACKUP_S3_BUCKET}/${PREFIX}/$(basename "$FINAL_FILE")"
  log "Uploading -> ${DEST}"
  if ! aws s3 cp "$FINAL_FILE" "$DEST" \
        --only-show-errors \
        --sse AES256; then
    die "S3 upload failed" 3
  fi
  log "Uploaded"
fi

# Prune local backups (only the local copies, not S3 — S3 lifecycle handles its own).
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  log "Pruning local backups older than ${BACKUP_RETENTION_DAYS}d in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
       \( -name 'irb-*.sql.gz' -o -name 'irb-*.sql.gz.enc' -o -name 'irb-*.sql.gz.gpg' \) \
       -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
fi

log "Backup OK: $(basename "$FINAL_FILE")"
