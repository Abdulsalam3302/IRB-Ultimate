# Public deployment guide — IRB Saudi Arabia

## Important: independence & data safety

- This platform is **not** an official NBCE IRB provider. It is operated independently by **AHSS** (ahss-sa.org).
- For any **public/demo** deployment, set `VITE_PUBLIC_DEMO_BANNER=1` so users see a pilot notice.
- Do **not** accept real participant PHI on non–KSA-resident hosts without PDPL/NDMO review (see `DEPLOY.md`).

## Stack (current codebase)

| Layer | Technology | Notes |
|-------|------------|--------|
| App | Node.js + Express + tRPC | Monolith serves API + SPA |
| Frontend | Vite + React | Builds to `dist/public` |
| Database | **MySQL 8** (Drizzle ORM) | Not Supabase Postgres out of the box |
| Files | S3-compatible storage | Certificates, uploads |
| PDF | Playwright Chromium | Requires Node server (not static-only hosting) |

**Supabase:** The schema is MySQL/Drizzle today. Moving to Supabase Postgres requires a migration project. For fastest public launch, use **Railway MySQL**, **PlanetScale**, or a KSA-resident MySQL host.

## Recommended: Railway (full stack, one click from GitHub)

1. Push this repo to GitHub `main`.
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub → select `IRB-Ultimate`.
3. Add **MySQL** plugin → copy `DATABASE_URL` into service variables.
4. Set required env vars (see `.env.example`):
   - `NODE_ENV=production`
   - `JWT_SECRET` — `openssl rand -hex 48`
   - `VITE_APP_ID=irb-sa-prod`
   - `OWNER_OPEN_ID=<your-oauth-sub>`
   - `VITE_PUBLIC_DEMO_BANNER=1` (public pilot)
   - `VITE_PUBLIC_SITE_URL=https://your-railway-domain.up.railway.app`
   - `ALLOWED_ORIGINS=https://your-railway-domain.up.railway.app`
   - LLM keys (`LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`)
5. Deploy uses `railway.toml`: `npm run build` → `npm start`.
6. Health check: `GET /api/health`.

## Alternative: Vercel (frontend) + Railway (API)

Because Playwright and long-running Express do not fit Vercel serverless well:

1. Deploy **API** on Railway (steps above).
2. Deploy **static SPA** on Vercel with `VITE_PUBLIC_SITE_URL` and API proxy, **or** point Vercel to Railway URL as single origin (custom domain on Railway only — simpler).

For a single public URL, prefer **Railway only**.

## GitHub push

```bash
git add -A
git commit -m "Public launch: independence disclaimer, footer fix, certificate v2"
git push origin main
```

## Security checklist (production)

- [ ] Strong `JWT_SECRET` (≥48 hex chars)
- [ ] `DEV_LOGIN_ENABLED` unset or `0`
- [ ] `ALLOWED_ORIGINS` set to your exact SPA origin(s)
- [ ] OAuth redirect URI registered for production API host
- [ ] S3 bucket private; presigned URLs only
- [ ] `VITE_PUBLIC_DEMO_BANNER=1` until KSA data residency is confirmed
- [ ] Daily backups via `scripts/backup.sh` (see `BACKUP.md`)

## Verify deployment

```bash
curl -s https://YOUR_HOST/api/health | jq
```

Open `/` — confirm **Platform notice** banner and footer show independent AHSS positioning.
