import type { DecodedUserSample } from "./userSampleAsset.ts";

export const TR808_FISCHER_VERSION = "85fbecf1bec32553395625ea659e2a56dfd7c0e1";
export const TR808_FISCHER_SOURCE_NOTES = {
  36: "kick", 38: "snare", 39: "clap", 42: "hatClosed", 46: "hatOpen",
  56: "cowbell", 37: "rim", 75: "clave", 70: "maracas", 45: "tomLow",
  47: "tomMid", 50: "tomHigh", 64: "congaLow", 62: "congaMid",
  63: "congaHigh", 49: "cymbal",
} as const;

interface Tr808Sample {
  readonly sourceNote: number;
  readonly articulation: string;
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly frameCount: number;
}

interface Tr808BassSample {
  readonly presetId: "long-50-10";
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly frameCount: number;
  readonly measuredFundamentalHz: number;
  readonly rootMidi: number;
  readonly tuningCents: number;
}

export interface Tr808FischerManifest {
  readonly packId: "tr808-fischer-core";
  readonly version: string;
  readonly source: string;
  readonly license: "CC0-1.0";
  readonly creator: "Michael Fischer / Technopolis";
  readonly recording: string;
  readonly samples: readonly Tr808Sample[];
  readonly bass: Tr808BassSample;
}

const BASE = "/audio/tr808-fischer/core/";
const manifests = new Map<string, Promise<Tr808FischerManifest>>();
const decodedPieces = new WeakMap<BaseAudioContext, Map<number, Promise<Map<number, AudioBuffer[]>>>>();
const decodedBass = new WeakMap<BaseAudioContext, Promise<DecodedUserSample>>();

async function sha256(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateRow(row: Tr808Sample | Tr808BassSample, label: string): void {
  if (!/^[A-Z0-9]+\.WAV$/.test(row.file) || !/^[a-f0-9]{64}$/.test(row.sha256) ||
      !Number.isSafeInteger(row.byteLength) || row.byteLength < 44 || row.byteLength > 2 * 1024 * 1024 ||
      row.sampleRate !== 44_100 || row.channelCount !== 1 ||
      !Number.isSafeInteger(row.frameCount) || row.frameCount < 1) {
    throw new Error(`${label} inválida en el manifiesto TR-808`);
  }
}

export function fetchTr808FischerManifest(): Promise<Tr808FischerManifest> {
  const existing = manifests.get(BASE);
  if (existing) return existing;
  const pending = fetch(`${BASE}manifest.json`, { cache: "force-cache" }).then(async (response) => {
    if (!response.ok) throw new Error(`TR-808 manifest HTTP ${response.status}`);
    const manifest = await response.json() as Tr808FischerManifest;
    if (manifest.packId !== "tr808-fischer-core" || manifest.version !== TR808_FISCHER_VERSION ||
        manifest.license !== "CC0-1.0" || manifest.creator !== "Michael Fischer / Technopolis" ||
        !manifest.source.endsWith(`/tree/${TR808_FISCHER_VERSION}`) ||
        !manifest.recording.includes("Roland TR-808 serial 103852") ||
        !Array.isArray(manifest.samples) || manifest.samples.length !== 16) {
      throw new Error("Versión, licencia o procedencia TR-808 incompatible");
    }
    const seenNotes = new Set<number>();
    const seenFiles = new Set<string>();
    for (const sample of manifest.samples) {
      validateRow(sample, `Pieza ${sample.sourceNote}`);
      if (!Object.hasOwn(TR808_FISCHER_SOURCE_NOTES, sample.sourceNote) ||
          sample.articulation !== TR808_FISCHER_SOURCE_NOTES[
            sample.sourceNote as keyof typeof TR808_FISCHER_SOURCE_NOTES
          ] || seenNotes.has(sample.sourceNote) || seenFiles.has(sample.file)) {
        throw new Error("Mapa TR-808 duplicado o no aprobado");
      }
      seenNotes.add(sample.sourceNote);
      seenFiles.add(sample.file);
    }
    validateRow(manifest.bass, "Bajo");
    if (manifest.bass.presetId !== "long-50-10" || manifest.bass.rootMidi !== 31 ||
        manifest.bass.tuningCents !== -8 ||
        Math.abs(manifest.bass.measuredFundamentalHz - 49.23248674295283) > 1e-9 ||
        seenFiles.has(manifest.bass.file)) {
      throw new Error("Preset de bajo TR-808 incompatible");
    }
    return manifest;
  }).catch((error: unknown) => {
    manifests.delete(BASE);
    throw error;
  });
  manifests.set(BASE, pending);
  return pending;
}

async function decodeVerified(context: BaseAudioContext,
  row: Tr808Sample | Tr808BassSample): Promise<AudioBuffer> {
  const response = await fetch(`${BASE}${row.file}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Falta TR-808/${row.file} (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== row.byteLength || await sha256(bytes) !== row.sha256) {
    throw new Error(`Integridad inválida de TR-808/${row.file}`);
  }
  const buffer = await context.decodeAudioData(bytes.slice(0));
  // decodeAudioData resamples to the AudioContext rate. Validate the decoded
  // duration against the signed source manifest instead of rejecting valid
  // 44.1 kHz files on the common 48 kHz device context.
  const expectedFrames = Math.round(row.frameCount * buffer.sampleRate / row.sampleRate);
  if (buffer.numberOfChannels !== row.channelCount ||
      !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 1 ||
      Math.abs(buffer.length - expectedFrames) > 2) {
    throw new Error(`Formato decodificado inválido de TR-808/${row.file}`);
  }
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const pcm = buffer.getChannelData(channel);
    for (let frame = 0; frame < pcm.length; frame++) {
      if (!Number.isFinite(pcm[frame])) throw new Error(`PCM no finito en TR-808/${row.file}`);
    }
  }
  return buffer;
}

export async function decodeTr808FischerPiece(manifest: Tr808FischerManifest,
  sourceNote: number, context: BaseAudioContext): Promise<Map<number, AudioBuffer[]>> {
  let perContext = decodedPieces.get(context);
  if (!perContext) { perContext = new Map(); decodedPieces.set(context, perContext); }
  const existing = perContext.get(sourceNote);
  if (existing) return existing;
  const row = manifest.samples.find((sample) => sample.sourceNote === sourceNote);
  if (!row) throw new Error(`TR-808 no contiene la pieza MIDI ${sourceNote}`);
  const pending = decodeVerified(context, row).then((buffer) => new Map([[127, [buffer]]]));
  perContext.set(sourceNote, pending);
  return pending;
}

export function loadTr808FischerBass(context: BaseAudioContext): Promise<DecodedUserSample> {
  const existing = decodedBass.get(context);
  if (existing) return existing;
  const pending = fetchTr808FischerManifest().then(async (manifest) => {
    const buffer = await decodeVerified(context, manifest.bass);
    return {
      ref: {
        id: "official:tr808-fischer:BD5010", sha256: manifest.bass.sha256,
        byteLength: manifest.bass.byteLength, mimeType: "audio/wav", sourceKind: "official",
        license: manifest.license, creator: manifest.creator, sourceUrl: manifest.source,
        packageVersion: manifest.version, frameCount: manifest.bass.frameCount,
        sampleRate: manifest.bass.sampleRate, channelCount: manifest.bass.channelCount,
      },
      buffer,
      pcmBytes: buffer.length * buffer.numberOfChannels * 4,
    } satisfies DecodedUserSample;
  }).catch((error: unknown) => {
    decodedBass.delete(context);
    throw error;
  });
  decodedBass.set(context, pending);
  return pending;
}

export function tr808FischerBassRegion(buffer: AudioBuffer) {
  return {
    startFrame: 0, endFrame: buffer.length, fadeInFrames: 64, fadeOutFrames: 256,
    rootMidi: 31, cents: -8, reverse: false, loopMode: "none" as const,
    playMode: "gate" as const,
  };
}
