import { createServer, type Server } from "node:http";
import { createConnection } from "node:net";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { attachRemoteScanner, REMOTE_SCANNER_PATH, remoteScannerStatus, scanWithRemoteWorker, type RemoteScannerOptions } from "./remoteScanner";

const token = "a1".repeat(32), fallbackToken = "b2".repeat(32);
const shutdown: Array<() => void> = [], servers: Server[] = [], sockets: WebSocket[] = [];
const health = () => ({ engine: "1.5.4", signatureAt: Date.now(), signatureVersion: 28114 });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(test: () => boolean) { for (let i = 0; i < 100; i++) { if (test()) return; await delay(5); } throw new Error("Synthetic worker did not reach expected state"); }
async function setup(options: RemoteScannerOptions = {}) {
  const server = createServer(); servers.push(server);
  // Ordinary protocol tests need scheduling headroom when Vitest runs alongside
  // DB/PDF suites. Only the heartbeat-expiry test deliberately uses a short TTL.
  shutdown.push(attachRemoteScanner(server, { tokens: { primary: token, fallback: fallbackToken }, isProduction: false, heartbeatMs: 1000, ...options }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.address() as { port: number }).port}${REMOTE_SCANNER_PATH}`;
}
async function worker(url: string, options: { id?: string; token?: string; onScan?: (job: any, bytes: Buffer, reply: (patch?: Record<string, unknown>) => void, socket: WebSocket) => void; health?: unknown; headers?: Record<string, string>; heartbeat?: boolean } = {}) {
  const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${options.token || token}`, "X-Scanner-Worker": options.id || "primary", ...options.headers } });
  sockets.push(socket);
  let nonce: string, pending: any, beats: ReturnType<typeof setInterval>;
  socket.on("error", () => {});
  socket.on("close", () => clearInterval(beats));
  socket.on("message", (raw, binary) => {
    if (!binary) {
      const message = JSON.parse(raw.toString());
      if (message.type === "hello") {
        nonce = message.nonce;
        const sendHealth = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "health", nonce, ready: true, health: options.health ?? health() })); };
        sendHealth(); if (options.heartbeat !== false) beats = setInterval(sendHealth, message.heartbeatMs);
      } else pending = message;
      return;
    }
    const reply = (patch = {}) => socket.send(JSON.stringify({ type: "result", nonce, id: pending.id, hash: pending.hash, bytes: pending.bytes, verdict: "clean", health: health(), ...patch }));
    options.onScan ? options.onScan(pending, raw as Buffer, reply, socket) : reply();
  });
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
}
afterEach(async () => {
  for (const close of shutdown.splice(0)) close();
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe("private outbound scan broker", () => {
  it("requires an authenticated ready worker and binds exact binary bytes to a clean verdict", async () => {
    const url = await setup();
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const content = Buffer.alloc(140000, "synthetic");
    await worker(url, { onScan(job, bytes, reply) { expect(bytes).toEqual(content); expect(job.bytes).toBe(content.length); reply(); } });
    await until(() => remoteScannerStatus().available === 1);
    await expect(scanWithRemoteWorker(content)).resolves.toEqual({ status: "clean", scanner: "clamav" });
    expect(remoteScannerStatus().active).toBe(0);
  });
  it.each([{ token: "ff".repeat(32) }, { headers: { Origin: "https://attacker.invalid" } }, { headers: { Cookie: "session=synthetic" } }])("rejects unauthorized/browser upgrades without a registered worker", async options => {
    const url = await setup();
    await expect(worker(url, options)).rejects.toThrow();
    expect(remoteScannerStatus().connected).toBe(0);
  });
  it("requires production TLS and the exact configured backend host", async () => {
    const url = await setup({ isProduction: true, publicOrigin: "https://api.example.test" });
    await expect(worker(url)).rejects.toThrow();
    await expect(worker(url, { headers: { "X-Forwarded-Proto": "https" } })).rejects.toThrow();
    expect(remoteScannerStatus().connected).toBe(0);
  });
  it("closes unmatched raw production upgrades instead of retaining an unauthenticated socket", async () => {
    const url = new URL(await setup({ isProduction: true, publicOrigin: "https://api.example.test" }));
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: Number(url.port) });
      const timer = setTimeout(() => { socket.destroy(); reject(new Error("Unmatched upgrade remained open")); }, 500);
      socket.once("connect", () => socket.write("GET /unmatched HTTP/1.1\r\nHost: api.example.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"));
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      socket.once("error", () => {});
    });
  });
  it("evicts a worker whose heartbeat stops", async () => {
    const url = await setup({ heartbeatMs: 50 }); await worker(url, { heartbeat: false });
    await until(() => remoteScannerStatus().available === 1);
    await until(() => remoteScannerStatus().connected === 0);
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("rejects a duplicate worker session without replacing the healthy one", async () => {
    const url = await setup(); await worker(url);
    await until(() => remoteScannerStatus().available === 1);
    await expect(worker(url)).rejects.toThrow();
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).resolves.toMatchObject({ status: "clean" });
  });
  it.each([
    { ...health(), engine: "1.0.0" },
    { ...health(), signatureAt: Date.now() - 49 * 3600_000 },
    { ...health(), signatureAt: Date.now() + 3600_000 },
  ])("refuses wrong engine or stale/future definitions", async h => {
    const url = await setup(); const ws = await worker(url, { health: h });
    await until(() => ws.readyState === WebSocket.CLOSED);
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("fails over only when a primary worker is unavailable", async () => {
    const url = await setup(); let fallbackCalls = 0;
    await worker(url, { onScan(_job, _bytes, _reply, ws) { ws.terminate(); } });
    await worker(url, { id: "fallback", token: fallbackToken, onScan(_job, _bytes, reply) { fallbackCalls++; reply(); } });
    await until(() => remoteScannerStatus().available === 2);
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).resolves.toMatchObject({ status: "clean" });
    expect(fallbackCalls).toBe(1);
  });
  it("never retries a bound malware verdict, including definitions becoming stale after detection", async () => {
    const url = await setup(); let fallbackCalls = 0;
    await worker(url, { onScan(_job, _bytes, reply) { reply({ verdict: "infected", health: { ...health(), signatureAt: 1 } }); } });
    await worker(url, { id: "fallback", token: fallbackToken, onScan(_job, _bytes, reply) { fallbackCalls++; reply(); } });
    await until(() => remoteScannerStatus().available === 2);
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fallbackCalls).toBe(0);
  });
  it.each([{ hash: "00".repeat(32) }, { id: "00".repeat(32) }, { nonce: "00".repeat(32) }, { bytes: 1 }, { verdict: "unknown" }])("fails closed on mismatched/unknown results", async patch => {
    const url = await setup(); await worker(url, { onScan(_job, _bytes, reply) { reply(patch); } });
    await until(() => remoteScannerStatus().available === 1);
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("does not let a replayed prior result complete another upload", async () => {
    const url = await setup(); let first: any, count = 0;
    await worker(url, { onScan(job, _bytes, reply) { if (!count++) { first = { id: job.id, hash: job.hash, bytes: job.bytes }; reply(); } else reply(first); } });
    await until(() => remoteScannerStatus().available === 1);
    await scanWithRemoteWorker(Buffer.from("first"));
    await expect(scanWithRemoteWorker(Buffer.from("second"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("bounds scan deadlines, cancels without failover and releases worker capacity", async () => {
    const url = await setup(); await worker(url, { onScan() {} });
    await until(() => remoteScannerStatus().available === 1);
    const controller = new AbortController(), pending = scanWithRemoteWorker(Buffer.from("synthetic"), controller.signal, 1000);
    await expect(scanWithRemoteWorker(Buffer.from("excess"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CLIENT_CLOSED_REQUEST" });
    expect(remoteScannerStatus().active).toBe(0);
    await worker(url); await until(() => remoteScannerStatus().available === 1);
    await expect(scanWithRemoteWorker(Buffer.from("recovered"))).resolves.toMatchObject({ status: "clean" });
  });
  it("rejects oversized data without dispatching any job", async () => {
    await setup();
    await expect(scanWithRemoteWorker(Buffer.alloc(15 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
  it("times out silent scans and shuts down active work fail-closed", async () => {
    const url = await setup(); await worker(url, { onScan() {} });
    await until(() => remoteScannerStatus().available === 1);
    const started = Date.now();
    await expect(scanWithRemoteWorker(Buffer.from("synthetic"), undefined, 30)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(Date.now() - started).toBeLessThan(1000);
    await worker(url, { onScan() {} }); await until(() => remoteScannerStatus().available === 1);
    const pending = scanWithRemoteWorker(Buffer.from("synthetic"));
    shutdown[0]();
    await expect(pending).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(remoteScannerStatus().active).toBe(0);
  });
  it("rejects malformed configuration without opening worker access", () => {
    const server = createServer();
    for (const tokens of [{ primary: "short" }, { "../wrong": token }, { primary: token, fallback: token }]) expect(() => attachRemoteScanner(server, { tokens, isProduction: false })).toThrow("configuration");
  });
});
