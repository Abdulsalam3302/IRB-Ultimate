# Activate and verify private Supabase Storage

This runbook describes the IRB platform's private object storage in the new Supabase project. Activation and private-access verification were completed on 5 September 2026; see the [2.4 release record](release-2.4-readiness.md) and its source-bound live receipts. This does not migrate the MySQL application database, provision an ethics committee, enable certificate issuance, or establish regulatory compliance.

Use the project origin `https://yimtuqerflrqminsujfn.supabase.co` only after confirming that the operator has selected that project. Store research documents only after the institution has approved the hosting region, processor contracts, retention rules, and incident procedures. The platform's existing upload malware scanner remains required.

## Provision the bucket and inspect access policies

Create a **private** standard Storage bucket named `irb-private` through the Supabase Dashboard or the official Storage REST bucket API. Set its file size limit to **15,728,640 bytes (15 MiB)** and configure exactly these permitted MIME types:

```json
{
  "id": "irb-private",
  "name": "irb-private",
  "public": false,
  "file_size_limit": 15728640,
  "allowed_mime_types": [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/html"
  ]
}
```

The REST operation is `POST /storage/v1/bucket`; inspection is `GET /storage/v1/bucket/irb-private`. Existing buckets require inspecting their current settings and deliberate correction through the Dashboard/API, rather than treating a duplicate-bucket error as successful provisioning. The activation script only inspects settings; it does not create or modify buckets.

`text/html` supports the explicitly typed printable certificate fallback if Chromium cannot render a PDF. The application adapter accepts it only in certificate namespaces and forces signed downloads as attachments. Applicants cannot upload HTML through the application. MIME/container signature checks do not establish document validity or replace malware scanning.

Do **not** create browser upload, listing, download, signing, update, or deletion policies for this bucket. The platform server uses a secret key only after its own ownership, staff MFA, and workflow checks. A publishable key is not a private-storage credential. Supabase explains the default deny behavior and the distinction between access policies and privileged server access in its [Storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control).

Review all existing `storage.objects` and `storage.buckets` policies, including broad `PUBLIC` or `authenticated` policies that might apply to every bucket. This read-only SQL is suitable for the Dashboard SQL editor:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename IN ('objects', 'buckets')
ORDER BY tablename, policyname;

SELECT c.relname, c.relrowsecurity
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
  AND c.relname IN ('objects', 'buckets');
```

Keep RLS enabled. A dedicated project can have no applicable storage policies for `anon`, `authenticated`, or `PUBLIC`; a shared project must ensure policies for other buckets do not grant access to `irb-private`. Do not directly alter managed Storage metadata or delete object rows with SQL. Object deletion must go through the Storage API so the stored bytes are removed as well. The [March 2026 Storage update](https://supabase.com/changelog/43465-developer-update-march-2026) describes relevant traversal and orphan-object protections.

## Configure the server

Set these environment variables in the backend deployment's secret/configuration manager:

```dotenv
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://yimtuqerflrqminsujfn.supabase.co
SUPABASE_STORAGE_BUCKET=irb-private
SUPABASE_SECRET_KEY=<modern sb_secret_ key stored only in the backend secret manager>
```

Never put the secret in a `VITE_*` variable, frontend bundle, source file, URL, command-line argument, ticket, or receipt. Modern secret keys are sent in the `apikey` header; they are not user JWTs and should not be used as `Authorization: Bearer` credentials. See the [current API-key guide](https://supabase.com/docs/guides/getting-started/api-keys). If `ALLOWED_EGRESS_HOSTS` is configured, include the exact project hostname.

The production adapter checks that the bucket is private on every operation, refuses overwrites, uses 60–300 second signed attachment URLs, limits objects to 15 MiB, and bounds concurrency and response sizes. A provider failure does not downgrade to ephemeral disk. Selecting a different provider does not copy existing objects; any previous storage migration needs a separate manifest, integrity checks, and validated record references.

The existing MySQL/TiDB database, application IDs, review records, and migration history remain in place. Changing Supabase Auth tenants produces different user identities. **Existing users are not automatically relinked by email.** Reconcile any necessary identity mapping through a separate audited process with explicit account ownership evidence. Never use matching email addresses alone to grant old records, reviewer privileges, or owner authority to a new tenant's account.

## Run the bounded synthetic probe

Use Node 24 and the repository's installed dependencies. Run from a trusted terminal or backend job whose environment is populated by the secret manager; keep shell tracing disabled. The script does not load `.env` files, ask for passwords, or create users. In addition to the server variables above, supply:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_PUBLISHABLE_KEY` | The project's modern `sb_publishable_` key. The probe first verifies it against Auth settings so an invalid key cannot masquerade as successful access control. |
| `SUPABASE_STORAGE_PROBE_USER_TOKEN` | Optional current bearer access token from a dedicated empty synthetic Auth account. Do not use a researcher, reviewer, or administrator account. |
| `SUPABASE_STORAGE_PROBE_USER_ID` | Expected UUID of that synthetic account. Required alongside its token to exercise authenticated access. |

The synthetic user must be a normal authenticated account, not an anonymous Auth session. Obtain its short-lived access token through the normal authentication flow on a trusted test client, inject it into the runner environment without printing it, and remove it from that environment after the run. The probe verifies the identity with `GET /auth/v1/user` and checks the expected UUID; it never prints the UUID, token, or account response.

After setting the environment, run:

```sh
umask 077
pnpm exec tsx scripts/verify-supabase-storage.ts > storage-activation-receipt.json
```

The receipt contains statuses, HTTP status numbers, the nonsecret project origin/bucket, and the uniquely generated synthetic prefix. It contains no keys, signed URLs, bearer tokens, file payloads, raw provider bodies, or account details. Store it with the release evidence. Do not add credentials to the command or redirect a shell environment dump into the receipt.

The probe performs these checks sequentially:

1. Verify the HTTPS destination, private bucket, exact size cap, and MIME allowlist.
2. Write a clean text file under `irb-storage-probe/<random UUID>/` using the server secret and `x-upsert: false`.
3. Refuse a duplicate write, sign a short download, and compare the downloaded bytes with the original synthetic content.
4. Attempt direct download, public-path download, listing, upload, and signing with no credentials and then with the verified publishable key. A filtered empty list counts as no object disclosure; malformed requests, transport errors, and rate limits do not count as successful denial.
5. Perform the same negative checks with a validated synthetic-user bearer when both optional variables are supplied. Verify the publishable key and synthetic identity again after their checks so revocation or expiry cannot masquerade as permission denial. Missing or invalid identity evidence produces `NOT_VERIFIED`.
6. Check that the short-lived test URL stops working after expiry. The probe uses a five-second test signature and waits up to eight seconds after receiving it; application download TTLs remain 60–300 seconds. A hosted HTTP 400 counts as expiry only for the previously successful, unchanged URL and an exact recognized expiry error. The observed missing-authorization schema error counts as denial only for the intentionally credential-free actor.
7. In `finally`, delete only exact keys attempted by this run, including any uploads unexpectedly permitted during negative tests. Verify that this run's prefix is empty through a bounded server-side listing.

The main phase is bounded to 60 seconds, cleanup to 20 seconds, each request to eight seconds, and the entire run to 30 requests. Responses are capped at 64 KiB. There are no retries, whole-bucket listings, recursive deletes, bucket-empty operations, or research-record queries. A process kill or provider outage can interrupt cleanup; the receipt's synthetic prefix identifies the only scope requiring manual inspection. Never delete the bucket or another run's prefix to resolve a cleanup failure.

## Interpret the evidence and activate

| Exit code / receipt | Meaning |
| --- | --- |
| `0` / `PASS` | Every exercised requirement, including authenticated denial and cleanup, passed for this synthetic run. |
| `2` / `PARTIAL` | At least one scope is unverified, commonly the optional authenticated test. This is not full activation evidence. |
| `1` / `FAIL` or `NOT_VERIFIED` | A prerequisite, assertion, configuration, provider call, or cleanup failed. Correct the issue before claiming activation. |

Keep policy inspection and synthetic API results as separate evidence. A random-prefix probe cannot prove that a policy granting access to a different prefix is absent. Review policies even when every probe passes. Current and legacy provider error formats are handled without logging their messages; see [Supabase Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes).

After provider checks pass, deploy the configured backend and run the application's own synthetic upload/download workflow with a clean file, an ownership-denied request, and the malware-scanner checks. Verify that the browser receives an application-controlled file route or a short signed download, never a service credential. Confirm the required backup/restore evidence and approved hosting arrangements separately. Storage activation alone does not enable public IRB operation, certificate issuance, or automatic global legal validity.
