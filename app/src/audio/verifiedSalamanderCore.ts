import { DecodedPianoSampleBank } from "./toneSampleVoiceFactory";
import { decodeSalamanderAacFallback } from "./salamanderAacFallback.ts";

/** SHA-256 of the shipped seven-sample manifest, pinned in project refs. */
export const SALAMANDER_CORE_PACKAGE_VERSION =
  "sha256:3554c3717e4a7f6cb343fd7c14cd515f22f735be20f67b5d75f2d93fe452ba10";

const CORE = [
  { note: "C3", file: "C3.ogg", midi: 48 },
  { note: "F#3", file: "Fs3.ogg", midi: 54 },
  { note: "C4", file: "C4.ogg", midi: 60 },
  { note: "F#4", file: "Fs4.ogg", midi: 66 },
  { note: "C5", file: "C5.ogg", midi: 72 },
  { note: "F#5", file: "Fs5.ogg", midi: 78 },
  { note: "C6", file: "C6.ogg", midi: 84 },
] as const;

interface SampleEntry {
  readonly note: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface Manifest {
  readonly author: string;
  readonly license: string;
  readonly files: readonly SampleEntry[];
}

const cached = new WeakMap<BaseAudioContext, Promise<DecodedPianoSampleBank>>();

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (part) => part.toString(16).padStart(2, "0")).join("");
}

async function load(context: BaseAudioContext): Promise<DecodedPianoSampleBank> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 no disponible para piano de proyecto");
  const manifestResponse = await fetch("/audio/salamander/core/manifest.json", { cache: "force-cache" });
  if (!manifestResponse.ok) throw new Error(`Salamander manifest HTTP ${manifestResponse.status}`);
  const manifestBytes = await manifestResponse.arrayBuffer();
  if (`sha256:${await sha256(manifestBytes)}` !== SALAMANDER_CORE_PACKAGE_VERSION) {
    throw new Error("Salamander: versión/hash del manifiesto no coincide con el proyecto");
  }
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
  if (manifest.author !== "Alexander Holm" ||
      manifest.license !== "https://creativecommons.org/licenses/by/3.0/" ||
      !Array.isArray(manifest.files) || manifest.files.length !== CORE.length) {
    throw new Error("Salamander: manifiesto o licencia alterados");
  }
  const bank = new DecodedPianoSampleBank();
  for (const expected of CORE) {
    const entry = manifest.files.find((item) => item.note === expected.note);
    if (!entry || entry.file !== expected.file ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 4 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Salamander ${expected.note}: muestra no declarada`);
    }
    const response = await fetch(`/audio/salamander/core/${entry.file}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Salamander ${entry.file} HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
    if (bytes.byteLength !== entry.bytes || header.length !== 4 ||
        header[0] !== 0x4f || header[1] !== 0x67 ||
        header[2] !== 0x67 || header[3] !== 0x53 ||
        await sha256(bytes) !== entry.sha256) {
      throw new Error(`Salamander ${entry.file}: OGG, tamaño o SHA-256 inválido`);
    }
    let buffer: AudioBuffer;
    try { buffer = await context.decodeAudioData(bytes.slice(0)); }
    catch {
      buffer = await decodeSalamanderAacFallback(context,
        expected.note, entry.file, entry.sha256);
    }
    if (buffer.length < 1 || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2) {
      throw new Error(`Salamander ${entry.file}: PCM inválido`);
    }
    bank.add({ midi: expected.midi, buffer });
  }
  if (bank.coverage(48, 84, 6).missing.length) throw new Error("Salamander: faltan las 37 teclas");
  return bank;
}

/** Same exact local recordings for live project playback and isolated WAV export. */
export async function loadVerifiedSalamanderCore(context: BaseAudioContext):
  Promise<DecodedPianoSampleBank> {
  const prior = cached.get(context);
  if (prior) return prior;
  const task = load(context);
  cached.set(context, task);
  try { return await task; }
  catch (error) { cached.delete(context); throw error; }
}
