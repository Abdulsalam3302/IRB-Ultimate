# Deployment and institutional activation — 2.2.0

This guide separates a synthetic pilot from operation with real research data. The repository contains engineering safeguards; the institution must establish its authority, lawful data flows, qualified staff and operating controls before inviting the public. For the current Render/Vercel configuration see [PUBLIC_DEPLOY.md](PUBLIC_DEPLOY.md).

## Institutional activation

Keep `IRB_ISSUANCE_ENABLED=false` during setup and pilot testing. Before enabling approvals, record the operating legal entity, authorized committee and applicable Saudi requirements, reviewer qualifications/conflicts, quorum and escalation procedures, consent/document standards, decision conditions, validity/renewal policy and signature process. Assign real reviewers through the authorized administrative workflow. Hiring staff and enabling a flag alone do not establish institutional or regulatory authority.

AI can support drafting, completeness checks, triage and risk flags. Final IRB approval requires the qualified human committee and an authenticated authorized decision. Human decision provenance is recorded when that decision occurs. Never backfill provenance on old automated approvals to make them publicly verifiable; reassess those records through the approved human process.

The planned 2027 global expansion is a jurisdiction-by-jurisdiction roadmap. Validate local ethics authority, privacy rules, consent language, data transfer, complaint handling and reliance arrangements before marketing recognition in a new country.

## Data and infrastructure decision

Build a data-flow map covering research narratives and attachments, identity, AI prompts, external evidence queries, logs, support, public verification, storage, backups and the frontend proxy. Determine applicable processing/transfer requirements with qualified local privacy/legal and bioethics personnel. Document processor agreements, locations, subprocessors, retention/deletion, security controls and incident obligations. No specific region, provider or generic legal citation in this repository substitutes for that assessment.

For real data, provision:

1. A monitored Node 24 service with enough memory for bounded Chromium rendering, maintained OS/browser dependencies, TLS, restricted ingress and a tested restart/rollback mechanism.
2. A private verified-TLS database with capacity monitoring, encryption, separate service/migration/backup credentials where feasible, and recovery objectives. MariaDB 11 is the CI migration reference. Test the exact managed database engine before cutover.
3. Private durable object storage. The implemented S3 driver uses AWS region and credentials, requests AES256 encryption, and returns short-lived downloads after application authorization. Configure block-public-access, IAM, versioning, retention and recovery at the bucket level. Arbitrary S3-compatible endpoints and KMS configuration are not exposed by the current driver.
4. A private ClamAV daemon with current signatures, monitoring and INSTREAM size settings sufficient for the application's 15 MiB file cap. The API limits scanning concurrency and rejects missing, malicious, malformed, timed-out or unavailable scans by default in production.
5. Institutional Supabase authentication with MFA enrollment and a verified `aal2` session for owner/admin/reviewer access. Protect provider administrative access and recovery codes. Configure exact `OWNER_OPEN_ID`; do not rely on unverified email bootstrap.
6. Approved model/evidence providers and optional observability/push providers, each with appropriate contracts and data handling. No SMTP email delivery is implemented; operational escalation needs a separately established monitored channel.

Local production storage is an explicit exception (`ALLOW_LOCAL_STORAGE=true`) requiring a durable encrypted private volume and an independent backup/restore procedure. The free Render blueprint does not supply such durability. Do not enable that exception on ephemeral storage for real records.

## Build, migration and release sequence

Use a staging environment with synthetic data and independent credentials. Match Node 24 and pnpm 10.34.5. Follow the isolated test database procedure in [README.md](README.md), then:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
node scripts/check-bundle.mjs
```

Build-time `VITE_PUBLIC_SITE_URL` must be the intended HTTPS canonical origin. Use the checked-in Dockerfile or the documented Render build with matching Playwright Chromium. Record the source SHA and image/build identity.

Before deploying to a populated database, take and verify an encrypted backup, test migration on a restored staging copy and review the SQL. Use `pnpm db:migrate` with the intended environment's secret injection. Production startup also runs the checked-in migrations and refuses to start if they fail. Migrations and code must be compatible with rollback; avoid destructive schema changes in the same release as their first consumer.

Configure `.env.example` variables using the environment's secret store. Production requires strong session signing, a database and app identity at startup. Set exact public URLs/origins, institutional authentication, staff MFA, scanner and durable storage; leave approval issuance disabled during acceptance. Do not use `ALLOW_LOCAL_TEST_DB=1`, scanner bypass, development login or weakened staff MFA in a public deployment.

Run the actual-host acceptance checks in [the operations runbook](docs/operations-runbook.md). Confirm `/api/ready` on direct and public-proxy routes, host/build identity, browser behavior, role boundaries, failure handling, restore evidence and traffic capacity. A successful build or commit does not prove a deployment, and a green health endpoint does not prove a complete workflow.

## Go-to-market activation

Publish truthful Arabic/English operator identity, privacy/terms, scope, support and incident contacts, pricing and limitations. Review SEO/AEO/GEO structured content against the claims register and actual service availability. Do not advertise government approval, universal compliance, autonomous IRB approval, guaranteed review times or international recognition without substantiating evidence.

Configure the purchased domain, DNS/TLS, canonical URLs, redirects and authentication callbacks together. Rebuild public pages and verify robots/sitemap/llms output; confirm confidential routes and API responses remain noindex/no-store. Analytics and advertising tags must not receive protocol, participant or staff data; review consent and processor obligations before enabling them.

Begin with a bounded cohort and documented capacity/support coverage. Enable issuance only after institutional sign-off and technical acceptance have both been recorded. Keep production evidence, outstanding risks and the named activation decision in [production readiness](docs/production-readiness.md).
