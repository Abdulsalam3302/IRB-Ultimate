import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { workerConfig, parseEngineHealth, startScannerWorker, scanBytes } from "../../scripts/scanner-worker-core.mjs";
import { attachRemoteScanner, scanWithRemoteWorker, remoteScannerStatus } from "./remoteScanner";
const closures: Array<() => void> = [], servers: Array<Server | HttpServer> = [], sockets = new Set<Socket>();
const token = "a1".repeat(32);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(test: () => boolean) { for (let i = 0; i < 150; i++) { if (test()) return; await delay(10); } throw new Error("Worker did not reach expected state"); }
async function daemon(verdict: string, early = false) {
  const server = createServer(socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket));
    let pending = Buffer.alloc(0), command = "";
    socket.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      if (!command) {
        const end = pending.indexOf(0); if (end < 0) return;
        command = pending.subarray(0, end).toString(); pending = pending.subarray(end + 1);
        if (command === "zPING") { socket.end("PONG\0"); return; }
        if (command === "zVERSION") { socket.end(`ClamAV 1.5.4/28114/${new Date().toUTCString().replace(/^[A-Za-z]{3}, (\d+) ([A-Za-z]{3}) (\d+) (.*) GMT$/, (_match, d, m, y, t) => `${new Date().toUTCString().slice(0, 3)} ${m} ${d} ${t} ${y}`)}\0`); return; }
        if (early && command === "zINSTREAM") { socket.end(verdict); return; }
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0); if (pending.length < 4 + length) return;
        pending = pending.subarray(4 + length);
        if (!length) { socket.end(verdict); return; }
      }
    });
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return { host: "127.0.0.1", port: (server.address() as { port: number }).port, engine: "1.5.4" };
}
afterEach(async () => {
  for (const close of closures.splice(0)) close();
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});
describe("standalone outbound scanner worker", () => {
  it.each(["stream: Synthetic.Early FOUND\0", "stream: Synthetic.Early FOUND\0unexpected trailing diagnostic"])("keeps a complete early positive terminal before all bytes are sent", async response => {
    const server = createServer(socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket)); socket.end(response); });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    await expect(scanBytes(Buffer.alloc(15 * 1024 * 1024, "synthetic"), { host: "127.0.0.1", port: (server.address() as { port: number }).port })).resolves.toBe("infected");
  });
  it.each(["stream: Synthetic.Early FOUND", "stream: Synthetic.\0Early FOUND\0"])("does not turn partial or malformed early positives into a clean verdict", async response => {
    const server = createServer(socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket)); socket.end(response); });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    await expect(scanBytes(Buffer.alloc(140000, "synthetic"), { host: "127.0.0.1", port: (server.address() as { port: number }).port })).rejects.toThrow("SCANNER_UNAVAILABLE");
  });
  it.each(["http://api.example.test", "https://user:secret@api.example.test", "https://api.example.test/path", "https://api.example.test?token=secret", "https://api.example.test:8443"])("rejects unsafe backend URL %s", endpoint => {
    expect(() => workerConfig({ SCANNER_BACKEND_URL: endpoint, SCANNER_WORKER_ID: "primary", SCANNER_WORKER_TOKEN: token })).toThrow();
  });
  it("uses only the exact HTTPS origin and fixed endpoint without credentials in URL", () => {
    const config = workerConfig({ SCANNER_BACKEND_URL: "https://irb.example.test", SCANNER_WORKER_ID: "primary", SCANNER_WORKER_TOKEN: token });
    expect(config.endpoint).toBe("wss://irb.example.test/api/internal/scanner/worker");
    expect(config.endpoint).not.toContain(token);
    expect(() => workerConfig({ SCANNER_BACKEND_URL: "https://irb.example.test", SCANNER_WORKER_ID: "primary", SCANNER_WORKER_TOKEN: token, CLAMAV_HOST: "scanner.thirdparty.example" })).toThrow();
  });
  it("requires the pinned engine with recent signatures", () => {
    const now = Date.UTC(2026, 8, 5, 12);
    expect(parseEngineHealth("ClamAV 1.5.4/28114/Sat Sep 5 10:00:00 2026\0", "1.5.4", now)).toMatchObject({ engine: "1.5.4", signatureVersion: 28114 });
    for (const value of ["ClamAV 1.5.3/28114/Sat Sep 5 10:00:00 2026\0", "ClamAV 1.5.4/28114/Tue Sep 1 10:00:00 2026\0", "ClamAV 1.5.4/28114/Sun Sep 6 10:00:00 2026\0", "ClamAV 1.5.4/28114/unknown\0"]) expect(() => parseEngineHealth(value, "1.5.4", now)).toThrow();
  });
  it.each([["stream: OK\0", "clean"], ["stream: Synthetic.Marker FOUND\0", "infected"]])("parses a complete daemon verdict without exposing signature details", async (response, expected) => {
    const config = await daemon(response);
    await expect(scanBytes(Buffer.from("synthetic"), config)).resolves.toBe(expected);
  });
  it("fails closed on ambiguous daemon output", async () => {
    const config = await daemon("stream: OK\0stream: hidden FOUND\0");
    await expect(scanBytes(Buffer.from("synthetic"), config)).rejects.toThrow("SCANNER_UNAVAILABLE");
  });
  it.each([["stream: OK\0", "clean"], ["stream: Synthetic.Marker FOUND\0", "infected"]])("runs actual WS worker/clamd protocol integration for %s", async (response, expected) => {
    const config = await daemon(response);
    const server = createHttpServer(); servers.push(server);
    closures.push(attachRemoteScanner(server, { isProduction: false, tokens: { primary: token }, heartbeatMs: 100 }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const reports: unknown[] = [];
    closures.push(startScannerWorker({ ...config, endpoint: `ws://127.0.0.1:${port}/api/internal/scanner/worker`, id: "primary", token }, { reconnect: false, report: (state: unknown) => reports.push(state) }));
    await until(() => remoteScannerStatus().available === 1);
    const content = Buffer.from("Synthetic-only private bytes");
    if (expected === "clean") await expect(scanWithRemoteWorker(content)).resolves.toMatchObject({ status: "clean" });
    else await expect(scanWithRemoteWorker(content)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(JSON.stringify(reports)).not.toContain(content.toString());
    expect(JSON.stringify(reports)).not.toContain(token);
  });
  it("clears its received buffer and cancels daemon work when the caller disconnects", async () => {
    const server = createHttpServer(); servers.push(server);
    closures.push(attachRemoteScanner(server, { isProduction: false, tokens: { primary: token }, heartbeatMs: 100 }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    let received: Buffer | undefined, aborted = false;
    const config = { host: "localhost", port: 3310, engine: "1.5.4", endpoint: `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/internal/scanner/worker`, id: "primary", token };
    closures.push(startScannerWorker(config, {
      reconnect: false,
      healthCheck: async () => ({ engine: "1.5.4", signatureAt: Date.now(), signatureVersion: 28114 }),
      scan: async (data: Buffer, _config: unknown, signal: AbortSignal) => {
        received = data;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true }));
      },
    }));
    await until(() => remoteScannerStatus().available === 1);
    const controller = new AbortController(), pending = scanWithRemoteWorker(Buffer.from("Synthetic cancellation fixture"), controller.signal);
    await until(() => !!received);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CLIENT_CLOSED_REQUEST" });
    await until(() => aborted);
    expect(received?.every(byte => byte === 0)).toBe(true);
  });
  it("preserves detected malware if engine health fails immediately after the verdict", async () => {
    const server = createHttpServer(); servers.push(server);
    closures.push(attachRemoteScanner(server, { isProduction: false, tokens: { primary: token }, heartbeatMs: 100 }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    let detected = false;
    const config = { host: "localhost", port: 3310, engine: "1.5.4", endpoint: `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/internal/scanner/worker`, id: "primary", token };
    closures.push(startScannerWorker(config, {
      reconnect: false,
      healthCheck: async () => {
        if (detected) throw new Error("engine unavailable after detection");
        return { engine: "1.5.4", signatureAt: Date.now(), signatureVersion: 28114 };
      },
      scan: async () => { detected = true; return "infected"; },
    }));
    await until(() => remoteScannerStatus().available === 1);
    await expect(scanWithRemoteWorker(Buffer.from("Synthetic terminal verdict"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("never dispatches to a clean fallback after a real early ClamAV positive", async () => {
    const config = await daemon("stream: Synthetic.Early FOUND\0", true);
    const fallbackToken = "b2".repeat(32);
    const server = createHttpServer(); servers.push(server);
    closures.push(attachRemoteScanner(server, { isProduction: false, tokens: { primary: token, fallback: fallbackToken }, heartbeatMs: 100 }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/internal/scanner/worker`;
    closures.push(startScannerWorker({ ...config, endpoint, id: "primary", token }, { reconnect: false }));
    await until(() => remoteScannerStatus().available === 1);
    let fallbackCalls = 0;
    closures.push(startScannerWorker({ ...config, endpoint, id: "fallback", token: fallbackToken }, {
      reconnect: false,
      scan: async () => { fallbackCalls++; return "clean"; },
    }));
    await until(() => remoteScannerStatus().available === 2);
    await expect(scanWithRemoteWorker(Buffer.alloc(15 * 1024 * 1024, "synthetic"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fallbackCalls).toBe(0);
  });
});
