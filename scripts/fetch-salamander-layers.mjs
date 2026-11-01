/**
 * Reproducible, bounded acquisition of four genuine Salamander V3 velocity
 * recordings for 13 anchors across the 37-key Studio range. The script is a
 * dry-run unless --apply is supplied; --check validates the saved manifest.
 *
 * Audio: Alexander Holm, CC BY 3.0. OGG distribution: darosh/samples-piano
 * npm packages at a pinned 1.0.5 release. Original bytes are not edited.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "app", "public", "audio", "salamander", "multivelocity");
const manifestPath = path.join(output, "manifest.json");
const sourceRepository = "https://github.com/darosh/samples-piano";
const sfzRepository = "https://github.com/sfzinstruments/SalamanderGrandPiano";
const license = "https://creativecommons.org/licenses/by/3.0/";
const packageVersion = "1.0.5";
const layers = [
  { layer: 1, sourceVelocityRange: [1, 26], sfzOffsets: [918, 883, 698, 714, 695, 662, 515, 609, 569, 638, 610, 599, 1071] },
  { layer: 5, sourceVelocityRange: [44, 46], sfzOffsets: [915, 719, 1016, 745, 562, 784, 587, 685, 595, 730, 636, 783, 624] },
  { layer: 10, sourceVelocityRange: [73, 80], sfzOffsets: [775, 624, 658, 660, 822, 670, 571, 593, 702, 682, 680, 593, 542] },
  { layer: 16, sourceVelocityRange: [121, 127], sfzOffsets: [935, 870, 879, 839, 727, 690, 602, 664, 720, 707, 693, 1522, 626] },
];
const notes = [
  { note: "C3", sourceNote: "C3", midi: 48 },
  { note: "Ds3", sourceNote: "D#3", midi: 51 },
  { note: "Fs3", sourceNote: "F#3", midi: 54 },
  { note: "A3", sourceNote: "A3", midi: 57 },
  { note: "C4", sourceNote: "C4", midi: 60 },
  { note: "Ds4", sourceNote: "D#4", midi: 63 },
  { note: "Fs4", sourceNote: "F#4", midi: 66 },
  { note: "A4", sourceNote: "A4", midi: 69 },
  { note: "C5", sourceNote: "C5", midi: 72 },
  { note: "Ds5", sourceNote: "D#5", midi: 75 },
  { note: "Fs5", sourceNote: "F#5", midi: 78 },
  { note: "A5", sourceNote: "A5", midi: 81 },
  { note: "C6", sourceNote: "C6", midi: 84 },
];
const expectedFiles = layers.length * notes.length;

function sourceUrl(layer, sourceNote) {
  const filename = `${sourceNote}v${layer}.ogg`;
  // UNPKG currently returns 404 for filenames containing a sharp sign even
  // when %23-encoded; jsDelivr serves the pinned npm package bytes correctly.
  return `https://cdn.jsdelivr.net/npm/@audio-samples/piano-velocity${layer}@${packageVersion}/audio/${encodeURIComponent(filename)}`;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireOgg(bytes, label) {
  if (bytes.length < 20_000 || bytes.toString("ascii", 0, 4) !== "OggS") {
    throw new Error(`${label}: expected an OGG audio file, got ${bytes.length} bytes`);
  }
}

function tool(command, args, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    encoding: null,
    maxBuffer,
    windowsHide: true,
    timeout: 20_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr?.toString("utf8") ?? result.status}`);
  }
  return result.stdout;
}

function analyzeAudio(file) {
  const probe = JSON.parse(tool("ffprobe", [
    "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels",
    "-of", "json", file,
  ]).toString("utf8"));
  const stream = probe.streams?.[0];
  const sampleRateHz = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  if (!Number.isInteger(sampleRateHz) || sampleRateHz < 8_000 || sampleRateHz > 192_000 ||
      !Number.isInteger(channels) || channels < 1 || channels > 8) {
    throw new Error(`${file}: invalid audio metadata`);
  }
  const pcm = tool("ffmpeg", [
    "-nostdin", "-v", "error", "-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
  ]);
  if (pcm.length === 0 || pcm.length % (channels * 4) !== 0) {
    throw new Error(`${file}: invalid decoded PCM length`);
  }
  const samples = pcm.length / 4;
  const attackSamples = Math.min(samples, Math.floor(0.25 * sampleRateHz) * channels);
  let energy = 0;
  let attackEnergy = 0;
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const value = pcm.readFloatLE(i * 4);
    if (!Number.isFinite(value)) throw new Error(`${file}: non-finite PCM sample`);
    energy += value * value;
    if (i < attackSamples) attackEnergy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return {
    sampleRateHz,
    channels,
    durationSec: Number((samples / channels / sampleRateHz).toFixed(6)),
    decodedPcmBytes: pcm.length,
    rms: Number(Math.sqrt(energy / samples).toFixed(8)),
    peak: Number(peak.toFixed(8)),
    attackRms250ms: Number(Math.sqrt(attackEnergy / attackSamples).toFixed(8)),
  };
}

async function acquire(layer, note, noteIndex) {
  const localName = `${note.note}v${layer.layer}.ogg`;
  const relativeFile = `v${layer.layer}/${localName}`;
  const target = path.join(output, relativeFile);
  const url = sourceUrl(layer.layer, note.sourceNote);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  requireOgg(bytes, url);
  await mkdir(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    const current = await readFile(target);
    if (!current.equals(bytes)) throw new Error(`${relativeFile}: existing file differs from pinned source`);
  } else {
    const temporary = `${target}.download`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  const audio = analyzeAudio(target);
  process.stdout.write(`${relativeFile}: ${(bytes.length / 1024).toFixed(1)} KiB, ` +
    `${audio.sampleRateHz} Hz, ${audio.durationSec.toFixed(2)} s, RMS ${audio.rms.toFixed(5)}\n`);
  return {
    layer: layer.layer,
    note: note.note,
    midi: note.midi,
    file: relativeFile,
    sourceUrl: url,
    bytes: bytes.length,
    sha256: hash(bytes),
    sfzAdjustableOffsetFrames: layer.sfzOffsets[noteIndex],
    sfzOffsetSampleRateHz: 48_000,
    ...audio,
  };
}

async function verify(allowPartial = false) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) ||
      (allowPartial ? manifest.files.length > expectedFiles : manifest.files.length !== expectedFiles)) {
    throw new Error(`manifest must list ${expectedFiles} files`);
  }
  let bytes = 0;
  let pcmBytes = 0;
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!layers.some((layer) => layer.layer === entry.layer) ||
        !notes.some((note) => note.note === entry.note) ||
        seen.has(`${entry.layer}:${entry.note}`)) throw new Error("invalid or duplicate manifest entry");
    seen.add(`${entry.layer}:${entry.note}`);
    const file = path.resolve(output, entry.file);
    if (!file.startsWith(`${output}${path.sep}`)) throw new Error(`file outside output: ${entry.file}`);
    const data = await readFile(file);
    requireOgg(data, entry.file);
    if (data.length !== entry.bytes || hash(data) !== entry.sha256) {
      throw new Error(`${entry.file}: hash/size mismatch`);
    }
    bytes += data.length;
    pcmBytes += entry.decodedPcmBytes;
  }
  if (bytes !== manifest.totals.compressedBytes || pcmBytes !== manifest.totals.decodedPcmBytes) {
    throw new Error("manifest totals mismatch");
  }
  process.stdout.write(`OK: ${seen.size} OGGs, ${(bytes / 1024 / 1024).toFixed(2)} MiB compressed, ` +
    `${(pcmBytes / 1024 / 1024).toFixed(2)} MiB decoded PCM\n`);
  return manifest;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--check") return verify();
  if (mode !== "--apply") {
    process.stdout.write(`Dry run: ${expectedFiles} original OGGs from ${sourceRepository}, ` +
      `layers ${layers.map((item) => item.layer).join("/")}, 13 anchors across C3–C6.\n`);
    process.stdout.write("Run with --apply to fetch and measure; --check verifies saved bytes.\n");
    return;
  }
  if (existsSync(manifestPath)) {
    const current = await verify(true);
    if (current.files.length === expectedFiles) return;
  }
  await mkdir(output, { recursive: true });
  const files = [];
  // Sequential measurement bounds ffmpeg memory. The optional bank is only
  // activated after the complete manifest has passed the engine's validation.
  for (const layer of layers) {
    for (let index = 0; index < notes.length; index++) {
      files.push(await acquire(layer, notes[index], index));
    }
  }
  const totals = {
    compressedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    decodedPcmBytes: files.reduce((sum, file) => sum + file.decodedPcmBytes, 0),
  };
  const manifest = {
    schemaVersion: 1,
    author: "Alexander Holm",
    license,
    sourceRepository,
    sfzRepository,
    packageVersion,
    velocityLayers: layers.map(({ layer, sourceVelocityRange }) => ({ layer, sourceVelocityRange })),
    files,
    totals,
  };
  const temporary = `${manifestPath}.download`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  try {
    await rename(temporary, manifestPath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  await writeFile(path.join(output, "ATTRIBUTION.md"),
    "# Salamander Grand Piano V3 — capas de velocidad\n\n" +
    "Grabaciones originales de **Alexander Holm** de un Yamaha C5. " +
    "Audio bajo [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).\n\n" +
    `Estos ${expectedFiles} OGGs sin alterar provienen de los paquetes ` +
    `[@audio-samples/piano-velocity* v${packageVersion}](${sourceRepository}). ` +
    `El [SFZ original](${sfzRepository}) fija los rangos y documenta los offsets ` +
    "ajustables; su valor por defecto es cero. `manifest.json` conserva URLs, " +
    "SHA-256, medidas PCM y la cobertura de cada capa.\n\n" +
    "Las cuatro capas son una selección de las dieciséis grabadas. " +
    "El paquete npm publica metadatos de código MIT, pero **la licencia del audio " +
    "sigue siendo CC BY 3.0**.\n");
  await verify();
}

await main();
