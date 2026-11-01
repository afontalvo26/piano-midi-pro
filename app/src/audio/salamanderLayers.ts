/** Optional four-layer Salamander bank. Nothing is fetched until it is selected. */
import { DecodedPianoSampleBank } from "./toneSampleVoiceFactory";

const BASE_URL = "/audio/salamander/multivelocity/";
const NOTES = [
  ["C3", 48], ["Ds3", 51], ["Fs3", 54], ["A3", 57],
  ["C4", 60], ["Ds4", 63], ["Fs4", 66], ["A4", 69],
  ["C5", 72], ["Ds5", 75], ["Fs5", 78], ["A5", 81], ["C6", 84],
] as const;
const LAYERS = [1, 5, 10, 16] as const;
const MAX_COMPRESSED_BYTES = 16 * 1024 * 1024;
export const MAX_LAYERED_PCM_BYTES = 280 * 1024 * 1024;
export const LAYERED_SAMPLE_COUNT = NOTES.length * LAYERS.length;

interface LayerEntry {
  layer: number;
  note: string;
  midi: number;
  file: string;
  bytes: number;
  sha256: string;
  sampleRateHz: number;
  channels: number;
  durationSec: number;
  decodedPcmBytes: number;
  peak: number;
  attackRms250ms: number;
}

interface LayerRange {
  layer: number;
  sourceVelocityRange: [number, number];
}

export interface LayerLoadProgress {
  loaded: number;
  total: number;
  decodedPcmBytes: number;
}

export interface LoadedSalamanderLayers {
  bank: DecodedPianoSampleBank;
  /** Matches the optional v16 recording to the installed one-layer piano at C4. */
  levelMatchGain: number;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Manifiesto multicapa inválido");
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error("Metadatos multicapa fuera de rango");
  }
  return value;
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Carga multicapa cancelada", "AbortError");
}

function parseManifest(value: unknown): { files: LayerEntry[]; ranges: LayerRange[] } {
  const manifest = record(value);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.velocityLayers)
    || !Array.isArray(manifest.files) || manifest.files.length !== LAYERED_SAMPLE_COUNT) {
    throw new Error("El banco multicapa está incompleto");
  }
  const ranges = manifest.velocityLayers.map((value): LayerRange => {
    const item = record(value);
    const velocityRange = item.sourceVelocityRange;
    if (!LAYERS.includes(item.layer as typeof LAYERS[number])
      || !Array.isArray(velocityRange) || velocityRange.length !== 2) {
      throw new Error("Mapa de velocidades multicapa inválido");
    }
    const minimum = finite(velocityRange[0], 1, 127);
    const maximum = finite(velocityRange[1], minimum, 127);
    return { layer: item.layer as number, sourceVelocityRange: [minimum, maximum] };
  });
  if (ranges.length !== LAYERS.length || new Set(ranges.map((range) => range.layer)).size !== LAYERS.length) {
    throw new Error("Faltan capas del piano");
  }
  const expected = new Map<string, number>();
  for (const layer of LAYERS) for (const [note, midi] of NOTES) expected.set(`v${layer}/${note}v${layer}.ogg`, midi);
  let compressed = 0;
  let decoded = 0;
  const files = manifest.files.map((value): LayerEntry => {
    const item = record(value);
    const file = item.file;
    if (typeof file !== "string" || !expected.has(file) ||
      item.midi !== expected.get(file) || typeof item.note !== "string" ||
      !file.endsWith(`/${item.note}v${item.layer}.ogg`) ||
      typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error("Archivo multicapa no reconocido");
    }
    expected.delete(file);
    const entry: LayerEntry = {
      layer: finite(item.layer, 1, 16), note: item.note, midi: item.midi as number,
      file, bytes: finite(item.bytes, 1, 2 * 1024 * 1024), sha256: item.sha256,
      sampleRateHz: finite(item.sampleRateHz, 48000, 48000),
      channels: finite(item.channels, 2, 2),
      durationSec: finite(item.durationSec, 0.1, 40),
      decodedPcmBytes: finite(item.decodedPcmBytes, 1, 12 * 1024 * 1024),
      peak: finite(item.peak, 0.001, 1.5),
      attackRms250ms: finite(item.attackRms250ms, 0.0001, 1),
    };
    compressed += entry.bytes;
    decoded += entry.decodedPcmBytes;
    return entry;
  });
  if (expected.size || compressed > MAX_COMPRESSED_BYTES || decoded > MAX_LAYERED_PCM_BYTES) {
    throw new Error("El banco multicapa está incompleto o excede la memoria permitida");
  }
  return { files, ranges };
}

function attackRms(buffer: AudioBuffer): number {
  const frames = Math.min(buffer.length, Math.floor(buffer.sampleRate * 0.25));
  if (frames === 0) throw new Error("La muestra de referencia está vacía");
  let power = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let frame = 0; frame < frames; frame++) power += samples[frame] ** 2;
  }
  return Math.sqrt(power / (frames * buffer.numberOfChannels));
}

function isOgg(bytes: ArrayBuffer): boolean {
  const magic = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return magic.length === 4 && magic[0] === 0x4f && magic[1] === 0x67
    && magic[2] === 0x67 && magic[3] === 0x53;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Loads one compressed file at a time, keeping the current instrument audible. */
export async function loadSalamanderLayers(
  referenceC4: AudioBuffer,
  signal: AbortSignal,
  onProgress: (progress: LayerLoadProgress) => void,
): Promise<LoadedSalamanderLayers> {
  abortIfNeeded(signal);
  if (typeof OfflineAudioContext === "undefined" || !crypto.subtle) {
    throw new Error("Este navegador no permite preparar el piano multicapa");
  }
  const manifestResponse = await fetch(`${BASE_URL}manifest.json`, { signal });
  if (!manifestResponse.ok) throw new Error("No se encontró el manifiesto multicapa local");
  const { files, ranges } = parseManifest(await manifestResponse.json());
  const c4V16 = files.find((entry) => entry.midi === 60 && entry.layer === 16)!;
  const referenceLevel = attackRms(referenceC4);
  if (!Number.isFinite(referenceLevel) || referenceLevel <= 0) {
    throw new Error("No se pudo medir el piano actual");
  }
  const levelMatchGain = referenceLevel / c4V16.attackRms250ms;
  if (!Number.isFinite(levelMatchGain) || levelMatchGain < 0.1 || levelMatchGain > 1) {
    throw new Error("Nivel multicapa incompatible con el piano actual");
  }
  const decoder = new OfflineAudioContext(2, 1, 48000);
  const bank = new DecodedPianoSampleBank();
  let loaded = 0;
  for (const entry of files) {
    abortIfNeeded(signal);
    const response = await fetch(`${BASE_URL}${entry.file}`, { signal });
    if (!response.ok) throw new Error(`No cargó ${entry.note}, capa ${entry.layer}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== entry.bytes || !isOgg(bytes)
      || await sha256(bytes) !== entry.sha256) {
      throw new Error(`Muestra multicapa alterada: ${entry.file}`);
    }
    abortIfNeeded(signal);
    const buffer = await decoder.decodeAudioData(bytes);
    abortIfNeeded(signal);
    if (buffer.numberOfChannels !== entry.channels ||
      Math.abs(buffer.duration - entry.durationSec) > 0.05) {
      throw new Error(`Audio multicapa inválido: ${entry.file}`);
    }
    const originalRange = ranges.find((range) => range.layer === entry.layer)!;
    const forte = files.find((other) => other.midi === entry.midi && other.layer === 16)!;
    bank.add({
      midi: entry.midi,
      buffer,
      velocityLayer: entry.layer,
      velocityCenter: (originalRange.sourceVelocityRange[0] + originalRange.sourceVelocityRange[1]) / 2,
      gainCompensation: forte.attackRms250ms / entry.attackRms250ms,
    });
    loaded++;
    const decodedPcmBytes = bank.decodedPcmBytes;
    if (decodedPcmBytes > MAX_LAYERED_PCM_BYTES) {
      throw new Error("El piano multicapa excede el límite de memoria decodificada");
    }
    onProgress({ loaded, total: LAYERED_SAMPLE_COUNT, decodedPcmBytes });
  }
  if (bank.size !== LAYERED_SAMPLE_COUNT || bank.coverage(48, 84, 2).missing.length) {
    throw new Error("El piano multicapa no cubre las 37 teclas");
  }
  return { bank, levelMatchGain };
}
