import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const names = await readdir('dist/public/assets');
const entry = names.find(n => /^index-.*\.js$/.test(n));
// Rollup content hashes may contain hyphens; exclude named split vendors instead.
const vendor = names.find(n => /^vendor-(?!charts-|utils-).+\.js$/.test(n));
if (!entry || !vendor) throw new Error('Expected entry/vendor build artifacts');
const sizes = {};
for (const [key, file, max] of [['entry', entry, 81920], ['vendor', vendor, 1048576]]) {
  const data = await readFile(`dist/public/assets/${file}`);
  sizes[key] = { bytes: data.byteLength, gzipBytes: gzipSync(data).byteLength, limitBytes: max };
  if (data.byteLength > max) throw new Error(`${key} chunk exceeds ${max} bytes: ${data.byteLength}`);
}
console.log(JSON.stringify(sizes, null, 2));
