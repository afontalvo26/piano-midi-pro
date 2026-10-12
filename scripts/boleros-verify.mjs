// Verify the demo catalogue shipped with the app.
//
// Checks that every `/demo/...` path referenced by the catalogues
// (app/src/constants/demoSongs.ts and its bolero pack) exists in
// app/public/demo/, parses with @tonejs/midi — the same parser the browser
// worker uses — and yields real notes and a duration. Also reports orphan
// MIDI files sitting on disk with no catalogue entry.
//
// Usage: node scripts/boleros-verify.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEMO_DIR = path.resolve('app/public/demo');
const SOURCES = [
  path.resolve('app/src/constants/demoSongs.ts'),
  path.resolve('app/src/constants/demoBoleros.ts'),
];

const tone = await import(
  pathToFileURL(path.resolve('app/node_modules/@tonejs/midi/build/Midi.js')).href
);
const Midi = tone.Midi ?? tone.default?.Midi ?? tone.default;

/** Collect every demo file referenced by the catalogues. */
async function collectPaths() {
  const found = new Map(); // file -> source basename
  for (const src of SOURCES) {
    const text = await fs.readFile(src, 'utf8');
    const source = path.basename(src);
    // demoBoleros.ts builds its `/demo/${file}` paths from `file: "..."`, so
    // read those entries too; the character class skips the template literal's
    // own `${file}` placeholder.
    for (const m of text.matchAll(/["'`]\/demo\/([^"'`${}]+)["'`]/g)) found.set(m[1], source);
    for (const m of text.matchAll(/\bfile:\s*"([^"]+)"/g)) {
      if (!/^\$/.test(m[1])) found.set(m[1], source);
    }
  }
  return found;
}

const paths = await collectPaths();
const onDisk = new Set(await fs.readdir(DEMO_DIR));

let missing = 0;
let unparseable = 0;
let silent = 0;
const bySource = {};

for (const [file, source] of paths) {
  bySource[source] = (bySource[source] ?? 0) + 1;
  if (!onDisk.has(file)) {
    console.log(`FALTA      ${file}  (referenciado en ${source})`);
    missing++;
    continue;
  }
  try {
    const midi = new Midi(await fs.readFile(path.join(DEMO_DIR, file)));
    const notes = midi.tracks.reduce((a, t) => a + t.notes.length, 0);
    if (notes === 0 || midi.duration <= 0) {
      console.log(`SIN NOTAS  ${file}`);
      silent++;
    }
  } catch (e) {
    console.log(`NO PARSEA  ${file}: ${e.message}`);
    unparseable++;
  }
}

const referenced = new Set(paths.keys());
const orphans = [...onDisk].filter((f) => /\.(mid|kar)$/i.test(f) && !referenced.has(f));

console.log("");
for (const [source, count] of Object.entries(bySource)) {
  console.log(`${source}: ${count} pistas referenciadas`);
}
console.log(
  `total=${paths.size} faltantes=${missing} ilegibles=${unparseable} sinNotas=${silent} huerfanos=${orphans.length}`,
);
for (const o of orphans) console.log(`  HUERFANO  ${o}`);

process.exitCode = missing || unparseable || silent || orphans.length ? 1 : 0;
