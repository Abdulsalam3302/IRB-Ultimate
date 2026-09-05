#!/usr/bin/env bash
# Read-only deployment guidance; secrets belong in the hosting provider vault.
set -euo pipefail
cat <<'GUIDANCE'
IRB deployment uses .github/workflows/deploy.yml after the exact main revision passes CI.
Read PUBLIC_DEPLOY.md and docs/operations-runbook.md before enabling a production cohort.
Set operator secrets directly in Render/Vercel; this helper never generates or prints them.
Keep IRB_ISSUANCE_ENABLED=false until the responsible institution authorizes issuance.
Staff access requires institutional Supabase MFA; applicant uploads require a healthy scanner.
Check both /api/health and /api/ready and verify the deployed commit in each provider.
Use scripts/update-vercel-rewrites.mjs HTTPS_BACKEND_ORIGIN only when moving the backend.
GUIDANCE
