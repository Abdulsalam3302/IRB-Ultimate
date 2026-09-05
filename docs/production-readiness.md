# Production readiness — 2.2.0

Updated 5 September 2026. Status: **engineering hardening for a controlled pilot; public operational acceptance pending**. This document tracks source controls and required evidence. It does not assert that the current release is deployed, accredited, clinically validated or approved to receive real research data.

## Current configuration baseline

| Area              | Source configuration                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Runtime           | Node 24.x; pnpm 10.34.5; React/Vite + Express/tRPC                                                                             |
| Database          | Drizzle/MySQL-compatible; CI MariaDB 11; verified TLS in production                                                            |
| Hosting blueprint | Render free Frankfurt; optional Vercel frontend/API proxy; automatic deployment disabled                                       |
| Authentication    | Native applicant login and optional identity providers; production staff require signed Supabase `aal2` assurance by default   |
| Decisions         | Qualified human committee, authoritative decision provenance; issuance disabled by default                                     |
| Abuse controls    | Shared database request counters and daily AI budgets; bounded per-process queues and input/output sizes                       |
| Uploads           | Production ClamAV scanning required by default; private durable storage required                                               |
| Documents         | Provenance-gated redacted public decisions; status-aware HTML/PDF/DOCX; explicitly labelled proposal drafts                    |
| Discovery         | Static public pages/metadata, read-only browser WebMCP and authenticated server MCP mutations; private routes noindex/no-store |

The release coordinator also inspected the Render configuration read-only on 5 September 2026. It showed free Frankfurt hosting and an EU-central TiDB database. S3 credentials/bucket, Forge storage, `CLAMAV_HOST`, `OWNER_OPEN_ID` and `SENTRY_DSN` were not configured; Supabase and LLM connection settings were present and the database pool was 5. Secret values were not included in the receipt. Configuration presence does not prove provider availability or entitlements.

**Current infrastructure blockers:** production uploads will correctly reject with unavailable scanning/storage until private durable storage and ClamAV are provisioned. The explicit owner subject and institutional staff MFA setup must be completed. Issuance remains disabled pending institutional authority. These prerequisites must be resolved before real applicants or advertising traffic are invited; turning off the safeguards is not a remedy. The final deployment/build identity and workflow checks still need their own release receipt.

Live follow-up on 5 September confirmed that the existing **IRB Saudi Arabia** Supabase project is `INACTIVE`. Its public authentication-provider discovery failed DNS resolution. Restoration was attempted and rejected because the account's two-active-free-project allowance was exhausted. Institutional OAuth and staff MFA are therefore unavailable on the current deployment. Staff MFA enforcement remains enabled. The operator must resolve project capacity, then restore and verify institutional identity and enrollment; no other project was paused or modified.

Release deployment checks also found an invalid GitHub Actions `VERCEL_TOKEN`. Render deployment passed the verified-commit gate, and the authenticated local Vercel CLI deployed a clean archive of that same verified commit. The owner must replace the GitHub secret to restore unattended frontend deployment; successful manual deployment does not make that workflow green. The actual-host PDF failure was corrected by sharing the Chromium cache between build and runtime and requiring a real PDF startup check before the API starts.

## Evidence register

| Evidence                                            | Current record and scope                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI/chat/document review                             | [AI/document audit](audit-ai-documents.md): strict parsing, bounded editable fields, advisory decisions, document privacy and truthful generation               |
| External integrations review                        | [External services audit](audit-external-services.md): literature, owner push, notifications, maps and independent runtime review                               |
| Synthetic real document generation                  | [Generator receipt](validation/ai-documents/generator-validation.json): local PDF/DOCX artifacts, text/ZIP checks and visual inspection; no real IRB authority  |
| Consolidated tests/typecheck/build/dependency audit | [Engineering receipt](validation/release-2.2.0/engineering-acceptance.json): Node24,330tests/42files,typecheck/build/frozeninstall pass; registry audit0 knownvulnerabilities.                         |
| Browser and bounded load acceptance                 | [HTTP/browser](validation/release-2.2.0/http-browser.json), [load](validation/release-2.2.0/local-load.json), and [browser reports](audit-frontend-gtm.md) pass locally; production topology requires a separate measured run.                                                           |
| Encrypted database/object restoration               | Operational receipt must identify target, backup integrity, recovered records, timing and limitations; synthetic drills alone do not prove production recovery. |
| Git/hosting release                                 | Commit/push/deployment identity and actual-host verification pending consolidated release receipt.                                                              |

The reproducible verification commands are in [README.md](../README.md), CI and [the runbook](operations-runbook.md). Existing audit counts describe their own bounded test groups only.

## Launch gates

| Gate                     | Required evidence before real public use                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Institutional authority  | Verified operating entity, applicable committee registration/authority, named qualified reviewers, conflicts/quorum, decision and appeal procedures                |
| Saudi data handling      | Reviewed lawful processing, sensitive-data controls, all processor/subprocessor locations and cross-border flows; contracts and retention/deletion policy          |
| Staff identity           | Owner subject configured, MFA enrolled, `aal1` denied and verified `aal2` accepted on staff API, file and export paths                                             |
| Durable records          | Private encrypted database/storage, backup scheduling and alerting, object lifecycle/versioning, tested restoration and recovery objectives                        |
| Uploads and egress       | Real scanner integration/signature updates, clean/malicious/unavailable tests, private scanner network and trusted ingress/egress verification                     |
| AI suitability           | Provider contract/residency/spend controls; representative Arabic/English calibration, injection/non-fabrication/bias/uncertainty evaluations and human escalation |
| Capacity and reliability | Measured host-specific latency/error/memory/concurrency under anticipated load, overload behavior, restart persistence and rollback                                |
| Public operation         | Domain/TLS, actual build identity, bilingual onboarding/support/privacy, incident roster, truthful claims/pricing, limited-cohort acceptance                       |

Do not turn on approval issuance until the institution records the activation decision and these applicable gates are closed. The 2027 global roadmap needs new jurisdiction-specific evidence; it is not an automatic extension of Saudi authority.

## Known operational limits

Free Frankfurt hosting is not evidence of Saudi residency, continuous availability or durable disk. The frontend API proxy is part of the confidential data path. Persistent rate/budget accounting survives process restarts, while concurrency queues are per process and overall capacity changes with replica count. Provider call caps are not exact currency budgets; set provider-side financial ceilings.

Prompt-injection defenses and secret redaction are incomplete DLP. Source searches are partial discovery rather than verified full-text evidence. Model panels do not constitute independent reviewers. ClamAV does not prove uploaded documents harmless. Document fallback must remain labelled HTML or unavailable rather than falsely reporting PDF success.

Recovery can restore outdated session/abuse state; rotate signing secrets and review counters during disaster recovery. Legacy decisions without actual human provenance require reassessment. No SMTP mail transport or guaranteed external delivery exists in the code.

Public registry enumeration is disabled by default in production. Set `PUBLIC_REGISTRY_ENABLED=true` only after reviewing the exact publication fields, institutional policy and privacy basis.
