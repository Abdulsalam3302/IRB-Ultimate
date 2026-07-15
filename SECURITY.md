# Security Policy

IRB Ultimate handles human-subjects research data. We take security seriously,
especially before any deployment that accepts real participant information.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `1.1.x` (open beta) | Yes |
| `main`  | Yes       |

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report privately to:

- **Dr. Abdulsalam Aleid** — [LinkedIn](https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-mhqs-911446142/)
- **AHSS** — [ahss.sa](https://www.ahss-sa.org/)

Include:

1. A clear description of the issue and impact
2. Steps to reproduce (or a proof-of-concept if safe)
3. Affected routes, roles, or data types
4. Your contact details for follow-up

We aim to acknowledge reports within **72 hours** and provide a remediation
timeline within **7 business days** for confirmed issues.

## Scope

In scope:

- Authentication, session handling, and authorization (RBAC)
- File upload and download paths
- SSRF / egress from server-side fetch helpers
- SQL injection, XSS, CSRF on `/api/*` and the SPA
- Rate-limit and LLM budget bypass
- Information disclosure via error messages or audit logs

Out of scope:

- Social engineering against individual users
- Denial-of-service at network volume (report to your hosting provider)
- Issues in third-party OAuth, LLM, or SMTP providers outside this codebase

## Safe harbor

Good-faith security research that avoids privacy violations, data destruction,
and service disruption is welcome. Do not access data belonging to other users
beyond what is needed to demonstrate a flaw.

## Production checklist (operators)

Before exposing a public instance:

1. Set a strong `JWT_SECRET` (`openssl rand -hex 48`)
2. Disable dev login (`DEV_LOGIN_ENABLED` unset; `NODE_ENV=production`)
3. Configure Supabase Auth, OAuth, or native email/password — the open
   passwordless sign-in mode has been removed; pilot mode requires a
   ≥ 32-char `PILOT_LOGIN_TOKEN` distributed out of band
4. Enable TLS and set `ALLOWED_ORIGINS` for split-domain deploys
5. Use KSA-resident MySQL + object storage for real research data (see `DEPLOY.md`)
6. Enable encrypted backups (`BACKUP_PASSPHRASE` or GPG recipient)
7. Set `ALLOWED_EGRESS_HOSTS` to restrict outbound fetches

## Hardening shipped in the public-use release (2026-07)

- Removed production passwordless sign-in; pilot tokens are never embedded
  in served pages and must be ≥ 32 chars
- Certificate downloads are owner/admin-only by application id (public
  verification uses the redacted stored certificate via `/verify`)
- Certificate generation fails closed (legacy SVG/HTML fallback removed)
- Owner-email auto-admin is a one-time bootstrap on every auth path
- AI budgets persisted in MySQL (`llm_usage_daily`) — survive restarts and
  horizontal replicas
- Deterministic server-side gate: Stage 1/2 can never pass with empty
  mandatory fields regardless of LLM output (prompt-injection hardening)
- PI email no longer sent to the LLM provider (PII minimization)
- Typed confirmation on all admin approval/decision mutations
- Upload magic-byte validation; S3 objects stored with
  `Content-Disposition: attachment`; co-investigator cap
- Support-ticket notifications carry a sanitized preview only
- PDPL self-service: data export (JSON) and account deletion from Profile

## Open beta v1.1.0 hardening (2026-07)

- Session JWT/cookie TTL shortened to **14 days** (was 1 year). Logout clears
  the cookie; tokens remain stateless until expiry (no server denylist yet).
- Public `verify.verifyIrb` no longer returns long-lived signed certificate
  URLs. Clients call `verify.certificateDownload` for a **5-minute** URL.
- Literature fetch paths enforce `assertSafeEgress` (SSRF guard).
- Supabase owner-email admin promotion is one-time via `adminExists()` (aligned
  with native auth); existing admins are not demoted on login.
- Native password minimum raised to **12** characters.
- Rate limits (in-memory, per process): 200/min general `/api/*`, 30/min strict
  (upload/AI/literature/support/analytics), 5/min auth. Cookies are
  `httpOnly` + `SameSite=Lax` (+ `Secure` on HTTPS).
- First-party analytics store **HMAC-hashed IP** and coarse geo only; owner-only
  observability dashboard at `/admin/observability`.
- Mandatory first-visit disclaimer acknowledgment before using the app.

### Open-beta operator checklist (additions)

1. Run migration `0014_analytics_observability`
2. Confirm `OWNER_OPEN_ID` / `OWNER_EMAIL` point at your account
3. Set `ALLOWED_ORIGINS` and `ALLOWED_EGRESS_HOSTS` for production
4. Remind beta testers: no real PHI until a later production hardening pass

See `README.md` and `DEPLOY.md` for the full hardening guide.
