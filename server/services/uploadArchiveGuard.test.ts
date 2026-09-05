import { describe, expect, it } from "vitest";
import { crc32, deflateRawSync } from "node:zlib";
import { Document, Packer, Paragraph } from "docx";
import {
  assertUploadArchiveSafe,
  inspectUploadArchive,
  UPLOAD_ARCHIVE_LIMITS,
} from "./uploadArchiveGuard";

type FixtureEntry = {
  name?: string;
  body?: Buffer;
  packed?: Buffer;
  bytes?: number;
  method?: number;
  flags?: number;
  descriptor?: "signed" | "unsigned";
  extra?: Buffer;
  localName?: string;
  attributes?: number;
};
/** Small explicit ZIP writer for metadata adversarial cases, plus real deflate/CRC defaults. */
function archive(items: FixtureEntry[]) {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let start = 0;
  for (const item of items) {
    const name = Buffer.from(item.name ?? "test.txt"),
      localName = Buffer.from(item.localName ?? item.name ?? "test.txt");
    const body = item.body ?? Buffer.from("Synthetic research document."),
      method = item.method ?? 8;
    const packed = item.packed ?? (method === 0 ? body : deflateRawSync(body));
    const bytes = item.bytes ?? body.length,
      flags = (item.flags ?? 0x0800) | (item.descriptor ? 8 : 0),
      crc = crc32(body),
      extra = item.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(extra.length, 28);
    if (!item.descriptor) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(packed.length, 18);
      local.writeUInt32LE(bytes, 22);
    }
    let descriptor = Buffer.alloc(0);
    if (item.descriptor) {
      const offset = item.descriptor === "signed" ? 4 : 0;
      descriptor = Buffer.alloc(12 + offset);
      if (offset) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, offset);
      descriptor.writeUInt32LE(packed.length, offset + 4);
      descriptor.writeUInt32LE(bytes, offset + 8);
    }
    const row = Buffer.alloc(46);
    row.writeUInt32LE(0x02014b50);
    row.writeUInt16LE(0x0314, 4);
    row.writeUInt16LE(20, 6);
    row.writeUInt16LE(flags, 8);
    row.writeUInt16LE(method, 10);
    row.writeUInt32LE(crc, 16);
    row.writeUInt32LE(packed.length, 20);
    row.writeUInt32LE(bytes, 24);
    row.writeUInt16LE(name.length, 28);
    row.writeUInt16LE(extra.length, 30);
    row.writeUInt32LE(item.attributes ?? 0, 38);
    row.writeUInt32LE(start, 42);
    const record = Buffer.concat([local, localName, extra, packed, descriptor]);
    locals.push(record);
    central.push(Buffer.concat([row, name, extra]));
    start += record.length;
  }
  const directory = Buffer.concat(central),
    eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(start, 16);
  return Buffer.concat([...locals, directory, eocd]);
}
function centralStart(data: Buffer) {
  return data.readUInt32LE(data.length - 6);
}
function extra(id: number, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

const docxType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
describe("archive metadata preflight", () => {
  it("accepts real generated bilingual DOCX documents", async () => {
    const data = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph("Synthetic research protocol"),
              new Paragraph("بروتوكول بحث افتراضي للاختبار"),
            ],
          },
        ],
      })
    );
    expect(inspectUploadArchive(data).entries).toBeGreaterThan(5);
    expect(() => assertUploadArchiveSafe(data, docxType)).not.toThrow();
  });
  it.each([undefined, "signed", "unsigned"] as const)(
    "accepts ordinary deflated entries with %s descriptors",
    descriptor => {
      const data = archive([
        { name: "word/", body: Buffer.alloc(0), method: 0 },
        { name: "word/document.xml", descriptor },
        { name: "بيانات.txt", body: Buffer.from("Arabic filename") },
      ]);
      expect(inspectUploadArchive(data)).toMatchObject({ entries: 3 });
    }
  );
  it("accepts stored entries and exact ordinary comments", () => {
    const data = archive([{ method: 0 }]);
    data.writeUInt16LE(4, data.length - 2);
    expect(
      inspectUploadArchive(Buffer.concat([data, Buffer.from("note")])).entries
    ).toBe(1);
  });
  it("rejects the real 16MiB expansion pattern despite a tiny valid deflate stream", () => {
    const data = archive([{ body: Buffer.alloc(16 * 1024 * 1024, 48) }]);
    expect(data.length).toBeLessThan(20_000);
    expect(() => inspectUploadArchive(data)).toThrow("entry size limit");
  });
  it("rejects excessive advertised aggregate expansion before inflating", () => {
    const data = archive(
      Array.from({ length: 4 }, (_, i) => ({
        name: `${i}.txt`,
        packed: Buffer.alloc(80_000),
        bytes: 13 * 1024 * 1024,
      }))
    );
    expect(() => inspectUploadArchive(data)).toThrow(
      "total expanded size limit"
    );
  });
  it("enforces the advertised compression ratio independently of total size", () => {
    expect(() =>
      inspectUploadArchive(
        archive([{ packed: Buffer.alloc(100), bytes: 20_001 }])
      )
    ).toThrow("compression ratio limit");
  });
  it("accepts the exact per-entry and ratio boundaries", () => {
    expect(
      inspectUploadArchive(
        archive([
          {
            packed: Buffer.alloc(
              Math.ceil(UPLOAD_ARCHIVE_LIMITS.maxEntryBytes / 200)
            ),
            bytes: UPLOAD_ARCHIVE_LIMITS.maxEntryBytes,
          },
        ])
      ).advertisedBytes
    ).toBe(UPLOAD_ARCHIVE_LIMITS.maxEntryBytes);
  });
  it("bounds path depth and rejects inconsistent DOS attributes", () => {
    expect(() =>
      inspectUploadArchive(archive([{ name: `${"a/".repeat(32)}test.txt` }]))
    ).toThrow("unsafe entry path");
    for (const attributes of [0x08, 0x10])
      expect(() => inspectUploadArchive(archive([{ attributes }]))).toThrow(
        "inconsistent entry attributes"
      );
  });

  it("rejects too many entries and oversized raw input", () => {
    expect(() =>
      inspectUploadArchive(
        archive(Array.from({ length: 1001 }, (_, i) => ({ name: `${i}` })))
      )
    ).toThrow("entry count limit");
    expect(() =>
      inspectUploadArchive(
        Buffer.alloc(UPLOAD_ARCHIVE_LIMITS.maxArchiveBytes + 1)
      )
    ).toThrow("archive size limit");
  });
  it.each([1, 0x40, 0x2000])("rejects encryption flag %s", flags => {
    expect(() => inspectUploadArchive(archive([{ flags }]))).toThrow(
      "encrypted entry"
    );
  });
  it.each([
    "../secret",
    "/absolute",
    "C:/secret",
    "a\\..\\secret",
    "a//b",
    "a/./b",
    "a/../b",
    "a/.. /b",
    "a/．．/b",
    "a\u0000b",
    "CON.txt",
  ])("rejects unsafe entry path %s", name => {
    expect(() => inspectUploadArchive(archive([{ name }]))).toThrow(
      "unsafe entry path"
    );
  });
  it("rejects duplicate and file/directory collisions across case and Unicode forms", () => {
    for (const names of [
      ["Test.txt", "test.txt"],
      ["a", "a/"],
      ["a", "a/b.txt"],
      ["test.txt", "ｔｅｓｔ.txt"],
    ])
      expect(() =>
        inspectUploadArchive(archive(names.map(name => ({ name }))))
      ).toThrow();
  });
  it("rejects ambiguous non-UTF8 and invalid UTF8 filenames", () => {
    expect(() =>
      inspectUploadArchive(archive([{ name: "بيانات", flags: 0 }]))
    ).toThrow("ambiguous filename encoding");
    const data = archive([{ name: "test.txt" }]);
    data[30] = 0xff;
    data[centralStart(data) + 46] = 0xff;
    expect(() => inspectUploadArchive(data)).toThrow(
      "invalid filename encoding"
    );
  });
  it.each([0x0001, 0x0017, 0x9901, 0x000f, 0x756e])(
    "rejects unsupported extra field %s",
    id => {
      expect(() =>
        inspectUploadArchive(archive([{ extra: extra(id) }]))
      ).toThrow("unsupported archive extension");
    }
  );
  it("rejects alternative Unicode paths, linked entries and malformed extras", () => {
    expect(() =>
      inspectUploadArchive(
        archive([
          {
            extra: extra(
              0x7075,
              Buffer.concat([
                Buffer.from([1, 0, 0, 0, 0]),
                Buffer.from("../other"),
              ])
            ),
          },
        ])
      )
    ).toThrow("ambiguous Unicode path");
    expect(() =>
      inspectUploadArchive(archive([{ attributes: 0xa1ff0000 }]))
    ).toThrow("linked or special entry");
    expect(() =>
      inspectUploadArchive(archive([{ extra: Buffer.from([1, 2, 3]) }]))
    ).toThrow("truncated extra field");
    expect(() =>
      inspectUploadArchive(
        archive([{ extra: Buffer.concat([extra(0x5455), extra(0x5455)]) }])
      )
    ).toThrow("ambiguous extra field");
  });
  it("rejects ZIP64, unsupported compression and multidisk metadata", () => {
    const zip64 = archive([{}]);
    zip64.writeUInt32LE(0xffffffff, zip64.length - 6);
    expect(() => inspectUploadArchive(zip64)).toThrow("inconsistent directory");
    expect(() => inspectUploadArchive(archive([{ method: 99 }]))).toThrow(
      "unsupported entry encoding"
    );
    const split = archive([{}]);
    split.writeUInt16LE(1, split.length - 18);
    expect(() => inspectUploadArchive(split)).toThrow("multi-disk");
  });
  it("rejects central/local name, flag, size and data-descriptor disagreement", () => {
    expect(() =>
      inspectUploadArchive(archive([{ localName: "different" }]))
    ).toThrow("inconsistent local payload");
    for (const offset of [6, 18, 22]) {
      const data = archive([{}]);
      data[offset] ^= 1;
      expect(() => inspectUploadArchive(data)).toThrow();
    }
    const descriptor = archive([{ descriptor: "signed" }]);
    descriptor[centralStart(descriptor) - 1] ^= 1;
    expect(() => inspectUploadArchive(descriptor)).toThrow("data descriptor");
  });
  it("rejects truncation, appended bytes, bogus directory counts and offset overflow", () => {
    const data = archive([{}]);
    for (const size of [0, 3, 21, 30, data.length - 1])
      expect(() => inspectUploadArchive(data.subarray(0, size))).toThrow();
    expect(() =>
      inspectUploadArchive(Buffer.concat([data, Buffer.from("trailing")]))
    ).toThrow("end record");
    const offset = Buffer.from(data);
    offset.writeUInt32LE(0xffffffff, centralStart(offset) + 42);
    expect(() => inspectUploadArchive(offset)).toThrow("invalid local entry");
    const count = Buffer.from(data);
    count.writeUInt16LE(2, count.length - 14);
    count.writeUInt16LE(2, count.length - 12);
    expect(() => inspectUploadArchive(count)).toThrow();
  });
  it("rejects hidden local records, concatenated archives and overlapping ranges", () => {
    const data = archive([{}, { name: "other" }]),
      firstCentral = centralStart(data),
      firstRow = 46 + Buffer.byteLength("test.txt");
    const hidden = Buffer.concat([
      data.subarray(0, firstCentral),
      data.subarray(firstCentral + firstRow),
    ]);
    hidden.writeUInt16LE(1, hidden.length - 14);
    hidden.writeUInt16LE(1, hidden.length - 12);
    hidden.writeUInt32LE(
      hidden.readUInt32LE(hidden.length - 10) - firstRow,
      hidden.length - 10
    );
    expect(() => inspectUploadArchive(hidden)).toThrow("hidden entry");
    expect(() =>
      inspectUploadArchive(Buffer.concat([archive([{}]), archive([{}])]))
    ).toThrow();
    const overlap = Buffer.from(data);
    const larger = overlap.readUInt32LE(firstCentral + 20) + 1;
    overlap.writeUInt32LE(larger, 18);
    overlap.writeUInt32LE(larger, firstCentral + 20);
    expect(() => inspectUploadArchive(overlap)).toThrow(
      "overlapping or hidden entry"
    );
  });
  it("handles bounded header mutations without unchecked reads or unexpected exceptions", () => {
    const original = archive([
      { descriptor: "signed" },
      { name: "other.txt", method: 0 },
    ]);
    for (let offset = 0; offset < original.length; offset++) {
      const candidate = Buffer.from(original);
      candidate[offset] ^= 0xff;
      try {
        inspectUploadArchive(candidate);
      } catch (error) {
        expect(error).toMatchObject({ code: "BAD_REQUEST" });
      }
    }
    expect(
      inspectUploadArchive(
        archive(
          Array.from({ length: 1000 }, (_, index) => ({ name: `${index}.txt` }))
        )
      ).entries
    ).toBe(1000);
  });

  it("guards Word, Excel and ZIP containers while leaving non-archive PDFs untouched", () => {
    for (const type of [
      docxType,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ])
      expect(() => assertUploadArchiveSafe(Buffer.from("PK"), type)).toThrow();
    expect(() =>
      assertUploadArchiveSafe(Buffer.from("%PDF synthetic"), "application/pdf")
    ).not.toThrow();
  });
});
