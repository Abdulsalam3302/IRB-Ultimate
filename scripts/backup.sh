#!/usr/bin/env bash
# Private MySQL/MariaDB snapshot. Never sources .env.
# Required: DATABASE_URL and BACKUP_GPG_RECIPIENT or BACKUP_PASSPHRASE (>=20 chars).
# Explicit isolated-test exception: ALLOW_UNENCRYPTED_BACKUP=true.
# Remote databases require BACKUP_DB_SSL_CA and verified TLS.
# Output: archive + .sha256 sidecar; passphrase archives use authenticated IRBBK01 AES-GCM.
set -euo pipefail
umask 077
log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $1" >&2; exit "${2:-1}"; }
command -v node >/dev/null 2>&1 || die "Node.js is required"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is required"
[ -n "${BACKUP_GPG_RECIPIENT:-}" ] || [ -n "${BACKUP_PASSPHRASE:-}" ] || [ "${ALLOW_UNENCRYPTED_BACKUP:-}" = "true" ] || die "Encrypted backups require a GPG recipient or passphrase"
if [ -n "${BACKUP_PASSPHRASE:-}" ] && [ -z "${BACKUP_GPG_RECIPIENT:-}" ]; then
  [ "${#BACKUP_PASSPHRASE}" -ge 20 ] || die "BACKUP_PASSPHRASE must contain at least 20 characters"
fi

PARSED=$(node <<'JS'
try {
  const u = new URL(process.env.DATABASE_URL);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const port = u.port || "3306";
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!["mysql:", "mariadb:"].includes(u.protocol) || !host || !user || !/^[A-Za-z0-9_]{1,64}$/.test(name) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || [host, user, pass, name].some(v => /[\x00-\x1f\x7f]/.test(v))) throw new Error();
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!local && /^(false|disable|disabled)$/i.test(u.searchParams.get("ssl") || u.searchParams.get("ssl-mode") || "")) throw new Error();
  process.stdout.write([host, port, user, pass, name, local ? "local" : "remote"].join("\n") + "\n");
} catch { process.stderr.write("Invalid or insecure DATABASE_URL\n"); process.exit(1); }
JS
) || die "Database URL validation failed"
DB_HOST=$(printf '%s\n' "$PARSED" | sed -n '1p')
DB_PORT=$(printf '%s\n' "$PARSED" | sed -n '2p')
DB_USER=$(printf '%s\n' "$PARSED" | sed -n '3p')
DB_PASS=$(printf '%s\n' "$PARSED" | sed -n '4p')
DB_NAME=$(printf '%s\n' "$PARSED" | sed -n '5p')
DB_TRANSPORT=$(printf '%s\n' "$PARSED" | sed -n '6p')
unset PARSED
DUMP_BIN=${MYSQLDUMP_BIN:-mysqldump}
command -v "$DUMP_BIN" >/dev/null 2>&1 || die "MySQL dump client is unavailable"
DUMP_VERSION=$("$DUMP_BIN" --version)
CLIENT_ARGS=(--no-defaults)
DUMP_ARGS=(--single-transaction --quick --routines --triggers --events --no-tablespaces)
case "$DUMP_VERSION" in
  *MariaDB*) CLIENT_FAMILY=mariadb ;;
  *) CLIENT_FAMILY=mysql; CLIENT_ARGS+=(--no-login-paths); DUMP_ARGS+=(--set-gtid-purged=OFF --column-statistics=0) ;;
esac
if [ "$DB_TRANSPORT" = remote ]; then
  [ -n "${BACKUP_DB_SSL_CA:-}" ] && [ -r "$BACKUP_DB_SSL_CA" ] || die "Remote backups require a readable BACKUP_DB_SSL_CA certificate"
  if [ "$CLIENT_FAMILY" = mysql ]; then CLIENT_ARGS+=(--ssl-mode=VERIFY_IDENTITY); else CLIENT_ARGS+=(--ssl --ssl-verify-server-cert); fi
  CLIENT_ARGS+=("--ssl-ca=$BACKUP_DB_SSL_CA")
else
  if [ "$CLIENT_FAMILY" = mysql ]; then CLIENT_ARGS+=(--ssl-mode=DISABLED); else CLIENT_ARGS+=(--skip-ssl); fi
fi
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
case "$BACKUP_RETENTION_DAYS" in ''|*[!0-9]*) die "Invalid BACKUP_RETENTION_DAYS" ;; esac
[ "$BACKUP_RETENTION_DAYS" -le 3650 ] || die "BACKUP_RETENTION_DAYS exceeds 3650"
BACKUP_DIR=${BACKUP_DIR:-./backups}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
WORK_DIR=$(mktemp -d "$BACKUP_DIR/.irb-backup.XXXXXX")
trap 'rm -rf -- "$WORK_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NONCE=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(4).toString("hex"))')
BASENAME="irb-${DB_NAME}-${STAMP}-${NONCE}.sql.gz"
PLAIN="$WORK_DIR/snapshot.sql.gz"
log "Creating a private snapshot of $DB_NAME on $DB_HOST:$DB_PORT"
if ! MYSQL_PWD="$DB_PASS" "$DUMP_BIN" "${CLIENT_ARGS[@]}" "--host=$DB_HOST" "--port=$DB_PORT" "--user=$DB_USER" "${DUMP_ARGS[@]}" "$DB_NAME" | gzip -6 > "$PLAIN"; then
  die "Database dump failed; temporary plaintext removed" 2
fi
unset DB_PASS
[ -s "$PLAIN" ] && gzip -t "$PLAIN" || die "Snapshot failed compression integrity validation" 2
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  command -v gpg >/dev/null 2>&1 || die "GPG is unavailable"
  STAGED="$WORK_DIR/$BASENAME.gpg"
  gpg --batch --yes --output "$STAGED" --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$PLAIN" || die "GPG encryption failed" 2
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  STAGED="$WORK_DIR/$BASENAME.enc"
  node - "$PLAIN" "$STAGED" <<'JS' || exit 2
const fs = require("node:fs");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
(async () => {
  const input = process.argv[2], output = process.argv[3];
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const header = Buffer.concat([Buffer.from("IRBBK01\n"), salt, iv]);
  const key = crypto.pbkdf2Sync(process.env.BACKUP_PASSPHRASE, salt, 600000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  fs.writeFileSync(output, header, { mode: 0o600, flag: "wx" });
  await pipeline(fs.createReadStream(input), cipher, fs.createWriteStream(output, { flags: "a", mode: 0o600 }));
  fs.appendFileSync(output, cipher.getAuthTag());
  key.fill(0);
})().catch(() => { process.stderr.write("Authenticated backup encryption failed\n"); process.exitCode = 1; });
JS
else
  STAGED="$WORK_DIR/$BASENAME"
  mv "$PLAIN" "$STAGED"
  log "Controlled-test exception: archive encryption was explicitly disabled"
fi
rm -f "$PLAIN"
node - "$STAGED" <<'JS' > "$STAGED.sha256"
const fs = require("node:fs"), crypto = require("node:crypto");
const hash = crypto.createHash("sha256");
const stream = fs.createReadStream(process.argv[2]);
stream.on("data", data => hash.update(data));
stream.on("end", () => process.stdout.write(hash.digest("hex") + "\n"));
stream.on("error", () => { process.stderr.write("Backup checksum failed\n"); process.exitCode = 1; });
JS
FINAL_FILE="$BACKUP_DIR/$(basename "$STAGED")"
[ ! -e "$FINAL_FILE" ] && [ ! -e "$FINAL_FILE.sha256" ] || die "Backup filename collision"
mv "$STAGED" "$FINAL_FILE"
mv "$STAGED.sha256" "$FINAL_FILE.sha256"
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 || die "S3 upload requested but AWS CLI is unavailable" 3
  DEST="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-irb-ultimate/mysql}/$(basename "$FINAL_FILE")"
  aws s3 cp "$FINAL_FILE" "$DEST" --only-show-errors --sse AES256 || die "Archive upload failed; encrypted local copy retained" 3
  aws s3 cp "$FINAL_FILE.sha256" "$DEST.sha256" --only-show-errors --sse AES256 || die "Checksum upload failed; local copy retained" 3
fi
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "irb-${DB_NAME}-*.sql.gz*" -mtime "+$BACKUP_RETENTION_DAYS" -delete
fi
log "Backup OK: $FINAL_FILE (SHA-256 sidecar created)"
