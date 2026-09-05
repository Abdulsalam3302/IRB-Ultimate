# Free private malware scanning

The selected architecture uses the operator’s existing trusted Mac and Docker Desktop, with an outbound worker connection to the existing Render API. **Incremental scanner SaaS charge: USD 0.** Electricity, internet use, hardware, existing platform services and operator time still have costs. No paid scanner service or new Oracle resource is selected or provisioned by this design.

The free profile provides a primary scanner and an optional fallback scanner in separate containers. Both replicas on one Mac share power, internet, Docker and sleep state. This is process redundancy; it does not provide host-outage redundancy or a guaranteed uptime level. Actual cloud-path activation and measured capacity require the release’s current runtime receipt. Earlier scanner receipts remain historical evidence for their recorded configuration.

## How uploads remain private

The browser uploads to the authenticated application route. The API checks ownership, quotas, MIME/extension and magic bytes, then ZIP/DOCX metadata limits. It retains the bounded document in memory while an authenticated worker scans it. **Storage and file metadata are created only after a clean verdict.** There is no persisted queue of unscanned documents.

The worker connects outward to `wss://irb-saudi-arabia.onrender.com/api/internal/scanner/worker`. There is no inbound port on the Mac, no public ClamAV port, no tunnel provider, and no public reputation-service submission. Each worker has a distinct, random 256-bit credential granting only the scanner protocol. It receives file bytes and a random job identifier, SHA-256 digest, byte count and deadline; it receives no applicant name, filename, study title, storage credential or database credential.

One worker handles one scan; the server accepts at most two worker identities. A connection nonce and job identity/hash/length bind the returned verdict to the upload. The worker accepts only the configured HTTPS backend origin, with certificate verification and no redirects. Browser origins/cookies and unmatched production WebSocket upgrades are rejected. Worker messages are bounded and rate-limited. Uploaded content is never written by the worker or included in logs; engine extraction uses bounded temporary memory storage. The worker clears its received buffer on completion, cancellation or disconnect.

A clean result requires the entire input and one complete, unambiguous ClamAV response. A complete positive `FOUND` verdict is terminal even if the engine reports it before consuming the complete upload. Malware and cancellation cannot fall through to another scanner. Only unavailability can try another healthy worker. An optional explicitly configured private TCP fallback shares the request’s overall deadline. Missing workers, unknown responses, wrong engine versions, stale definitions and exhausted deadlines return unavailable before storage.

ClamAV’s native TCP protocol has no authentication or encryption. Each engine is isolated on its own Docker internal network with its assigned worker. No host port is published. Do not attach unrelated containers to these networks or expose TCP 3310. [ClamAV Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html)

## Free deployment files

- `infra/clamav/compose.free.yaml`: selected topology, separate primary/fallback networks and signature volumes, no published ports, bounded logs and resource limits.
- `infra/clamav/clamd-free.conf`: one scan thread and `ConcurrentDatabaseReload no`. Reloads can temporarily block that engine; another healthy worker can handle an unavailable primary. Archive, encryption, macro and scan-limit restrictions remain enabled.
- `infra/scanner-worker/Dockerfile`: non-root, pinned Node runtime and locked `ws` dependency. The worker container has a read-only filesystem and no application repository credentials.
- `scripts/scanner-worker.mjs` and `scanner-worker-core.mjs`: outbound worker, engine health checks, bounded INSTREAM transport, reconnect backoff and safe state-only logging.
- `server/services/remoteScanner.ts`: authenticated WebSocket broker and request/verdict binding.
- `infra/clamav/start.sh`, `health.sh`, `freshclam.conf`: signed-definition updates, exact engine version, bounded startup and stale-definition watchdog.

The existing ClamAV image pin is `clamav/clamav:1.5.4_base-debian13-slim@sha256:2bc2f9c5c1fd5120a334490d005c694430f0589d085a7aca400bbd93458fe1f0`. Image-index and platform evidence is in `infra/clamav/image-lock.json`. The worker Dockerfile pins its Node image digest separately.

ClamAV recommends 3–4 GiB RAM and 5 GiB available disk space. The free profile caps each engine at 3 GiB/one CPU and each worker at 192 MiB. These limits are resource controls, not proof that two engines fit alongside other workloads. Measure memory during real signature reloads before starting the fallback. If the host lacks safe headroom, operate one engine and leave a second host as a future fallback. Do not stop unrelated containers to manufacture capacity. [ClamAV system requirements](https://docs.clamav.net/Introduction.html)

## Credentials and activation

Use private files outside the repository, under `~/.config/irb-private-scanner/`, with directory mode 0700 and file mode 0600. Each file supplies only its worker identity and distinct high-entropy token. Keep tokens out of URLs, shell arguments, screenshots, command output and release receipts. Do not run `docker compose config` or print container environment/inspection output: these can disclose resolved credentials.

The server configuration is:

```dotenv
UPLOAD_SCAN_REQUIRED=true
UPLOAD_SCANNER_MODE=remote
SCANNER_PUBLIC_ORIGIN=https://irb-saudi-arabia.onrender.com
SCANNER_EXPECTED_ENGINE=1.5.4
CLAMAV_SCAN_TIMEOUT_MS=15000
```

Set `SCANNER_WORKER_TOKENS` privately to a JSON object mapping each configured worker ID to its own random 64-character hexadecimal token. Never copy sample/test tokens. The worker files contain `SCANNER_WORKER_ID` and `SCANNER_WORKER_TOKEN`; Compose supplies the fixed backend URL and private engine hostname. Update the server and matching worker together when rotating a credential. A removed credential stops authorizing new connections; restart the broker or terminate its existing worker connection to revoke the current session immediately.

Commands contain paths only; substitute the actual private filenames if the operator chose different names:

```sh
export IRB_SCANNER_PRIMARY_ENV="$HOME/.config/irb-private-scanner/primary.env"
export IRB_SCANNER_FALLBACK_ENV="$HOME/.config/irb-private-scanner/fallback.env"
docker compose -f infra/clamav/compose.free.yaml build
docker compose -f infra/clamav/compose.free.yaml up -d clamav-primary worker-primary
docker compose -f infra/clamav/compose.free.yaml exec -T clamav-primary /usr/local/bin/irb-clamav-health
```

Both environment-file paths must be defined for Compose to resolve the file, including when starting only the primary services. After measuring adequate host/VM memory, start the fallback:

```sh
docker compose -f infra/clamav/compose.free.yaml up -d clamav-fallback worker-fallback
docker compose -f infra/clamav/compose.free.yaml exec -T clamav-fallback /usr/local/bin/irb-clamav-health
docker compose -f infra/clamav/compose.free.yaml ps
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'
```

Keep the Mac awake and Docker running if uploads are expected. No launch agent, wake policy or system sleep setting is implied by these commands. A supervisor may restart worker containers, but it cannot overcome a sleeping or disconnected host. State-only worker logs can help diagnose connection readiness; never enable payload/debug logging.

## Operational checks and fallback

The engine and worker independently require the pinned version and definitions no older than 48 hours, with at most five minutes of future clock skew. FreshClam updates every two hours; the engine watchdog closes its listener when stale or unhealthy. Worker health is checked regularly and around scans. The server evicts workers with stale heartbeats. Reconnect attempts back off with jitter up to approximately one minute.

Before enabling public document uploads, exercise synthetic clean/EICAR uploads through the real authenticated application path. Prove another applicant cannot retrieve the object; no object/metadata is created for malware or scanner unavailability; primary failure uses the healthy fallback; loss of both workers refuses uploads; and cancellation stops the scan. Measure memory during definition reloads and verify recovery. Do not use real research records to establish these gates, and do not describe a source test or local engine result as a cloud-path receipt.

The broker currently belongs to the single Render API instance. Restarts terminate pending requests safely and workers reconnect. Future horizontal API scaling requires an explicit shared routing/broker design; a replica without a worker will return unavailable. The free Render service can sleep, restart or exhaust shared monthly allowances. Render states its free instances are unsuitable for production availability commitments. WebSocket support permits the transport but does not change those limits. [Render free-instance limits](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket)

The safe last fallback is to pause/retry uploads while retaining the applicant’s editable draft. **Never set `UPLOAD_SCAN_REQUIRED=false` as an availability workaround.** Two worker containers on the same Mac can recover from an individual process failure, but both become unavailable if the host fails.

## Optional future free host

A second trusted machine can run the same worker with its own credential. Oracle’s current Always Free A1 allowance is **two OCPUs and 12 GB RAM total**, with regional capacity and account eligibility constraints; it is not the older four-CPU/24-GB allowance. A suitably sized instance could host a private scanner, but no account, allocation or instance is established by this repository. Idle instances may be reclaimed, and free capacity can be unavailable. Choose an eligible home region and enforce free-resource quotas; do not silently upgrade to paid service. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

Processing location, access control and institutional authorization remain relevant whether the worker is on a Saudi Mac or a cloud VM. A private connection alone does not establish data residency or legal permission to process a study.

## Historical and optional infrastructure evidence

The earlier local ARM64 engine receipt in `infra/clamav/local-runtime-verification.json` records real clean/EICAR, outage, stale-definition and reload checks for the prior four-GiB profile with concurrent reloads. Its measured reload peak was approximately 2.05 GiB. It does not verify the new free two-replica profile or current Render-to-worker connectivity. `preparation-verification.json` and `image-lock.json` retain their original evidence scopes.

The archive metadata guard was added after a real ClamAV fixture showed that engine heuristics alone could return clean for an archive containing an oversized entry. The guard bounds advertised sizes, ratios and structures; it does not prove actual deflate size, CRC correctness or nested-content safety. Keep it before the scanner.

`infra/clamav/render.yaml` remains an **optional, unselected paid private-service blueprint** for a later explicit cost decision. Earlier Render preparation was blocked by missing billing information. It is not the selected free deployment, and no paid purchase is authorized by this runbook.
