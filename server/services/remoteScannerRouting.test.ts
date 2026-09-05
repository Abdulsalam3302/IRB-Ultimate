import { createServer, type Server, type Socket } from "node:net";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const remote = vi.hoisted(() => vi.fn());
vi.mock("./remoteScanner", () => ({ scanWithRemoteWorker: remote }));
vi.mock("../_core/env", () => ({ ENV: { isProduction: true } }));
import { scanUploadedFile } from "./uploadScanner";
const servers: Server[] = [], sockets = new Set<Socket>();
beforeEach(() => {
  remote.mockReset();
  vi.stubEnv("UPLOAD_SCANNER_MODE", "remote"); vi.stubEnv("UPLOAD_SCAN_REQUIRED", "true");
  vi.stubEnv("CLAMAV_FALLBACK_HOST", ""); vi.stubEnv("CLAMAV_PORT", "3310");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});
async function fallback() {
  let connections = 0;
  const server = createServer(socket => {
    connections++; sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    let pending = Buffer.alloc(0), command = false;
    socket.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      if (!command) { const end = pending.indexOf(0); if (end < 0) return; pending = pending.subarray(end + 1); command = true; }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0); if (pending.length < length + 4) return;
        pending = pending.subarray(length + 4);
        if (!length) { socket.end("stream: OK\0"); return; }
      }
    });
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("CLAMAV_FALLBACK_HOST", "127.0.0.1"); vi.stubEnv("CLAMAV_PORT", String((server.address() as { port: number }).port));
  return () => connections;
}
describe("upload routing to free private workers", () => {
  it("uses a clean remote result without a TCP fallback", async () => {
    const calls = await fallback(); remote.mockResolvedValue({ status: "clean", scanner: "clamav" });
    await expect(scanUploadedFile(Buffer.from("synthetic"), undefined, 1)).resolves.toMatchObject({ status: "clean" });
    expect(calls()).toBe(0);
  });
  it("uses an explicitly configured private fallback only on unavailable", async () => {
    const calls = await fallback(); remote.mockRejectedValue(new TRPCError({ code: "SERVICE_UNAVAILABLE" }));
    await expect(scanUploadedFile(Buffer.from("synthetic"), undefined, 1)).resolves.toMatchObject({ status: "clean" });
    expect(calls()).toBe(1);
  });
  it.each(["BAD_REQUEST", "CLIENT_CLOSED_REQUEST"] as const)("never retries terminal %s through the clean fallback", async code => {
    const calls = await fallback(); remote.mockRejectedValue(new TRPCError({ code }));
    await expect(scanUploadedFile(Buffer.from("synthetic"), undefined, 1)).rejects.toMatchObject({ code });
    expect(calls()).toBe(0);
  });
  it("keeps account concurrency protection around remote scans", async () => {
    let finish: (value: unknown) => void = () => {};
    remote.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = scanUploadedFile(Buffer.from("first"), undefined, 1);
    await expect(scanUploadedFile(Buffer.from("second"), undefined, 1)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    finish({ status: "clean", scanner: "clamav" }); await pending;
    expect(remote).toHaveBeenCalledTimes(1);
  });
});
