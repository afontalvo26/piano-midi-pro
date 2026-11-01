/** Professionally recorded Virtuosity subset, pinned by its shipped manifest. */
import { decodeRecordedDrumAacFallback } from "./recordedDrumAacFallback.ts";

export const VIRTUOSITY_CORE_VERSION = "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc";
export const VIRTUOSITY_CORE_NOTES = {
  36: "kick",
  38: "snare",
  42: "hatClosed",
  46: "hatOpen",
  56: "cowbell",
} as const;

type Articulation = typeof VIRTUOSITY_CORE_NOTES[keyof typeof VIRTUOSITY_CORE_NOTES];

interface ManifestSample {
  readonly articulation: string;
  readonly velocityLayer: number;
  readonly roundRobin: number;
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
}

interface Manifest {
  readonly version: string;
  readonly license: string;
  readonly samples: readonly ManifestSample[];
}

const BASE = "/audio/virtuosity/core/";
const decodedByContext = new WeakMap<BaseAudioContext, Map<string, Promise<Map<number, AudioBuffer[]>>>>();

export function virtuosityArticulation(note: number): Articulation | null {
  return VIRTUOSITY_CORE_NOTES[note as keyof typeof VIRTUOSITY_CORE_NOTES] ?? null;
}

export async function fetchVirtuosityManifest(): Promise<Manifest> {
  const response = await fetch(`${BASE}manifest.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Virtuosity manifest HTTP ${response.status}`);
  const manifest = await response.json() as Manifest;
  if (manifest.version !== VIRTUOSITY_CORE_VERSION || manifest.license !== "CC0-1.0" ||
      !Array.isArray(manifest.samples)) {
    throw new Error("Virtuosity manifest version or license mismatch");
  }
  return manifest;
}

/** Each required layer is decoded and SHA-256 checked before the kit is ready. */
export async function decodeVirtuosityPiece(
  manifest: Manifest, articulation: Articulation, context: BaseAudioContext,
): Promise<Map<number, AudioBuffer[]>> {
  const samples = manifest.samples.filter((sample) => sample.articulation === articulation);
  const signature = `${articulation}:${samples.map((sample) => sample.sha256).join(":")}`;
  let cache = decodedByContext.get(context);
  if (!cache) {
    cache = new Map();
    decodedByContext.set(context, cache);
  }
  const existing = cache.get(signature);
  if (existing) return existing;
  const task = decodePieceSamples(samples, articulation, context);
  cache.set(signature, task);
  try { return await task; }
  catch (error) { cache.delete(signature); throw error; }
}

async function decodePieceSamples(samples: readonly ManifestSample[], articulation: Articulation,
  context: BaseAudioContext): Promise<Map<number, AudioBuffer[]>> {
  const expectedLayers = articulation === "snare" ? 8 : articulation === "cowbell" ? 3 : 4;
  const expectedPerLayer = articulation === "snare" ? 1 : 2;
  if (samples.length !== expectedLayers * expectedPerLayer || !globalThis.crypto?.subtle) {
    throw new Error(`Virtuosity ${articulation} incomplete or SHA-256 unavailable`);
  }
  const prepared = await Promise.all(samples.map(async (sample) => {
    if (!Number.isInteger(sample.velocityLayer) || sample.velocityLayer < 1 ||
        sample.velocityLayer > 127 || !Number.isInteger(sample.roundRobin) ||
        sample.roundRobin < 1 || sample.roundRobin > expectedPerLayer ||
        !/^[A-Za-z0-9_-]+\.ogg$/.test(sample.file) || !/^[a-f0-9]{64}$/.test(sample.sha256)) {
      throw new Error(`Virtuosity ${articulation} invalid sample metadata`);
    }
    const response = await fetch(`${BASE}${sample.file}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Virtuosity ${sample.file} HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== sample.byteLength) throw new Error(`Virtuosity ${sample.file} byte length mismatch`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, (part) => part.toString(16).padStart(2, "0")).join("");
    if (hex !== sample.sha256) throw new Error(`Virtuosity ${sample.file} SHA-256 mismatch`);
    let audio: AudioBuffer;
    try { audio = await context.decodeAudioData(bytes); }
    catch { audio = await decodeRecordedDrumAacFallback(context, "virtuosity", sample); }
    return { sample, audio };
  }));
  const layers = new Map<number, AudioBuffer[]>();
  const layerNumbers = [...new Set(prepared.map((item) => item.sample.velocityLayer))].sort((a, b) => a - b);
  if (layerNumbers.length !== expectedLayers) throw new Error(`Virtuosity ${articulation} missing velocity layers`);
  for (const layer of layerNumbers) {
    const variants = prepared.filter((item) => item.sample.velocityLayer === layer)
      .sort((a, b) => a.sample.roundRobin - b.sample.roundRobin);
    if (variants.length !== expectedPerLayer ||
        variants.some((item, index) => item.sample.roundRobin !== index + 1)) {
      throw new Error(`Virtuosity ${articulation} missing or duplicate velocity layer ${layer}`);
    }
    layers.set(layer, variants.map((item) => item.audio));
  }
  return layers;
}
