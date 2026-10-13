// ============================================================
// covers-fetch.mjs — download the harvested covers at HD and write the manifest
// the app reads.
//
//   node scripts/covers-fetch.mjs [--force] [--min-confidence 0.5]
//
// Reads  scripts/covers-found.json      (produced by covers-discover.mjs)
// Writes app/public/covers/<n>-<slug>.jpg
//        app/public/covers/manifest.json  → { covers: { "<trackId>": "<url>" } }
//
// Every file is verified after download (magic bytes + real pixel size) so a
// CDN error page can never land in the pack as a "cover".
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const SRC = "scripts/covers-found.json";
const DIR = "app/public/covers";
const MANIFEST = `${DIR}/manifest.json`;
const FAILURES = "scripts/covers-failures.json";

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const minIndex = argv.indexOf("--min-confidence");
// Below this, the match is more likely wrong than right; shipping a wrong cover
// is worse than shipping the generated gradient, so it is left out.
const MIN_CONFIDENCE = minIndex === -1 ? 0.5 : Number(argv[minIndex + 1]);

const data = JSON.parse(readFileSync(SRC, "utf8"));
const records = Object.values(data.results).sort((a, b) => a.n - b.n);
console.log(`harvested records: ${records.length} | min confidence: ${MIN_CONFIDENCE}`);

mkdirSync(DIR, { recursive: true });

/** Real pixel size from the file header — never trust the URL. */
function measure(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: "jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}

const manifest = {};
const failures = [];
const stats = { downloaded: 0, reused: 0, belowThreshold: 0, unusable: 0, bytes: 0 };
let smallest = Infinity;

const pick = (record) => ({
  n: record.n,
  title: record.title,
  artist: record.artist,
  confidence: record.confidence,
  status: record.status,
});

for (const record of records) {
  if (!record.coverUrl) {
    stats.unusable++;
    failures.push({ ...pick(record), reason: `no cover (${record.status})` });
    continue;
  }
  if (record.confidence < MIN_CONFIDENCE) {
    stats.belowThreshold++;
    failures.push({ ...pick(record), reason: `confidence ${record.confidence} < ${MIN_CONFIDENCE}` });
    continue;
  }

  const name = `${String(record.n).padStart(3, "0")}-${record.slug}.jpg`;
  const target = `${DIR}/${name}`;

  if (existsSync(target) && !FORCE) {
    const buf = readFileSync(target);
    const size = measure(buf);
    if (size) {
      manifest[record.trackId] = `/covers/${name}`;
      stats.reused++;
      stats.bytes += buf.length;
      smallest = Math.min(smallest, size.width);
      continue;
    }
  }

  try {
    const res = await fetch(record.coverUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const size = measure(buf);
    if (!size) {
      throw new Error(`not an image (${buf.length} B, starts ${buf.subarray(0, 4).toString("hex")})`);
    }
    if (size.width < 600) throw new Error(`too small: ${size.width}x${size.height}`);

    writeFileSync(target, buf);
    manifest[record.trackId] = `/covers/${name}`;
    stats.downloaded++;
    stats.bytes += buf.length;
    smallest = Math.min(smallest, size.width);
    console.log(
      `  ${String(record.n).padStart(3)}/${records.length} ${size.width}x${size.height} ` +
        `${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${name}`,
    );
  } catch (error) {
    stats.unusable++;
    failures.push({ ...pick(record), reason: String(error.message ?? error) });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: "Spotify — open.spotify.com/search via live browser; 640px square master",
  size: "640x640",
  count: Object.keys(manifest).length,
  covers: manifest,
};
writeFileSync(MANIFEST, `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(FAILURES, `${JSON.stringify(failures, null, 2)}\n`);

console.log("\n════════ summary ════════");
console.log(
  `downloaded: ${stats.downloaded} | reused: ${stats.reused} | ` +
    `below confidence: ${stats.belowThreshold} | unusable: ${stats.unusable}`,
);
console.log(`manifest entries: ${Object.keys(manifest).length} / ${records.length}`);
console.log(
  `total size: ${(stats.bytes / 1024 / 1024).toFixed(1)} MB | smallest width: ${
    smallest === Infinity ? "-" : `${smallest}px`
  }`,
);
if (failures.length) {
  console.log(`\nnot shipped (${failures.length}) — these keep their generated cover:`);
  for (const f of failures) console.log(`  #${f.n} ${f.title} — ${f.artist} :: ${f.reason}`);
}
console.log(`\ndetail: ${FAILURES}`);
