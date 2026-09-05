/** Outbound-only confidential scanner worker. Never writes uploaded bytes to disk. */
import { createConnection, isIP } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { WebSocket } from "ws";

export const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REPLY = 4096;
const HEX_ID = /^[a-f0-9]{64}$/;
const fail = () => new Error("SCANNER_UNAVAILABLE");

export function workerConfig(env = process.env) {
  const endpoint = new URL(env.SCANNER_BACKEND_URL || "");
  const localTest = env.SCANNER_ALLOW_LOOPBACK_TEST === "true" && env.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
  if ((!localTest && endpoint.protocol !== "https:") || (localTest && !["http:", "https:"].includes(endpoint.protocol)) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || endpoint.pathname !== "/" || (!localTest && endpoint.port)) throw fail();
  const id = env.SCANNER_WORKER_ID || "";
  const token = env.SCANNER_WORKER_TOKEN || "";
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id) || !HEX_ID.test(token)) throw fail();
  const host = env.CLAMAV_HOST || "clamav";
  // A private Docker service name or loopback only; never send uploads to an arbitrary remote daemon.
  if (!(host === "localhost" || host === "127.0.0.1" || host === "::1" || /^[a-z][a-z0-9_-]{0,62}$/.test(host)) || (isIP(host) && !["127.0.0.1", "::1"].includes(host))) throw fail();
  const port = Number(env.CLAMAV_PORT || 3310);
  if (!/^\d+$/.test(env.CLAMAV_PORT || "3310") || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw fail();
  const engine = env.SCANNER_EXPECTED_ENGINE || "1.5.4";
  if (!/^\d+\.\d+\.\d+$/.test(engine)) throw fail();
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.pathname = "/api/internal/scanner/worker";
  return { endpoint: endpoint.href, id, token, host, port, engine, localTest };
}

/** NUL-framed clamd control request with a complete, bounded response. */
export function daemonCommand(config, command, signal, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: config.host, port: config.port });
    let reply = Buffer.alloc(0), done = false;
    const finish = (error) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy();
      if (error) { reply.fill(0); reject(fail()); } else resolve(reply.toString("ascii"));
    };
    const abort = () => finish(true);
    const timer = setTimeout(abort, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.once("connect", () => socket.write(`z${command}\0`));
    socket.on("data", chunk => {
      if (reply.length + chunk.length > MAX_REPLY) { finish(true); return; }
      reply = Buffer.concat([reply, chunk]);
    });
    socket.once("end", () => finish(false));
    socket.once("error", () => finish(true));
    socket.once("close", () => { if (!done) finish(true); });
  });
}

export function parseEngineHealth(version, engine, now = Date.now()) {
  const match = /^ClamAV (\d+\.\d+\.\d+)\/(\d+)\/([A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\0$/.exec(version);
  if (!match || match[1] !== engine) throw fail();
  const signatureAt = Date.parse(`${match[3]} UTC`), signatureVersion = Number(match[2]);
  if (!Number.isSafeInteger(signatureAt) || !Number.isSafeInteger(signatureVersion) || signatureVersion <= 0 || signatureAt - now > 300_000 || now - signatureAt > 48 * 3600_000) throw fail();
  return { engine, signatureAt, signatureVersion };
}

export async function engineHealth(config, signal) {
  if (await daemonCommand(config, "PING", signal) !== "PONG\0") throw fail();
  return parseEngineHealth(await daemonCommand(config, "VERSION", signal), config.engine);
}

/** Stream exact bytes to the private daemon. FOUND is a terminal verdict. */
export function scanBytes(data, config, signal, timeoutMs = 15000) {
  if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_BYTES) return Promise.reject(fail());
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: config.host, port: config.port });
    let offset = 0, queued = false, sent = false, done = false;
    let reply = Buffer.alloc(0);
    const finish = (verdict) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy();
      if (verdict) resolve(verdict); else reject(fail());
    };
    const abort = () => finish();
    const timer = setTimeout(abort, Math.max(25, Math.min(30000, timeoutMs)));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    const pump = () => {
      if (done || queued) return;
      while (offset < data.length) {
        const length = Math.min(65536, data.length - offset), frame = Buffer.allocUnsafe(4);
        frame.writeUInt32BE(length);
        socket.cork(); socket.write(frame); const writable = socket.write(data.subarray(offset, offset + length)); socket.uncork();
        offset += length;
        if (!writable) { socket.once("drain", pump); return; }
      }
      queued = true; socket.write(Buffer.alloc(4), () => { sent = true; });
    };
    socket.once("connect", () => { socket.setNoDelay(true); socket.write("zINSTREAM\0"); pump(); });
    socket.on("data", chunk => {
      // A complete positive verdict is terminal even if the daemon rejects a
      // stream before consuming it all, or closes/resets immediately afterward.
      reply = Buffer.concat([reply, chunk.subarray(0, MAX_REPLY - reply.length)]);
      if (/^stream: [^\x00-\x1f\x7f]{1,512} FOUND\0/.test(reply.toString("utf8"))) { finish("infected"); return; }
      if (reply.length >= MAX_REPLY) { finish(); return; }
    });
    socket.once("end", () => {
      const text = reply.toString("utf8");
      if (/^stream: [^\x00-\x1f\x7f]{1,512} FOUND\0/.test(text)) finish("infected");
      else if (sent && text === "stream: OK\0") finish("clean");
      else finish();
    });
    socket.once("error", () => finish());
    socket.once("close", () => { if (!done) finish(); });
  });
}

export function startScannerWorker(config, { report = () => {}, reconnect = true, healthCheck = engineHealth, scan = scanBytes } = {}) {
  let stopped = false, socket, heartbeat, reconnectTimer, failures = 0, active, nonce, ready = false, healthRunning = false, awaitingHello, sessionController;
  const connection = new AbortController();
  const clearJob = () => { if (active) { active.controller.abort(); clearTimeout(active.timer); active.data?.fill(0); active = undefined; } };
  const safeReport = state => { try { report({ state }); } catch { /* Logging must not affect the boundary. */ } };
  const send = message => { if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_REPLY) throw fail(); socket.send(JSON.stringify({ ...message, nonce })); };
  const disconnect = (expected = socket) => {
    if (expected !== socket) return;
    ready = false; sessionController?.abort(); clearInterval(heartbeat); clearTimeout(awaitingHello); clearJob(); expected?.terminate();
  };
  const health = async () => {
    if (healthRunning || !nonce || stopped) return;
    healthRunning = true;
    const current = socket;
    try {
      const result = await healthCheck(config, AbortSignal.any([connection.signal, sessionController.signal]));
      if (stopped || socket !== current || socket?.readyState !== WebSocket.OPEN) return;
      send({ type: "health", ready: true, health: result }); ready = true;
      failures = 0; safeReport("ready");
    } catch { if (socket === current) { safeReport("unavailable"); disconnect(current); } }
    finally { if (socket === current) healthRunning = false; }
  };
  const connect = () => {
    if (stopped) return;
    nonce = undefined; ready = false; healthRunning = false; sessionController = new AbortController();
    socket = new WebSocket(config.endpoint, { headers: { Authorization: `Bearer ${config.token}`, "X-Scanner-Worker": config.id }, followRedirects: false, handshakeTimeout: 10000, perMessageDeflate: false, maxPayload: MAX_BYTES });
    const current = socket;
    socket.on("open", () => { safeReport("connected"); awaitingHello = setTimeout(() => disconnect(current), 5000); });
    socket.on("error", () => { safeReport("unavailable"); disconnect(current); });
    socket.on("close", () => {
      if (socket !== current) return;
      ready = false; sessionController.abort(); clearInterval(heartbeat); clearTimeout(awaitingHello); clearJob();
      if (!stopped && reconnect) {
        const wait = Math.min(60000, 1000 * 2 ** Math.min(6, failures++)) + Math.floor(Math.random() * 1000);
        reconnectTimer = setTimeout(connect, wait);
      }
    });
    socket.on("message", async (raw, binary) => {
      try {
        if (socket !== current || stopped) return;
        if (!binary) {
          if (raw.length > MAX_REPLY) throw fail();
          const message = JSON.parse(raw.toString());
          if (message.type === "hello") {
            if (nonce || message.protocol !== 1 || !HEX_ID.test(message.nonce) || message.engine !== config.engine || message.maxBytes !== MAX_BYTES || !Number.isInteger(message.heartbeatMs) || message.heartbeatMs < 25 || message.heartbeatMs > 5000) throw fail();
            clearTimeout(awaitingHello); nonce = message.nonce;
            await health();
            if (socket === current && current.readyState === WebSocket.OPEN) heartbeat = setInterval(health, message.heartbeatMs);
            return;
          }
          if (!nonce || message.nonce !== nonce || message.type !== "scan" || !ready || active || !HEX_ID.test(message.id) || !HEX_ID.test(message.hash) || !Number.isInteger(message.bytes) || message.bytes < 1 || message.bytes > MAX_BYTES || !Number.isInteger(message.timeoutMs) || message.timeoutMs < 1 || message.timeoutMs > 30000) throw fail();
          active = { ...message, controller: new AbortController(), timer: setTimeout(() => disconnect(current), message.timeoutMs), data: undefined };
          return;
        }
        const job = active;
        if (!job || job.data || raw.length !== job.bytes || !timingSafeEqual(createHash("sha256").update(raw).digest(), Buffer.from(job.hash, "hex"))) { raw.fill(0); throw fail(); }
        job.data = raw;
        const before = await healthCheck(config, job.controller.signal);
        const verdict = await scan(job.data, config, job.controller.signal, job.timeoutMs);
        if (job !== active || job.controller.signal.aborted || stopped) return;
        if (verdict === "infected") {
          send({ type: "result", id: job.id, hash: job.hash, bytes: job.bytes, verdict, health: before });
          clearJob(); return;
        }
        // Definitions and pinned engine must still be valid after the scan.
        const after = await healthCheck(config, job.controller.signal);
        if (job !== active || job.controller.signal.aborted || stopped) return;
        if (!["clean", "infected"].includes(verdict) || after.engine !== before.engine || after.signatureVersion < before.signatureVersion) throw fail();
        send({ type: "result", id: job.id, hash: job.hash, bytes: job.bytes, verdict, health: after });
        clearJob();
      } catch { if (socket === current) { safeReport("unavailable"); disconnect(current); } }
    });
  };
  connect();
  return () => { stopped = true; connection.abort(); clearTimeout(reconnectTimer); disconnect(); };
}
