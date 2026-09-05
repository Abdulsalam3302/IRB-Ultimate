import { TRPCError } from "@trpc/server";

/** Metadata limits are independent of the scanner's best-effort archive heuristics. */
export const UPLOAD_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 15 * 1024 * 1024,
  maxEntries: 1000,
  maxEntryBytes: 15 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxNameBytes: 1024,
  maxPathDepth: 32,
});

const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const utf8 = new TextDecoder("utf-8", { fatal: true });

function reject(reason: string): never {
  // Stable categories contain no uploaded filenames, content or scanner output.
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Archive rejected: ${reason}. Upload an ordinary, unencrypted document within the archive limits.`,
  });
}

function readName(raw: Buffer, flags: number): string {
  if (!raw.length || raw.length > UPLOAD_ARCHIVE_LIMITS.maxNameBytes)
    reject("filename limit");
  if (!(flags & 0x0800) && raw.some(byte => byte >= 0x80))
    reject("ambiguous filename encoding");
  let name: string;
  try {
    name = utf8.decode(raw);
  } catch {
    return reject("invalid filename encoding");
  }
  // Use a conservative portable path profile, including Unicode compatibility forms.
  const normalized = name.normalize("NFKC");
  if (
    /[\\:\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u2044\u2215]/u.test(
      normalized
    ) ||
    normalized.startsWith("/")
  )
    reject("unsafe entry path");
  const segments = normalized.replace(/\/$/, "").split("/");
  if (
    segments.length > UPLOAD_ARCHIVE_LIMITS.maxPathDepth ||
    segments.some(
      part =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  )
    reject("unsafe entry path");
  return normalized;
}

function checkExtraFields(extra: Buffer, rawName: Buffer): void {
  const seen = new Set<number>();
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) reject("truncated extra field");
    const id = extra.readUInt16LE(cursor),
      size = extra.readUInt16LE(cursor + 2);
    const end = cursor + 4 + size;
    if (end > extra.length || seen.has(id)) reject("ambiguous extra field");
    seen.add(id);
    if ([0x0001, 0x0017, 0x9901, 0x000f, 0x756e].includes(id))
      reject("unsupported archive extension");
    if (id === 0x000d && size > 12) reject("linked archive entry");
    // Do not let an alternate Unicode name change how different ZIP readers resolve a path.
    if (
      id === 0x7075 &&
      (size < 5 ||
        extra[cursor + 4] !== 1 ||
        !extra.subarray(cursor + 9, end).equals(rawName))
    )
      reject("ambiguous Unicode path");
    cursor = end;
  }
}

type Entry = {
  name: string;
  start: number;
  end: number;
  bytes: number;
  directory: boolean;
};
export type UploadArchiveSummary = {
  entries: number;
  advertisedBytes: number;
  compressedBytes: number;
};

/**
 * Parse the bounded ZIP central directory and matching local records without inflation.
 * Profile: single disk, ordinary stored/deflated entries, optional standard descriptors.
 * ZIP64, encryption, hidden records, overlapping payloads and conflicting paths fail closed.
 * This is a metadata preflight, not proof of actual expanded size or a malware verdict.
 * Format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function inspectUploadArchive(data: Buffer): UploadArchiveSummary {
  if (data.length < 22 || data.length > UPLOAD_ARCHIVE_LIMITS.maxArchiveBytes)
    reject("archive size limit");
  // EOCD is terminal; its optional comment is at most 65535 bytes. Multiple plausible
  // terminal records are ambiguous, so a parser cannot be steered toward a benign index.
  let eocd = -1;
  for (
    let cursor = data.length - 22;
    cursor >= Math.max(0, data.length - 65557);
    cursor--
  ) {
    if (
      data.readUInt32LE(cursor) === 0x06054b50 &&
      cursor + 22 + data.readUInt16LE(cursor + 20) === data.length
    ) {
      if (eocd !== -1) reject("ambiguous end record");
      eocd = cursor;
    }
  }
  if (eocd < 0) reject("missing end record");
  const count = data.readUInt16LE(eocd + 10);
  const centralBytes = data.readUInt32LE(eocd + 12),
    centralStart = data.readUInt32LE(eocd + 16);
  if (
    data.readUInt16LE(eocd + 4) !== 0 ||
    data.readUInt16LE(eocd + 6) !== 0 ||
    data.readUInt16LE(eocd + 8) !== count
  )
    reject("multi-disk archive");
  if (!count || count > UPLOAD_ARCHIVE_LIMITS.maxEntries)
    reject("entry count limit");
  if (
    centralStart === 0xffffffff ||
    centralBytes === 0xffffffff ||
    centralStart + centralBytes !== eocd ||
    centralBytes < count * 46
  )
    reject("unsupported or inconsistent directory");

  let cursor = centralStart,
    advertisedBytes = 0,
    compressedBytes = 0;
  const entries: Entry[] = [];
  const paths = new Map<string, boolean>();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > eocd || data.readUInt32LE(cursor) !== 0x02014b50)
      reject("invalid directory entry");
    const needed = data.readUInt16LE(cursor + 6),
      flags = data.readUInt16LE(cursor + 8),
      method = data.readUInt16LE(cursor + 10);
    const crc = data.readUInt32LE(cursor + 16),
      compressed = data.readUInt32LE(cursor + 20),
      bytes = data.readUInt32LE(cursor + 24);
    const nameBytes = data.readUInt16LE(cursor + 28),
      extraBytes = data.readUInt16LE(cursor + 30),
      commentBytes = data.readUInt16LE(cursor + 32);
    const start = data.readUInt32LE(cursor + 42),
      endHeader = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (endHeader > eocd || data.readUInt16LE(cursor + 34) !== 0)
      reject("truncated or split entry");
    if (flags & (0x0001 | 0x0040 | 0x2000)) reject("encrypted entry");
    if (
      needed < 10 ||
      needed > 20 ||
      (flags & ~0x080e) !== 0 ||
      ![0, 8].includes(method) ||
      (method === 0 && flags & 6)
    )
      reject("unsupported entry encoding");
    if (
      bytes > UPLOAD_ARCHIVE_LIMITS.maxEntryBytes ||
      compressed > UPLOAD_ARCHIVE_LIMITS.maxArchiveBytes
    )
      reject("entry size limit");
    if (bytes > compressed * UPLOAD_ARCHIVE_LIMITS.maxCompressionRatio)
      reject("compression ratio limit");
    if (method === 0 && bytes !== compressed)
      reject("inconsistent stored entry size");
    advertisedBytes += bytes;
    compressedBytes += compressed;
    if (advertisedBytes > UPLOAD_ARCHIVE_LIMITS.maxTotalBytes)
      reject("total expanded size limit");
    const rawName = data.subarray(cursor + 46, cursor + 46 + nameBytes);
    const name = readName(rawName, flags),
      directory = name.endsWith("/");
    const key = name.replace(/\/$/, "").toLowerCase();
    if (paths.has(key)) reject("duplicate entry path");
    paths.set(key, directory);
    const attributes = data.readUInt32LE(cursor + 38);
    const unixType = (attributes >>> 16) & 0xf000;
    if (attributes & 0x08 || (attributes & 0x10 && !directory))
      reject("inconsistent entry attributes");
    if (unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000)
      reject("linked or special entry");
    if (
      (unixType === 0x4000 && !directory) ||
      (unixType === 0x8000 && directory) ||
      (directory && (bytes !== 0 || compressed !== 0))
    )
      reject("inconsistent directory entry");
    checkExtraFields(
      data.subarray(
        cursor + 46 + nameBytes,
        cursor + 46 + nameBytes + extraBytes
      ),
      rawName
    );

    if (start + 30 > centralStart || data.readUInt32LE(start) !== 0x04034b50)
      reject("invalid local entry");
    if (
      data.readUInt16LE(start + 4) !== needed ||
      data.readUInt16LE(start + 6) !== flags ||
      data.readUInt16LE(start + 8) !== method
    )
      reject("conflicting entry headers");
    const localNameBytes = data.readUInt16LE(start + 26),
      localExtraBytes = data.readUInt16LE(start + 28);
    const payload = start + 30 + localNameBytes + localExtraBytes;
    let end = payload + compressed;
    if (
      payload > centralStart ||
      end > centralStart ||
      !data.subarray(start + 30, start + 30 + localNameBytes).equals(rawName)
    )
      reject("inconsistent local payload");
    checkExtraFields(
      data.subarray(start + 30 + localNameBytes, payload),
      rawName
    );
    const localFields = [
      data.readUInt32LE(start + 14),
      data.readUInt32LE(start + 18),
      data.readUInt32LE(start + 22),
    ];
    const expected = [crc, compressed, bytes];
    if (flags & 8) {
      if (
        localFields.some(
          (value, offset) => value !== 0 && value !== expected[offset]
        )
      )
        reject("conflicting streamed entry sizes");
      const candidates = [0, 4].filter(prefix => {
        if (
          end + prefix + 12 > centralStart ||
          (prefix && data.readUInt32LE(end) !== 0x08074b50)
        )
          return false;
        return expected.every(
          (value, offset) =>
            data.readUInt32LE(end + prefix + offset * 4) === value
        );
      });
      if (candidates.length !== 1)
        reject("missing or ambiguous data descriptor");
      end += candidates[0] + 12;
    } else if (localFields.some((value, offset) => value !== expected[offset]))
      reject("conflicting entry sizes");
    entries.push({ name, start, end, bytes, directory });
    cursor = endHeader;
  }
  if (
    cursor !== eocd ||
    advertisedBytes >
      compressedBytes * UPLOAD_ARCHIVE_LIMITS.maxCompressionRatio
  )
    reject("inconsistent directory size");
  // All local records must exactly cover the data area. This rejects prepended/self-
  // extracting data, orphan local records, concatenated archives and shared payload bombs.
  entries.sort((a, b) => a.start - b.start);
  let nextStart = 0;
  for (const entry of entries) {
    if (entry.start !== nextStart) reject("overlapping or hidden entry");
    nextStart = entry.end;
    const segments = entry.name.replace(/\/$/, "").toLowerCase().split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      if (paths.get(segments.slice(0, depth).join("/")) === false)
        reject("conflicting directory path");
    }
  }
  if (nextStart !== centralStart) reject("hidden archive data");
  return { entries: count, advertisedBytes, compressedBytes };
}

/** Guard every accepted ZIP-based upload without adding ZIP to the upload MIME allowlist. */
export function assertUploadArchiveSafe(
  data: Buffer,
  contentType: string
): void {
  if (
    contentType === DOCX ||
    contentType === XLSX ||
    contentType === "application/zip" ||
    (data.length >= 4 && data.readUInt32LE(0) === 0x04034b50)
  )
    inspectUploadArchive(data);
}
