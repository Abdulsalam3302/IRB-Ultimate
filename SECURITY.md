# Security Policy

IRB Ultimate handles human-subjects research data. We take security seriously,
especially before any deployment that accepts real participant information.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `main`  | Yes       |

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report privately to:

- **Dr. Abdulsalam Aleid** — [LinkedIn](https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-911446142)
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
3. Configure OAuth — do not rely on `/api/dev/login`
4. Enable TLS and set `ALLOWED_ORIGINS` for split-domain deploys
5. Use KSA-resident MySQL + object storage for real research data (see `DEPLOY.md`)
6. Enable encrypted backups (`BACKUP_PASSPHRASE` or GPG recipient)
7. Set `ALLOWED_EGRESS_HOSTS` to restrict outbound fetches

See `README.md` and `DEPLOY.md` for the full hardening guide.
