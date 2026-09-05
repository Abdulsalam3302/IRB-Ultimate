import { createConnection } from "node:net";
import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { boundedInt } from "../_core/limits";
import { scanWithRemoteWorker } from "./remoteScanner";

export const MAX_SCANNED_UPLOAD_BYTES = 15 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 4096;
let activeScans = 0;
const scanningUsers = new Set<number>();

export type UploadScanResult = { status: "clean"; scanner: "clamav" } | { status: "skipped"; scanner: null };
export type ClamAvOptions = { host: string; port: number; timeoutMs?: number; signal?: AbortSignal };

function unavailable(): TRPCError {
  return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Document security scanning is temporarily unavailable. Please retry the upload later." });
}
function aborted(): TRPCError {
  return new TRPCError({ code: "CLIENT_CLOSED_REQUEST", message: "Upload request was cancelled." });
}

/**
 * One clamd INSTREAM request per socket. Files are streamed in bounded chunks;
 * no filesystem paths or shell commands are sent. Clean requires complete input
 * and one closed response. A complete positive verdict is terminal even early.
 * Protocol: https://docs.clamav.net/manual/Usage/ClamdProtocol.html
 */
export async function scanWithClamAv(data: Buffer, options: ClamAvOptions): Promise<{ status: "clean"; scanner: "clamav" }> {
  if (!data.length || data.length > MAX_SCANNED_UPLOAD_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Document size is outside the security scanner limits." });
  if (options.signal?.aborted) throw aborted();
  if (!options.host || options.host.length > 253 || /[\s/\\\0]/.test(options.host) || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw unavailable();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(25, Math.min(30_000, options.timeoutMs!)) : 15_000;
  const concurrency = boundedInt(process.env.CLAMAV_MAX_CONCURRENT, 4, 1, 32);
  if (activeScans >= concurrency) throw unavailable();
  activeScans++;
  try {
    return await new Promise<{ status: "clean"; scanner: "clamav" }>((resolve, reject) => {
      const socket = createConnection({ host: options.host, port: options.port });
      let settled = false;
      let reply = Buffer.alloc(0);
      let offset = 0;
      let allInputSent = false;
      let inputQueued = false;
      const finish = (error?: TRPCError) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        options.signal?.removeEventListener("abort", onAbort);
        socket.destroy();
        if (error) reject(error);
        else resolve({ status: "clean", scanner: "clamav" });
      };
      const onAbort = () => finish(aborted());
      const deadline = setTimeout(() => finish(unavailable()), timeoutMs);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      // Covers cancellation between the preflight check and listener install.
      if (options.signal?.aborted) { finish(aborted()); return; }

      const pump = () => {
        if (settled || inputQueued) return;
        while (offset < data.length) {
          const length = Math.min(CHUNK_BYTES, data.length - offset);
          const header = Buffer.allocUnsafe(4);
          header.writeUInt32BE(length);
          socket.cork();
          socket.write(header);
          const writable = socket.write(data.subarray(offset, offset + length));
          socket.uncork();
          offset += length;
          if (!writable) { socket.once("drain", pump); return; }
        }
        inputQueued = true;
        socket.write(Buffer.alloc(4), () => { allInputSent = true; });
      };
      socket.once("connect", () => {
        socket.setNoDelay(true);
        socket.write(Buffer.from("zINSTREAM\0", "ascii"));
        pump();
      });
      socket.on("data", (chunk: Buffer) => {
        if (settled) return;
        reply = Buffer.concat([reply, chunk.subarray(0, MAX_REPLY_BYTES - reply.length)]);
        if (/^stream: [^\x00-\x1f\x7f]{1,512} FOUND\0/.test(reply.toString("utf8"))) {
          finish(new TRPCError({ code: "BAD_REQUEST", message: "This document was rejected by security scanning. Upload a clean original document." }));
          return;
        }
        if (reply.length >= MAX_REPLY_BYTES) { finish(unavailable()); return; }
      });
      socket.once("end", () => {
        if (settled) return;
        const text = reply.toString("utf8");
        if (/^stream: [^\x00-\x1f\x7f]{1,512} FOUND\0/.test(text)) {
          finish(new TRPCError({ code: "BAD_REQUEST", message: "This document was rejected by security scanning. Upload a clean original document." }));
        } else if (allInputSent && text === "stream: OK\0") finish();
        else finish(unavailable());
      });
      socket.once("error", () => finish(unavailable()));
      socket.once("close", () => { if (!settled) finish(unavailable()); });
    });
  } finally {
    activeScans--;
  }
}

/** Production fails closed unless the operator explicitly selects a controlled pilot exception. */
export async function scanUploadedFile(data: Buffer, signal?: AbortSignal, userId?: number): Promise<UploadScanResult> {
  if (signal?.aborted) throw aborted();
  const policy = process.env.UPLOAD_SCAN_REQUIRED;
  const required = ENV.isProduction ? policy !== "false" : policy === "true";
  const mode = process.env.UPLOAD_SCANNER_MODE || "clamav";
  if (!["clamav", "remote"].includes(mode)) throw unavailable();
  const host = process.env.CLAMAV_HOST?.trim();
  if (policy === "false") return { status: "skipped", scanner: null };
  if (!host && mode !== "remote") {
    if (required) throw unavailable();
    return { status: "skipped", scanner: null };
  }
  // Invalid configured ports must not silently redirect scans to another port.
  const rawPort = process.env.CLAMAV_PORT || "3310";
  if (!/^\d+$/.test(rawPort)) throw unavailable();
  if (userId !== undefined && scanningUsers.has(userId)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Another document for this account is still being scanned. Retry when it finishes." });
  if (userId !== undefined) scanningUsers.add(userId);
  try {
    if (mode === "remote") {
      const timeoutMs = boundedInt(process.env.CLAMAV_SCAN_TIMEOUT_MS, 15_000, 1000, 30_000);
      const deadline = Date.now() + timeoutMs;
      try {
        return await scanWithRemoteWorker(data, signal, timeoutMs);
      } catch (error) {
        // An explicitly configured private daemon is optional free failover.
        // No malware verdict or client cancellation can enter this path.
        if (!(error instanceof TRPCError) || error.code !== "SERVICE_UNAVAILABLE" || !process.env.CLAMAV_FALLBACK_HOST?.trim()) throw error;
        if (signal?.aborted) throw aborted();
        const remainingMs = deadline - Date.now();
        if (remainingMs < 25) throw unavailable();
        return await scanWithClamAv(data, {
          host: process.env.CLAMAV_FALLBACK_HOST.trim(),
          port: Number(rawPort),
          timeoutMs: remainingMs, signal,
        });
      }
    }
    return await scanWithClamAv(data, {
    host: host!,
    port: Number(rawPort),
    timeoutMs: boundedInt(process.env.CLAMAV_SCAN_TIMEOUT_MS, 15_000, 1000, 30_000),
    signal,
    });
  } finally {
    if (userId !== undefined) scanningUsers.delete(userId);
  }
}
