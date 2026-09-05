# IRB Ultimate 2.4.1

IRB Ultimate is a bilingual Arabic/English research ethics workflow platform being prepared for a controlled Saudi Arabia pilot. It supports protocol drafting, advisory AI checks, qualified human committee review, decision records, and public verification of eligible decisions.

**The software does not confer IRB registration, government endorsement, institutional authority, or international recognition.** Approval and issuance remain disabled by default (`IRB_ISSUANCE_ENABLED=false`). A qualified, authorized human committee must make final decisions. Planned global expansion in 2027 requires validation for each jurisdiction and institution; recognition is not activated by the calendar.

## What the platform does

- Guides applicants through declarations, classification, detailed protocols, uploads, and revisions in Arabic and English.
- Provides bounded AI drafting and advisory review. Missing information, malformed output, and unavailable providers remain explicit; AI does not issue approval or manufacture evidence.
- Runs two advisory model panels, each comprising six domain analyses and a synthesis. These are model outputs, not hundreds of experts, independent human votes, or a committee quorum.
- Records human committee assignments, decisions, audit history and decision provenance. Draft edits invalidate prior AI checks, and locked applications reject chat changes.
- Generates status-aware PDF/DOCX decision records, draft proposals, and bilingual resource templates. Public decision copies are redacted and require recorded human provenance; legacy automated approvals are not retroactively attested.
- Exposes public information for search/answer engines and read-only browser WebMCP tools and authenticated server MCP workflow tools (including draft edits and submission). Automation receives no authority to approve research or bypass authentication.

## Runtime and local setup

Use **Node.js 24.x** and **pnpm 10.34.5**, matching `package.json`, `.node-version`, Docker and CI. The frontend uses React 19/Vite; the API uses Express/tRPC, Drizzle and a MySQL-compatible database. CI uses MariaDB 11. Existing migration syntax is also designed for TiDB; do not assume stock MySQL 8 compatibility without a fresh migration test.

```bash
npm install -g pnpm@10.34.5
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit the local file with a dedicated development database and a generated session secret (`openssl rand -hex 48`). Keep credentials out of Git and chat. Create the development database using your database administrator, then:

```bash
pnpm db:migrate
pnpm exec playwright install chromium
pnpm dev
```

The development server binds to loopback, normally port 3000. Native applicant registration is available. Local developer login requires explicit `DEV_LOGIN_ENABLED=1`; it is always disabled in production. For a disposable local owner account, set `OWNER_OPEN_ID=dev-owner-001` and use the local developer flow. Do not expose that environment through a public tunnel.

AI credentials are optional for local startup. Without an enabled, working provider, model operations report unavailable. Submission rules and human review remain enforced; no neutral score substitutes for a failed model call. Local development uses private disk storage when remote storage is unconfigured. Production rejects that fallback unless an operator explicitly provisions a durable private volume.

## Commands and verification

| Command                                                             | Purpose                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`                                                          | Start the development server                                                  |
| `pnpm check`                                                        | TypeScript verification                                                       |
| `pnpm test`                                                         | Vitest; database-backed cases need an isolated test database                  |
| `pnpm build`                                                        | Build public SEO pages, workspace frontend, server and templates              |
| `pnpm start`                                                        | Run the production bundle                                                     |
| `pnpm db:migrate`                                                   | Apply checked-in migrations                                                   |
| `pnpm db:push`                                                      | Generate and apply migrations during schema development; review generated SQL |
| `node scripts/check-bundle.mjs`                                     | Check frontend bundle budgets after building                                  |
| `NODE_ENV=test pnpm exec tsx scripts/verify-document-generation.ts` | Generate synthetic PDF/DOCX fixtures                                          |

Tests do not load developer `.env`. If `DATABASE_URL` is supplied, it must point to loopback and its database name must end in `_test`. Create a disposable database first; never use a research database. For example, with a locally provisioned test-only account:

```bash
DATABASE_URL='mysql://irb_test:test_only_password@127.0.0.1:3306/irb_ci_test' pnpm db:migrate
DATABASE_URL='mysql://irb_test:test_only_password@127.0.0.1:3306/irb_ci_test' pnpm test
pnpm check
pnpm build
node scripts/check-bundle.mjs
```

These commands are the verification procedure, not a claim that a particular commit or live deployment passed. Current evidence and pending release checks belong in [production readiness](docs/production-readiness.md). The CI workflow includes isolated migration, dependency audit, typecheck, tests, build, browser and bounded load checks. Historical scripts such as `e2e:roles` are development tools; use the current CI readiness workflow for release acceptance.

## Security and deployment

Version 2.4 activates private Supabase storage and adds free, privately operated ClamAV workers with bounded failover, durable upload accounting and deletion work, and tighter chat/model limits. It also improves bilingual support, static public notices, and initial loading. See the [2.4 release record](docs/release-2.4-readiness.md), [private storage checks](docs/supabase-storage-activation.md), [free scanner deployment](docs/scanner-deployment.md), and [operator facts required for launch](docs/public-launch-operator-facts.md). Earlier infrastructure records are historical; configuration files alone do not prove live operation.

Production controls include revocable signed sessions, shared database-backed request/AI accounting, staff MFA, origin checks, bounded expensive operations, private downloads, upload scanning, strict model output validation, and privacy-filtered external notifications. These controls require correctly configured infrastructure and operating procedures; prompt defenses are not complete data-loss prevention.

Start with [DEPLOY.md](DEPLOY.md) for institutional and infrastructure prerequisites, [PUBLIC_DEPLOY.md](PUBLIC_DEPLOY.md) for the checked-in Render/Vercel topology, and [the operations runbook](docs/operations-runbook.md) for incidents, backup restoration and release checks. [SECURITY.md](SECURITY.md) describes reporting and security boundaries. `.env.example` contains safe configuration placeholders.

The checked-in Render blueprint is a free Frankfurt service with automatic deployment disabled. It is a synthetic pilot topology, not evidence of Saudi data residency, production capacity, backup durability or live availability. A split frontend/API deployment routes API traffic through both providers, which must be included in the data-flow assessment.

## Source map

| Directory/file                                  | Responsibility                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `client/src/`                                   | Applicant/staff interface, bilingual content and public pages    |
| `server/routers.ts`, `server/db.ts`             | Authorization, application transitions and persistent records    |
| `server/_core/`                                 | Authentication, abuse controls, transport, readiness and exports |
| `server/aiReview.ts`, `server/aiSwarmReview.ts` | Advisory AI evaluations                                          |
| `server/services/`                              | Chat drafting, advisory pipeline, upload scanning and backups    |
| `server/certificateV2.ts`, `server/templates/`  | Decision records and templates                                   |
| `server/literature/`                            | Bounded external evidence discovery with source status           |
| `server/emailService.ts`                        | In-app notifications; no SMTP email transport is implemented     |
| `drizzle/`, `shared/`                           | Schema/migrations and shared contracts                           |
| `docs/`                                         | Audit evidence, operational requirements and launch preparation  |

Package metadata declares the MIT license. Confirm distribution and third-party asset rights as part of release management.
