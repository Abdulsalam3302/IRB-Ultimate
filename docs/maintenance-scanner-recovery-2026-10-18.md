# Free scanner recovery — 18 October 2026

Verification date: **18 October 2026, approximately 02:20 Asia/Riyadh** (17 October 2026, 23:20 UTC). This receipt covers the existing Mac-hosted Docker scanners and their outbound Render connections. It contains no credentials or research data.

## Observed failure and recovery

Docker Desktop's existing engine did not answer the Docker API. The backend log recorded an engine shutdown on **10 October 2026 at 12:30:35 UTC**, caused by `no space left on device` while writing its VM log. Several backend/build processes remained after the normal desktop shutdown attempt. At recovery, the host had approximately **154 GiB available**; the historical disk exhaustion must still be treated as an operational risk.

The owner explicitly authorized restarting Docker Desktop. A bounded graceful termination stopped the stuck child processes. Docker's supported `desktop stop --force --timeout 25` then completed, followed by a normal `desktop start`. The recovered engine reported **29.8.1**.

No factory reset, data deletion, image/volume removal, disk replacement or prune operation was performed. The authorized desktop restart also resumed existing containers according to their own restart policies; unrelated containers were not reconfigured or stopped individually.

The existing IRB profile was reconciled with:

```sh
docker compose -f infra/clamav/compose.free.yaml up -d --no-build --pull never \
  clamav-primary worker-primary clamav-fallback worker-fallback
```

The command used the existing private primary and fallback environment files outside the repository. It completed successfully and recreated only the four IRB services against their existing images, networks and persistent signature volumes. Resolved environment and credential values were not printed.

## Current measured checks

| Check | Primary | Fallback |
| --- | --- | --- |
| Engine container | Running, healthy | Running, healthy |
| Dedicated readiness command | Exit 0 | Exit 0 |
| Pinned ClamAV engine | 1.5.4 | 1.5.4 |
| Signature version | 28156 | 28156 |
| Signature timestamp | 17 October 2026, 06:25:46 UTC | 17 October 2026, 06:25:46 UTC |
| Synthetic plain-text scan through its worker-to-engine network | `clean` | `clean` |
| Standard synthetic EICAR test through its worker-to-engine network | `infected` | `infected` |
| Outbound authenticated broker connection | `connected`, then `ready` at 23:20:00 UTC | `connected`, then `ready` at 23:19:54 UTC |
| Stable worker state at 23:20:37 UTC | Remained ready | Remained ready |
| Engine memory sample | Approximately 970 MiB / 3 GiB | Approximately 970 MiB / 3 GiB |
| Worker memory sample | Approximately 25 MiB / 192 MiB | Approximately 18 MiB / 192 MiB |

Both signatures were younger than the enforced 48-hour maximum. Workers remained connected beyond the broker's 15-second stale-heartbeat eviction window. Startup-only unavailable states cleared through the existing reconnect backoff.

The Compose service listing showed **no published host ports**. The engines' internal TCP 3310 listeners remain on their private scanner networks. These checks did not send research data to the engines; the synthetic EICAR fixture was held in memory and cleared after the test.

The existing Render backend answered `/api/health` with HTTP 200, `ok: true`, application **2.6.0**, commit **376158ceaff65d24f6d4c8a8b123a4de97977966**. This is the backend observed during scanner recovery, before the new maintenance release is deployed.

## Evidence limits and continued operation

- Two stable worker-side connections and valid engine checks were observed. At recovery, the then-deployed application did not expose an authenticated operator endpoint for `remoteScannerStatus()`, so the recovery checks above do not claim a direct server-side available-worker count. The subsequent maintenance source adds an owner-only `system.scannerStatus` snapshot and monitoring card; its deployment and live readback must be verified separately.
- Clean and EICAR tests exercised each worker's private network path to its actual running engine. A fresh authenticated application upload, production malware rejection before storage, and cloud-path failover test were **not** performed as part of this recovery. Earlier release receipts retain their own historical scope.
- Both scanners share one Mac, Docker Desktop, disk, power and internet connection. A second container provides process redundancy; it does not provide a second host or an uptime guarantee.
- The Mac and Docker Desktop must remain running and awake for this free scanner arrangement. No automatic desktop-login launch, wake policy or unattended host supervisor was installed by this recovery.
- Keep adequate host disk headroom and check scanner readiness after host/Docker updates, restarts or definition reloads. The observed historical disk exhaustion explains why monitoring only the website's HTTP liveness is insufficient.
- FreshClam, the engine watchdog and worker checks continue enforcing fresh signatures. Scanner absence, stale definitions and ambiguous replies must continue refusing uploads before storage. Do not disable required scanning to work around host availability.

See [the scanner deployment runbook](scanner-deployment.md) for the current topology, credential handling, readiness commands and fallback limits.
