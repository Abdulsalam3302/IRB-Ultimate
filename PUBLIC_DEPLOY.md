# Public deployment guide — IRB Saudi Arabia

## Quick auto deploy (recommended)

### Already configured in GitHub
These secrets are stored on `Abdulsalam3302/IRB-Ultimate`:
- `JWT_SECRET` — production session signing
- `PILOT_LOGIN_TOKEN` — pilot login (demo)
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — Vercel CI

Add once in GitHub → Settings → Secrets:
- `RAILWAY_TOKEN` — from [railway.app/account/tokens](https://railway.app/account/tokens)
- `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)

Then push to `main` — `.github/workflows/deploy.yml` deploys automatically.

### One-command local setup
```bash
chmod +x scripts/deploy-all.sh
RAILWAY_TOKEN=xxx ./scripts/deploy-all.sh
```

### Live URLs
| Service | URL |
|---------|-----|
| **Vercel (frontend)** | https://irb-saudi-arabia.vercel.app |
| **Railway (full stack)** | Set after first Railway deploy |

After Railway is live, merge `vercel.rewrites.template.json` into `vercel.json` (replace `RAILWAY_API_URL` with your Railway host) so Vercel proxies `/api/*` to the backend.

---

## Important: independence & data safety

- This platform is **not** an official NBCE IRB provider. It is operated independently by **AHSS** (ahss-sa.org).
- Set `VITE_PUBLIC_DEMO_BANNER=1` on public deploys (already set on Vercel).
- Do **not** accept real participant PHI on non–KSA-resident hosts without PDPL/NDMO review.

## Stack

| Layer | Technology |
|-------|------------|
| App | Node.js + Express + tRPC monolith |
| Frontend | Vite + React → `dist/public` |
| Database | **MySQL 8** (Drizzle) — use Railway MySQL |
| PDF | Playwright (Docker image included) |

**Supabase:** You have a Supabase project, but this codebase uses **MySQL/Drizzle**. Postgres migration is a separate project. Use **Railway MySQL** for immediate full functionality.

## Railway (full stack)

1. [railway.app/new](https://railway.app/new) → Deploy from GitHub → `IRB-Ultimate`
2. Add **MySQL** service → link `DATABASE_URL` to the web service
3. Set variables on the web service:

```
NODE_ENV=production
JWT_SECRET=<from GitHub secret JWT_SECRET>
VITE_APP_ID=irb-sa-prod
OWNER_OPEN_ID=dev-owner-001
PILOT_LOGIN_ENABLED=1
PILOT_LOGIN_TOKEN=<from GitHub secret PILOT_LOGIN_TOKEN>
VITE_PUBLIC_DEMO_BANNER=1
ALLOWED_ORIGINS=https://irb-saudi-arabia.vercel.app,https://YOUR-SERVICE.up.railway.app
```

4. Dockerfile + `railway.toml` handle build (Playwright included).
5. Migrations run automatically on boot (`server/migrate.ts`).
6. Health: `GET /api/health`
7. Pilot login: `GET /api/dev/login` (token embedded when `PILOT_LOGIN_ENABLED=1`)

## Vercel (frontend)

- Project: `irb-saudi-arabia` (linked to GitHub)
- Env vars set: `VITE_PUBLIC_DEMO_BANNER=1`, `VITE_APP_ID`, `VITE_PUBLIC_SITE_URL`
- Rebuild after env changes: `vercel deploy --prod`

## Security checklist

- [x] `JWT_SECRET` generated (GitHub secret)
- [x] `PILOT_LOGIN_TOKEN` generated (GitHub secret)
- [ ] `RAILWAY_TOKEN` added to GitHub
- [ ] `DEV_LOGIN_ENABLED` unset in production
- [ ] `ALLOWED_ORIGINS` includes Vercel + Railway URLs
- [ ] OAuth configured when moving beyond pilot

## Verify

```bash
curl -s https://YOUR-RAILWAY-HOST/api/health | jq
```

Open `/` — confirm platform independence notice and demo banner.
