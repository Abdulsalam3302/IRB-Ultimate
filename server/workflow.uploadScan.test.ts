import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { Document, Packer, Paragraph } from "docx";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  scan: vi.fn(),
  storage: vi.fn(),
  metadata: vi.fn(),
  audit: vi.fn(),
  reserve: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("./services/uploadScanner", () => ({ scanUploadedFile: mocks.scan }));
vi.mock("./storage", () => ({ storagePut: mocks.storage, assertStorageBinding: vi.fn() }));
vi.mock("./services/storageDeletion", () => ({ reserveStorageUpload: mocks.reserve, expediteStorageCleanup: mocks.cleanup }));
vi.mock("./db", () => ({
  getUserUploadUsage: vi.fn(async () => ({ count: 0, bytes: 0 })),
  addFileUpload: mocks.metadata,
  addAuditLog: mocks.audit,
}));
import { appRouter } from "./routers";

function context() {
  const req = Object.assign(new EventEmitter(), {
    headers: {},
    protocol: "http",
    aborted: false,
  });
  const res = Object.assign(new EventEmitter(), { destroyed: false });
  return {
    user: { id: 123, role: "user", openId: "synthetic-upload-user" },
    req,
    res,
  } as unknown as TrpcContext;
}
const input = {
  fileName: "synthetic.pdf",
  contentType: "application/pdf",
  fileData: Buffer.from("%PDF-1.7 synthetic test document").toString("base64"),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.storage.mockImplementation(async key => ({ key, url: `/uploads/${key}` }));
  mocks.reserve.mockResolvedValue({ id: 77, binding: { storageProvider: "local", storageOrigin: "/isolated/test/uploads", storageBucket: "" } });
  mocks.cleanup.mockResolvedValue(undefined);
  mocks.metadata.mockResolvedValue(999);
});

describe("upload scan occurs before persistence", () => {
  it.each(["BAD_REQUEST", "SERVICE_UNAVAILABLE"] as const)(
    "does not write storage or metadata after scanner %s",
    async code => {
      mocks.scan.mockRejectedValue(
        new TRPCError({ code, message: "Synthetic scan denial" })
      );
      await expect(
        appRouter.createCaller(context()).application.uploadFile(input)
      ).rejects.toMatchObject({ code });
      expect(mocks.storage).not.toHaveBeenCalled();
      expect(mocks.metadata).not.toHaveBeenCalled();
    }
  );

  it("stores only after a clean verdict and records scan provenance", async () => {
    const order: string[] = [];
    mocks.scan.mockImplementation(async () => {
      order.push("scan");
      return { status: "clean", scanner: "clamav" };
    });
    mocks.storage.mockImplementation(async key => {
      order.push("storage");
      return { key };
    });
    const result = await appRouter
      .createCaller(context())
      .application.uploadFile(input);
    expect(order).toEqual(["scan", "storage"]);
    expect(result).toMatchObject({
      url: "/api/irb/files/999",
      scanStatus: "clean",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file_upload_stored",
        details: expect.stringContaining("malware scan clean"),
      })
    );
  });

  it("cannot write bytes when durable reservation fails", async () => {
    mocks.scan.mockResolvedValue({ status: "clean", scanner: "clamav" });
    mocks.reserve.mockRejectedValue(new TRPCError({ code: "SERVICE_UNAVAILABLE" }));
    await expect(appRouter.createCaller(context()).application.uploadFile(input)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it.each(["storage", "metadata"] as const)("expedites the durable cleanup job after %s failure", async failure => {
    mocks.scan.mockResolvedValue({ status: "clean", scanner: "clamav" });
    mocks[failure].mockRejectedValue(new Error("Synthetic persistence failure"));
    await expect(appRouter.createCaller(context()).application.uploadFile(input)).rejects.toThrow("Synthetic persistence failure");
    expect(mocks.cleanup).toHaveBeenCalledWith(77, failure === "metadata");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not erase a committed object when later audit logging fails", async () => {
    mocks.scan.mockResolvedValue({ status: "clean", scanner: "clamav" });
    mocks.audit.mockRejectedValue(new Error("Synthetic audit failure"));
    await expect(appRouter.createCaller(context()).application.uploadFile(input)).rejects.toThrow("Synthetic audit failure");
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.metadata).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: "local" }), 77);
  });

  it("cancels an active scan when the requesting connection closes", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => {
      markStarted = resolve;
    });
    mocks.scan.mockImplementation(
      (_bytes: Buffer, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new TRPCError({ code: "CLIENT_CLOSED_REQUEST" })),
            { once: true }
          );
          markStarted();
        })
    );
    const ctx = context();
    const result = appRouter.createCaller(ctx).application.uploadFile(input);
    await started;
    ctx.res.emit("close");
    await expect(result).rejects.toMatchObject({
      code: "CLIENT_CLOSED_REQUEST",
    });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(ctx.req.listenerCount("aborted")).toBe(0);
    expect(ctx.res.listenerCount("close")).toBe(0);
  });
});

describe("archive preflight precedes scanner and persistence", () => {
  it("rejects an oversized OOXML entry before any external scanner or storage call", async () => {
    const data = await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph("Synthetic protocol")] }],
      })
    );
    const central = data.readUInt32LE(data.length - 6);
    const local = data.readUInt32LE(central + 42);
    data.writeUInt32LE(16 * 1024 * 1024, central + 24);
    data.writeUInt32LE(16 * 1024 * 1024, local + 22);
    await expect(
      appRouter.createCaller(context()).application.uploadFile({
        fileName: "synthetic.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileData: data.toString("base64"),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("entry size limit"),
    });
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("allows a real ordinary DOCX through the required clean scan before storage", async () => {
    const data = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph("Synthetic protocol / بروتوكول بحث افتراضي"),
            ],
          },
        ],
      })
    );
    mocks.scan.mockResolvedValue({ status: "clean", scanner: "clamav" });
    await expect(
      appRouter.createCaller(context()).application.uploadFile({
        fileName: "synthetic.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileData: data.toString("base64"),
      })
    ).resolves.toMatchObject({ scanStatus: "clean" });
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(mocks.storage).toHaveBeenCalledTimes(1);
    expect(mocks.scan.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.storage.mock.invocationCallOrder[0]
    );
  });
});
