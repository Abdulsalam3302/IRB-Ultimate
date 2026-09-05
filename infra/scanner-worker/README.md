# Outbound scanner worker

This worker connects from an existing trusted machine to the platform’s fixed HTTPS backend, then scans bounded document bytes through an isolated local ClamAV service. It opens no inbound listener, writes no upload files, and logs only connection/readiness state changes.

Use [`../clamav/compose.free.yaml`](../clamav/compose.free.yaml) and the current [scanner deployment guide](../../docs/scanner-deployment.md). The selected free setup uses private environment files under `~/.config/irb-private-scanner/`; never commit them or print resolved Compose configuration/container environment.

Required worker secrets are `SCANNER_WORKER_ID` and a distinct random 64-hex-character `SCANNER_WORKER_TOKEN`. Nonsecret configuration is `SCANNER_BACKEND_URL=https://irb-saudi-arabia.onrender.com`, `SCANNER_EXPECTED_ENGINE=1.5.4`, `CLAMAV_HOST=clamav`, and `CLAMAV_PORT=3310`. Only the private Docker service name or loopback is accepted as the engine host. Production requires HTTPS; the explicit loopback-only test exception is disabled in production.

One worker handles one scan. A healthy fallback worker may take over when the primary is unavailable. A known malware verdict is terminal, including an early ClamAV response during a backpressured upload. Clean requires complete input and a complete engine response. A stopped, stale or disconnected engine fails closed. Received worker buffers are cleared on completion/cancellation/disconnect.

The worker image pins its Node base digest, installs its locked `ws` dependency without lifecycle scripts, runs as a non-root user, and is launched with a read-only filesystem in Compose. Signature databases belong to each ClamAV container’s separate persistent volume; temporary extraction is bounded in memory. No application database or storage secrets belong in the worker.

A second container on the same Mac is process redundancy only. Host-outage redundancy requires another trusted machine with its own key and independently verified operational availability. Public-cloud transport/clean/EICAR/failover proof must come from the current release receipt, not from a successful image build.
