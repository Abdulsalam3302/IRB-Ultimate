# Release 2.5.0 — reliable applications and durable communications

This release addresses the reported Stage 2 false missing-field recommendations, unavailable AI displayed as a failed assessment, slow saves, and submission delays. It also adds durable background screening, native password recovery, and an administrator email workspace. The implementation brief is in [release-2.5-implementation-brief.md](release-2.5-implementation-brief.md).

## Applicant behavior

- Draft saving works independently of AI. A serialized, debounced save queue preserves edits made during requests; review, documents, navigation, and browser-agent submission flush the same queue.
- Valid short responses are accepted as present. Required information uses readable English and Arabic labels. AI service failures have no numeric score and do not erase a previous completed assessment.
- Review output must contain valid field scores and a consistent overall result. Contradictory provider output is retried within a bounded window or reported as unavailable. Scores are advisory and are not raised to manufacture a pass.
- Unchanged completed reviews can be reused for 24 hours using the exact content, rubric, and model fingerprint. Every actual model attempt remains subject to the user's allowance and global concurrency limits.
- Submission records one immutable version and one durable screening job atomically. Concurrent retries return the same submission outcome. AI evaluation and notifications run after the immediate receipt.
- Browser agents have strictly validated tools for the signed-in applicant's own content and readiness. The visible editor and agent share saving and submission locks. Official decision authority is not exposed through browser tools.
- Large English and Arabic protocols retain their full submission snapshot. Account erasure prevents an already-started request from creating a new submission.

## Background screening and communications

Screening uses leased jobs, immutable snapshots, bounded attempts, crash recovery, and readable progress. Missing information, red flags, unavailable evaluation, or uncertain results are escalated. A clean advisory result still requires the responsible committee's authorized decision; this release does not enable AI-only IRB certificates.

The email workspace provides a recipient directory, bounded campaign previews, explicit owner confirmation, and delivery history. Individual welcome, recovery, submission, and recorded-decision messages use a branded bilingual template. Decision attachments must match the genuine recorded approval, rejection, or retraction.

The outbox encrypts addresses, message content, recovery links, and attachments. It supports Resend HTTPS and a configurable SMTP alternative, idempotency, suppression, signed Resend callbacks, and distinct queued, accepted, delivered, failed, and unknown states. Switching providers does not silently replay uncertain messages. Native password recovery uses single-use, expiring tokens and revokes earlier sessions on success.

Email remains disabled in production until the sender domain, transport, encryption key, and signed callback are configured and actual inbox delivery is verified. Password recovery accurately reports this availability. See [email-domain-activation.md](email-domain-activation.md).

## Verification and operational boundaries

The release checks include real SQL concurrency, token redemption and session invalidation, screening recovery, mail delivery state handling, authorization, and account erasure; TypeScript; dependency auditing; production builds; browser flows in both languages; and HTTP/load checks against an isolated production-mode server. Exact revision CI and deployment receipts are the release authority.

The final local run passed 898 tests across 78 files, 148 applicant browser checks, 22 email-administration browser checks, and 32 production-mode HTTP/browser readiness checks. TypeScript, the production build, bundle budgets, and the dependency audit passed. The compressed application entry was 23,337 bytes; vendor bundles are measured separately. Browser fixtures use synthetic intercepted API responses; integration tests use an isolated SQL database.

On 2026-09-15, a real configured AI provider processed a synthetic Stage 2 protocol in 18.948 seconds with one model attempt. It returned a validated score of 86, all 12 field assessments, and no missing-field issues. The short sample-size response `50` was recognized. This is one observed provider test, not a latency guarantee or scientific qualification of all studies.

The bounded local HTTP load test made 510 synthetic requests. Public/readiness requests returned successfully, and the expensive public API returned HTTP 429 after its allowance. It produced no server errors. These local results do not establish production capacity at any advertised user count.

Before migration, a fresh read-only production snapshot was encrypted and restored into a disposable local database. All restored table content hashes matched the source snapshot. The encrypted archive and recovery key are stored privately and are excluded from this repository.

Migrations 0022–0025 add email delivery tables, password-recovery/session state, screening jobs, and a larger submission snapshot column. Production startup applies these migrations before serving readiness traffic.

## Domain, email, and official launch

`irb-sa.org` is attached to the existing Vercel project. Domain ownership is verified there, but public DNS still points to Squarespace. The working Vercel hostname remains the configured canonical origin until DNS, HTTPS, authentication origins, and redirects are verified together.

The proposed committee address is `committee@irb-sa.org`. The free receiving/forwarding and outbound provider plan is documented, but the receiving Gmail account and required provider/domain sign-in are still pending. No live welcome, reset, decision, or bulk campaign is claimed delivered by this release.

Official certificate issuance remains disabled pending responsible committee activation. The owner must complete the controller/contact details, domain, terms, pricing/support arrangements, data-governance decisions, and qualified bioethics pilot before confidential research intake or paid acquisition. Engineering verification does not confer governmental accreditation or global regulatory validity.
