import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async importOriginal => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    send = send;
  },
}));
import { s3Delete, s3Put } from "../storage.s3";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("S3_BUCKET", "synthetic-private");
  vi.stubEnv("AWS_REGION", "eu-central-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "synthetic-unused");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "synthetic-unused");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("bounded S3 lifecycle", () => {
  it("supplies an absolute 30-second write deadline and refuses overwrites", async () => {
    const deadline = vi.spyOn(AbortSignal, "timeout");
    send.mockRejectedValueOnce(new Error("Synthetic aborted write"));
    await expect(
      s3Put("42/synthetic.txt", "Synthetic only", "text/plain")
    ).rejects.toThrow("Synthetic aborted write");
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "synthetic-private",
      Key: "42/synthetic.txt",
      IfNoneMatch: "*",
    });
    expect(send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
    expect(deadline).toHaveBeenCalledWith(30_000);
    deadline.mockRestore();
  });
  it.each(["Enabled", "Suspended"])(
    "blocks versioned bucket %s rather than report delete-marker erasure",
    async Status => {
      send.mockResolvedValueOnce({ Status });
      await expect(s3Delete("42/synthetic.txt")).rejects.toMatchObject({
        code: "unsupported_provider",
      });
      expect(send).toHaveBeenCalledOnce();
    }
  );
  it("confirms exact unversioned deletion only after HEAD reports absent", async () => {
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await s3Delete("42/synthetic.txt");
    expect(send.mock.calls.map(call => call[0].constructor.name)).toEqual([
      "GetBucketVersioningCommand",
      "DeleteObjectCommand",
      "HeadObjectCommand",
    ]);
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "synthetic-private",
      Key: "42/synthetic.txt",
    });
    expect(new Set(send.mock.calls.map(call => call[1].abortSignal)).size).toBe(
      1
    );
  });
  it("does not turn a permissions failure or still-visible object into confirmed erasure", async () => {
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 } });
    await expect(s3Delete("42/synthetic.txt")).rejects.toMatchObject({
      $metadata: { httpStatusCode: 403 },
    });
    send.mockResolvedValue({});
    await expect(s3Delete("42/synthetic.txt")).rejects.toThrow(
      "cannot be verified"
    );
  });
});
