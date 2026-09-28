# Release 2.6.0 — resilient operations, confidential screening and a 24-hour review standard

## Why

Production readiness had failed since 24 September 2026. The TiDB Cloud free cluster reached its monthly usage quota, which makes the provider refuse new connections until the quota resets or the spending limit is raised. Startup migrations then failed, the redacted log said only `Error`, the process crash-looped, and the readiness monitor timed out on every run. Separately, Render's build image made the global npm prefix read-only (every deploy failed with `EROFS`) and the deploy workflow's Render API key was rejected (HTTP 401).

## Operations and reliability

- **Diagnosable failures:** production logs keep fixed driver codes only (`code`, `errno`, `sqlState`, plus hints such as `database_quota_exhausted`), never provider text, SQL or data.
- **Maintenance mode instead of crash loops:** when the database is unreachable the API stays up, `/api/health` stays live, `/api/ready` reports `database_unavailable` without touching the database, other API/upload calls get a bilingual retryable 503, and migrations retry with backoff. Workers start after recovery. SQL/schema migration failures still stop the release.
- **Much lower idle database load:** readiness is cached (30 s; full schema check at most every 10 min); screening, email and storage-deletion workers back off when idle and wake instantly on new submissions or mail. Estimated idle request volume drops by roughly 25×, protecting the free quota.
- **Render build fixed:** `scripts/render-build.sh` runs the pinned pnpm through `npx`; the Render health check is liveness (`/api/health`).
- **Safer deploys:** the deploy workflow waits for `/api/ready` after the backend goes live and stops before the frontend if the database or schema is not ready (manual override for maintenance deploys).
- **Monitoring:** the readiness monitor records health and readiness for the backend and public proxy in the job summary and keeps one GitHub issue open while production is not ready (closed automatically on recovery). The deploy workflow names a rejected Render key explicitly.
- **Observability:** the owner dashboard adds review operations — awaiting decision, past 24 hours, share decided within 24 hours, average hours to decision, screening and email queue states.
- A friendly bilingual maintenance banner appears in the app only for the server's maintenance responses (`X-Service-State: maintenance`) and disappears on the next successful request. API policy checks (maintenance gate, rate limits) now normalize the case-insensitive `/api` prefix.

## Confidential screening and human escalation

- Every submission is screened automatically at submission time (AI Stage 1/2 reviews plus deterministic attention checks for vulnerable groups without safeguards, unresolved placeholders, and clinical trials without registration/SFDA pathway).
- Applicants see progress only ("received", "with the review committee"); scores, findings, attention flags and outcomes stay in the reviewer/administrator workspace, and pre-submission quality tips are no longer returned once an application is submitted. Applicants still see their own optional pre-submission AI self-check, which they requested. The general disclosure that automated screening supports human reviewers remains in notices and the privacy policy.
- Any AI concern, unavailable assessment or attention flag routes the submission to human attention, and administrators receive a one-time escalation notice per submission version.

## 24-hour first-review service standard

- Reviewer assignments carry a 24-hour window. Every 30 minutes a self-healing sweep tops every awaiting application back up to its required reviewers (five for full board, otherwise one), counting votes already cast; it prefers the least-loaded independent reviewer, never the applicant, and runs under the application row lock so concurrent sweeps cannot double-assign. Reviewers are reminded six hours before their window ends, newly assigned reviewers get an in-app notice and email, and administrators (other than the applicant) are alerted when an application — including a resubmission — waits more than 24 hours for a decision.
- Public copy states a *target* for complete applications, never a guarantee; results are measured in Observability.

## Applicant guidance

- Instant, bilingual pre-submission quality checks (no AI cost) on the submit page: primary objective, design and analysis, justified sample size, eligibility, consent (or justified waiver), vulnerable-group safeguards, PDPL data protection, risk mitigation, conflicts of interest, trial registration, timeline and funding, and unresolved placeholders. Tips never block submission.
- The chat assistant now coaches applicants through the same elements in a warm, one-question-at-a-time style, offering clearly labelled example wording without recording example facts.
- Stage 2 review prompt references the Saudi Law of Ethics of Research on Living Creatures and its Implementing Regulations (NCBE), PDPL, SFDA/trial registration, Declaration of Helsinki 2024, ICH E6(R3) and CIOMS 2016; prompt typos fixed.

## Official domain, SEO, GEO and AEO

- `irb-sa.org` is the canonical host; `www` redirects permanently; the Vercel alias is `noindex`.
- New answer-first public guides: how to get IRB approval in Saudi Arabia, an application checklist, and exempt vs expedited vs full board review. Home, FAQ and hero copy updated (Arabic and English).
- Structured data graph (Organization, WebSite, WebPage/Article, BreadcrumbList, Service, FAQPage), large social cards, web manifest, sitemap `lastmod`, AI-crawler-friendly robots, generated `llms.txt` and `llms-full.txt`. See MARKETING.md for the off-site backlink plan.

## Maintenance

- Semver-compatible dependency updates (React 19.3, tRPC 11.19, Zod 4.6, AWS SDK, Supabase, mysql2, drizzle and others); `pnpm audit` clean.
- GitHub Actions moved to Node 24 majors (`checkout@v6`, `setup-node@v6`, `pnpm/action-setup@v6`, `upload-artifact@v6`) and pinned `ubuntu-24.04` ahead of the Ubuntu 26 label change.
- Removed retired Railway workflows/config and stale templates; unified the product name as IRB Saudi Arabia.

## Operator actions

1. Restore the database now by raising the TiDB Cloud spending limit, or wait for the monthly reset on 1 October; the service recovers automatically.
2. Create a new Render API key and update the `RENDER_API_KEY` repository secret so automatic deploys resume.
3. Verify `irb-sa.org` in Google Search Console and Bing Webmaster Tools and submit the sitemap.
4. Domain cut-over checks: Render `PUBLIC_APP_URL` (or `ALLOWED_ORIGINS`) must include `https://irb-sa.org`, otherwise form submissions from the new domain get "origin not allowed"; Supabase Auth site URL and redirect URLs must include `https://irb-sa.org`; keep Vercel's domain settings free of an apex→www redirect (the app redirects www→apex).
5. Deploys now wait for `/api/ready` after Render reports live. While the database is intentionally unavailable, run the Deploy workflow manually with **allow_unready** to ship the frontend anyway.
