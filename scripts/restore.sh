#!/usr/bin/env bash
# Restore only a verified archive from backup.sh. Never sources .env.
# DATABASE_URL selects an EXISTING target; RESTORE_CONFIRM_DB must equal its exact name.
# Entire checksum/decryption/authentication/gzip validation finishes BEFORE database writes.
# Remote targets require BACKUP_DB_SSL_CA; plaintext test archives require explicit allowance.
set -euo pipefail
umask 077
log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $1" >&2; exit 1; }
command -v node >/dev/null 2>&1 || die "Node.js is required"
FILE=${1:-}
[ -n "$FILE" ] && [ -f "$FILE" ] && [ -f "$FILE.sha256" ] || die "Provide an archive with its .sha256 sidecar"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is required"
PARSED=$(node <<'JS'
try {
  const u = new URL(process.env.DATABASE_URL);
  const host = u.hostname.replace(/^\[|\]$/g, ""), port = u.port || "3306";
  const user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password), name = decodeURIComponent(u.pathname.slice(1));
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
[ "${RESTORE_CONFIRM_DB:-}" = "$DB_NAME" ] || die "RESTORE_CONFIRM_DB must equal the exact target database name; CONFIRM=yes is not accepted"
MYSQL_CLIENT=${MYSQL_BIN:-mysql}
command -v "$MYSQL_CLIENT" >/dev/null 2>&1 || die "MySQL client is unavailable"
CLIENT_ARGS=(--no-defaults)
case "$("$MYSQL_CLIENT" --version)" in
  *MariaDB*) CLIENT_FAMILY=mariadb ;;
  *) CLIENT_FAMILY=mysql; CLIENT_ARGS+=(--no-login-paths) ;;
esac
if [ "$DB_TRANSPORT" = remote ]; then
  [ -n "${BACKUP_DB_SSL_CA:-}" ] && [ -r "$BACKUP_DB_SSL_CA" ] || die "Remote restores require a readable BACKUP_DB_SSL_CA certificate"
  if [ "$CLIENT_FAMILY" = mysql ]; then CLIENT_ARGS+=(--ssl-mode=VERIFY_IDENTITY); else CLIENT_ARGS+=(--ssl --ssl-verify-server-cert); fi
  CLIENT_ARGS+=("--ssl-ca=$BACKUP_DB_SSL_CA")
else
  if [ "$CLIENT_FAMILY" = mysql ]; then CLIENT_ARGS+=(--ssl-mode=DISABLED); else CLIENT_ARGS+=(--skip-ssl); fi
fi
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/irb-restore.XXXXXX")
trap 'rm -rf -- "$WORK_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
chmod 700 "$WORK_DIR"
# Copy first to an owner-only workspace: verification and decryption use the
# same bytes even if an external archive path changes after verification.
cp "$FILE" "$WORK_DIR/archive"
cp "$FILE.sha256" "$WORK_DIR/archive.sha256"
node - "$WORK_DIR/archive" <<'JS' || exit 1
const fs = require("node:fs"), crypto = require("node:crypto");
const file = process.argv[2];
const expected = fs.readFileSync(file + ".sha256", "utf8").trim();
if (!/^[a-f0-9]{64}$/i.test(expected)) { process.stderr.write("Invalid backup checksum sidecar\n"); process.exit(1); }
const hash = crypto.createHash("sha256");
const stream = fs.createReadStream(file);
stream.on("data", chunk => hash.update(chunk));
stream.on("end", () => {
  if (!crypto.timingSafeEqual(hash.digest(), Buffer.from(expected, "hex"))) { process.stderr.write("Backup checksum mismatch; target was not modified\n"); process.exitCode = 1; }
});
stream.on("error", () => { process.stderr.write("Backup checksum validation failed\n"); process.exitCode = 1; });
JS
GZIP_FILE="$WORK_DIR/verified.sql.gz"
case "$FILE" in
  *.sql.gz.enc)
    [ -n "${BACKUP_PASSPHRASE:-}" ] || die "BACKUP_PASSPHRASE is required"
    node - "$WORK_DIR/archive" "$GZIP_FILE" <<'JS' || exit 1
const fs = require("node:fs"), crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
(async () => {
  const input = process.argv[2], output = process.argv[3];
  const fd = fs.openSync(input, "r"), size = fs.fstatSync(fd).size;
  const header = Buffer.alloc(36), tag = Buffer.alloc(16);
  if (size < 53 || fs.readSync(fd, header, 0, 36, 0) !== 36 || header.subarray(0, 8).toString("ascii") !== "IRBBK01\n") throw new Error();
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  const key = crypto.pbkdf2Sync(process.env.BACKUP_PASSPHRASE, header.subarray(8, 24), 600000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(24, 36));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(input, { start: 36, end: size - 17 }), decipher, fs.createWriteStream(output, { mode: 0o600, flags: "wx" }));
  key.fill(0);
})().catch(() => { process.stderr.write("Backup authentication/decryption failed; target was not modified\n"); process.exitCode = 1; });
JS
    ;;
  *.sql.gz.gpg)
    command -v gpg >/dev/null 2>&1 || die "GPG is unavailable"
    gpg --batch --quiet --output "$GZIP_FILE" --decrypt "$WORK_DIR/archive" || die "GPG decryption/integrity validation failed"
    ;;
  *.sql.gz)
    [ "${ALLOW_UNENCRYPTED_BACKUP:-}" = true ] || die "Plaintext archives require an explicit controlled-test exception"
    cp "$WORK_DIR/archive" "$GZIP_FILE"
    ;;
  *) die "Unsupported archive format" ;;
esac
gzip -t "$GZIP_FILE" || die "Compressed backup integrity validation failed; target was not modified"
gunzip -c "$GZIP_FILE" > "$WORK_DIR/verified.sql" || die "Full decompression failed; target was not modified"
[ -s "$WORK_DIR/verified.sql" ] || die "Empty SQL snapshot; target was not modified"
# backup.sh deliberately does not use --databases. Refuse schema-changing
# directives so restore cannot silently switch to the source database.
if LC_ALL=C grep -Eiq '^[[:space:]]*(USE[[:space:]]|CREATE[[:space:]]+DATABASE|DROP[[:space:]]+DATABASE)' "$WORK_DIR/verified.sql"; then
  die "Archive contains database-switching directives; use an institution-reviewed migration instead"
fi
log "Archive authenticated and fully validated; restoring matching objects into $DB_NAME on $DB_HOST:$DB_PORT"
MYSQL_PWD="$DB_PASS" "$MYSQL_CLIENT" "${CLIENT_ARGS[@]}" "--host=$DB_HOST" "--port=$DB_PORT" "--user=$DB_USER" --binary-mode --local-infile=0 "$DB_NAME" < "$WORK_DIR/verified.sql" || die "Database restore failed; investigate the target before retrying"
unset DB_PASS
log "Restore OK: $DB_NAME"
