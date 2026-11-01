/** Roberto's recorded hand claps from the FreePats World Percussion CC0 bank. */
import { decodeRecordedDrumAacFallback } from "./recordedDrumAacFallback.ts";

export const FREEPATS_HANDCLAP_VERSION = "e54eb2912a0d6d4444ab205d52f778e27da0fc96";
export const FREEPATS_HANDCLAP_NOTE = 39;

interface ManifestSample {
  readonly id: string;
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
}

interface Manifest {
  readonly packId: string;
  readonly version: string;
  readonly license: string;
  readonly sourceMidiNote: number;
  readonly projectGmNote: number;
  readonly samples: readonly ManifestSample[];
}

const BASE = "/audio/freepats-handclap/core/";
const decodedByContext = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer[]>>>();

export async function fetchFreePatsHandClapManifest(): Promise<Manifest> {
  const response = await fetch(`${BASE}manifest.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`FreePats clap manifest HTTP ${response.status}`);
  const manifest = await response.json() as Manifest;
  if (manifest.packId !== "freepats-handclap" || manifest.version !== FREEPATS_HANDCLAP_VERSION ||
      manifest.license !== "CC0-1.0" || manifest.sourceMidiNote !== 59 ||
      manifest.projectGmNote !== FREEPATS_HANDCLAP_NOTE || !Array.isArray(manifest.samples) ||
      manifest.samples.length !== 9) {
    throw new Error("FreePats clap manifest version, license or map mismatch");
  }
  return manifest;
}

export async function decodeFreePatsHandClap(manifest: Manifest,
  context: BaseAudioContext): Promise<AudioBuffer[]> {
  const signature = manifest.samples.map((sample) => sample.sha256).join(":");
  let cache = decodedByContext.get(context);
  if (!cache) { cache = new Map(); decodedByContext.set(context, cache); }
  const existing = cache.get(signature);
  if (existing) return existing;
  const task = decodeAll(manifest, context);
  cache.set(signature, task);
  try { return await task; }
  catch (error) { cache.delete(signature); throw error; }
}

async function decodeAll(manifest: Manifest, context: BaseAudioContext): Promise<AudioBuffer[]> {
  if (!globalThis.crypto?.subtle) throw new Error("FreePats clap SHA-256 no disponible");
  const seen = new Set<string>();
  return Promise.all(manifest.samples.map(async (sample) => {
    if (!/^(?:01|02)_\d{2}$/.test(sample.id) ||
        sample.file !== `${sample.id}.ogg` || seen.has(sample.id) ||
        !/^[a-f0-9]{64}$/.test(sample.sha256) || !Number.isSafeInteger(sample.byteLength) ||
        sample.byteLength < 64 || sample.byteLength > 2_000_000) {
      throw new Error("FreePats clap sample metadata invalid");
    }
    seen.add(sample.id);
    const response = await fetch(`${BASE}${sample.file}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`FreePats clap ${sample.file} HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== sample.byteLength) {
      throw new Error(`FreePats clap ${sample.file} byte length mismatch`);
    }
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== sample.sha256) throw new Error(`FreePats clap ${sample.file} SHA-256 mismatch`);
    let buffer: AudioBuffer;
    try { buffer = await context.decodeAudioData(bytes); }
    catch { buffer = await decodeRecordedDrumAacFallback(context, "freepats-handclap", sample); }
    if (buffer.length < 1 || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2 ||
        buffer.duration > 2) throw new Error(`FreePats clap ${sample.file} audio invalid`);
    return buffer;
  }));
}
