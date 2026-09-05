# Private malware scanner deployment

Prepared and locally exercised on 5 September 2026. **No paid service has been created and production settings have not been changed.** The Docker image built and ran successfully on local Linux ARM64, with real signatures, clean/EICAR verdicts and failure/recovery checks. Render's live Blueprint validator currently returns `need_payment_info`; a payment method and the concrete price decision below are the remaining provisioning gate. Render's build and private-network integration are separate outstanding checks.

## Resource and cost decision

The minimum suitable Render compute plan is **2 CPU / 4 GB RAM**, plan ID `2c-4g` (the accepted legacy Blueprint ID is `pro`). ClamAV documents a minimum of 3 GiB RAM and prefers 4 GiB; database reloads temporarily use substantially more memory than idle scanning. The 512 MB and 2 GB plans do not meet that minimum. We retain concurrent database reloads and signature integrity testing. [ClamAV Docker requirements](https://docs.clamav.net/manual/Installing/Docker.html), [Render compute plans](https://render.com/docs/compute-plans).

| New resource | Configuration | Published monthly cost |
| --- | --- | ---: |
| Private scanner compute | One `2c-4g` / `pro` instance, 2 CPU, 4 GB | USD 85.00 |
| Signature disk | 6 GB at USD 0.25/GB/month | USD 1.50 |
| **Incremental scanner total** | One instance and disk | **USD 86.50** |

Prices were read from the official page on 5 September 2026. Taxes, outbound usage beyond workspace allowances, build usage, and other existing services are additional. The 6 GB disk allocation exceeds ClamAV's 5 GiB free-space recommendation. The application's current compute, Supabase and Vercel costs are outside this scanner estimate. Confirm the displayed checkout estimate before creating the service. [Render pricing](https://render.com/pricing), [ClamAV system requirements](https://docs.clamav.net/Introduction.html).

Standard private networking does not require a Pro workspace upgrade. The API and scanner must share a Render workspace and region; a free API service can initiate private requests to this paid scanner. Environment-level network isolation requires a Pro workspace or higher; the currently published Pro workspace charge is USD 25/month if that additional control is selected. Do not purchase it implicitly. [Private networking](https://render.com/docs/private-network), [free-service limitations](https://render.com/docs/free), [workspace pricing](https://render.com/pricing).

## Files and version pin

- `infra/clamav/Dockerfile`: copies the official pinned ClamAV runtime into a final image that exposes only TCP 3310. It installs no extra downloaded packages and starts no milter or HTTP server.
- `infra/clamav/image-lock.json`: registry and calculated SHA-256 evidence for the upstream image index and its platform manifests.
- `infra/clamav/clamd.conf`: 15 MiB input/file cap, 50 MiB aggregate scan cap, bounded recursion/files/time, two scan threads, and fail-closed encrypted/over-limit detection policies.
- `infra/clamav/freshclam.conf`: official signed signature databases, integrity testing, updates every two hours, and daemon reload notification.
- `infra/clamav/start.sh`: supervised initial update, engine startup, updater lifecycle, periodic readiness enforcement and bounded termination.
- `infra/clamav/health.sh`: local PING, exact engine-version check and signature timestamp validation.
- `infra/clamav/render.yaml`: standalone private-service Blueprint. It does not modify the existing application Blueprint.
- `infra/clamav/compose.yaml`: local fixture with a persistent signature volume, bounded resources and no published host ports.
- `infra/clamav/probe.mjs`: two small synthetic INSTREAM requests from the API host, checking clean acceptance and rejection of the standard harmless EICAR antivirus marker.

The image pin is:

```text
clamav/clamav:1.5.4_base-debian13-slim
sha256:2bc2f9c5c1fd5120a334490d005c694430f0589d085a7aca400bbd93458fe1f0
```

The Docker Hub tag, registry response digest and locally calculated index digest matched. The image index includes Linux amd64, arm64 and ppc64le; Render uses its applicable platform. Image identity and local ARM64 execution have been verified separately; neither establishes a vulnerability-free base image or a successful Render build. The pinned image has no bundled definitions, so its persistent signature disk and initial FreshClam update are required. [Official image distribution](https://docs.clamav.net/manual/Installing/Docker.html), [verified tag metadata](https://hub.docker.com/v2/repositories/clamav/clamav/tags/1.5.4_base-debian13-slim).

## Network and confidentiality boundary

Create a **private service** (`type: pserv`), never a public web service. Bind TCP 3310 inside it; do not publish a Docker host port, add a public proxy/domain, or expose a health HTTP listener. Render private services have no public `onrender.com` hostname. Port 3310 is permitted on the private network. The prepared region is `frankfurt`, matching the checked-in API topology; verify the live API's region and workspace before applying it because a region cannot be changed after service creation. [Private services](https://render.com/docs/private-services), [network port rules](https://render.com/docs/private-network), [Blueprint regions](https://render.com/docs/blueprint-spec).

ClamAV's TCP protocol has no native authentication or transport encryption. Same-workspace services must therefore be trusted; the protocol also supports administrative commands. Use an isolated environment/network for untrusted co-tenants. A plain public TCP listener is unacceptable. Vercel browsers/functions and Supabase clients must not connect to the scanner; the authenticated Render API scans bytes before storing an uploaded object. [ClamAV TCP warning](https://docs.clamav.net/manual/Installing/Docker.html).

The signature disk contains malware definitions, not uploaded studies. Document extraction uses an ephemeral directory, temporary files are removed by the engine, and clean-file/metadata/debug logging is disabled. Do not enable verbose logging or send document contents to a monitoring service. A Frankfurt scanner is processing in Germany; private networking does not establish Saudi data residency or authorization for sensitive research data. Retain the platform's deployment and institutional processing gates.

## Readiness and failure behavior

Render private services support TCP health checks only. An open socket alone cannot prove fresh definitions or a functioning scanner. The service therefore checks PING, the pinned engine version and the running engine's signature timestamp. A timestamp older than 48 hours or more than five minutes in the future fails readiness. An operator may reduce this threshold to 12–48 hours, but cannot extend it beyond 48 through the environment. [Render health checks](https://render.com/docs/health-checks).

Initial signature download/update must succeed before starting clamd. It has a ten-minute deadline, followed by at most four minutes for engine readiness. The updater remains running and notifies clamd after updates. The watchdog checks every 15 seconds, terminates immediately after a stale-signature result, and terminates after two other consecutive readiness failures. A stopped engine/updater also stops the service. This closes the TCP listener so the application continues to reject uploads while Render restarts the instance.

Application settings after a successful private probe are:

```dotenv
UPLOAD_SCAN_REQUIRED=true
CLAMAV_HOST=<assigned-internal-hostname-without-port>
CLAMAV_PORT=3310
CLAMAV_SCAN_TIMEOUT_MS=15000
CLAMAV_MAX_CONCURRENT=2
```

The existing application transport uses bounded INSTREAM frames and accepts one complete unambiguous verdict. Scanner outage, timeout or unknown replies return unavailable before storage; FOUND is rejected. The daemon enables alerts for encrypted content, Office macros and inspection limits. An actual encrypted ZIP was rejected. Those settings are deliberate upload restrictions, but **engine heuristics alone do not reliably reject every oversized archive entry**: see the measured exception below. Deterministic ZIP/DOCX metadata validation must enforce archive limits before scanning. Limits and feature names were checked against the [ClamAV 1.5.4 configuration sample](https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.4/etc/clamd.conf.sample).

## Deployment sequence after the cost decision

1. Confirm the USD 86.50/month scanner allocation, supply the payment method through Render's own billing UI, and verify the API's live workspace/region. Do not put payment details or application credentials in this service.
2. Build and test the image with a working Docker daemon, or perform a staged Render build. From the repository, run `docker compose -f infra/clamav/compose.yaml build`. Record the resulting application image digest and engine version. Inspect the final image to confirm `3310/tcp` is its only exposed port.
3. Run `docker compose -f infra/clamav/compose.yaml up -d`, then `docker compose -f infra/clamav/compose.yaml exec -T clamav /usr/local/bin/irb-clamav-health`. This has no published host port. Allow the initial definition download; do not repeatedly delete the signature volume and redownload it.
4. Run `render blueprints validate infra/clamav/render.yaml --output json`, require a valid result, and create/sync that standalone Blueprint through Render. Select the verified repository commit. The Blueprint uses manual deployment triggers and a six-GB disk at `/var/lib/clamav`. It does not include an unsupported HTTP health-check field or a custom shutdown delay, which Render rejects for disk-backed services.
5. Record the service's actual internal hostname. From the Render API host, run the prepared synthetic probe with the settings above: `node infra/clamav/probe.mjs`. Require both clean acceptance and EICAR rejection. The script accepts only an internal single-label hostname on port 3310 and emits no scanned bytes or signature names.
6. Exercise one synthetic upload through the authenticated application route. Verify that it is scanned before private storage, another account cannot download it, and a stopped scanner produces unavailable with no object/metadata success. Verify a harmless archive that exceeds the inspection limits is rejected. These are staged tests; do not use patient/research records to establish readiness.
7. Check memory during signature reload, disk growth, response time at two concurrent scans, logs, process restart, stale-signature failure and updater recovery. Only then change the live API's scanner settings. Keep `UPLOAD_SCAN_REQUIRED=true` during rollback; restore the last verified scanner image or pause uploads, rather than bypass scanning.

A persistent disk prevents horizontal scaling and zero-downtime replacement of this single service. Scanner redeployments can temporarily make uploads unavailable. For a later availability requirement, provision separate scanners with separate disks and an explicitly designed private failover path; that is additional infrastructure and cost. [Render disk limitations](https://render.com/docs/disks).

## Verification completed and remaining evidence

- Registry image-index SHA-256 independently verified.
- Nine local readiness tests passed, including current/stale/future signatures, wrong engine version, malformed/split replies, invalid age policy and timeout bounds.
- Existing scanner and upload-route tests: 21 passed across two files; no application source change was needed.
- Shell syntax, JavaScript syntax and Docker Compose configuration checks passed.
- Render live Blueprint validation was exercised. The unsupported disk/shutdown-delay combination was corrected. The current result is blocked by `need_payment_info`; it is not a successful provisioning or complete deployment validation.
- Docker Desktop subsequently became available. The actual ARM64 build, official signature download/integrity checks, real clean/EICAR detection, engine reload, health-driven shutdown and recovery were exercised as described below. A Render private-network probe and paid creation remain unperformed.

See `infra/clamav/preparation-verification.json` for the machine-readable preparation receipt. Repeat validation after funding/configuration changes. Pinning the engine must be paired with regular review of ClamAV security releases and updated base-image digests; signature updates do not patch the engine or operating system. A newer pin also requires updating the exact readiness-version assertion and rerunning the tests and staged probe.

## Actual local container results

`infra/clamav/local-runtime-verification.json` records the subsequent Docker Desktop run. The Linux ARM64 image built from the pinned upstream index and exposed exactly `3310/tcp`, with no published host ports. Container limits were 4 GiB RAM and 2 CPU. Initial FreshClam download, integrity testing and engine readiness completed in approximately 22 seconds. The engine reported ClamAV 1.5.4 with daily database 28114, built at 06:23:38 UTC on 5 September 2026.

The prepared network probe accepted the clean synthetic file and rejected the harmless EICAR marker in 17 ms total. The actual bundled `server/services/uploadScanner.ts` transport independently produced the same results in 12 ms. Pausing the real scanner caused the application transport to return `SERVICE_UNAVAILABLE` in 262 ms under an explicit 250 ms test deadline; unpausing restored service. An encrypted synthetic ZIP produced the expected rejection.

A manual signature reload completed in approximately five seconds with 3,628,050 signatures. The container's cgroup recorded a peak of 2,196,766,720 bytes (approximately 2.05 GiB) across startup, synthetic scans and reload, with no OOM or memory-limit events. This supports retaining the 4 GB plan; it is a small ARM64 test, not a production throughput or concurrent-update capacity guarantee.

For the staleness check, a test-only wrapper advanced the health process's clock by 72 hours while it queried the real engine. Neither the signed definitions nor the system clock was modified. Health returned exit code 3; the watchdog stopped both daemons and exited the container with code 1. The actual application transport then returned `SERVICE_UNAVAILABLE` in 122 ms. This proves the readiness/watchdog failure path under an isolated clock injection; it does not claim an authentically old signature database was loaded.

**Archive exception found and addressed in the application:** a 16,457-byte ZIP containing one advertised 16 MiB entry of repeated ASCII `0` returned clean despite `MaxFileSize 15M` and `AlertExceedsMax yes`. The compressed input is below the application's raw-upload cap. The separate `server/services/uploadArchiveGuard.ts` metadata guard now rejects that exact fixture before scanning; an independent check also accepted a normal ZIP and rejected the encrypted ZIP. Its declared limits include 1,000 entries, 15 MiB per entry, 50 MiB aggregate expansion and a 200:1 compression ratio. Do not treat ClamAV's `OK` as evidence that every advertised expansion/entry bound was enforced. The receipt preserves the failed engine-only result and the passing application-guard checks as separate evidence layers. Full staged authenticated upload testing remains required.

After the failure injection, the unchanged image was recreated successfully using the saved signature volume. Health returned to ready without a full definition redownload. The local scanner was then stopped to release its resource allocation; the private local signature volume remains available for repeat tests.
