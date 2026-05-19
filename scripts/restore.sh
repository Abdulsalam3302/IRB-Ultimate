#!/usr/bin/env bash
# IRB Ultimate — restore a backup produced by scripts/backup.sh
#
# Usage:
#   scripts/restore.sh path/to/irb-irb_platform-20260520T030000Z.sql.gz
#   scripts/restore.sh path/to/irb-irb_platform-20260520T030000Z.sql.gz.enc   # openssl
#   scripts/restore.sh path/to/irb-irb_platform-20260520T030000Z.sql.gz.gpg   # gpg
#
# Required env:
#   DATABASE_URL              target to restore INTO (will be wiped!)
#
# Optional env:
#   BACKUP_PASSPHRASE         required if file ends in .enc
#   CONFIRM=yes               skip the interactive confirmation
#
# Restoring a backup is destructive. The script refuses to proceed unless the
# operator types the target db name or sets CONFIRM=yes.

set -euo pipefail

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

FILE="${1:-}"
[ -n "$FILE" ] || die "usage: $0 <backup-file>"
[ -f "$FILE" ] || die "file not found: $FILE"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL not set"

# Reuse parse_url from backup.sh by sourcing it. Keep restore independent for
# now though — small duplication beats a fragile shell module.
parse_db() {
  node -e '
    const u = new URL(process.env.DATABASE_URL);
    console.log([u.hostname, u.port||"3306", decodeURIComponent(u.username||""), decodeURIComponent(u.password||""), decodeURIComponent((u.pathname||"/").slice(1))].join("\n"));
  '
}
mapfile -t URL_PARTS < <(parse_db)
DB_HOST="${URL_PARTS[0]}"; DB_PORT="${URL_PARTS[1]}"
DB_USER="${URL_PARTS[2]}"; DB_PASS="${URL_PARTS[3]}"
DB_NAME="${URL_PARTS[4]}"

[ -n "$DB_NAME" ] || die "DATABASE_URL has no database"
command -v mysql >/dev/null 2>&1 || die "mysql client not found in PATH"

log "About to RESTORE ${FILE} into ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
log "This will OVERWRITE the current database."
if [ "${CONFIRM:-}" != "yes" ]; then
  printf "Type the database name to confirm: "
  read -r ACK
  [ "$ACK" = "$DB_NAME" ] || die "Confirmation mismatch — aborted"
fi

# Decrypt → decompress → stream into mysql.
case "$FILE" in
  *.sql.gz.enc)
    [ -n "${BACKUP_PASSPHRASE:-}" ] || die "BACKUP_PASSPHRASE required for .enc"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
        -in "$FILE" -pass env:BACKUP_PASSPHRASE \
      | gunzip \
      | MYSQL_PWD="$DB_PASS" mysql \
          --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME"
    ;;
  *.sql.gz.gpg)
    gpg --decrypt --quiet "$FILE" \
      | gunzip \
      | MYSQL_PWD="$DB_PASS" mysql \
          --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME"
    ;;
  *.sql.gz)
    gunzip -c "$FILE" \
      | MYSQL_PWD="$DB_PASS" mysql \
          --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME"
    ;;
  *)
    die "Unrecognized file extension: $FILE"
    ;;
esac

log "Restore OK"
