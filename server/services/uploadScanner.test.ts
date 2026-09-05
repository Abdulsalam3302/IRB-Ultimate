import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SCANNED_UPLOAD_BYTES, scanUploadedFile, scanWithClamAv } from "./uploadScanner";

const runtime = vi.hoisted(() => ({ isProduction: false }));
vi.mock("../_core/env", () => ({ ENV: runtime }));
const servers: Server[] = [];
const clients = new Set<Socket>();

type Received = { command: string; content: Buffer; chunks: number[] };
async function daemon(respond: (socket: Socket, received: Received) => void) {
  const server = createServer(socket => {
    clients.add(socket);
    socket.once("close", () => clients.delete(socket));
    socket.on("error", () => {});
    let pending = Buffer.alloc(0);
    let command: string | undefined;
    let chunks: Buffer[] = [];
    let lengths: number[] = [];
    let complete = false;
    socket.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      if (command === undefined) {
        const end = pending.indexOf(0);
        if (end < 0) return;
        command = pending.subarray(0, end).toString("ascii");
        pending = pending.subarray(end + 1);
      }
      while (!complete && pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (pending.length < 4 + length) return;
        if (!length) {
          complete = true;
          respond(socket, { command, content: Buffer.concat(chunks), chunks: lengths });
          return;
        }
        lengths.push(length);
        chunks.push(pending.subarray(4, 4 + length));
        pending = pending.subarray(4 + length);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { host: "127.0.0.1", port: (server.address() as { port: number }).port };
}

afterEach(async () => {
  for (const client of clients) client.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  clients.clear();
  runtime.isProduction = false;
  vi.unstubAllEnvs();
});

describe("ClamAV INSTREAM transport", () => {
  it("keeps an early complete FOUND terminal before a backpressured upload finishes", async () => {
    const server = createServer(socket => { clients.add(socket); socket.on("error", () => {}); socket.once("close", () => clients.delete(socket)); socket.end("stream: Synthetic.Early FOUND\0"); });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const options = { host: "127.0.0.1", port: (server.address() as { port: number }).port };
    await expect(scanWithClamAv(Buffer.alloc(MAX_SCANNED_UPLOAD_BYTES, "synthetic"), options)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("streams exact synthetic bytes in bounded frames and accepts a split complete OK response", async () => {
    const content = Buffer.alloc(140_000, "synthetic-document");
    let received: Received | undefined;
    const options = await daemon((socket, result) => {
      received = result;
      socket.write("stream:");
      setTimeout(() => socket.end(" OK\0"), 5);
    });
    await expect(scanWithClamAv(content, options)).resolves.toEqual({ status: "clean", scanner: "clamav" });
    expect(received?.command).toBe("zINSTREAM");
    expect(received?.content).toEqual(content);
    expect(received?.chunks).toEqual([65536, 65536, 8928]);
  });

  it("rejects FOUND without exposing daemon-provided signature text", async () => {
    const options = await daemon(socket => socket.end("stream: Synthetic.Malware.Signature FOUND\0"));
    const scan = scanWithClamAv(Buffer.from("synthetic"), options);
    await expect(scan).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(scan).rejects.not.toThrow("Synthetic.Malware.Signature");
  });

  it.each([
    "stream: OK", "OK\0", "stream: OK\0stream: Other FOUND\0", "stream: inaccessible ERROR\0", "INSTREAM size limit exceeded. ERROR\0", "stream: UNKNOWN\0", "stream: OK\n",
  ])("fails closed on malformed, truncated or ambiguous verdict %j", async verdict => {
    const options = await daemon(socket => socket.end(verdict));
    await expect(scanWithClamAv(Buffer.from("synthetic"), options)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("bounds daemon responses and scan deadlines", async () => {
    const oversized = await daemon(socket => socket.end(Buffer.alloc(4097, "x")));
    await expect(scanWithClamAv(Buffer.from("synthetic"), oversized)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const hanging = await daemon(() => {});
    const started = Date.now();
    await expect(scanWithClamAv(Buffer.from("synthetic"), { ...hanging, timeoutMs: 30 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("rejects socket resets and rejects OK until the complete response closes", async () => {
    const reset = await daemon(socket => socket.destroy());
    await expect(scanWithClamAv(Buffer.from("synthetic"), reset)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const incomplete = await daemon(socket => socket.write("stream: OK\0"));
    await expect(scanWithClamAv(Buffer.from("synthetic"), { ...incomplete, timeoutMs: 30 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("cancels a scan when its upload request is aborted", async () => {
    const options = await daemon(() => {});
    const controller = new AbortController();
    const pending = scanWithClamAv(Buffer.from("synthetic"), { ...options, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CLIENT_CLOSED_REQUEST" });
  });

  it("rejects oversized uploads before opening a socket and releases capacity after timeout", async () => {
    await expect(scanWithClamAv(Buffer.alloc(MAX_SCANNED_UPLOAD_BYTES + 1), { host: "127.0.0.1", port: 1 })).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    vi.stubEnv("CLAMAV_MAX_CONCURRENT", "1");
    const options = await daemon(() => {});
    const first = scanWithClamAv(Buffer.from("synthetic"), { ...options, timeoutMs: 30 });
    await expect(scanWithClamAv(Buffer.from("synthetic"), options)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(first).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const clean = await daemon(socket => socket.end("stream: OK\0"));
    await expect(scanWithClamAv(Buffer.from("synthetic"), clean)).resolves.toMatchObject({ status: "clean" });
  });
});

describe("upload scanner deployment policy", () => {
  it("requires a configured daemon by default in production", async () => {
    runtime.isProduction = true;
    vi.stubEnv("CLAMAV_HOST", "");
    vi.stubEnv("UPLOAD_SCAN_REQUIRED", "");
    await expect(scanUploadedFile(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("permits only an explicit controlled-pilot exception in production", async () => {
    runtime.isProduction = true;
    vi.stubEnv("CLAMAV_HOST", "");
    vi.stubEnv("UPLOAD_SCAN_REQUIRED", "false");
    await expect(scanUploadedFile(Buffer.from("synthetic"))).resolves.toEqual({ status: "skipped", scanner: null });
  });
  it("does not treat invalid policy text as an exception", async () => {
    runtime.isProduction = true;
    vi.stubEnv("CLAMAV_HOST", "");
    vi.stubEnv("UPLOAD_SCAN_REQUIRED", "FALSE");
    await expect(scanUploadedFile(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("honors required scanning in development and rejects invalid configured ports", async () => {
    vi.stubEnv("UPLOAD_SCAN_REQUIRED", "true");
    vi.stubEnv("CLAMAV_HOST", "");
    await expect(scanUploadedFile(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    vi.stubEnv("CLAMAV_HOST", "127.0.0.1");
    vi.stubEnv("CLAMAV_PORT", "garbage");
    await expect(scanUploadedFile(Buffer.from("synthetic"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
