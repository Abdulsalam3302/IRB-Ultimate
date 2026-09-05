#!/usr/bin/env node
import { workerConfig, startScannerWorker } from "./scanner-worker-core.mjs";
// Do not load the application's .env: worker credentials grant scanning only.
let stop;
try {
  const config = workerConfig();
  let lastState;
  stop = startScannerWorker(config, { report: ({ state }) => {
    if (state !== lastState) console.log(JSON.stringify({ service: "private-scanner-worker", state }));
    lastState = state;
  } });
} catch {
  console.error("Private scanner worker configuration is invalid.");
  process.exitCode = 1;
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { stop?.(); process.exitCode = 0; });
