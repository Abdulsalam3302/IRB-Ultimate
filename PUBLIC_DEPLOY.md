# Public deployment — IRB Saudi Arabia (v1.1 open beta)

## Chosen stack (free + capable)

| Layer | Service | Why |
|-------|---------|-----|
| **API + SPA build** | [Render](https://render.com) free Web Service (Node) | Runs the Express monolith; free tier; Git auto-deploy; health checks |
| **Frontend edge** | [Vercel](https://vercel.com) (existing) | CDN SPA; rewrites `/api/*` → Render |
| **Database** | [TiDB Cloud](https://tidbcloud.com) Serverless (MySQL-compatible) | Free Developer Tier; TLS; works with Drizzle/MySQL |
| **Not used** | Railway | Trial expired / paid — replaced |

> **Vercel alone is not enough** for this app: certificates/Playwright and a long-lived Express server need a real Node process. Render hosts that; Vercel fronts the SPA.

Free-tier notes:
- Render spins down after ~15 minutes idle → first request can take ~30–60s. GitHub `keep-warm.yml` pings every 12 minutes.
- Free Render RAM is limited; PDF certificate generation may skip (approval still works). Upgrade to Starter when you need reliable certs.

---

## One-time setup (≈20 minutes)

### 1. TiDB Cloud (MySQL)

1. Create a free Serverless cluster at https://tidbcloud.com  
2. Create a database named `irb_platform`  
3. Copy the connection string (include SSL), e.g.  
   `mysql://user:pass@gateway01….tidbcloud.com:4000/irb_platform?ssl=true`

### 2. Render Web Service

**Option A — Blueprint (recommended)**  
1. https://dashboard.render.com/select-repo?type=blueprint  
2. Select `Abdulsalam3302/IRB-Ultimate` → apply [`render.yaml`](render.yaml)  
3. Service name: `irb-saudi-arabia` → URL becomes  
   `https://irb-saudi-arabia.onrender.com`

**Option B — Manual**  
- New → Web Service → this repo  
- Runtime: Node  
- Build: `corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile && pnpm run build`  
- Start: `node dist/index.js`  
- Health: `/api/health`  
- Plan: Free  

**Environment variables on Render:**

```
NODE_ENV=production
PORT=10000
DATABASE_URL=<tidb url with ssl>
JWT_SECRET=<openssl rand -hex 48>
OWNER_EMAIL=<your real email — first register becomes admin>
VITE_APP_ID=irb-sa-prod
VITE_PUBLIC_DEMO_BANNER=1
PUBLIC_APP_URL=https://irb-saudi-arabia.vercel.app
VITE_PUBLIC_SITE_URL=https://irb-saudi-arabia.vercel.app
ALLOWED_ORIGINS=https://irb-saudi-arabia.vercel.app,https://irb-saudi-arabia.onrender.com
```

Optional (if using Supabase social login):
```
SUPABASE_URL=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

**AI generation (required for Stage 1/2 review, enhance, auto-complete, swarm):**
```
LLM_API_URL=https://api.minimax.io
LLM_API_KEY=<your key with remaining credits>
LLM_MODEL=MiniMax-M2
LLM_PROVIDER=openai
LLM_MAX_TOKENS=24576
```
Or OpenAI-compatible:
```
LLM_API_URL=https://api.openai.com
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
```
Without a working key/credits, AI endpoints return `[AI_UNAVAILABLE]` (applications can still proceed via proceed-despite).

Verify after login as owner:
```
PORT=3010 node scripts/check-ai.mjs
# or against production once Render is live:
BASE_URL=https://irb-saudi-arabia.onrender.com OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/check-ai.mjs
```

Migrations run automatically on boot (`server/migrate.ts`).

### 3. Point Vercel at Render

```bash
node scripts/update-vercel-rewrites.mjs https://irb-saudi-arabia.onrender.com
git add vercel.json && git commit -m "Point Vercel API rewrites at Render" && git push
```

Or set rewrites in the Vercel dashboard to the same destinations.

Fix GitHub secret `VERCEL_TOKEN` if CI deploy fails (current token was invalid).

### 4. Verify

```bash
curl -sS https://irb-saudi-arabia.onrender.com/api/health
curl -sS https://irb-saudi-arabia.vercel.app/api/health
```

Both should return healthy JSON (Vercel proxies to Render).

### 5. Create owner admin

1. Open https://irb-saudi-arabia.vercel.app/disclaimer → acknowledge  
2. Register at `/auth` with **exactly** `OWNER_EMAIL`  
3. Password ≥ 12 characters  
4. Open https://irb-saudi-arabia.vercel.app/admin/observability  

---

## GitHub secrets / vars

| Name | Purpose |
|------|---------|
| `RENDER_DEPLOY_HOOK` | Optional — Render → Settings → Deploy Hook |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Frontend CI deploy |
| `JWT_SECRET` | Prefer setting on Render dashboard (not only GitHub) |
| var `RENDER_URL` | Keep-warm + docs (`https://….onrender.com`) |

Railway secrets/vars can be removed.

---

## Local helper

```bash
chmod +x scripts/deploy-render.sh
RENDER_URL=https://irb-saudi-arabia.onrender.com ./scripts/deploy-render.sh
```

---

## Security checklist (public beta)

- [ ] Strong `JWT_SECRET` (≥ 32 chars) on Render  
- [ ] `ALLOWED_ORIGINS` lists Vercel + Render URLs only  
- [ ] `OWNER_EMAIL` is your address; register that account first  
- [ ] `DEV_LOGIN_ENABLED` unset; `PILOT_LOGIN_ENABLED=0` for real public use  
- [ ] TiDB TLS enabled (`ssl=true` in URL)  
- [ ] No real PHI until KSA-resident hosting + PDPL review  
- [ ] Health green on both Render and Vercel proxy  

---

## URLs

| Surface | URL |
|---------|-----|
| Public site | https://irb-saudi-arabia.vercel.app |
| API (Render) | https://irb-saudi-arabia.onrender.com |
| Health | `/api/health` |
| Observability | `/admin/observability` (owner only) |

## Live stack (as of 2026-07-15)

| Layer | Status |
|-------|--------|
| Render `irb-saudi-arabia` (Frankfurt, free) | Live — auto-deploy from `main` |
| TiDB Serverless `irb-saudi-arabia` (eu-central-1) | Active — DB `irb_platform`, TLS |
| Vercel SPA + `/api` rewrite → Render | Live |
| Keep-warm GitHub Action | Every 12 minutes |
| Owner bootstrap | Register with `OWNER_EMAIL` (= Render account email) first |

**Ops notes**
- Migrations use `CREATE INDEX IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` (TiDB cannot run MySQL stored procedures).
- Render build uses `npm i -g pnpm@10.4.1` (not `corepack enable` — EROFS on free images).
- Pin Node `20.x` via `engines` + `.node-version`.
- `DATABASE_POOL_MAX=5` for TiDB Serverless.
