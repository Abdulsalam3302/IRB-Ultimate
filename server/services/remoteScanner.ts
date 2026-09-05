/** Private outbound workers. No upload is persisted or disclosed through this API. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { TRPCError } from "@trpc/server";

export const REMOTE_SCANNER_PATH = "/api/internal/scanner/worker";
export const REMOTE_SCAN_MAX_BYTES = 15 * 1024 * 1024;
const CONTROL_BYTES = 4096;
const HEARTBEAT_MS = 5000;
const MAX_SIGNATURE_AGE_MS = 48 * 60 * 60 * 1000;
const workerIdPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const unavailable = () => new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Document security scanning is temporarily unavailable. Please retry the upload later." });
const cancelled = () => new TRPCError({ code: "CLIENT_CLOSED_REQUEST", message: "Upload request was cancelled." });
const infected = () => new TRPCError({ code: "BAD_REQUEST", message: "This document was rejected by security scanning. Upload a clean original document." });
type Health = { engine: string; signatureAt: number; signatureVersion: number };
type Job = { id: string; hash: string; bytes: number; finish: (error?: TRPCError) => void };
type Worker = { id: string; socket: WebSocket; nonce: string; seen: number; ready: boolean; health?: Health; job?: Job; window: number; messages: number };
export type RemoteScannerOptions = {
  isProduction?: boolean;
  publicOrigin?: string;
  tokens?: Record<string, string>;
  expectedEngine?: string;
  heartbeatMs?: number;
};

export class RemoteScannerBroker {
  private workers = new Map<string, Worker>();
  private stopped = false;
  private heartbeat: ReturnType<typeof setInterval>;
  readonly expectedEngine: string;
  readonly heartbeatMs: number;
  constructor(options: Pick<RemoteScannerOptions, "expectedEngine" | "heartbeatMs"> = {}) {
    this.expectedEngine = options.expectedEngine || "1.5.4";
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    if (!/^\d+\.\d+\.\d+$/.test(this.expectedEngine)) throw new Error("Invalid scanner engine pin");
    this.heartbeat = setInterval(() => {
      for (const worker of this.workers.values()) {
        if (Date.now() - worker.seen > this.heartbeatMs * 3 || (worker.health && !this.validHealth(worker.health))) this.remove(worker);
      }
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }
  private validHealth(value: unknown): value is Health {
    const h = value as Health;
    return !!h && h.engine === this.expectedEngine && Number.isSafeInteger(h.signatureVersion) && h.signatureVersion > 0 &&
      Number.isSafeInteger(h.signatureAt) && Date.now() - h.signatureAt <= MAX_SIGNATURE_AGE_MS && h.signatureAt - Date.now() <= 300_000;
  }
  hasWorker(id: string) { return this.workers.has(id); }
  status() { return { connected: this.workers.size, available: [...this.workers.values()].filter(w => this.available(w)).length, active: [...this.workers.values()].filter(w => !!w.job).length }; }
  private available(worker: Worker) {
    return worker.ready && !worker.job && worker.socket.readyState === WebSocket.OPEN && Date.now() - worker.seen <= this.heartbeatMs * 3 && this.validHealth(worker.health);
  }
  private remove(worker: Worker) {
    if (this.workers.get(worker.id) !== worker) return;
    this.workers.delete(worker.id);
    worker.ready = false;
    worker.job?.finish(unavailable());
    worker.socket.terminate();
  }
  add(id: string, socket: WebSocket) {
    if (this.stopped || this.workers.size >= 2 || this.workers.has(id) || !workerIdPattern.test(id)) { socket.terminate(); return; }
    const worker: Worker = { id, socket, nonce: randomBytes(32).toString("hex"), seen: Date.now(), ready: false, window: Date.now(), messages: 0 };
    this.workers.set(id, worker);
    socket.on("error", () => this.remove(worker));
    socket.on("close", () => this.remove(worker));
    socket.on("message", (raw: RawData, binary: boolean) => {
      try {
        const frame = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
        if (binary || frame.byteLength > CONTROL_BYTES) { this.remove(worker); return; }
        if (Date.now() - worker.window > 1000) { worker.window = Date.now(); worker.messages = 0; }
        if (++worker.messages > 10) { this.remove(worker); return; }
        const message = JSON.parse(frame.toString());
        if (!message || message.nonce !== worker.nonce) { this.remove(worker); return; }
        if (message.type === "health") {
          if (message.ready !== true || !this.validHealth(message.health)) { this.remove(worker); return; }
          worker.health = message.health;
          worker.seen = Date.now();
          worker.ready = true;
          return;
        }
        const job = worker.job;
        if (message.type !== "result" || !job || message.id !== job.id || message.hash !== job.hash || message.bytes !== job.bytes) {
          this.remove(worker); return;
        }
        // A bound malware verdict remains terminal even if definitions became
        // stale during the scan. Never downgrade it to an unavailable retry.
        if (message.verdict === "infected") { job.finish(infected()); return; }
        if (!this.validHealth(message.health)) { this.remove(worker); return; }
        worker.health = message.health;
        worker.seen = Date.now();
        if (message.verdict === "clean") job.finish();
        else this.remove(worker);
      } catch { this.remove(worker); }
    });
    socket.send(JSON.stringify({ type: "hello", protocol: 1, nonce: worker.nonce, heartbeatMs: this.heartbeatMs, maxBytes: REMOTE_SCAN_MAX_BYTES, engine: this.expectedEngine }), error => { if (error) this.remove(worker); });
  }
  async scan(data: Buffer, signal?: AbortSignal, timeoutMs = 15_000): Promise<{ status: "clean"; scanner: "clamav" }> {
    if (signal?.aborted) throw cancelled();
    if (!data.length || data.length > REMOTE_SCAN_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Document size is outside the security scanner limits." });
    if (this.stopped) throw unavailable();
    const deadline = Date.now() + Math.max(25, Math.min(30_000, timeoutMs));
    const hash = createHash("sha256").update(data).digest("hex");
    const tried = new Set<string>();
    for (let count = 0; count < 2; count++) {
      if (signal?.aborted) throw cancelled();
      const worker = [...this.workers.values()].find(w => !tried.has(w.id) && this.available(w));
      const remaining = deadline - Date.now();
      if (!worker || remaining <= 0) throw unavailable();
      tried.add(worker.id);
      const attemptMs = count === 0 && this.status().available > 1 ? Math.ceil(remaining / 2) : remaining;
      try {
        await this.attempt(worker, data, hash, signal, attemptMs);
        if (signal?.aborted) throw cancelled();
        return { status: "clean", scanner: "clamav" };
      } catch (error) {
        // Malware and cancellation are terminal. Only unavailable workers may fail over.
        if (!(error instanceof TRPCError) || error.code !== "SERVICE_UNAVAILABLE") throw error;
      }
    }
    throw unavailable();
  }
  private attempt(worker: Worker, data: Buffer, hash: string, signal: AbortSignal | undefined, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const abort = () => { finish(cancelled()); this.remove(worker); };
      const finish = (error?: TRPCError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.job = undefined;
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => { finish(unavailable()); this.remove(worker); }, timeoutMs);
      const job: Job = { id: randomBytes(32).toString("hex"), hash, bytes: data.length, finish };
      worker.job = job;
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      if (worker.socket.bufferedAmount > CONTROL_BYTES) { this.remove(worker); return; }
      worker.socket.send(JSON.stringify({ type: "scan", nonce: worker.nonce, id: job.id, hash, bytes: data.length, timeoutMs }), error => { if (error) this.remove(worker); });
      // One bounded binary message, never a base64 expansion or filename/path.
      worker.socket.send(data, { binary: true, compress: false }, error => { if (error) this.remove(worker); });
    });
  }
  close() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    for (const worker of [...this.workers.values()]) this.remove(worker);
  }
}

let activeBroker: RemoteScannerBroker | undefined;
export function scanWithRemoteWorker(data: Buffer, signal?: AbortSignal, timeoutMs?: number) {
  if (!activeBroker) return Promise.reject(unavailable());
  return activeBroker.scan(data, signal, timeoutMs);
}
/** Intended for authenticated operator diagnostics only. */
export function remoteScannerStatus() { return activeBroker?.status() ?? { connected: 0, available: 0, active: 0 }; }

export function attachRemoteScanner(server: Server, options: RemoteScannerOptions = {}): () => void {
  if (!options.tokens && process.env.UPLOAD_SCANNER_MODE !== "remote") return () => {};
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  let tokens: Record<string, string>;
  try { tokens = options.tokens ?? JSON.parse(process.env.SCANNER_WORKER_TOKENS || "{}"); }
  catch { throw new Error("Invalid scanner worker configuration"); }
  if (!tokens || Array.isArray(tokens) || Object.keys(tokens).length < 1 || Object.keys(tokens).length > 2 ||
      Object.entries(tokens).some(([id, token]) => !workerIdPattern.test(id) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) || new Set(Object.values(tokens)).size !== Object.keys(tokens).length) throw new Error("Invalid scanner worker configuration");
  const tokenHashes = Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, createHash("sha256").update(token).digest()]));
  const origin = options.publicOrigin ?? process.env.SCANNER_PUBLIC_ORIGIN;
  let expectedOrigin: URL | undefined;
  if (origin) {
    try { expectedOrigin = new URL(origin); } catch { throw new Error("Invalid scanner public origin"); }
    if (expectedOrigin.protocol !== "https:" || expectedOrigin.username || expectedOrigin.password || expectedOrigin.pathname !== "/" || expectedOrigin.search || expectedOrigin.hash || expectedOrigin.port) throw new Error("Invalid scanner public origin");
  }
  if (isProduction && !expectedOrigin) throw new Error("Scanner requires an explicit HTTPS public origin");
  const broker = new RemoteScannerBroker({ ...options, expectedEngine: options.expectedEngine ?? process.env.SCANNER_EXPECTED_ENGINE });
  activeBroker = broker;
  const wss = new WebSocketServer({ noServer: true, maxPayload: CONTROL_BYTES, perMessageDeflate: false, clientTracking: false });
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url?.split("?")[0] !== REMOTE_SCANNER_PATH) {
      // Installing an upgrade listener disables Node's default rejection. Close
      // unmatched production upgrades; Vite owns its separate development socket.
      if (isProduction) socket.destroy();
      return;
    }
    const reject = () => { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); socket.destroy(); };
    const authorization = request.headers.authorization;
    const id = request.headers["x-scanner-worker"];
    const tls = !!(request.socket as typeof request.socket & { encrypted?: boolean }).encrypted || request.headers["x-forwarded-proto"] === "https";
    if (request.url !== REMOTE_SCANNER_PATH || request.headers.origin || request.headers.cookie || request.headers["sec-websocket-protocol"] ||
        typeof id !== "string" || !Object.hasOwn(tokenHashes, id) || typeof authorization !== "string" || !/^Bearer [a-f0-9]{64}$/.test(authorization) ||
        !timingSafeEqual(createHash("sha256").update(authorization.slice(7)).digest(), tokenHashes[id]) || broker.hasWorker(id) ||
        (isProduction && (!tls || request.headers.host !== expectedOrigin!.host))) { reject(); return; }
    wss.handleUpgrade(request, socket, head, ws => broker.add(id, ws));
  };
  server.on("upgrade", upgrade);
  return () => { server.off("upgrade", upgrade); broker.close(); wss.close(); if (activeBroker === broker) activeBroker = undefined; };
}
