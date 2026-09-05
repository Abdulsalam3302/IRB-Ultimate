import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { env, safeEgress, fetchMock } = vi.hoisted(() => ({
  env: {
    supabaseUrl: "https://storage-test.supabase.co", supabaseStorageBucket: "irb-private",
    supabaseSecretKey: "sb_secret_" + "testonly".repeat(5), storageProvider: "auto",
    forgeApiUrl: "", forgeApiKey: "", isProduction: true,
  }, safeEgress: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock("./_core/env", () => ({ ENV: env }));
vi.mock("./_core/ssrfGuard", () => ({ assertSafeEgress: safeEgress }));
import { supabasePut, supabaseGetUrl, SUPABASE_STORAGE_MAX_BYTES, SUPABASE_STORAGE_TIMEOUT_MS } from "./storage.supabase";
import { resolveStorageProvider, storageGet, storagePut } from "./storage";

const key = "42/study-123.pdf";
const pdf = Buffer.from("%PDF-1.7\nSynthetic test document\n%%EOF");
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const bucket = () => json({ id: "irb-private", public: false, file_size_limit: SUPABASE_STORAGE_MAX_BYTES });
const signed = (objectKey = key) => json({ signedURL: `/object/sign/irb-private/${objectKey}?token=synthetic.token.value` });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(env, { supabaseUrl: "https://storage-test.supabase.co", supabaseStorageBucket: "irb-private", supabaseSecretKey: "sb_secret_" + "testonly".repeat(5), storageProvider: "auto", forgeApiUrl: "", forgeApiKey: "", isProduction: true });
  safeEgress.mockResolvedValue(new URL(env.supabaseUrl));
  vi.stubGlobal("fetch", fetchMock);
  for (const name of ["AWS_REGION", "S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "ALLOW_LOCAL_STORAGE"]) vi.stubEnv(name, "");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("private Supabase storage boundary", () => {
  it("uploads a verified document without overwrite, authenticates server-side, and signs an attachment", async () => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(json({ Key: `irb-private/${key}` })).mockResolvedValueOnce(signed());
    const result = await storagePut(key, pdf, "application/pdf");
    expect(result.key).toBe(key);
    const url = new URL(result.url);
    expect(url.origin).toBe(env.supabaseUrl);
    expect(url.searchParams.get("download")).toBe("study-123.pdf");
    expect(safeEgress).toHaveBeenCalledWith(env.supabaseUrl);
    const [uploadUrl, upload] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe(`${env.supabaseUrl}/storage/v1/object/irb-private/${key}`);
    expect(upload.method).toBe("POST");
    expect(upload.headers).toMatchObject({ apikey: env.supabaseSecretKey, "x-upsert": "false", "Content-Type": "application/pdf" });
    expect(upload.headers.Authorization).toBeUndefined();
    expect(upload.redirect).toBe("error");
    expect(upload.body).toEqual(pdf);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ expiresIn: 300 });
    expect(JSON.stringify(result)).not.toContain(env.supabaseSecretKey);
  });

  it.each([[-1, 60], [0, 60], [60.9, 60], [180, 180], [999999, 300], [NaN, 300], [Infinity, 300]])("bounds requested URL lifetime %s to %s seconds", async (requested, expected) => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(signed());
    await storageGet(key, requested);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expiresIn).toBe(expected);
  });

  it.each(["sb_publishable_" + "x".repeat(32), "eyJhbGciOiJIUzI1NiJ9.anon.signature", "", "sb_secret_short", "sb_secret_" + "a".repeat(24) + "\r\nInjected:yes"])("rejects a non-server secret before any request", async secret => {
    env.supabaseSecretKey = secret;
    await expect(supabaseGetUrl(key)).rejects.toThrow("server-only secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["http://storage-test.supabase.co", "https://u:p@storage-test.supabase.co", "https://storage-test.supabase.co/path", "https://storage-test.supabase.co?key=x", "https://storage-test.supabase.co:8443", "not a URL"])("rejects unsafe project origin %s", async origin => {
    env.supabaseUrl = origin;
    await expect(supabaseGetUrl(key)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["../other", "public/bucket", "bad?bucket", "", "A-bucket"])("rejects malformed bucket %s", async name => {
    env.supabaseStorageBucket = name;
    await expect(supabaseGetUrl(key)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["../private.pdf", "/absolute.pdf", "42/../private.pdf", "42/%2e%2e/private.pdf", "42/a.pdf?x=y", "42\\a.pdf", "42//a.pdf", "42/.hidden.pdf"])("rejects path manipulation %s before I/O", async objectKey => {
    await expect(supabasePut(objectKey, pdf, "application/pdf")).rejects.toThrow("Invalid storage key");
    await expect(supabaseGetUrl(objectKey)).rejects.toThrow("Invalid storage key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ id: "irb-private", public: true }, { id: "other-bucket", public: false }, { id: "irb-private" }])("does not upload or sign when bucket metadata is unsafe", async metadata => {
    fetchMock.mockResolvedValueOnce(json(metadata));
    await expect(supabasePut(key, pdf, "application/pdf")).rejects.toThrow("Private storage operation failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rechecks private status on the next operation", async () => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(signed()).mockResolvedValueOnce(json({ id: "irb-private", public: true }));
    await supabaseGetUrl(key);
    await expect(supabaseGetUrl(key)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["42/a.pdf", Buffer.from("<html>wrong type</html>"), "application/pdf"],
    ["42/a.exe", pdf, "application/pdf"],
    ["42/a.txt", Buffer.from("<svg onload=alert(1)>"), "text/plain"],
    ["42/a.txt", Buffer.from([0xff, 0xfe, 0]), "text/plain"],
    ["42/a.csv", Buffer.from("x,y\n1,\u0000"), "text/csv"],
    ["42/a.html", Buffer.from("<!doctype html><html></html>"), "text/html"],
    ["42/a.svg", Buffer.from("<svg></svg>"), "image/svg+xml"],
    ["42/a.pdf", pdf, "application/pdf\r\nInjected:yes"],
  ])("rejects MIME/extension mismatches and active applicant content", async (objectKey, data, mime) => {
    await expect(supabasePut(objectKey as string, data as Buffer, mime as string)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty and oversize data without network or string conversion", async () => {
    await expect(supabasePut(key, Buffer.alloc(0), "application/pdf")).rejects.toThrow("size");
    await expect(supabasePut(key, Buffer.alloc(SUPABASE_STORAGE_MAX_BYTES + 1), "application/pdf")).rejects.toThrow("size");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves typed generated HTML fallback only in certificate namespaces", async () => {
    const objectKey = "certificates/IRB-123.html";
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(json({ Key: `irb-private/${objectKey}` })).mockResolvedValueOnce(signed(objectKey));
    const result = await supabasePut(objectKey, "<!DOCTYPE html><html><body>Printable record</body></html>", "text/html; charset=utf-8");
    expect(new URL(result.url).searchParams.get("download")).toBe("IRB-123.html");
    expect(fetchMock.mock.calls[1][1].headers["Content-Type"]).toBe("text/html");
  });

  it.each([
    "https://evil.example/storage/v1/object/sign/irb-private/42/study-123.pdf?token=x",
    "/object/public/irb-private/42/study-123.pdf?token=x",
    "/object/sign/irb-private/99/private.pdf?token=x",
    "/object/sign/irb-private/42/study-123.pdf?token=x&token=y",
    "/object/sign/irb-private/42/study-123.pdf?token=x&redirect=https://evil.example",
    "/object/sign/irb-private/42/study-123.pdf",
    "/object/sign/irb-private/42/study-123.pdf?token=x#fragment",
  ])("rejects an untrusted signed download destination %s", async signedURL => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(json({ signedURL }));
    await expect(supabaseGetUrl(key)).rejects.toThrow("Private storage operation failed");
  });

  it("rejects a wrong upload receipt without signing another object", async () => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(json({ Key: "irb-private/another-user/private.pdf" }));
    await expect(supabasePut(key, pdf, "application/pdf")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry duplicate uploads or expose raw provider errors", async () => {
    fetchMock.mockResolvedValueOnce(bucket()).mockResolvedValueOnce(json({ message: `private body ${env.supabaseSecretKey}` }, 409));
    await expect(supabasePut(key, pdf, "application/pdf")).rejects.toThrow(/^Private storage operation failed; please retry later$/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed on egress rejection without including its URL or credential diagnostic", async () => {
    safeEgress.mockRejectedValueOnce(new Error(`private IP diagnostics ${env.supabaseSecretKey}`));
    await expect(supabaseGetUrl(key)).rejects.toThrow(/^Private storage operation failed; please retry later$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels an oversized chunked provider body", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel }), { headers: { "Content-Type": "application/json" } }));
    await expect(supabaseGetUrl(key)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds a stalled egress lookup and prevents a late request after deadline", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    safeEgress.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = supabaseGetUrl(key);
    const rejection = expect(pending).rejects.toThrow("Private storage operation failed");
    await vi.advanceTimersByTimeAsync(SUPABASE_STORAGE_TIMEOUT_MS);
    await rejection;
    release();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("storage provider selection", () => {
  it("prefers configured Supabase without changing explicit legacy selections", () => {
    env.forgeApiUrl = "https://forge.example"; env.forgeApiKey = "forge-test";
    for (const name of ["AWS_REGION", "S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) vi.stubEnv(name, "configured-test");
    expect(resolveStorageProvider()).toBe("supabase");
    env.storageProvider = "s3"; expect(resolveStorageProvider()).toBe("s3");
    env.storageProvider = "forge"; expect(resolveStorageProvider()).toBe("forge");
    env.storageProvider = "auto"; env.supabaseStorageBucket = ""; env.supabaseSecretKey = "";
    expect(resolveStorageProvider()).toBe("forge");
    env.forgeApiUrl = ""; env.forgeApiKey = ""; expect(resolveStorageProvider()).toBe("s3");
  });

  it("never falls back when a selected provider is incomplete or unhealthy", async () => {
    env.supabaseSecretKey = "";
    await expect(storageGet(key)).rejects.toThrow("incomplete");
    env.storageProvider = "s3"; expect(() => resolveStorageProvider()).toThrow("incomplete");
    env.storageProvider = "forge"; expect(() => resolveStorageProvider()).toThrow("incomplete");
    env.storageProvider = "unknown"; expect(() => resolveStorageProvider()).toThrow("Invalid");
    env.storageProvider = "supabase"; env.supabaseSecretKey = "sb_secret_" + "testonly".repeat(5);
    fetchMock.mockRejectedValueOnce(new Error("provider network error"));
    await expect(storageGet(key)).rejects.toThrow("Private storage operation failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires production permission even for explicitly selected local storage", async () => {
    env.storageProvider = "local";
    expect(() => resolveStorageProvider()).toThrow("durable storage");
    vi.stubEnv("ALLOW_LOCAL_STORAGE", "true");
    expect(await storageGet(key)).toEqual({ key, url: `/uploads/${key}` });
    env.isProduction = false;
    vi.stubEnv("ALLOW_LOCAL_STORAGE", "");
    expect(resolveStorageProvider()).toBe("local");
  });
});
