# Deployment runbook — IRB Ultimate

This is a runbook, not an automated pipeline. Phase 6 was deliberately
held off live wiring because the chosen Vercel + Railway + PlanetScale
stack does not satisfy Saudi PDPL / NDMO data-residency for real human-
subjects research data. Walk through "Residency decision" below before
following the rest.

## Status

| | |
|---|---|
| Audit findings (start → now) | 44 → ~3 MEDIUMs open |
| 3 CRITICALs | closed |
| 18 HIGHs | closed |
| Dep CVEs | 26 → 3 moderate transitives |
| Tests | 95 / 95 |
| Backup tooling | `scripts/backup.sh` + `BACKUP.md` |
| Data reset | run successfully — only owner row remains |
| Resource downloads | PDF + DOCX endpoints live at `/api/export/resource/<slug>.<pdf\|docx>` |

## Residency decision (must resolve before live launch)

The platform handles human-subjects research data. Under **PDPL Art. 29**
and **NDMO §6**, sensitive personal data of KSA residents (including
health-research data) should be stored inside the Kingdom unless an
explicit cross-border transfer authorisation exists. Pick one:

### Option A — Demo / pilot only (recommended for first push)

Deploy to Vercel + Railway + PlanetScale **with a visible banner** that
labels the platform as a demo / pilot using non-real data. Real PHI is
not accepted. Banner copy is wired via env: set
`VITE_PUBLIC_DEMO_BANNER=1` and an EN/AR notice appears in the navbar +
landing hero.

This is the "ship now, real launch later" path. Use for AHSS leadership
demos, recruiting reviewers, gathering feedback. **Do not invite real
PIs to submit real protocols on this deployment.**

### Option B — KSA-resident hosting (real launch)

Move to a Saudi-resident host. Concrete choices, fastest → most
sovereign:

| Host | KSA region | Notes |
|---|---|---|
| AWS me-central-1 | Bahrain (adjacent) | Good developer ecosystem; get an NDMO cross-border assessment first |
| Oracle Cloud Jeddah | Yes (Jeddah) | Single-AZ, smaller ecosystem |
| STC Cloud / SCCC Alibaba KSA | Yes (Riyadh / Jeddah) | Best for sovereign data, lighter docs |

Frontend can still be Vercel (no PHI passes through it). API server,
MySQL, S3 bucket, backup bucket all live in KSA-region. Re-do the
NDMO + PDPL data-flow map before launch.

### Option C — Self-hosted KSA VPS

Cheapest path. Provision a KSA VPS (STC Cloud, etc.), run the Express
server + MySQL there, point Vercel at it. You own ops; you also own
patching and uptime.

---

## Pre-flight checklist (do once, before first deploy)

- [ ] **Generate strong secrets**
  - `JWT_SECRET` — `openssl rand -hex 48` (must be ≥32 chars, not a
    placeholder; production refuses to boot with a weak secret)
  - `BACKUP_PASSPHRASE` — `openssl rand -hex 32`
  - `DEV_LOGIN_TOKEN` — `openssl rand -hex 32` (only if you'll ever
    enable dev login on a non-prod env)
- [ ] **Pick a KSA-resident MySQL** (Option B/C above) and capture the
  DATABASE_URL with `?ssl={"rejectUnauthorized":true}` appended.
- [ ] **Pick an S3-compatible bucket** in the same jurisdiction
  (AWS me-central-1, R2, Backblaze KSA partner). Two buckets:
  - `${APP}-uploads` — file uploads, lifecycle 7y per NBCE
  - `${APP}-backups` — daily SQL dumps, object-lock 30d
- [ ] **OAuth gateway**: register the production redirect URI at
  `https://<api-host>/api/oauth/callback`. Set `OAUTH_SERVER_URL` and
  `OAUTH_PORTAL_URL` (or `VITE_OAUTH_PORTAL_URL`) to your provider.
- [ ] **Provision an LLM credential** for the prod env (MiniMax, OpenAI,
  Anthropic — pick one with a documented DPA covering KSA data).
- [ ] **Sentry DSN** (optional). Don't set it if no DPA is in place; the
  observability shim is no-op without one.
- [ ] **Cron / scheduler**: configure daily `scripts/backup.sh` to run at
  03:00 KSA local time (00:00 UTC). On Railway this is a separate cron
  job pointing at the same env; on systemd use the unit in `BACKUP.md`.

## Required env vars in production

```
NODE_ENV=production
PORT=3000
JWT_SECRET=<openssl rand -hex 48>
DATABASE_URL=mysql://...?ssl={"rejectUnauthorized":true}
VITE_APP_ID=irb-ultimate-prod
OWNER_OPEN_ID=<your-openid-from-the-oauth-provider>

OAUTH_SERVER_URL=https://your-oauth-gateway
OAUTH_PORTAL_URL=https://your-oauth-portal
VITE_OAUTH_PORTAL_URL=https://your-oauth-portal

# CRITICAL: SPA origin allowlist for split-domain deploy (SA-01 / SA-20)
ALLOWED_ORIGINS=https://irb.example.sa

# Optional connect-src extensions (Sentry, analytics)
ALLOWED_CONNECT_HOSTS=https://sentry.yourorg.io

# LLM (one set)
LLM_API_URL=https://api.openai.com
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
LLM_MAX_TOKENS=8192
LLM_USER_DAILY_LIMIT=60
LLM_GLOBAL_DAILY_LIMIT=2000

# S3 storage (uploads bucket)
AWS_REGION=me-central-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=irb-ultimate-uploads-prod

# Backup script (separate bucket + restricted IAM key)
BACKUP_DIR=/var/lib/irb/backups
BACKUP_RETENTION_DAYS=30
BACKUP_PASSPHRASE=<openssl rand -hex 32>
BACKUP_S3_BUCKET=irb-ultimate-backups-prod
BACKUP_S3_PREFIX=mysql/irb_platform

# SMTP for notifications
SMTP_HOST=smtp.example.sa
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="IRB Ultimate <noreply@irb.example.sa>"

# SSRF egress allowlist (SA-38). When set, the platform may only fetch
# from these hosts. Tighter than the default IP-range deny list.
ALLOWED_EGRESS_HOSTS=files.s3.me-central-1.amazonaws.com,api.openai.com

# Demo banner. Set 1 for Option A demo deploys.
VITE_PUBLIC_DEMO_BANNER=
# Public canonical URL for SEO (build-time).
VITE_PUBLIC_SITE_URL=
```

## Deploy targets

### Vercel — SPA only

`vercel.json` (commit alongside this file when you're ready):

```json
{
  "buildCommand": "pnpm install --frozen-lockfile && pnpm vite build",
  "outputDirectory": "dist/public",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://api.irb.example.sa/api/$1" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

Set `VITE_APP_ID` and `VITE_OAUTH_PORTAL_URL` as Vercel env vars.

### Railway / Render — Express API + MySQL

- **Dockerfile** (commit when ready):
  ```Dockerfile
  FROM node:24-alpine
  RUN apk add --no-cache mysql-client chromium
  ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
  WORKDIR /app
  COPY . .
  RUN corepack enable && pnpm install --frozen-lockfile && pnpm build
  EXPOSE 3000
  CMD ["pnpm", "start"]
  ```
- **Health check**: `GET /api/health` → 200 `{ ok: true, version }`. Set
  Railway / Render's HTTP health check to this path.
- **Cron job**: separate service, runs `bash scripts/backup.sh` daily.
  Inherits the same env (especially `DATABASE_URL` + `BACKUP_*`).

### PlanetScale — MySQL

Replace if/when you move to KSA. PlanetScale URL form:
`mysql://user:pswd@host.connect.psdb.cloud:3306/db?ssl={"rejectUnauthorized":true}`

The DB driver already enforces TLS in production (SA-19).

## First-launch smoke test (do in order)

1. `curl -sf https://api.<host>/api/health` — must return 200 with the
   build hash.
2. Visit the SPA. Hit `/api/oauth/start?next=/` → portal → callback.
   Check that the `__Host-oauth_state` cookie is set on first hit and
   gone after callback.
3. Click "Verify IRB" — empty form should not error. Try `AB` — should
   reject (SA-11 minimum length).
4. Sign in as admin. Submit a draft application. Run Stage 1 review.
   `pnpm dev` logs should show LLM budget reservation. Try 61+ calls in
   a row — last one should 429.
5. `curl -sI https://api.<host>/api/export/resource/informed-consent.docx`
   — must return 200 with `Content-Type: application/...wordprocessingml`.
6. Trigger the daily backup manually:
   `railway run -- bash scripts/backup.sh`
   Verify the dump landed in S3 and is encrypted.
7. Restore drill: pull yesterday's dump into a throwaway DB, run the
   restore script, count rows.

## Going public (the final push)

Only after Option B or C residency move:

1. Take a final backup + verify restore.
2. Update DNS to point `irb.example.sa` → Vercel.
3. Set `VITE_PUBLIC_DEMO_BANNER=` (empty) to remove the demo notice.
4. Smoke-test in private mode.
5. Email the AHSS list with the production URL + onboarding doc.

## What's deliberately NOT automated

- The Vercel + Railway projects themselves. They need a human to create
  them, hook up env vars, and click "deploy."
- DNS. Cloudflare / your registrar.
- Cross-border data-transfer paperwork. Speak to legal.
- ROPA / Records of Processing under PDPL Art. 31.
- A signed DPA with the chosen LLM provider.

When all of the above are done, this runbook becomes a 10-minute checklist
instead of a multi-week process.
