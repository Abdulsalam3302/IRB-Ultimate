# Private upload and identity deletion lifecycle

The deletion outbox separates account closure from verified provider deletion. Migrations `0020_storage_deletion_outbox` and `0021_identity_erasure` must run before enabling the worker or accepting new uploads. This document describes source behavior; synthetic tests do not prove deletion on a production provider.

## Admission and interrupted uploads

Before writing an application upload, the server stores its exact key, owner, byte count, provider, origin and bucket in a durable reservation. A singleton database row serializes admission across API replicas. Existing file metadata and reserved, pending, processing or blocked deletion jobs all count toward the default **750 MiB total application-upload allowance**, alongside the existing **250 MiB / 500 files per user** limits. `MAX_TOTAL_UPLOAD_BYTES` can change the total bound; invalid settings retain a bounded default. The transaction prevents simultaneous admissions from overshooting the limit.

The metadata insert and cancellation of its cleanup reservation commit together. If the process crashes or an upload response is ambiguous, cleanup remains scheduled after a 15-minute settling window. Supabase and S3 remote writes are bounded to 30 seconds. A confirmed write followed by a failed database commit can be cleaned sooner. Jobs retain their quota charge until deletion is verified, including when the provider is unavailable or operator review is needed. Files generated outside the application-upload path, provider versions, backups and unrelated bucket contents are not part of this application-upload ledger; measure actual provider usage separately. The allowance reserves headroom and does not establish a vendor entitlement or a complete physical-bucket inventory.

## Account closure

Legacy file sizes that are missing or invalid are not counted as zero. New admission fails closed until those sizes are established or the exact objects are verifiably deleted. An outbox `fileSize` of `-1` preserves an unknown legacy size after its file metadata is removed; active jobs with that marker continue to block admission.

The account-erasure transaction removes only the user's unassigned uploads and uploads in their never-submitted drafts. Files in regulatory records remain. Files uploaded by another identity are not included in this user's deletion request; when their draft container is removed, their existing ownership metadata is preserved. Storage locations recorded at upload time are retained in deletion jobs. Legacy rows without a location are blocked as `unknown_binding`; current provider configuration is not evidence of their original location.

The response distinguishes `queuedStorageDeletions`, `blockedStorageDeletions` and `storageDeletionStatus` (`pending` or `not_required`). Queue insertion is not completed object deletion. Account anonymization and session invalidation can complete while provider deletion is pending. Concurrent late draft creation and upload metadata attachment to a closed account are rejected.

For a Supabase identity, the verified JWT issuer is recorded when the session bridge succeeds. Closure records the account's stored subject and issuer as a separate identity job. `queuedIdentityDeletions`, `blockedIdentityDeletions` and `identityDeletionStatus` report that scope separately. Historical identities without a verified issuer are blocked for review. The worker may delete only the corresponding **project Auth user** on the exact bound issuer; it does not call Supabase dashboard or Management APIs. Native applicants have no Supabase identity job.

Identity jobs remain tombstones after completion. The bridge checks them before creating a session, and the database rechecks inside the same lock used by closure before it can upsert an account. This prevents an old, still-valid provider JWT from recreating a closed identity. Do not purge those tombstones as ordinary completed-job housekeeping. Their retention and any controlled reopening process require an explicit account-security policy. Supabase also documents that issued access JWTs can remain valid until expiry after user deletion. See [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).

## Worker and provider behavior

`startStorageDeletionWorker()` starts one serial batch of up to two jobs every 60 seconds; the returned asynchronous stop function cancels future batches and waits for the active batch. Each claim has a durable two-minute lease. Retries use increasing delays and stop after six attempts. Claims and completion updates use the database lock and attempt identity, so multiple replicas cannot silently release the same quota reservation. Provider work runs outside the database transaction.

| Provider               | Completion evidence and limits                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Storage       | Storage API removes the exact key; a bounded, authenticated search for that filename must return no objects. A remaining or ambiguous result stays pending.                                                                     |
| S3                     | Requires an unversioned bucket, deletes the exact key and verifies a 404 from `HeadObject`. Versioned/suspended buckets are blocked because a delete marker would retain historical bytes.                                      |
| Local development disk | Unlinks the exact normalized key within the captured root and rejects a parent path escaping through a symlink. A missing file is idempotent completion.                                                                        |
| Forge                  | Blocked until an exact, verifiable deletion adapter is implemented.                                                                                                                                                             |
| Supabase Auth          | Captured UUID and issuer only; verifies the UUID, requests hard deletion and requires a typed `user_not_found` response before completion. Any issuer mismatch, invalid identity or unknown location blocks automatic deletion. |

Outbox diagnostics store bounded error codes rather than provider bodies, credentials or signed URLs. An `object_referenced` job is blocked so deletion cannot remove a file still attached to a record. A provider or bucket change never rebinds queued work to the new destination.

Operators should monitor counts and age without exposing object names:

```sql
SELECT reason, status, lastErrorCode, COUNT(*) AS jobs, MIN(createdAt) AS oldest
FROM storage_deletion_jobs
GROUP BY reason, status, lastErrorCode;
```

Investigate `blocked` jobs and repeated provider failures. Before a controlled retry, establish the original location, ownership, applicable retention decision, exact scope and provider access; do not fill unknown bindings from current environment variables or blanket-reset the queue. Review source configuration and the actual provider response separately. The process logs new blocking events and unavailable batches; an operational alert recipient and response procedure must still be configured.
