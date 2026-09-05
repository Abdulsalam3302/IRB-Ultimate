# Render/Vercel pilot deployment — 2.4.0

This guide describes the checked-in configuration, not the current state of any hosting account. The Render blueprint selects a **free Frankfurt** service and disables automatic deployment. Use this topology for synthetic pilot data while institutional authority, processor/residency review, durability and capacity are being established. Free-tier capacity and availability must be checked against the provider's current terms; no uptime or load guarantee follows from this repository.

## Topology and data flows

Render runs the Node 24 Express process and Chromium document generation. It can serve both the frontend and API. Optional Vercel hosting serves `dist/public` and proxies `/api/*` to Render using `vercel.json`. **Both providers handle proxied API traffic**, including authenticated payloads. Include them in the data-flow and processor assessment.

An external MySQL-compatible database stores application, decision, audit, session-revocation, request-limit and AI usage records. The code requires private durable storage for production uploads and a working malware scanner. Follow [Supabase activation](docs/supabase-storage-activation.md) and the separate [private ClamAV deployment](docs/scanner-deployment.md); the web-service blueprint alone does not provision them, staff MFA or an operating committee.

## Build and launch settings

Apply `render.yaml` only after reviewing the region, plan, repository and environment for the intended deployment. For a manually configured Node service, use the same settings:

```text
Node: 24
Build: npm install -g pnpm@10.34.5 && pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm run build
Start: node dist/index.js
Readiness path: /api/ready
```

The Dockerfile is an alternative image build with matching Chromium system dependencies and an unprivileged runtime user. Confirm real PDF generation in the chosen hosting image; installing a browser in a developer workstation does not prove the host has its fonts, libraries or memory.

Production startup applies checked-in migrations and fails if they cannot complete. Back up and test migrations on staging first. The preferred reviewed migration command is `pnpm db:migrate`; do not generate new migrations during deployment.

## Environment

Use `.env.example` as the variable reference, keeping server credentials in the hosting secret store. Configure:

- `NODE_ENV=production`, a strong `JWT_SECRET`, `VITE_APP_ID`, `DATABASE_URL` with verified TLS, and bounded database pool/queue values appropriate to the service.
- `PUBLIC_APP_URL`, `PUBLIC_SITE_URL` and build-time `VITE_PUBLIC_SITE_URL` to the final HTTPS public origin. `ALLOWED_ORIGINS` must contain the exact permitted browser origins. Set `TRUST_PROXY_HOPS` from the actual edge/API path and restrict direct-origin access.
- Institutional `SUPABASE_URL`, `VITE_SUPABASE_URL`, and public `VITE_SUPABASE_ANON_KEY`. Register the exact `/auth/callback` URLs in Supabase. Update the static `connect-src` policy in `vercel.json` if its configured project changes; environment variables do not rewrite that policy.
- `OWNER_OPEN_ID=sb:<verified-Supabase-user-subject>` for the intended owner and `STAFF_MFA_REQUIRED=true`. Confirm the signed session carries `aal2` after MFA. A native email/password account or an email match alone is not the production staff setup.
- `DEV_LOGIN_ENABLED=0`, `PILOT_LOGIN_ENABLED=0` and `IRB_ISSUANCE_ENABLED=false` until institutional issuance is authorized.
- `UPLOAD_SCAN_REQUIRED=true`, private `CLAMAV_HOST`/port, and a private S3 bucket plus the supported AWS credential/region settings. The code writes S3 objects with AES256 server-side encryption; enforce private access and retention in bucket/IAM policy as well.
- An approved OpenAI-compatible LLM endpoint/key/model when AI processing is authorized. Keep `AI_ENABLED=0` until provider contracts/data flows are cleared, then explicitly enable it. Set user/global call ceilings and provider-side spend limits. Native Anthropic request format is not supported by the current client.

The default `PDF_MAX_CONCURRENCY=1` limits rendering memory pressure. Production upload scanning and durable storage deliberately fail closed when missing; disabling safeguards to make a free host accept real data is not release acceptance.

## Optional Vercel frontend

Retain the public SEO-page rewrites, workspace fallback, robots/sitemap/llms assets, security headers and private-route noindex/no-store rules in `vercel.json`. The helper updates backend destinations while preserving the other routes:

```bash
node scripts/update-vercel-rewrites.mjs https://your-api.example.com
```

Review the resulting configuration before committing. Set public build-time variables on Vercel as well as Render, then rebuild. All `VITE_` variables are exposed to browsers; API keys, session secrets and service credentials must never use that prefix.

The checked-in Vercel Git deployment switch and Render automatic deployment switch are disabled. Review current GitHub workflow dispatch requirements and hosting configuration before publishing; pushing source does not by itself prove either host deployed. Do not treat old domain URLs or historical token errors in prior notes as current evidence.

## Verify the actual deployment

Use the chosen origin in these read-only checks:

```bash
curl --fail --silent --show-error https://your-api.example.com/api/health
curl --fail --silent --show-error https://your-api.example.com/api/ready
curl --fail --silent --show-error https://your-public.example.com/api/ready
```

Record the build identity/version, readiness result, time and host. `/api/health` is liveness/version information; `/api/ready` checks database and required security schema. Neither proves scanner health, provider contracts, backup restoration or committee authority.

Complete the synthetic acceptance checklist in [the runbook](docs/operations-runbook.md), including browser login/MFA, upload scanning, private download denial, AI outage behavior, document rendering, restart persistence and bounded load. Confirm the actual host's memory, latency and error rates. On constrained infrastructure, reject excess work cleanly; document failures must remain visible and must not be represented as successful PDF delivery.

Before accepting real applications or paid-ad traffic, close the requirements in [DEPLOY.md](DEPLOY.md) and record release evidence in [production readiness](docs/production-readiness.md). A custom domain is only one part of that decision.

### Container frontend configuration

Vite public configuration is compiled into the browser build. Supply `--build-arg VITE_PUBLIC_SITE_URL=...`, `--build-arg VITE_SUPABASE_URL=...`, `--build-arg VITE_SUPABASE_ANON_KEY=...` and `--build-arg VITE_APP_ID=irb-sa-prod` when building the image. The evaluation banner has been removed; the former `VITE_PUBLIC_DEMO_BANNER` setting has no effect. These are public browser values; never pass a service-role key or other secret as a build argument. Runtime-only environment variables cannot change an already built frontend. The container still needs its separate server/database/model/scanner secrets at runtime.
