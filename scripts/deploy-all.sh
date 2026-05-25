#!/usr/bin/env bash
# One-shot public deployment helper — generates secrets, configures Vercel, deploys Railway.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

JWT_SECRET="$(openssl rand -hex 48)"
PILOT_TOKEN="$(openssl rand -hex 24)"
VERCEL_URL="${VERCEL_URL:-https://irb-saudi-arabia.vercel.app}"

echo "==> IRB Saudi Arabia — automated public deploy"
echo "    JWT_SECRET (save for Railway): $JWT_SECRET"
echo "    PILOT_LOGIN_TOKEN (save for Railway): $PILOT_TOKEN"

# ── Vercel env (demo banner + build-time vars) ──
if command -v vercel >/dev/null 2>&1; then
  echo "==> Configuring Vercel environment..."
  printf '1' | vercel env add VITE_PUBLIC_DEMO_BANNER production --force 2>/dev/null || true
  printf 'irb-sa-prod' | vercel env add VITE_APP_ID production --force 2>/dev/null || true
  printf '%s' "$VERCEL_URL" | vercel env add VITE_PUBLIC_SITE_URL production --force 2>/dev/null || true
  echo "==> Redeploying Vercel..."
  vercel deploy --prod --yes 2>/dev/null || echo "    (Vercel deploy skipped — run manually)"
else
  echo "    Vercel CLI not found — skip"
fi

# ── Railway ──
if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  echo "==> Deploying Railway (Docker)..."
  npx @railway/cli@4.61.1 up --detach || true
  echo "==> Set Railway variables (if not already):"
else
  echo "==> Railway: set RAILWAY_TOKEN then re-run, or connect GitHub at railway.app"
fi

cat <<EOF

Railway variables to set in dashboard (or via \`railway variables set\`):
  NODE_ENV=production
  JWT_SECRET=$JWT_SECRET
  VITE_APP_ID=irb-sa-prod
  OWNER_OPEN_ID=dev-owner-001
  PILOT_LOGIN_ENABLED=1
  PILOT_LOGIN_TOKEN=$PILOT_TOKEN
  VITE_PUBLIC_DEMO_BANNER=1
  ALLOWED_ORIGINS=$VERCEL_URL,https://YOUR-RAILWAY-URL.up.railway.app

After Railway is live, add to Vercel → Settings → Rewrites:
  /api/*  →  https://YOUR-RAILWAY-URL.up.railway.app/api/*

Pilot login: https://YOUR-RAILWAY-URL/api/dev/login
Health:      https://YOUR-RAILWAY-URL/api/health

GitHub Actions: add secrets RAILWAY_TOKEN, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
EOF
