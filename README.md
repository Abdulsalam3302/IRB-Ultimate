# IRB Ultimate

AI-powered Institutional Review Board platform for Saudi Arabia. Submit research
protocols, run a two-stage AI compliance and ethics review, route to a scientific
committee, and issue downloadable IRB certificates — all aligned with NBCE
regulations and Saudi Vision 2030.

Built and approved by **Dr. Abdulsalam Aleid** in partnership with the
**Advanced Healthcare Systems Society (AHSS)**.

---

## Stack

- **Frontend:** React 19 + Vite + TailwindCSS + Radix UI + tRPC + React Query + Wouter
- **Backend:** Node.js + Express + tRPC + Drizzle ORM + MySQL 8
- **AI:** Any OpenAI-compatible `/v1/chat/completions` endpoint (Forge / OpenAI / etc.)
- **Storage:** S3-compatible bucket (optional — uploads no-op if unconfigured)
- **Auth:** External OAuth provider, with a local **Dev Login** fallback for development

---

## Quick start (local)

```bash
# 1. Install deps
pnpm install

# 2. Configure env
cp .env.example .env
#   Edit .env — at minimum set DATABASE_URL and JWT_SECRET.
#   Leave OAUTH_SERVER_URL empty to enable the local /api/dev/login bypass.

# 3. Create the database (MySQL 8+)
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS irb_platform;"

# 4. Run migrations
pnpm db:push

# 5. Start the dev server
pnpm dev
#   → http://localhost:3000  (or next free port)
#   → http://localhost:3000/api/dev/login  (sign in as admin in dev mode)
```

Visit `/api/dev/login`, accept the defaults, and you're signed in as the platform owner.
Set `OWNER_OPEN_ID=dev-owner-001` in `.env` to auto-promote that openId to admin.

---

## Scripts

| Command         | What it does                                        |
| --------------- | --------------------------------------------------- |
| `pnpm dev`      | Start the dev server with hot reload (tsx watch)    |
| `pnpm build`    | Build the SPA + bundle the server to `dist/`        |
| `pnpm start`    | Run the production bundle (`NODE_ENV=production`)   |
| `pnpm check`    | TypeScript typecheck (no emit)                      |
| `pnpm test`     | Run the vitest suite                                |
| `pnpm db:push`  | Generate + apply Drizzle migrations                 |
| `pnpm format`   | Prettier write across the repo                      |

---

## Environment variables

See `.env.example` for the canonical list. Highlights:

| Variable                     | Required | Notes |
| ---------------------------- | :------: | ----- |
| `DATABASE_URL`               | yes      | `mysql://user:pass@host:3306/db` |
| `JWT_SECRET`                 | yes      | Strong random — used to sign session cookies |
| `VITE_APP_ID`                | yes      | Any non-empty string; appears in JWT claims |
| `OWNER_OPEN_ID`              | yes      | First admin's openId |
| `OAUTH_SERVER_URL`           | prod     | OAuth gateway (leave blank in dev to use the dev login) |
| `VITE_OAUTH_PORTAL_URL`      | prod     | Public OAuth portal the SPA redirects to |
| `BUILT_IN_FORGE_API_URL`     | optional | OpenAI-compatible base URL for AI review |
| `BUILT_IN_FORGE_API_KEY`     | optional | API key for the above |
| `AWS_REGION` / `S3_BUCKET` …  | optional | S3 for file uploads & certificates |

Without an LLM key the platform still runs end-to-end — AI scoring falls back to
neutral defaults so you can exercise the full workflow.

---

## Architecture

```
client/                  Vite SPA (React 19 + tRPC client)
  src/pages/             Route components (landing, dashboard, admin, …)
  src/contexts/          Auth, language (Arabic/English RTL), theme
server/
  _core/
    index.ts             Express bootstrap + middleware
    security.ts          Headers, rate-limit, error handler
    devLogin.ts          Local /api/dev/login bypass (dev only)
    oauth.ts             OAuth callback handler
    sdk.ts               OAuth + JWT session SDK
    llm.ts               OpenAI-compatible chat-completions client
  routers.ts             Full tRPC API surface
  aiReview.ts            Stage 1 & Stage 2 AI compliance reviewers
  aiSwarmReview.ts       Owner-only dual-panel AI swarm deep-audit engine
  certificate.ts         Approved-IRB certificate generator
  retractionCertificate.ts  Retraction certificate (white/red)
  emailService.ts        SMTP notifications (no-op when unset)
  storage.ts             S3 presigned upload helpers
  db.ts                  Drizzle data-access helpers
shared/                  Cross-cutting types & constants
drizzle/                 SQL migrations + schema
```

### Workflow (3 phases)

1. **Phase 0 — Declaration of Honesty:** NBCE bioethics certificate + truth consent.
2. **Stage 1 — Classification:** research type, IRB category, PI info → AI gateway review.
3. **Stage 2 — Detailed Ethics:** methodology, sample size, consent, risk/benefit → AI ethics review.

Submitted applications are randomly assigned to 5 scientific committee members
with a 24-hour expiry. Three approvals advance to admin for final decision.
Approved IRBs receive a downloadable certificate; retracted IRBs return a
retraction PDF on the public verify page.

### AI Swarm Review (owner-only)

The platform owner — and only the owner — can run a **dual-panel AI swarm
deep audit** on any application from the admin panel's *AI Swarm* tab
(`server/aiSwarmReview.ts`, `client/src/components/AiSwarmConsole.tsx`):

- **Two fully independent panels** per run (Panel Alpha — adversarial audit;
  Panel Beta — standards review). They never see each other's output and are
  persisted separately so the owner can compare them for agreement.
- **510 simulated expert perspectives per panel** across six specialty
  clusters: methodology & biostatistics, ethics & consent, regulatory & legal,
  patient & community advocacy, data privacy & security, scientific merit &
  novelty. Each cluster reports vote tallies, findings, red flags, required
  changes, and dissenting opinions; a panel chair synthesises the verdict.
- **Strict by construction.** The pass/fail verdict is enforced server-side
  (score ≥ 80, every cluster ≥ 60, zero red flags, ≥ 70% approve votes) — a
  lenient model cannot soften it, and fenced applicant input defeats prompt
  injection.
- **Fair and unbiased.** Binding anti-bias rules in every prompt, evidence-only
  scoring, mandatory actionable feedback on every fail, and dissent reporting.
- **Advisory and hidden.** It never changes application status, never notifies
  the applicant, and is invisible to applicants, reviewers, and even secondary
  admins (`ownerProcedure` fails closed; the UI tab renders only for the
  owner). Results live in the `ai_swarm_reviews` table; every run is audited.
- **Budgeted.** One run reserves 14 LLM calls against the owner's daily AI
  budget up front (SA-03 policy, no refunds on failure).

The owner is identified by `OWNER_OPEN_ID` (or `OWNER_EMAIL`) captured at
boot — if neither is set, the feature is disabled for everyone (fails closed).

---

## Going to production

A non-exhaustive checklist before exposing this publicly:

1. **Rotate secrets** — generate a fresh `JWT_SECRET` (`openssl rand -hex 48`).
   Set strong DB credentials and never commit `.env`.
2. **Replace dev login** — set `OAUTH_SERVER_URL` and `VITE_OAUTH_PORTAL_URL`.
   Dev login auto-disables when `NODE_ENV=production` *or* `OAUTH_SERVER_URL` is
   set, but verify in your deploy.
3. **TLS only** — terminate HTTPS at your load balancer. Session cookies use
   `SameSite=Lax` (+ `Secure` when the request is HTTPS).
4. **DB:** point `DATABASE_URL` at a managed MySQL (RDS, PlanetScale, etc.).
   Run `pnpm db:push` once on deploy.
5. **AI provider:** configure `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY`.
6. **S3:** configure `AWS_*` and `S3_BUCKET` so uploads and certificates persist.
7. **SMTP:** configure `SMTP_*` so notification emails actually send.
8. **Reverse proxy:** terminate TLS, set `X-Forwarded-For`, and respect
   `app.set('trust proxy', 1)` (already enabled).
9. **Backups:** enable point-in-time recovery on your MySQL instance — the
   `audit_log` and `application_versions` tables are the truth-of-record.

### Built-in hardening

- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS in prod) — `server/_core/security.ts`.
- In-memory IP rate-limit on `/api/*` (200 req/min general, 30/min strict,
  5/min auth). Process-local — use Redis when running multiple nodes.
- Session JWT/cookie TTL: **14 days** (`SESSION_TTL_MS`).
- Error handler that hides stack traces in production.
- Health probe at `GET /api/health` for load balancers.
- Cookies `httpOnly`, `Secure` over HTTPS, `SameSite=Lax`.
- Open beta: first-visit disclaimer gate; owner-only observability at
  `/admin/observability`.

### Public hosting (v1.1+)

- **API:** Render free Web Service (`render.yaml`) — replaces Railway  
- **SPA edge:** Vercel (rewrites `/api/*` → Render)  
- **DB:** TiDB Cloud Serverless (MySQL-compatible) or any TLS MySQL  
- Full steps: [`PUBLIC_DEPLOY.md`](PUBLIC_DEPLOY.md)

---

## Testing

`pnpm test` runs the vitest suite (106 tests covering tRPC procedures, RBAC,
input validation, owner-gating of the AI swarm, and shared types). The tests
boot a real MySQL connection using `DATABASE_URL` from `.env` — make sure
migrations are applied first.

`pnpm e2e:roles` drives the running dev server through all five privilege
levels — visitor, applier, reviewer, secondary admin, and owner — covering
registration/login, the full application journey, committee voting, final
approval + public certificate verification, and the owner-only AI swarm
endpoints (57 checks). Requires `DEV_LOGIN_ENABLED=1` and
`OWNER_OPEN_ID=dev-owner-001` in `.env`.

---

## License

MIT — see `package.json`.

## Acknowledgements

Made with love in Saudi Arabia with the
[Advanced Healthcare Systems Society](https://www.ahss-sa.org/).
Approved by [Dr. Abdulsalam Aleid](https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-911446142).
