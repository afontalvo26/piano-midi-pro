import { SALAMANDER_CORE_PACKAGE_VERSION } from "./verifiedSalamanderCore.ts";

/** SHA-256 of the local AAC-LC adaptation manifest, pinned independently. */
export const SALAMANDER_AAC_FALLBACK_VERSION =
  "sha256:c596b0aadb77f53917d4f0d258c65522a79b14c94cfa6c024154b11612c0f8bf";

interface AacEntry {
  readonly note: string;
  readonly sourceFile: string;
  readonly sourceBytes: number;
  readonly sourceSha256: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface AacManifest {
  readonly sourceManifestSha256: string;
  readonly author: string;
  readonly license: string;
  readonly codec: string;
  readonly container: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly files: readonly AacEntry[];
}

let manifestPromise: Promise<AacManifest> | null = null;

async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (part) => part.toString(16).padStart(2, "0")).join("");
}

async function loadManifest(): Promise<AacManifest> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 no disponible para AAC Salamander");
  const response = await fetch("/audio/salamander/core-aac/manifest.json", { cache: "force-cache" });
  if (!response.ok) throw new Error(`Salamander AAC manifest HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (`sha256:${await digest(bytes)}` !== SALAMANDER_AAC_FALLBACK_VERSION) {
    throw new Error("Salamander AAC: hash del manifiesto inválido");
  }
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as AacManifest;
  if (manifest.sourceManifestSha256 !== SALAMANDER_CORE_PACKAGE_VERSION.slice(7) ||
      manifest.author !== "Alexander Holm" ||
      manifest.license !== "https://creativecommons.org/licenses/by/3.0/" ||
      manifest.codec !== "AAC-LC" || manifest.container !== "M4A/MP4" ||
      manifest.sampleRate !== 44_100 || manifest.channels !== 2 ||
      !Array.isArray(manifest.files) || manifest.files.length !== 7) {
    throw new Error("Salamander AAC: procedencia o codec inválido");
  }
  return manifest;
}

/** Called only after the verified OGG sample cannot be decoded. */
export async function decodeSalamanderAacFallback(context: BaseAudioContext,
  note: string, sourceFile: string, sourceSha256?: string): Promise<AudioBuffer> {
  const task = manifestPromise ??= loadManifest();
  let manifest: AacManifest;
  try { manifest = await task; }
  catch (error) { if (manifestPromise === task) manifestPromise = null; throw error; }
  const entry = manifest.files.find((file) => file.note === note);
  if (!entry || entry.sourceFile !== sourceFile ||
      (sourceSha256 !== undefined && entry.sourceSha256 !== sourceSha256) ||
      entry.file !== sourceFile.replace(/\.ogg$/, ".m4a") ||
      !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 1000 ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 1000 || entry.bytes > 1_000_000 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error(`Salamander AAC ${note}: fuente o entrada no verificada`);
  }
  const response = await fetch(`/audio/salamander/core-aac/${entry.file}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Salamander AAC ${entry.file} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8));
  if (bytes.byteLength !== entry.bytes || header.length < 8 ||
      String.fromCharCode(...header.slice(4, 8)) !== "ftyp" ||
      await digest(bytes) !== entry.sha256) {
    throw new Error(`Salamander AAC ${entry.file}: tamaño, MP4 o SHA-256 inválido`);
  }
  const buffer = await context.decodeAudioData(bytes.slice(0));
  if (buffer.length < 1 || buffer.numberOfChannels !== 2) {
    throw new Error(`Salamander AAC ${entry.file}: PCM inválido`);
  }
  return buffer;
}
