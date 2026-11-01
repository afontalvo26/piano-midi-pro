import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

// Michael Fischer recorded a real Roland TR-808 directly from its individual
// outputs. TidalCycles publishes the preserved set under CC0. We pin one Git
// commit and verify every downloaded blob against Git's own tree hash before
// it can enter the app.
const REPOSITORY = "tidalcycles/sounds-tr808-fischer";
const COMMIT = "85fbecf1bec32553395625ea659e2a56dfd7c0e1";
const DESTINATION = new URL("../app/public/audio/tr808-fischer/core/", import.meta.url);

const PIECES = [
  { sourceNote: 36, articulation: "kick", sourcePath: "bd8/BD5050.WAV", file: "BD5050.WAV" },
  { sourceNote: 38, articulation: "snare", sourcePath: "sd8/SD5050.WAV", file: "SD5050.WAV" },
  { sourceNote: 39, articulation: "clap", sourcePath: "cp8/CP.WAV", file: "CP.WAV" },
  { sourceNote: 42, articulation: "hatClosed", sourcePath: "ch8/CH.WAV", file: "CH.WAV" },
  { sourceNote: 46, articulation: "hatOpen", sourcePath: "oh8/OH50.WAV", file: "OH50.WAV" },
  { sourceNote: 56, articulation: "cowbell", sourcePath: "cb8/CB.WAV", file: "CB.WAV" },
  { sourceNote: 37, articulation: "rim", sourcePath: "rs8/RS.WAV", file: "RS.WAV" },
  { sourceNote: 75, articulation: "clave", sourcePath: "cl8/CL.WAV", file: "CL.WAV" },
  { sourceNote: 70, articulation: "maracas", sourcePath: "ma8/MA.WAV", file: "MA.WAV" },
  { sourceNote: 45, articulation: "tomLow", sourcePath: "lt8/LT50.WAV", file: "LT50.WAV" },
  { sourceNote: 47, articulation: "tomMid", sourcePath: "mt8/MT50.WAV", file: "MT50.WAV" },
  { sourceNote: 50, articulation: "tomHigh", sourcePath: "ht8/HT50.WAV", file: "HT50.WAV" },
  { sourceNote: 64, articulation: "congaLow", sourcePath: "lc8/LC50.WAV", file: "LC50.WAV" },
  { sourceNote: 62, articulation: "congaMid", sourcePath: "mc8/MC50.WAV", file: "MC50.WAV" },
  { sourceNote: 63, articulation: "congaHigh", sourcePath: "hc8/HC50.WAV", file: "HC50.WAV" },
  { sourceNote: 49, articulation: "cymbal", sourcePath: "cy8/CY5050.WAV", file: "CY5050.WAV" },
];

const BASS = {
  presetId: "long-50-10",
  sourcePath: "bd8/BD5010.WAV",
  file: "BD5010.WAV",
  measuredFundamentalHz: 49.23248674295283,
  rootMidi: 31,
  tuningCents: -8,
};

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function gitBlobHash(bytes) {
  return digest("sha1", Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}

async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Piano-MIDI-Pro-asset-build" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function inspectPcmWav(bytes, path) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE" || bytes.toString("ascii", 12, 16) !== "fmt " ||
      bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 ||
      bytes.readUInt32LE(24) !== 44_100 || bytes.readUInt16LE(34) !== 16) {
    throw new Error(`La fuente dejó de ser WAV PCM mono 16-bit/44,1 kHz: ${path}`);
  }
  const dataOffset = bytes.indexOf(Buffer.from("data"), 36);
  if (dataOffset < 0 || dataOffset + 8 > bytes.length) throw new Error(`WAV sin data: ${path}`);
  const dataBytes = bytes.readUInt32LE(dataOffset + 4);
  if (dataOffset + 8 + dataBytes > bytes.length || dataBytes < 2 || dataBytes % 2 !== 0) {
    throw new Error(`Longitud PCM inválida: ${path}`);
  }
  return { sampleRate: 44_100, channelCount: 1, frameCount: dataBytes / 2 };
}

async function main() {
  await mkdir(DESTINATION, { recursive: true });
  const tree = JSON.parse((await get(
    `https://api.github.com/repos/${REPOSITORY}/git/trees/${COMMIT}?recursive=1`,
  )).toString("utf8"));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("Árbol Git incompleto");
  const entries = new Map(tree.tree.map((entry) => [entry.path, entry]));
  const sources = ["LICENSE", "README.md", ...new Set([
    ...PIECES.map((piece) => piece.sourcePath), BASS.sourcePath,
  ])];
  const verified = new Map();
  for (const path of sources) {
    const entry = entries.get(path);
    if (entry?.type !== "blob" || !Number.isSafeInteger(entry.size)) {
      throw new Error(`Falta archivo oficial: ${path}`);
    }
    const bytes = await get(
      `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${encodeURI(path)}`,
    );
    if (bytes.length !== entry.size || gitBlobHash(bytes) !== entry.sha) {
      throw new Error(`Integridad Git inválida: ${path}`);
    }
    verified.set(path, { bytes, gitSha1: entry.sha });
  }
  const license = verified.get("LICENSE").bytes;
  const readme = verified.get("README.md").bytes;
  const readmeText = readme.toString("utf8");
  if (!license.toString("utf8").includes("CC0 1.0 Universal") ||
      !readmeText.includes("samples were taken _DIRECTLY_ from a Roland TR-808") ||
      !/professional\s+grade\s+equipment/.test(readmeText) ||
      !readmeText.includes("16-Bit, 44.1kHz")) {
    throw new Error("Licencia o procedencia de la grabación TR-808 cambió");
  }
  await writeFile(new URL("LICENSE", DESTINATION), license);
  await writeFile(new URL("README-source.md", DESTINATION), readme);

  const samples = [];
  for (const piece of PIECES) {
    const source = verified.get(piece.sourcePath);
    const format = inspectPcmWav(source.bytes, piece.sourcePath);
    await writeFile(new URL(piece.file, DESTINATION), source.bytes);
    samples.push({ ...piece, ...format, sourceGitSha1: source.gitSha1,
      sha256: digest("sha256", source.bytes), byteLength: source.bytes.length });
  }
  const bassSource = verified.get(BASS.sourcePath);
  const bassFormat = inspectPcmWav(bassSource.bytes, BASS.sourcePath);
  await writeFile(new URL(BASS.file, DESTINATION), bassSource.bytes);
  const bass = { ...BASS, ...bassFormat, sourceGitSha1: bassSource.gitSha1,
    sha256: digest("sha256", bassSource.bytes), byteLength: bassSource.bytes.length };
  const manifest = {
    packId: "tr808-fischer-core", version: COMMIT,
    source: `https://github.com/${REPOSITORY}/tree/${COMMIT}`,
    license: "CC0-1.0", licenseSha256: digest("sha256", license),
    readmeSha256: digest("sha256", readme), creator: "Michael Fischer / Technopolis",
    recording: "Direct individual outputs of Roland TR-808 serial 103852; SoundEdit 16 on Macintosh Quadra 660AV",
    note: "Sixteen fixed central-settings hits plus one long kick for the tuned monophonic 808 bass preset; exact source PCM, no synthesis or loudness processing.",
    samples, bass,
  };
  await writeFile(new URL("manifest.json", DESTINATION), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`TR-808 verificada: ${samples.length} piezas + bajo, ${
    samples.reduce((sum, sample) => sum + sample.byteLength, bass.byteLength)} bytes\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
