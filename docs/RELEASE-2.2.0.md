# IRB platform 2.2.0 — release acceptance

Date: 5 September 2026. Release posture: **synthetic-data evaluation deployment; real public intake not accepted for launch yet**.

## Delivered engineering changes

- Replaced automatic/fabricated ethical approvals with recorded human committee authority, qualification/appointment evidence, conflict checks, quorum and transactional decisions. AI reports remain advisory. Legacy decisions do not acquire new human provenance automatically.
- Hardened application ownership, active reviewer authorization, staff MFA, session expiry/revocation, upload validation/scanning, private downloads, export routes and public certificate redaction. Public registry enumeration requires explicit operator activation after publication/privacy review.
- Bounded AI calls, persistent daily accounting, request rates, bodies, model output, queues, file scans, password hashing, PDF rendering, database connections and network timeouts. Production accounting outages fail closed. Pilot defaults allow 40 model calls/account/day and 500 globally/day; these are call budgets, not a monetary billing guarantee.
- Corrected chat history/patch authority, prompt-data boundaries, stale draft writes, fabricated research content, unsupported provider responses and ambiguous mutation retries.
- Corrected certificate/PDF/DOCX generation, Arabic output, real title insertion, status/provenance checks and honest fallback behavior. Generated proposals remain labelled drafts.
- Removed obsolete debug collection, client third-party tracking, vulnerable/unused dependencies, unused route-logging patch and unsafe legacy production cleanup/deployment helpers. Production exception logs omit raw SQL, provider bodies and research text.
- Added static public HTML, bilingual metadata/FAQ, canonical and sitemap allowlists, private noindex/no-store, Saudi positioning and campaign assets. 2027 international expansion remains a jurisdiction-specific roadmap.
- Added explicit pipeline gates, Node24 runtime, non-root container configuration, readiness checks, failure-reporting scheduled monitoring and operational recovery documentation.

## Verification

Final integration results and deployment identifiers are recorded in `docs/validation/release-2.2.0/` and the hosting receipt added after release. Verification layers are separate:

- The full automated suite, typecheck, frozen lockfile install, production build and dependency audit exercise local engineering behavior.
- HTTP/browser tests use synthetic accounts and records on a disposable loopback MySQL database. They verify cross-account denials, private downloads, CSRF, rate limits, logout replay, public/mobile UI and API-outage handling.
- The load receipt contains 510 synthetic read-only requests on one local instance. It is not a production throughput/SLA claim or a representative clinical workload test.
- Document-generation receipts cover actual Chromium PDFs, DOCX ZIP integrity, extracted text and inspected English/Arabic pages with synthetic data.
- The follow-up [public-resource receipt](validation/release-2.2.0/public-resource-templates.json) covers all five downloadable resources in English and Arabic: 10 PDFs, 10 DOCX files and 22 PDF pages. It corrects footer-only pages, duplicated writing rules, real-looking sample identities and unsupported universal compliance/retention/reporting claims; participant-rights contacts now appear in the actual consent worksheet. Desktop Word pagination remains a separate acceptance check.
- Backup/restore receipts cover an isolated encrypted database drill and negative integrity checks. They do not prove production backup scheduling, object-storage recovery or a contractual RPO/RTO.
- Browser WebMCP remains an experimental browser capability. Server MCP has a separately documented authenticated transport and protocol support; neither assertion grants agents independent ethical authority.

## Public launch blockers observed

The current service is free Render hosting in Frankfurt with an EU-central TiDB database. Private S3/Forge storage, a ClamAV host, an explicit owner subject and Sentry were absent during the configuration inspection. The release deliberately keeps issuance disabled and scanner/MFA controls enabled. A bilingual synthetic-data-only banner is enabled on the evaluation deployment.

Before advertising to real researchers, complete the operator/controller identity and actual privacy/support contacts; the responsible institution/committee and qualified staff appointments; reviewed hosting and all provider data flows; durable private storage and a monitored malware scanner; institutional owner/MFA onboarding; provider contracts and spend limits; production restoration and capacity checks; and a complete authorized pilot with the bioethics lead. Domain purchase then enables final DNS/TLS/canonical/search verification and approved pricing/terms.

No paid campaign, accreditation claim, institutional approval, real research decision or production restore was performed by this release. See [production readiness](production-readiness.md), [operations runbook](operations-runbook.md), [security](../SECURITY.md), and [GTM assets](../MARKETING.md).
