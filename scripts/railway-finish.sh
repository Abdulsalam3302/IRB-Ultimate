#!/usr/bin/env bash
# Finish Railway + Vercel wiring after GitHub repo is connected on railway.app.
# Requires: RAILWAY_TOKEN, JWT_SECRET, PILOT_LOGIN_TOKEN (from env or GitHub Actions secrets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLI="npx --yes @railway/cli@4.61.1"
VERCEL_URL="${VERCEL_URL:-https://irb-saudi-arabia.vercel.app}"
GITHUB_REPO="${GITHUB_REPO:-Abdulsalam3302/IRB-Ultimate}"
WEB_SERVICE="${RAILWAY_WEB_SERVICE:-IRB-Ultimate}"
MYSQL_SERVICE="${RAILWAY_MYSQL_SERVICE:-MySQL}"

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "ERROR: RAILWAY_TOKEN is required (https://railway.com/account/tokens)" >&2
  exit 1
fi
if [[ -z "${JWT_SECRET:-}" || -z "${PILOT_LOGIN_TOKEN:-}" ]]; then
  echo "ERROR: JWT_SECRET and PILOT_LOGIN_TOKEN are required" >&2
  exit 1
fi

export RAILWAY_TOKEN

echo "==> Finding Railway project linked to ${GITHUB_REPO}..."
PROJECT_ID="${RAILWAY_PROJECT_ID:-}"
if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$("$CLI" list --json | node -e "
    const repo = process.argv[1].toLowerCase();
    const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const projects = Array.isArray(data) ? data : (data.projects ?? data);
    const list = (projects?.edges ?? projects ?? []).map(e => e.node ?? e);
    const hit = list.find(p => {
      const name = (p.name || '').toLowerCase();
      return name.includes('irb') || name.includes('ultimate') || name.includes('saudi');
    });
    if (hit?.id) { console.log(hit.id); process.exit(0); }
    if (list[0]?.id) { console.log(list[0].id); process.exit(0); }
    process.exit(1);
  " "$GITHUB_REPO")" || true
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: Could not detect Railway project. Set RAILWAY_PROJECT_ID." >&2
  exit 1
fi

echo "    Project: $PROJECT_ID"
"$CLI" link --project "$PROJECT_ID" --environment production 2>/dev/null || "$CLI" link --project "$PROJECT_ID"

echo "==> Ensuring MySQL service..."
if ! "$CLI" variable list --service "$MYSQL_SERVICE" --json >/dev/null 2>&1; then
  echo "    Adding MySQL..."
  "$CLI" add --database mysql --service "$MYSQL_SERVICE" --json >/dev/null || \
    "$CLI" add --database mysql --json >/dev/null
fi

echo "==> Configuring web service variables (${WEB_SERVICE})..."
"$CLI" variable set NODE_ENV=production --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set "JWT_SECRET=${JWT_SECRET}" --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set VITE_APP_ID=irb-sa-prod --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set OWNER_OPEN_ID=dev-owner-001 --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set PILOT_LOGIN_ENABLED=1 --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set "PILOT_LOGIN_TOKEN=${PILOT_LOGIN_TOKEN}" --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set VITE_PUBLIC_DEMO_BANNER=1 --service "$WEB_SERVICE" --skip-deploys
"$CLI" variable set "DATABASE_URL=\${{${MYSQL_SERVICE}.MYSQL_URL}}" --service "$WEB_SERVICE" --skip-deploys

echo "==> Generating public domain..."
DOMAIN_OUT="$("$CLI" domain --service "$WEB_SERVICE" --json 2>/dev/null || "$CLI" domain --service "$WEB_SERVICE" 2>&1 || true)"
RAILWAY_HOST="$(node -e "
const raw = process.argv[1] || '';
try {
  const j = JSON.parse(raw);
  const d = j.domain || j.url || j.hostname || (j.serviceDomain && j.serviceDomain.domain);
  if (d) { console.log(String(d).replace(/^https?:\\/\\//,'')); process.exit(0); }
} catch {}
const m = raw.match(/([a-z0-9-]+\\.up\\.railway\\.app)/i);
if (m) console.log(m[1]);
" "$DOMAIN_OUT")"

if [[ -z "$RAILWAY_HOST" ]]; then
  RAILWAY_HOST="$("$CLI" status --json 2>/dev/null | node -e "
    const j = JSON.parse(require('fs').readFileSync(0,'utf8'));
    const domains = j?.service?.domains ?? j?.domains ?? [];
    const d = domains[0]?.domain || domains[0];
    if (d) console.log(String(d).replace(/^https?:\\/\\//,''));
  " 2>/dev/null || true)"
fi

if [[ -z "$RAILWAY_HOST" ]]; then
  echo "WARN: Could not detect Railway domain — set ALLOWED_ORIGINS manually in dashboard." >&2
  RAILWAY_URL="https://YOUR-SERVICE.up.railway.app"
else
  RAILWAY_URL="https://${RAILWAY_HOST}"
  echo "    Railway URL: $RAILWAY_URL"
  "$CLI" variable set "ALLOWED_ORIGINS=${VERCEL_URL},${RAILWAY_URL}" --service "$WEB_SERVICE" --skip-deploys
fi

echo "==> Triggering redeploy..."
"$CLI" redeploy --service "$WEB_SERVICE" --yes 2>/dev/null || "$CLI" up --detach --service "$WEB_SERVICE" 2>/dev/null || true

echo "==> Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf "${RAILWAY_URL}/api/health" >/dev/null 2>&1; then
    echo "    Health OK"
    break
  fi
  sleep 10
done

if [[ -n "${RAILWAY_HOST:-}" && "$RAILWAY_HOST" != "YOUR-SERVICE.up.railway.app" ]]; then
  echo "==> Wiring Vercel API proxy..."
  node "$ROOT/scripts/update-vercel-rewrites.mjs" "$RAILWAY_URL"
  if command -v vercel >/dev/null 2>&1; then
    vercel deploy --prod --yes 2>/dev/null || true
  fi
fi

cat <<EOF

Done.
  Full stack:  ${RAILWAY_URL}
  Frontend:    ${VERCEL_URL}
  Health:      ${RAILWAY_URL}/api/health
  Pilot login: ${RAILWAY_URL}/api/dev/login

EOF
