# Security policy — 2.3.0

IRB Ultimate is under active hardening for a controlled pilot. This policy describes the current source and operating requirements; it is not a penetration-test certificate, regulatory approval, service-level commitment, or proof of live configuration.

## Report privately

Do not put vulnerabilities, credentials, protocol data, participant information, or exploit dumps into public issues. Use GitHub private vulnerability reporting for this repository if enabled; otherwise contact the repository maintainer through a previously verified private channel and request a secure submission method. The operating institution must publish a monitored security contact and incident escalation roster before inviting public users.

Provide the affected version, route/role, expected and observed behavior, a minimal synthetic reproduction and potential impact. Avoid accessing another person's records, changing real decisions, sending bulk traffic or testing third-party providers without permission. Coordinated disclosure timing should be agreed privately; no response-time guarantee is established by this document.

## Supported security baseline

The active baseline is version 2.3.0 on Node 24 with its checked-in lockfile. Older deployments and legacy approved rows require review. A `main` branch name alone does not prove that a host runs the latest release.

| Boundary                 | Implemented control and practical limit                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final research decisions | Human committee and explicit provenance; approval issuance disabled unless `IRB_ISSUANCE_ENABLED=true`. Configuration does not establish legal authority.                                                                             |
| Identity                 | Signed sessions with issuer/audience/expiry and database-backed revocation. Production verification fails closed on unavailable session storage.                                                                                      |
| Staff access             | Supabase-verified `aal2` session assurance required by default in production, including private cross-record exports. Native password login alone cannot satisfy this control.                                                        |
| Owner authority          | Prefer exact `OWNER_OPEN_ID` from the verified identity provider; Supabase subjects use `sb:<subject>`. An unverified email is not sufficient evidence.                                                                               |
| Abuse and cost           | Atomic shared request/AI counters, account/global ceilings, bounded queues and response sizes. Production accounting failure denies requests rather than silently bypassing limits. Provider-side spending ceilings remain necessary. |
| Uploads                  | Type/size checks and bounded ClamAV scanning before persistence. Production scan failures or missing scanner fail closed by default. Malware scanning cannot prove document safety.                                                   |
| Documents                | Private authorization and no-store responses; public decision copies are regenerated/redacted and provenance-gated. AI drafts are labelled and missing facts are preserved.                                                           |
| Model tools              | Allowlisted draft fields, strict parsing, server-owned history, injection defenses, bounded data exposure and explicit unavailable states. These are not comprehensive DLP or medical validation.                                     |
| Egress                   | HTTPS/SSRF checks and bounds on reviewed integrations; configure host/network restrictions. DNS checks alone do not pin destination connections.                                                                                      |
| Notifications            | Sensitive details stay in authenticated in-app notifications. Optional external owner pushes are generic. No SMTP delivery service is implemented.                                                                                    |

## Required production configuration

- Keep `IRB_ISSUANCE_ENABLED=false` until the institution has documented authority, assigned qualified reviewers and approved decision procedures. Do not populate human decision provenance for legacy automated records without actual reassessment.
- Set `NODE_ENV=production`, a randomly generated `JWT_SECRET`, `VITE_APP_ID`, a verified-TLS database and exact public origins. Keep developer/pilot login disabled. Set `STAFF_MFA_REQUIRED=true` and enroll staff through institutional Supabase MFA.
- Set `UPLOAD_SCAN_REQUIRED=true` and provision a reachable, private, maintained ClamAV service with current signatures. Never expose unauthenticated clamd to the internet. Scanner bypass settings belong only in isolated synthetic tests.
- Provision private encrypted object storage, block public bucket access, restrict credentials, configure retention/versioning and test unauthorized downloads. Do not use ephemeral local uploads as a production record store.
- Protect database audit, human decision, request-limit, AI usage and session-revocation records. Back them up and test restoration; recovery to an older snapshot can revive previously revoked sessions, so rotate the session secret during disaster recovery.
- Review every processor, jurisdiction, retention policy and cross-border flow, including frontend API proxies, authentication, LLMs, observability, backups and external evidence queries. A hosting region or a disclaimer is not a lawful-processing assessment.
- Configure `TRUST_PROXY_HOPS` to the actual ingress path, block bypass routes, apply edge traffic controls, and restrict `ALLOWED_EGRESS_HOSTS`. Do not send secrets or participant identifiers into chat.

Use [the deployment guide](DEPLOY.md), [the runbook](docs/operations-runbook.md), [the AI/document audit](docs/audit-ai-documents.md), and [the external service audit](docs/audit-external-services.md) for evidence and remaining limits. Independent security testing, incident drills, scientific calibration and institutional review remain launch requirements.
