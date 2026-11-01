import type { ProjectWavFile, ProjectWavResult } from "./projectWav.ts";
import { validateWavPcm } from "./wavPcm.ts";

const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const UTF8_FLAG = 0x0800;
const DOS_DATE = 0x0021; // 1980-01-01, deterministic ZIP metadata.
const encoder = new TextEncoder();

export interface WavZipManifestFile {
  readonly name: string;
  readonly kind: ProjectWavFile["kind"];
  readonly id: string;
  readonly sourceTrackIds: readonly string[];
  readonly byteLength: number;
  readonly sha256: string;
  readonly crc32: number;
  readonly frames: number;
  readonly sampleRate: number;
  readonly format: ProjectWavResult["format"];
  readonly peak: number;
}

export interface WavZipManifest {
  readonly schemaVersion: 1;
  readonly kind: "pmp-wav-stems";
  readonly project: { readonly id: string; readonly name: string;
    readonly revision: number; readonly revisionHash: string };
  readonly range: { readonly startTick: number; readonly endTick: number;
    readonly tailSeconds: number; readonly sampleRate: number };
  readonly render: { readonly seed: string; readonly stemsAdditive: boolean;
    readonly busStemsOverlap: boolean; readonly omittedSourceTrackIds: readonly string[];
    readonly omittedStemIds: readonly string[];
    readonly projectLimiterIncluded: boolean; readonly studioGlobalChainIncluded: boolean;
    readonly excludedStudioChain: readonly string[]; readonly sendsIncluded: boolean;
    readonly masterEffectsIncluded: boolean; readonly sidechainIncluded: boolean };
  readonly officialCredits: ProjectWavResult["officialCredits"];
  readonly files: readonly WavZipManifestFile[];
}

export interface WavZipProgress {
  readonly phase: "hashing" | "packaging" | "done";
  readonly completed: number;
  readonly total: number;
}

export interface WavZipPackage {
  readonly name: string;
  readonly blob: Blob;
  readonly mimeType: "application/zip";
  readonly manifest: WavZipManifest;
  readonly manifestSha256: string;
}

interface ZipEntry {
  readonly name: string;
  readonly nameBytes: Uint8Array;
  readonly data: Uint8Array;
  readonly crc: number;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}

function wholeBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.buffer instanceof ArrayBuffer &&
      bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
  return bytes.slice().buffer as ArrayBuffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", wholeBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireEntryName(name: string): Uint8Array {
  if (!name || name === "." || name === ".." || /[\\/\0\r\n]/.test(name) ||
      name.startsWith(".") || name.endsWith(".") || name.length > 240) {
    throw new RangeError(`Nombre inseguro en ZIP WAV: ${name}`);
  }
  const bytes = encoder.encode(name);
  if (bytes.byteLength > 0xffff) throw new RangeError("Nombre de ZIP WAV demasiado largo");
  return bytes;
}

function localHeader(entry: ZipEntry): Uint8Array {
  const bytes = new Uint8Array(30 + entry.nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, 0, true);
  view.setUint16(12, DOS_DATE, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.data.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  bytes.set(entry.nameBytes, 30);
  return bytes;
}

function centralHeader(entry: ZipEntry, offset: number): Uint8Array {
  const bytes = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(14, DOS_DATE, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint32(42, offset, true);
  bytes.set(entry.nameBytes, 46);
  return bytes;
}

function endRecord(count: number, centralBytes: number, centralOffset: number): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralBytes, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

function zipName(result: ProjectWavResult): string {
  const master = result.files[0]?.name;
  if (!master?.endsWith("-master.wav")) throw new RangeError("Nombre del master WAV inválido para ZIP");
  return `${master.slice(0, -"-master.wav".length)}-stems.zip`;
}

/** ZIP32 store mode; only validated WAV bytes and their hash manifest are included. */
export async function createWavZip(result: ProjectWavResult,
  onProgress?: (progress: WavZipProgress) => void): Promise<WavZipPackage> {
  if (result.files.length < 2 || result.files[0]?.kind !== "master" ||
      result.files.length > 512) throw new RangeError("ZIP de stems requiere master y pistas");
  const names = new Set<string>(["manifest.json"]);
  const files: WavZipManifestFile[] = [];
  const wavEntries: ZipEntry[] = [];
  let frameCount = -1;
  for (const [index, file] of result.files.entries()) {
    if (names.has(file.name) || !file.name.toLowerCase().endsWith(".wav")) {
      throw new RangeError("Nombres WAV repetidos o inválidos para ZIP");
    }
    names.add(file.name);
    const header = validateWavPcm(file.bytes);
    if (header.frames !== file.pcm.frames || header.sampleRate !== file.pcm.sampleRate ||
        header.format !== file.pcm.format || file.bytes.byteLength !== file.pcm.byteLength ||
        (frameCount >= 0 && header.frames !== frameCount)) {
      throw new RangeError(`Stem ${file.id}: WAV no coincide con reporte o master`);
    }
    frameCount = header.frames;
    const checksum = crc32(file.bytes);
    const hash = await sha256(file.bytes);
    files.push({ name: file.name, kind: file.kind, id: file.id,
      sourceTrackIds: file.sourceTrackIds, byteLength: file.bytes.byteLength,
      sha256: hash, crc32: checksum, frames: header.frames,
      sampleRate: header.sampleRate, format: header.format, peak: file.pcm.outputPeak });
    wavEntries.push({ name: file.name, nameBytes: requireEntryName(file.name),
      data: file.bytes, crc: checksum });
    onProgress?.({ phase: "hashing", completed: index + 1, total: result.files.length });
  }
  const manifest: WavZipManifest = { schemaVersion: 1, kind: "pmp-wav-stems",
    project: { id: result.projectId, name: result.projectName,
      revision: result.revision, revisionHash: result.revisionHash },
    range: { startTick: result.plan.startTick, endTick: result.plan.endTick,
      tailSeconds: result.plan.tailSeconds, sampleRate: result.plan.sampleRate },
    render: { seed: result.seed, stemsAdditive: result.stemsAdditive,
      busStemsOverlap: result.plan.busStemsOverlap,
      omittedSourceTrackIds: result.plan.omittedSourceTrackIds,
      omittedStemIds: result.omittedStemIds,
      projectLimiterIncluded: result.projectLimiterIncluded,
      studioGlobalChainIncluded: result.studioGlobalChainIncluded,
      excludedStudioChain: result.plan.excludedStudioChain,
      sendsIncluded: result.sendsIncluded, masterEffectsIncluded: result.masterEffectsIncluded,
      sidechainIncluded: result.sidechainIncluded },
    officialCredits: result.officialCredits, files };
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const manifestSha256 = await sha256(manifestBytes);
  const entries: ZipEntry[] = [{ name: "manifest.json", nameBytes: encoder.encode("manifest.json"),
    data: manifestBytes, crc: crc32(manifestBytes) }, ...wavEntries];
  if (entries.length > 0xffff) throw new RangeError("ZIP excede límite de entradas");
  let offset = 0;
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  for (const [index, entry] of entries.entries()) {
    const header = localHeader(entry);
    central.push(centralHeader(entry, offset));
    parts.push(wholeBuffer(header), wholeBuffer(entry.data));
    offset += header.byteLength + entry.data.byteLength;
    onProgress?.({ phase: "packaging", completed: index + 1, total: entries.length });
  }
  const centralOffset = offset;
  for (const header of central) {
    parts.push(wholeBuffer(header));
    offset += header.byteLength;
  }
  parts.push(wholeBuffer(endRecord(entries.length, offset - centralOffset, centralOffset)));
  offset += 22;
  if (!Number.isSafeInteger(offset) || offset > MAX_ZIP_BYTES || offset > 0xffff_ffff) {
    throw new RangeError("ZIP WAV excede 256 MiB o ZIP32");
  }
  const blob = new Blob(parts, { type: "application/zip" });
  if (blob.size !== offset) throw new Error("ZIP WAV quedó truncado");
  onProgress?.({ phase: "done", completed: entries.length, total: entries.length });
  return { name: zipName(result), blob, mimeType: "application/zip",
    manifest, manifestSha256 };
}
