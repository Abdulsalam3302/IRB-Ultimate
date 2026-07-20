# Production readiness — IRB Saudi Arabia (open beta)

Last updated: 2026-07-20

## 1. Repository overview

IRB Saudi Arabia is an Express + tRPC + React (Vite) monolith for NCBE-style IRB applications with Stage 1/2 AI review, certificates, committee workflows, and owner observability.

## 2. Current architecture

| Layer | Choice |
|-------|--------|
| Package manager | pnpm (lockfile enforced) |
| Runtime | Node 20.x |
| API | Express + tRPC |
| SPA | Vite React → Vercel |
| API host | Render free Web Service (`irb-saudi-arabia`, Frankfurt) |
| Database | TiDB Cloud Serverless MySQL (`irb_platform`, eu-central-1, TLS) |
| Auth | Native email/password + optional Supabase; JWT cookie sessions |
| AI | MiniMax OpenAI-compatible API (`MiniMax-M3`) |
| CI | GitHub Actions `ci.yml` (secret scan → MariaDB migrate → typecheck/tests/build → e2e) |
| Deploy | Render Git auto-deploy + Vercel production deploy workflow |

## 3. Baseline verification (local, 2026-07-20)

See the final agent report for exact pass/fail of the latest run. Expected commands:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
PORT=3010 node scripts/check-ai.mjs   # requires local server + LLM key
curl -sS https://irb-saudi-arabia.onrender.com/api/health
curl -sS https://irb-saudi-arabia.vercel.app/api/health
```

## 4. Risk register (condensed)

| ID | Priority | Risk | Mitigation status |
|----|----------|------|-------------------|
| R1 | P0 | LLM API key leaked in chat/tickets | Keys only in Render/.env; rotate if exposed; CI secret scan |
| R2 | P0 | Auth/API down when host sleeps | Keep-warm Action; clear outage messaging |
| R3 | P1 | TiDB stored-proc migrations | Rewritten to IF NOT EXISTS DDL |
| R4 | P1 | Free-tier cold starts / PDF RAM | Documented; certs may skip on free plan |
| R5 | P1 | MiniMax quota exhaustion | `[AI_UNAVAILABLE]` degrade path |
| R6 | P2 | No dedicated staging env | Recommended next milestone |
| R7 | P2 | Branch protection not enforced in GitHub settings | Admin action required |
| R8 | P2 | PHI / PDPL hosting residency | Open beta disclaimer; no real PHI until KSA hosting review |

## 5. Changes implemented (recent)

- MiniMax default model → `MiniMax-M3`
- Reasoning-tag strip coverage for M3 `<think>` blocks
- CI: Node 20, concurrency, minimal permissions, heuristic secret scan
- TiDB-compatible migrations; Render pnpm install without corepack EROFS
- Owner AI status probe + observability card
- Production deploy docs (`PUBLIC_DEPLOY.md`)

## 6. Remaining risks

- No automated staging promotion gate
- Vercel GH token may still be stale (CLI deploy works)
- Free Render spin-down remains (mitigated by keep-warm)
- AI quality depends on MiniMax plan/credits
- Certificate PDF generation may OOM on free RAM

## 7. CI/CD design

1. PR / push → `secret-scan` → `verify` (migrate, `pnpm check`, `pnpm test`, `pnpm build`, bundle budgets) → `e2e`
2. Merge to `main` → Render auto-deploy + optional deploy hook + Vercel workflow
3. Keep-warm pings `/api/health` every 12 minutes

## 8. Testing strategy

- Unit/integration: Vitest (`pnpm test`) — authz, AI outage copy, migrations helpers, routers
- E2E: `scripts/e2e-*.mjs` + Playwright screenshots in CI
- Live AI: `scripts/check-ai.mjs` (owner session)

## 9. Deployment and rollback

**Deploy:** push to `main` (Render) / `vercel --prod` or deploy workflow (Vercel).

**Rollback:**
1. Render Dashboard → Deploys → Redeploy previous live deploy
2. Or `git revert` + push
3. Vercel → Promote previous production deployment

**Migrations:** prefer expand-and-contract; TiDB cannot run MySQL stored procedures.

## 10. Recommended GitHub settings (admin)

- Protect `main`: require PR, 1 approval, require status checks `secret-scan`, `verify` (and `e2e` when stable)
- Disallow force-push / deletion on `main`
- Restrict Actions secrets to this repo; never expose production secrets to fork PRs
- Rotate any API key that appeared in chat

## 11. Prioritized next steps

1. Enable branch protection with required CI checks
2. Add a Render staging service + TiDB branch for pre-prod smoke
3. Fix/refresh `VERCEL_TOKEN` GitHub secret
4. Upgrade Render plan when certificate PDF reliability matters
5. Rotate MiniMax key if it was shared outside secret storage
