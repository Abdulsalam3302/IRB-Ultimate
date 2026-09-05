import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ scan: vi.fn(), storage: vi.fn(), metadata: vi.fn(), audit: vi.fn() }));
vi.mock("./services/uploadScanner", () => ({ scanUploadedFile: mocks.scan }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./db", () => ({ getUserUploadUsage: vi.fn(async () => ({ count: 0, bytes: 0 })), addFileUpload: mocks.metadata, addAuditLog: mocks.audit }));
import { appRouter } from "./routers";

function context() {
  const req = Object.assign(new EventEmitter(), { headers: {}, protocol: "http", aborted: false });
  const res = Object.assign(new EventEmitter(), { destroyed: false });
  return { user: { id: 123, role: "user", openId: "synthetic-upload-user" }, req, res } as unknown as TrpcContext;
}
const input = { fileName: "synthetic.pdf", contentType: "application/pdf", fileData: Buffer.from("%PDF-1.7 synthetic test document").toString("base64") };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.storage.mockResolvedValue({ key: "123/synthetic.pdf", url: "/uploads/123/synthetic.pdf" });
  mocks.metadata.mockResolvedValue(999);
});

describe("upload scan occurs before persistence", () => {
  it.each(["BAD_REQUEST", "SERVICE_UNAVAILABLE"] as const)("does not write storage or metadata after scanner %s", async code => {
    mocks.scan.mockRejectedValue(new TRPCError({ code, message: "Synthetic scan denial" }));
    await expect(appRouter.createCaller(context()).application.uploadFile(input)).rejects.toMatchObject({ code });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it("stores only after a clean verdict and records scan provenance", async () => {
    const order: string[] = [];
    mocks.scan.mockImplementation(async () => { order.push("scan"); return { status: "clean", scanner: "clamav" }; });
    mocks.storage.mockImplementation(async () => { order.push("storage"); return { key: "123/synthetic.pdf" }; });
    const result = await appRouter.createCaller(context()).application.uploadFile(input);
    expect(order).toEqual(["scan", "storage"]);
    expect(result).toMatchObject({ url: "/api/irb/files/999", scanStatus: "clean" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "file_upload_stored", details: expect.stringContaining("malware scan clean") }));
  });

  it("cancels an active scan when the requesting connection closes", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    mocks.scan.mockImplementation((_bytes: Buffer, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new TRPCError({ code: "CLIENT_CLOSED_REQUEST" })), { once: true });
      markStarted();
    }));
    const ctx = context();
    const result = appRouter.createCaller(ctx).application.uploadFile(input);
    await started;
    ctx.res.emit("close");
    await expect(result).rejects.toMatchObject({ code: "CLIENT_CLOSED_REQUEST" });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(ctx.req.listenerCount("aborted")).toBe(0);
    expect(ctx.res.listenerCount("close")).toBe(0);
  });
});
