# 2.6.1 maintenance and activation record

Maintenance date: **2026-10-18, Asia/Riyadh**. This record distinguishes source verification from live service verification. GitHub CI and the deployment workflow retain the exact source revision and host deployment result.

## Changes

- Refreshed compatible application and development dependencies, preserving Node 24 and the existing application architecture. Resolved the two dependency advisories identified by the initial audit, including the typography selector-parser dependency. The final audit reported zero known vulnerabilities. This is a point-in-time package audit, not a guarantee that no vulnerability exists.
- Matched upload admission, request-size classification and rate policy to the actual Express/tRPC adapter behavior, including case-insensitive API mount prefixes, nested final-segment lookup and batches. Equivalent executable upload paths now receive the same authentication, concurrency and request deadline controls before body parsing. Procedure authorization remains required.
- Isolated optional WebMCP module failures so an unavailable browser-tool module cannot take down sign-in or the applicant workspace. Route module failures offer explicit manual recovery; there is no automatic reload that discards an unsaved form.
- Reduced rich public metadata loading in private workspaces while retaining build-time public search metadata and immediate private-route noindex behavior. Public navigation and language changes cancel obsolete metadata work.
- Fixed deployment tracking to follow the actual new Render deployment rather than an older live deployment of the same source revision. Release verification requires both HTTP 200 readiness and the exact CI-approved runtime revision.
- Fixed monitoring so missing endpoint configuration and error HTTP statuses cannot produce a false healthy result.
- Extended the existing edge account-route privacy headers to `/forgot-password` and `/reset-password` after live acceptance identified those two omissions. Both routes now have explicit private/no-store and noindex/nofollow rules, covered by focused deployment-configuration regression checks. Confirm the follow-up deployment before relying on these headers at the edge.
- Removed deprecated logout cookie options while preserving the session cookie's scope and server-side revocation behavior.
- Added an owner-only scanner status card using the broker's existing in-memory counts. An unavailable scanner is distinct from a saturated scanner or an unknown local-daemon status; this is not historical outage monitoring.
- Corrected backup documentation to the maintained encrypted/checksummed utilities and exact isolated-restore confirmation. No production backup schedule or restore drill is claimed by this documentation update.

## Live activation evidence

The domain and email checks were performed on the previously deployed 2.6.0 revision before the maintenance release. They establish working integrations, not deployment of 2.6.1.

- `https://irb-sa.org` served successfully over HTTPS; `www` redirected to the canonical apex. Public and API readiness returned HTTP 200. A fresh native owner sign-in reached the dashboard and owner Email page.
- Squarespace showed the domain **Active**, locked, and set to renew on **2027-09-15** through Google Workspace. WHOIS privacy was enabled and persisted after reload. The existing website and mail DNS records were preserved.
- The website's native password-reset request produced a bilingual Resend message from `committee@irb-sa.org`. Provider delivery, the application's signed delivery callback, and actual owner inbox receipt were each verified. SPF, DKIM and DMARC passed. No password was changed.
- A synthetic Gmail message reached the committee inbox; a committee reply reached the originating inbox with SPF, DKIM and DMARC pass. No real research or participant data was used.
- Updated the existing bilingual Gmail signature's portal and logo links to `irb-sa.org`, saved the change, and verified the persisted links while keeping it the default for new messages and replies. The public PNG logo returned HTTP 200.
- Existing Resend configuration uses a domain-restricted sending key, a verified domain, enforced TLS and an enabled signed webhook. A duplicate key was unnecessary. No new paid service or subscription was purchased. The existing Google Workspace mailbox is not an entirely free service.
- Refreshed the expired local Render CLI session through its normal seven-day authorization flow and verified account access. The separately stored mail-encryption recovery key matched the production value without exposing either value. The local CLI session is distinct from GitHub's unattended deployment key.
- The approved Docker recovery restored both free private scanner engines and outbound broker workers. Clean-file and EICAR fixtures produced the expected results on each engine path. See [scanner recovery evidence](maintenance-scanner-recovery-2026-10-18.md) and [domain/email activation](email-domain-activation.md).

## Verification and release evidence

Final local checks on the combined source used Node **24.22.0** and a newly created isolated loopback MySQL database with outbound provider credentials cleared:

| Check | Result |
| --- | --- |
| Full unit/integration suite | **978 passed**, 87 files, no failures or skips |
| TypeScript and production build | Passed |
| HTTP/browser readiness | **32 passed** |
| Logout cookie expiration/security flags and revoked-session replay | **9 passed** |
| Authentication browser checks | **78 passed** |
| Applicant browser checks | **156 passed** |
| PDF runtime | Real Chromium rendered an 18,156-byte PDF |
| Scanner readiness/policy guard suite | **10 passed** |
| Entry/vendor size budgets | 79,042 / 942,670 bytes, both within unchanged limits |
| Bounded local load | 510 requests, no HTTP 5xx or network failures; 36 expected expensive-route HTTP 429 responses |

The synthetic database, server and upload fixtures were removed after verification. The seven optional-module/metadata fault and race cases also have a dedicated browser script that now runs in CI after its production build.

Use the [CI run](https://github.com/Abdulsalam3302/IRB-Ultimate/actions/workflows/ci.yml) associated with this revision for the final complete test count, dependency audit, typecheck, scanner-health guards, production build, bundle budget, isolated database migrations, browser journeys, PDF runtime, readiness and bounded-load checks. Local browser and load results are loopback measurements and do not establish public traffic capacity or a service-level guarantee.

The [deployment workflow](https://github.com/Abdulsalam3302/IRB-Ultimate/actions/workflows/deploy.yml) is intentionally gated on successful CI for the current `main` revision. It deploys that revision to Render, verifies its runtime identity and database/schema readiness, and then deploys the frontend to Vercel. Confirm the workflow result and `/api/health` revision before describing this source release as deployed. No maintenance override is needed for a healthy database.

## Completed deployment and private-storage restoration

The application change in commit `18add2f110a8cd927ba2fca34a2699ab895b0834` completed [CI 39079342461](https://github.com/Abdulsalam3302/IRB-Ultimate/actions/runs/39079342461) and the [automatic deployment 39079667134](https://github.com/Abdulsalam3302/IRB-Ultimate/actions/runs/39079667134). Render deployment `dep-dba0cv6q1p3s739rg98g` became live and Vercel production deployment `dpl_B23hQXhsMBe1Ckmpycsw5vHSB56o` became Ready with that exact source revision and the canonical domain aliases. Runtime health and database readiness both returned HTTP 200 with version 2.6.1 and the verified source SHA. The unattended Vercel credential successfully performed the deployment. A follow-up receipt and password-recovery cache-header correction uses the same normal CI/deployment gates; its run is discoverable from this file's Git history.

After owner sign-in, the original Supabase project was resumed and returned to **Healthy**. No replacement project, bucket, account mapping, server key, or paid tier was needed. Its region remains Sydney (`ap-southeast-2`). The [provider receipt](release-evidence/2026-10-18/supabase-storage-activation.json) records all checks passing over 27 bounded HTTP requests: private 15 MiB bucket and exact MIME policy, valid publishable key, clean server write, refused duplicate, byte-identical signed download, expired-link refusal, and direct/public/list/upload/sign denial for anonymous, publishable and validated ordinary authenticated actors. All attempted objects and the dedicated synthetic Auth identity were removed and absence verified.

A separate [current policy inspection](release-evidence/2026-10-18/supabase-policy-inspection.json) through the linked CLI found **no storage policies** on `storage.objects` or `storage.buckets`, with RLS enabled on both. This complements the random-prefix behavior probe; no RLS or bucket access policy was changed.

The [deployed native upload receipt](release-evidence/2026-10-18/native-private-upload.json) uses two disposable non-owner identities and no application record. A clean 68-byte text file returned a clean ClamAV verdict, was stored privately, and downloaded with the expected bytes and SHA-256. Anonymous access returned 401; the other applicant received 403. The harmless EICAR antivirus fixture was rejected before storage. Both native identities were erased through their own account-erasure endpoint and their old sessions then received 401. The exact `account_erasure` storage job completed in one attempt, file metadata was absent, and a privileged provider listing returned HTTP 200 with the dedicated synthetic user's prefix empty. Cancelled upload-reservation rows are distinct from the completed erasure job.

Both new-account welcome messages reached the owner-controlled test inbox from `committee@irb-sa.org`; the observed Gmail authentication results passed SPF, DKIM and DMARC. This supplements the password-reset and mailbox roundtrip evidence above. Decision emails and attachments retain local/unit coverage; no real application outcome was issued to manufacture delivery proof.

Both free scanner workers reconnected to the new Render process and remained ready beyond the broker heartbeat expiry interval. Their current engines and fresh definitions were verified separately from the application malware rejection. Both engines remain private with no published host port. The [authenticated owner readback](release-evidence/2026-10-18/owner-operational-status.json) confirmed required scanning with two connected, two available and zero active workers. Normal owner sign-in succeeded without requiring a two-factor session. The bounded AI connectivity probe returned the expected `OK`, then its native session was logged out. A connection probe does not establish scientific or ethical review accuracy.

## Remaining operating dependencies

- Supabase restoration and the native upload workflow are now verified as described above. The free project can pause and provider quotas can interrupt service. Keep the owner account accessible and investigate storage failures without bypassing private-storage or scanning requirements. Restoration does not establish an independent object backup or an approved data-residency arrangement.
- Both free scanner instances share this Mac's power, disk, awake state, network and Docker engine. Their container-level fallback does not provide host-outage redundancy. Keep this host available or explicitly provision another trusted host under the institution's data-processing arrangements.
- Free hosting and provider quotas can impose cold starts, concurrency and usage limits. The Vercel deployment credential has a recorded rotation date of **2026-12-04**; existing CI checks warn before expiry. Domain renewal, mailbox billing, provider account recovery and secret rotation remain operator responsibilities.
- The authoritative deployed repository is `Abdulsalam3302/IRB-Ultimate`. The older `irb-platform` remote has diverged and is not the Render service source; it was not force-overwritten or silently merged.
- Successful engineering checks do not confer institutional IRB authority, authorize real research decisions, guarantee future regulatory acceptance, or replace the institution's privacy, bioethics and incident-response responsibilities. Official decisions retain the existing qualified human committee controls.

No real application was submitted, decided, rejected or retracted during this maintenance. Production data was not used as the automated test database.
