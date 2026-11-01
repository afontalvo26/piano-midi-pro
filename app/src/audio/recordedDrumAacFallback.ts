/** Local AAC-LC copies of the same pinned CC0 drum performances, for older Safari. */
type Pack = "virtuosity" | "freepats-handclap";

const PACKS = {
  virtuosity: {
    manifestHash: "cb4ceaafd3b60be07780435a0315c3bd968261fd55c9d416ddc6d2c2d810223d",
    sourceHash: "d58ba219cf99765a7ad752637e5e037d2e000e9fef44e079a3df97396dece93f",
    version: "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc", count: 38,
  },
  "freepats-handclap": {
    manifestHash: "88d8eabfa1beef453aaedaf5142d4999999c40da9dd69428a04550d8c439acea",
    sourceHash: "21e46735d3f673908cb912ec5aca1ef858b684e19d4b5dc3b28ebac26acf0380",
    version: "e54eb2912a0d6d4444ab205d52f778e27da0fc96", count: 9,
  },
} as const;

interface FallbackSample {
  readonly sourceFile: string;
  readonly sourceBytes: number;
  readonly sourceSha256: string;
  readonly file: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bytes: number;
  readonly sha256: string;
}

interface FallbackManifest {
  readonly packId: string;
  readonly sourceVersion: string;
  readonly sourceManifestSha256: string;
  readonly license: string;
  readonly codec: string;
  readonly container: string;
  readonly files: readonly FallbackSample[];
}

const manifests = new Map<Pack, Promise<FallbackManifest>>();

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (part) => part.toString(16).padStart(2, "0")).join("");
}

async function loadManifest(pack: Pack): Promise<FallbackManifest> {
  if (!globalThis.crypto?.subtle) throw new Error(`${pack} AAC: SHA-256 no disponible`);
  const response = await fetch(`/audio/${pack}/core-aac/manifest.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${pack} AAC manifest HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const expected = PACKS[pack];
  if (await sha256(bytes) !== expected.manifestHash) {
    throw new Error(`${pack} AAC: hash del manifiesto inválido`);
  }
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as FallbackManifest;
  if (manifest.packId !== `${pack}-core-aac` ||
      manifest.sourceVersion !== expected.version ||
      manifest.sourceManifestSha256 !== expected.sourceHash ||
      manifest.license !== "CC0-1.0" || manifest.codec !== "AAC-LC" ||
      manifest.container !== "M4A/MP4" || !Array.isArray(manifest.files) ||
      manifest.files.length !== expected.count) {
    throw new Error(`${pack} AAC: procedencia, licencia o codec inválido`);
  }
  return manifest;
}

/** Run after OGG integrity has passed but its decodeAudioData call fails. */
export async function decodeRecordedDrumAacFallback(context: BaseAudioContext, pack: Pack,
  source: { readonly file: string; readonly sha256: string;
    readonly byteLength: number }): Promise<AudioBuffer> {
  let task = manifests.get(pack);
  if (!task) { task = loadManifest(pack); manifests.set(pack, task); }
  let manifest: FallbackManifest;
  try { manifest = await task; }
  catch (error) { if (manifests.get(pack) === task) manifests.delete(pack); throw error; }
  const item = manifest.files.find((file) => file.sourceFile === source.file);
  if (!item || item.sourceSha256 !== source.sha256 ||
      item.sourceBytes !== source.byteLength ||
      item.file !== source.file.replace(/\.ogg$/, ".m4a") ||
      ![44_100, 48_000].includes(item.sampleRate) ||
      ![1, 2].includes(item.channels) ||
      !Number.isSafeInteger(item.bytes) || item.bytes < 1000 || item.bytes > 1_000_000 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)) {
    throw new Error(`${pack} AAC ${source.file}: derivado no coincide con fuente`);
  }
  const response = await fetch(`/audio/${pack}/core-aac/${item.file}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${pack} AAC ${item.file} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (bytes.byteLength !== item.bytes || header.length !== 8 ||
      String.fromCharCode(...header.slice(4, 8)) !== "ftyp" ||
      await sha256(bytes) !== item.sha256) {
    throw new Error(`${pack} AAC ${item.file}: tamaño, MP4 o SHA-256 inválido`);
  }
  const buffer = await context.decodeAudioData(bytes.slice(0));
  if (buffer.length < 1 || buffer.numberOfChannels !== item.channels ||
      buffer.duration > 30) {
    throw new Error(`${pack} AAC ${item.file}: PCM inválido`);
  }
  return buffer;
}
