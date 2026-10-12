// Bulk MIDI downloader for piano-midi-pro vallenato pack.
// Usage: node scripts/download-midi.mjs
//
// Strategy: download .zip files from karaokegratis.com.ar (each contains a .kar = MIDI Karaoke)
// then extract the .mid/.kar inside and save as a clean filename in app/public/demo/.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';

const OUT_DIR = path.resolve('app/public/demo');
const TMP_DIR = path.resolve('scripts/_tmp_midi');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * @typedef {{ url: string, file: string, postUrl?: string }} Job
 */

/** @type {Job[]} */
const JOBS = [
  // === Diomedes Díaz ===
  {
    url: 'https://karaokegratis.com.ar/wp-content/uploads/2018/06/Diomedes%20Diaz%20-%20Tu%20Serenata.zip',
    file: 'DiomedesDiaz_-_Tu_Serenata.kar',
  },
  // (more populated below dynamically)
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

const FETCH_TIMEOUT_MS = 25000;
const MAX_INTENTOS = 3;

/**
 * Descarga con tope duro y reintentos.
 *
 * Sin `AbortSignal.timeout` un servidor que deja la conexion colgada bloquea el
 * proceso para siempre: paso con karaokegratis, que se quedo en el primer
 * archivo y agoto un tope de 900s sin escribir una sola linea mas.
 */
async function fetchBuf(url) {
  let ultimoError;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      ultimoError = e;
      if (intento < MAX_INTENTOS) {
        process.stdout.write(`reintento ${intento}/${MAX_INTENTOS - 1} (${e.message}) ... `);
        await new Promise((ok) => setTimeout(ok, 1500 * intento));
      }
    }
  }
  throw new Error(`${ultimoError.message} tras ${MAX_INTENTOS} intentos`);
}

/**
 * Minimal ZIP parser to extract the first .kar/.mid entry.
 * Supports stored (no compression) and deflate.
 * @param {Buffer} zip
 * @returns {{ name: string, data: Buffer } | null}
 */
function extractFirstMidiFromZip(zip) {
  // Find End of Central Directory Record (EOCD): signature 0x06054b50
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocdOffset = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 70000; i--) {
    if (zip[i] === sig[0] && zip[i + 1] === sig[1] && zip[i + 2] === sig[2] && zip[i + 3] === sig[3]) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;
  const cdSize = zip.readUInt32LE(eocdOffset + 12);
  const cdOffset = zip.readUInt32LE(eocdOffset + 16);
  const totalEntries = zip.readUInt16LE(eocdOffset + 10);

  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const uncompSize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localHeaderOffset = zip.readUInt32LE(p + 42);
    const name = zip.slice(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;

    if (!/\.(mid|kar)$/i.test(name)) continue;

    // Read local file header to find data start
    const lh = localHeaderOffset;
    if (zip.readUInt32LE(lh) !== 0x04034b50) continue;
    const lhNameLen = zip.readUInt16LE(lh + 26);
    const lhExtraLen = zip.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compData = zip.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compData);
    } else {
      continue;
    }
    if (data.length !== uncompSize && uncompSize !== 0) {
      // mismatch but continue
    }
    return { name, data };
  }
  return null;
}

async function processJob(job) {
  process.stdout.write(`→ ${job.file} ... `);
  try {
    const buf = await fetchBuf(job.url);
    const head = buf.slice(0, 4).toString('ascii');
    let final;
    let finalName = job.file;
    if (head === 'MThd') {
      // Already a MIDI
      final = buf;
    } else if (buf[0] === 0x50 && buf[1] === 0x4b) {
      // ZIP
      const entry = extractFirstMidiFromZip(buf);
      if (!entry) {
        console.log(`zip but no .mid/.kar inside`);
        return false;
      }
      final = entry.data;
      // Keep original ext if user wanted .kar
      if (!/\.(mid|kar)$/i.test(finalName)) {
        finalName += /\.kar$/i.test(entry.name) ? '.kar' : '.mid';
      }
    } else {
      console.log(`unknown format (head=${buf.slice(0, 8).toString('hex')})`);
      return false;
    }
    if (final.slice(0, 4).toString('ascii') !== 'MThd') {
      console.log(`extracted but not a MIDI`);
      return false;
    }
    await ensureDir(OUT_DIR);
    await fs.writeFile(path.join(OUT_DIR, finalName), final);
    console.log(`OK (${final.length} bytes)`);
    return true;
  } catch (e) {
    console.log(`ERR: ${e.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jobsPath = args[0] || path.resolve('scripts/download-midi.jobs.json');
  let jobs = JOBS;
  try {
    const raw = await fs.readFile(jobsPath, 'utf8');
    const extra = JSON.parse(raw);
    if (Array.isArray(extra)) jobs = extra;
  } catch {
    /* fallback to JOBS */
  }
  let ok = 0;
  for (const job of jobs) {
    if (await processJob(job)) ok++;
  }
  console.log(`\nDone: ${ok}/${jobs.length} files saved to ${OUT_DIR}`);
  // Salir explicito: los sockets keep-alive de undici mantienen vivo el event
  // loop, y el runner acotado espera a que el proceso cierre de verdad.
  process.exit(0);
}

main();
