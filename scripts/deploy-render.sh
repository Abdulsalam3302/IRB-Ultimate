#!/usr/bin/env bash
# Prepare local secrets + vercel rewrites for Render-backed public deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RENDER_URL="${RENDER_URL:-https://irb-saudi-arabia.onrender.com}"
VERCEL_URL="${VERCEL_URL:-https://irb-saudi-arabia.vercel.app}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 48)}"

echo "==> IRB Saudi Arabia — Render + Vercel public deploy helper"
echo "    Render API:  $RENDER_URL"
echo "    Public SPA:  $VERCEL_URL"
echo "    JWT_SECRET:  $JWT_SECRET"
echo
echo "1) Create free TiDB Cloud Serverless (MySQL) cluster:"
echo "   https://tidbcloud.com → Developer Tier → copy DATABASE_URL (with ssl)"
echo
echo "2) Render → New → Blueprint → connect this repo → apply render.yaml"
echo "   Or: https://dashboard.render.com/select-repo?type=blueprint"
echo
echo "3) On the Render service, set env:"
cat <<EOF
   NODE_ENV=production
   DATABASE_URL=<tidb mysql url>
   JWT_SECRET=$JWT_SECRET
   OWNER_EMAIL=<your real email>
   PUBLIC_APP_URL=$VERCEL_URL
   VITE_PUBLIC_SITE_URL=$VERCEL_URL
   ALLOWED_ORIGINS=$VERCEL_URL,$RENDER_URL
   VITE_APP_ID=irb-sa-prod
   VITE_PUBLIC_DEMO_BANNER=1
EOF
echo
echo "4) Point Vercel rewrites at Render:"
node scripts/update-vercel-rewrites.mjs "$RENDER_URL"
echo
echo "5) After Render is Live, verify:"
echo "   curl -sS $RENDER_URL/api/health"
echo "   Then register OWNER_EMAIL at $VERCEL_URL/auth (first admin bootstrap)."
echo
echo "6) Optional GitHub secret for auto-redeploy:"
echo "   RENDER_DEPLOY_HOOK = (Render → Settings → Deploy Hook URL)"
