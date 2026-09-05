# IRB 2.4.0 release readiness

Prepared 5 September 2026. This release activates the free private-file infrastructure and closes account, chat, and upload lifecycle gaps. Final deployment acceptance is recorded separately against the exact commit; source tests do not establish live operation.

## Public offer and authority

The public website remains an English/Arabic evaluation deployment for synthetic data. Official IRB issuance remains disabled and human committee authority, assignment checks and staff MFA remain enforced. A 2027 expansion date does not confer international recognition. The operator must finish the [public offer and institutional acceptance facts](public-launch-operator-facts.md) before real research intake and paid acquisition.

## Infrastructure

The new Supabase tenant `yimtuqerflrqminsujfn` is active in Sydney. Its `irb-private` bucket is private, limits objects to 15 MiB and permitted types, and has no anonymous or authenticated client storage grants. Server-only credentials remain in deployment secrets; the browser receives only the publishable key. The primary application database remains MySQL/TiDB. The supplied old-project storage ZIP is empty and restored no data.

Two free ClamAV 1.5.4 engines and two authenticated outbound WebSocket workers run in isolated Docker networks on the operator's Mac. They expose no host scanner port. The backend checks engine version, signature freshness, content digest, job identity and exact byte count before accepting a clean verdict. Malware is a terminal rejection. Engine unavailability can use the second worker within a bounded deadline; if both are unavailable the upload is rejected before storage. The pair shares the same host, power and connectivity. It covers individual process failures, not a Mac outage. A second independently operated host can use the same free worker configuration later. No paid scanning subscription or public file-analysis service was purchased or enabled.

Keep Docker and the Mac running for uploads. [Scanner operation, restart and fallback instructions](scanner-deployment.md) document this dependency and free future host alternatives. Render free hosting has limited resources and can restart or suspend idle HTTP services; this deployment does not establish an uptime or high-volume SLA.

## Privacy and abuse controls

- Scan admission occurs before expensive body parsing. Uploads have per-account and process concurrency, size and deadline bounds.
- A transactional quota reserves bytes before provider I/O: 750 MiB total application uploads, 250 MiB and 500 files per account by default. Pending or blocked deletion bytes still count; unknown legacy sizes block admission. Generated certificates, backups and unrelated provider objects require separately measured headroom.
- Failed uploads and draft-account closure create durable deletion jobs bound to the original provider, origin, bucket and exact object. Provider absence must be verified before completion. Ambiguous writes wait 15 minutes to avoid racing a late write. Unknown legacy bindings, versioned S3 and unsupported deletion providers require operator review.
- Supabase account closure queues a separately bound Auth identity deletion and retains a tombstone to reject old-token account recreation. Retained regulatory records remain governed records. Account closure reports pending file and identity deletion separately and clears browser authentication and research caches.
- Chat reserves provider budget before inference, including the second call in enhancement/re-review. Chat storage allows 100 turns per account per UTC day and 1,000 stored messages per application. Atomic user/assistant pair reservations prevent concurrent overshoot. Capacity refusal leaves manual application editing available.
- Owner authority uses an exact authenticated `OWNER_OPEN_ID`; matching an email cannot grant owner privileges. The legacy bulk test-account purge is disabled in production.

See the [storage and identity deletion runbook](storage-deletion-lifecycle.md). Verified provider API absence does not prove expiry from provider backups. Retention and recovery acceptance remain institutional operating decisions.

## Frontend and discovery

Public English and Arabic pages have route-specific search/social metadata. The evaluation notice was removed from the app and generated pages at the operator's request; the former build flag cannot restore it. Human decision authority wording remains accurate. Unverified support response promises were removed. FAQs and WebMCP registration load only when needed; bundle budgets stay enforced. WebMCP keeps its supported-browser feature check and application authorization boundaries.

## Release verification

The release process runs migrations, dependency audit, TypeScript checks, scanner health checks, the complete test suite, production build and bundle budgets, HTTP/browser role tests and bounded local load/rate-limit tests. GitHub Actions deploys only the current commit with passing CI, then verifies the backend commit before deploying the frontend with the same source metadata.

Live acceptance uses dedicated synthetic accounts and exact synthetic object keys. It checks private download authorization, clean scanning, EICAR rejection, primary outage/fallback, total scanner outage rejection, recovery, and durable account/object/identity cleanup. These observations are kept in the dated release evidence, separately from local tests and cloud build receipts. No real study, official approval, mass email, paid campaign or paid scanner transaction is part of this release.

The repaired Vercel deployment token is saved in GitHub Actions. Its recorded rotation date is 4 December 2026, with workflow expiry checks. Do not put tokens, database credentials or signed file URLs in release evidence.
