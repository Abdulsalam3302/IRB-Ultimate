# Operations runbook

Use this runbook with the environment's authorized operator, privacy lead and committee lead. Store credentials in a secret manager, keep research data out of tickets/logs, and record actions with time, environment and source/build identity. The procedures below are acceptance criteria, not evidence that they have already run on production.

## Release acceptance

1. Record the source SHA, Node 24/pnpm version, migration journal, build identity, public origin and hosting regions. Apply tested checked-in migrations with `pnpm db:migrate`; production also applies them at startup. Confirm `/api/health` and `/api/ready` on both the API host and the public proxy.
2. Use separate synthetic applicant, assigned reviewer, unrelated reviewer, admin and owner identities. Verify private access denials, owner-only functions, role-specific permissions and no confidential data in public registry/verification. Production staff `aal1` must fail; institutional MFA `aal2` must succeed, including downloads and exports.
3. Upload a clean synthetic file, a supported scanner test fixture in isolated staging, an oversized/wrong-type file and a file while the scanner is unavailable. Verify rejected/scanner-failed uploads do not become attached persisted documents. Check cancellation and unauthorized private-file reads.
4. Exercise AI unavailable, malformed output, attempted status injection, locked application chat edits and missing information. Confirm advisory results, visible failure, bounded calls and no fabricated approvals or citations. Run final decisions only under the institution's authorized test process; keep pilot issuance disabled otherwise.
5. Generate bilingual resources, draft proposals and eligible synthetic decision records. Check long text, Arabic direction, QR, PDF/DOCX content, actual MIME type and public redaction. Reject false-success HTML-as-PDF behavior. Verify browser/font dependencies inside the deployment image.
6. Restart a replica and verify logout revocation, daily AI usage and request limits persist. Test a bounded burst in staging and measure latency, failures, memory, database pool/queue and scanner/PDF capacity. Test actual ingress `TRUST_PROXY_HOPS` and prevent clients from spoofing the trusted forwarding chain.
7. Verify current encrypted backup recovery into an isolated target, then record acceptance or outstanding failures. Publish a release only with its own receipt; local test counts cannot substitute for host verification.

Current automated entry points include `pnpm check`, `pnpm test`, `pnpm build`, `node scripts/check-bundle.mjs`, `node scripts/e2e-readiness.mjs`, and `node scripts/load-readiness.mjs`. E2E/load scripts operate against a running isolated server; follow `.github/workflows/ci.yml` for their environment. Never redirect load or destructive test scripts at production without a separately scoped operational test.

## Health and monitoring

`GET /api/health` reports process liveness and build/version metadata. `GET /api/ready` checks database access and required security schema. Alert on repeated readiness failure, elevated 5xx/429, pool saturation, storage errors, scan failures/stale signatures, PDF timeouts, AI provider/quota failures and backup failure. Monitor host memory, restarts and storage capacity externally.

### Database outage triage

When the database cannot be reached at boot (network, TLS, credentials, connection limits or a managed-provider quota), the API stays up in maintenance mode: `/api/health` returns 200, `/api/ready` returns 503 with `state: "database_unavailable"`, other `/api/*` and `/uploads/*` requests get a bilingual 503 with `Retry-After`, and migrations retry with backoff (15 s → 5 min). Background workers start only after recovery. SQL/schema failures during migration still stop the process.

Logs carry a fixed driver code and never provider text, for example `[migrate] Failed: Error code=ECONNREFUSED`, `code=ER_ACCESS_DENIED_ERROR errno=1045 sqlState=28000`, or `errno=1105 sqlState=HY000 hint=database_quota_exhausted`.

| Log signal | Likely cause | Operator action |
|---|---|---|
| `hint=database_quota_exhausted` | TiDB Cloud monthly Request Unit quota spent | Raise the cluster spending limit or wait for the monthly reset; review idle load |
| `ER_ACCESS_DENIED_ERROR` / `28000` | Rotated or wrong `DATABASE_URL` credentials | Update the Render secret and redeploy |
| `ENOTFOUND` / `EAI_AGAIN` | Cluster endpoint changed or deleted | Confirm the cluster exists; update `DATABASE_URL` |
| `ETIMEDOUT` / `ECONNREFUSED` | Provider outage, paused cluster or network allowlist | Check provider status and IP access list |
| `CERT_*` / `UNABLE_TO_*` | TLS chain change | Confirm the provider CA; never disable verification |

The GitHub **Runtime readiness monitor** opens one issue titled "Production readiness failing" while readiness fails and closes it on recovery.

Idle database load is deliberately small: readiness answers are cached for 30 s with a full schema check at most every 10 minutes, and the screening, email and storage-deletion workers back off to 60 s / 60 s / 5 min when idle (submissions and queued mail wake them immediately).

### 24-hour review service standard

Assignments carry a 24-hour window. A self-healing background sweep every 30 minutes tops each awaiting application back up to its required reviewers (five for full board, otherwise one, counting votes already cast) under the application row lock, preferring the least-loaded independent reviewer and renewing a lapsed reviewer only when nobody else is available. It reminds reviewers six hours before their window ends and notifies administrators (never the applicant) once per submission when an application waits more than 24 hours for a human decision. Administrators can also run **Expire & reassign** manually. Track results under Observability → Review operations. The target is published as a target, not a guarantee.

The owner observability interface is restricted; staff MFA applies. Optional error reporting must be privacy-filtered and covered by a processor agreement. In-app notifications are not external email delivery. Assign a monitored on-call/security channel and committee escalation owner outside the application.

Do not log passwords, JWTs, signed download URLs, API keys, raw prompts, attachments or participant information. Diagnose failures using event categories, timestamps and authorized record references.

## Backups and restore drills

Protect the complete database, including application versions, audit records, committee decisions, human provenance, session revocations, request limits and daily AI budgets. Protect private uploads/certificates separately. Local certificate snapshots are convenience copies; they are not a full database/disaster-recovery backup. Remote lifecycle retention is configured by the operator.

`scripts/backup.sh` and `scripts/restore.sh` are the maintained utilities; consult their current headers and [BACKUP.md](../BACKUP.md) before running. A scheduler must explicitly run backups; the web process does not establish a database backup schedule. Supply `BACKUP_GPG_RECIPIENT` or `BACKUP_PASSPHRASE` (at least 20 characters) and restricted backup destination credentials via secret injection. Backups require encryption by default. The current `.enc` format is authenticated AES-256-GCM (`IRBBK01`), and a `.sha256` sidecar is required; historical CBC files are not silently accepted as the new format. Remote database backup/restore connections require verified TLS and a readable `BACKUP_DB_SSL_CA` certificate. Retention periods must match the institution's approved policy and legal holds, not an assumed universal IRB term.

For each drill:

1. Select a completed backup, verify its checksum/integrity, decrypt using separately stored recovery material, and record its source time without copying secrets into the receipt.
2. Create an isolated restore database and private object destination with no outbound model/push credentials. Set `DATABASE_URL` explicitly to that target; restore is destructive. After reviewing the target, run `RESTORE_CONFIRM_DB=irb_restore_test bash scripts/restore.sh /path/to/approved-backup.sql.gz.enc` for that isolated example database. `RESTORE_CONFIRM_DB` must exactly match the destination database name; `CONFIRM=yes` is not accepted. The utility validates checksum, authentication and decompression before writing to the database.
3. Verify table/row counts, representative protocol and decision relationships, audit/provenance, attachment availability and access controls. Measure recovery point/time; record any unsupported or unavailable layer.
4. Remove drill data under the institution's retention procedure. For real disaster recovery, rotate `JWT_SECRET` before reopening access because restoring an older revocation table may revive old tokens; reconcile AI/provider spend and rate counters and review lost audit intervals.

Keep a verified pre-migration backup. Roll back application code only when compatible with the current schema. Restore a database only as an explicit incident recovery action; it may discard later research decisions.

## Incident and abuse response

| Event                           | Immediate response and recovery evidence                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI abuse/provider incident      | Set `AI_ENABLED=0`, revoke/rotate exposed provider credentials, preserve sanitized audit/spend evidence, inspect affected cases and re-enable only after review. Set hard provider spending ceilings in addition to call limits. |
| Questionable decision/authority | Set `IRB_ISSUANCE_ENABLED=false`; involve the committee lead. Use the audited retraction/reassessment workflow when authorized, preserving history. Never erase or fabricate provenance.                                         |
| Account/session compromise      | Revoke affected sessions through supported flows; if scope is uncertain rotate `JWT_SECRET` to invalidate all sessions, review staff/provider access and audit trails, and require fresh MFA.                                    |
| Scanner unavailable/malware     | Keep uploads fail-closed, restore the private daemon/signatures, assess any affected objects and rerun clean/malicious/unavailable acceptance. Do not disable scanning to clear a queue of real files.                           |
| Database/storage outage         | Fail closed, preserve the incident timeline, restore connectivity or approved backups, verify decision/audit consistency and authorization before reopening. No fallback to ephemeral public storage.                            |
| Data leak                       | Restrict access, preserve evidence without duplicating sensitive data, contact privacy/security leads, scope recipients/records and apply the institution's applicable notification obligations.                                 |
| Capacity overload               | Limit incoming traffic and expensive work, inspect queue/memory/provider metrics, scale only after measuring, and keep visible retry/unavailable behavior. Avoid repeated paid AI retries.                                       |

## Configuration exceptions

`ALLOW_LOCAL_TEST_DB=1`, `ALLOW_UNENCRYPTED_BACKUP=true`, `UPLOAD_SCAN_REQUIRED=false`, `STAFF_MFA_REQUIRED=false`, developer/pilot login and ephemeral `ALLOW_LOCAL_STORAGE=true` are not public acceptance settings. CI may use specific exceptions with disposable loopback synthetic data; those exceptions must not propagate into hosting secrets.

Reassess the data-flow map and controls whenever adding a provider, changing region/proxy topology, enabling analytics/ads, expanding internationally or altering AI decision behavior. Changes to the institution's legal or bioethics authority require its own approval process.

On Render set `PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.cache/playwright` for both build and runtime. The start command runs `scripts/check-pdf-runtime.mjs` before accepting traffic; it renders a fixed synthetic PDF with network and JavaScript disabled and emits only a diagnostic category on failure. Run the same check after changing Playwright or the host image.
