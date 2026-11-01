import type { ProjectAssetRef } from "../project/model";

/** The first local sampler supports short WAV and OGG recordings only. */
const MAX_ENCODED_BYTES = 16 * 1024 * 1024;
const MAX_DECODED_BYTES = 48 * 1024 * 1024;
const MAX_DURATION_SECONDS = 96;

export interface UserSampleLimits {
  readonly maxEncodedBytes?: number;
  readonly maxDecodedBytes?: number;
  readonly maxDurationSeconds?: number;
}

export interface UserSampleReader {
  readAsset(ref: ProjectAssetRef): Promise<Blob | null>;
}

export interface DecodedUserSample {
  readonly ref: ProjectAssetRef;
  readonly buffer: AudioBuffer;
  readonly pcmBytes: number;
}

export interface AnalyzedUserSample {
  readonly ref: ProjectAssetRef;
  /** The normalized MIME is needed by ProjectAssetStore.stageAsset. */
  readonly data: Blob;
  readonly buffer: AudioBuffer;
}

function containerMime(bytes: Uint8Array): "audio/wav" | "audio/ogg" {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 &&
      bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return "audio/wav";
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 &&
      bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  throw new Error("Muestra no admitida: se requiere WAV u OGG válido");
}

function declaredMime(mime: string, actual: "audio/wav" | "audio/ogg"): boolean {
  const normalized = mime.toLowerCase().split(";", 1)[0]?.trim();
  return actual === "audio/wav"
    ? normalized === "audio/wav" || normalized === "audio/x-wav" || normalized === "audio/wave"
    : normalized === "audio/ogg" || normalized === "application/ogg";
}

function checkBuffer(buffer: AudioBuffer, limits: UserSampleLimits = {}): number {
  const maxDuration = limits.maxDurationSeconds ?? MAX_DURATION_SECONDS;
  const maxDecoded = limits.maxDecodedBytes ?? MAX_DECODED_BYTES;
  if (!Number.isSafeInteger(buffer.length) || buffer.length < 1 ||
      !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8_000 ||
      buffer.sampleRate > 192_000 || buffer.numberOfChannels < 1 ||
      buffer.numberOfChannels > 2 || buffer.duration > maxDuration) {
    throw new Error("Muestra demasiado larga o formato de audio no admitido");
  }
  const pcmBytes = buffer.length * buffer.numberOfChannels * 4;
  if (pcmBytes > maxDecoded) throw new Error("Audio decodificado excede el límite de PCM");
  return pcmBytes;
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 no disponible en este navegador");
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(result, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function decode(data: Blob, context: BaseAudioContext,
  limits: UserSampleLimits = {}): Promise<{ buffer: AudioBuffer; hash: string;
  mimeType: "audio/wav" | "audio/ogg" }> {
  if (!(data instanceof Blob) || data.size < 12 ||
      data.size > (limits.maxEncodedBytes ?? MAX_ENCODED_BYTES)) {
    throw new Error("Audio vacío o mayor al límite de bytes admitido");
  }
  const bytes = await data.arrayBuffer();
  const mimeType = containerMime(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12)));
  if (data.type && !declaredMime(data.type, mimeType)) {
    throw new Error("El tipo declarado no coincide con el archivo de audio");
  }
  const hash = await digest(bytes);
  let buffer: AudioBuffer;
  try { buffer = await context.decodeAudioData(bytes.slice(0)); }
  catch (error) { throw new Error("No se pudo decodificar la muestra de audio", { cause: error }); }
  checkBuffer(buffer, limits);
  return { buffer, hash, mimeType };
}

/** Analyze user-controlled bytes before PRJ stages them, without publishing them. */
export async function analyzeUserSample(data: Blob, assetId: string,
  context: BaseAudioContext, sourceKind: "user" | "recorded" = "user",
  license = "user-controlled"): Promise<AnalyzedUserSample> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(assetId) || assetId.length > 128) {
    throw new RangeError("Identificador de muestra inválido");
  }
  const decoded = await decode(data, context);
  const normalized = new Blob([data], { type: decoded.mimeType });
  return {
    data: normalized, buffer: decoded.buffer,
    ref: { id: assetId, sha256: decoded.hash, byteLength: normalized.size,
      mimeType: decoded.mimeType, sourceKind, license,
      frameCount: decoded.buffer.length, sampleRate: decoded.buffer.sampleRate,
      channelCount: decoded.buffer.numberOfChannels },
  };
}

/** Recheck every boundary, even if a custom reader bypasses ProjectAssetStore. */
export async function loadVerifiedUserSample(ref: ProjectAssetRef, reader: UserSampleReader,
  context: BaseAudioContext, limits: UserSampleLimits = {}): Promise<DecodedUserSample> {
  if (ref.sourceKind !== "user" && ref.sourceKind !== "recorded") {
    throw new Error(`Activo ${ref.id}: no es una muestra propia`);
  }
  if (!/^[a-f0-9]{64}$/.test(ref.sha256) || ref.byteLength < 12 ||
      ref.byteLength > (limits.maxEncodedBytes ?? MAX_ENCODED_BYTES) ||
      !Number.isSafeInteger(ref.byteLength)) {
    throw new Error(`Activo ${ref.id}: referencia de muestra inválida`);
  }
  const data = await reader.readAsset(ref);
  if (!data) throw new Error(`Activo ${ref.id}: muestra ausente`);
  if (data.size !== ref.byteLength || !declaredMime(ref.mimeType,
    ref.mimeType.toLowerCase().includes("ogg") ? "audio/ogg" : "audio/wav")) {
    throw new Error(`Activo ${ref.id}: tamaño o MIME inválido`);
  }
  // decodeAudioData resamples to its context. Preserve the project's saved
  // frame coordinate system when reopening on a device with another rate.
  if (ref.sampleRate !== undefined && (!Number.isSafeInteger(ref.sampleRate) ||
      ref.sampleRate < 8_000 || ref.sampleRate > 192_000)) {
    throw new Error(`Activo ${ref.id}: frecuencia de muestreo inválida`);
  }
  const decodeContext = ref.sampleRate !== undefined && ref.sampleRate !== context.sampleRate
    ? new OfflineAudioContext(1, 1, ref.sampleRate) : context;
  const decoded = await decode(data, decodeContext, limits);
  if (decoded.hash !== ref.sha256 || !declaredMime(ref.mimeType, decoded.mimeType) ||
      (ref.frameCount !== undefined && ref.frameCount !== decoded.buffer.length) ||
      (ref.sampleRate !== undefined && ref.sampleRate !== decoded.buffer.sampleRate) ||
      (ref.channelCount !== undefined && ref.channelCount !== decoded.buffer.numberOfChannels)) {
    throw new Error(`Activo ${ref.id}: hash, formato o frames no coinciden`);
  }
  return { ref, buffer: decoded.buffer, pcmBytes: checkBuffer(decoded.buffer, limits) };
}

/** Cache belongs to one project sink and is dropped when that sink retires. */
export class UserSampleCache {
  private readonly cached = new Map<string, Promise<DecodedUserSample>>();
  private residentBytes = 0;
  private generation = 0;
  private readonly maxResidentBytes: number;
  constructor(maxResidentBytes = 96 * 1024 * 1024) {
    this.maxResidentBytes = maxResidentBytes;
  }

  load(ref: ProjectAssetRef, reader: UserSampleReader,
    context: BaseAudioContext, limits: UserSampleLimits = {}): Promise<DecodedUserSample> {
    const key = [ref.id, ref.sourceKind, ref.sha256, ref.byteLength, ref.mimeType, ref.frameCount ?? "",
      ref.sampleRate ?? "", ref.channelCount ?? "", limits.maxEncodedBytes ?? "",
      limits.maxDecodedBytes ?? "", limits.maxDurationSeconds ?? ""].join(":");
    const existing = this.cached.get(key);
    if (existing) return existing;
    const generation = this.generation;
    const task = loadVerifiedUserSample(ref, reader, context, limits).then((decoded) => {
      if (generation !== this.generation) throw new Error("La preparación de muestras fue cancelada");
      if (this.residentBytes + decoded.pcmBytes > this.maxResidentBytes) {
        throw new Error("Muestras del proyecto exceden el límite de PCM residente");
      }
      this.residentBytes += decoded.pcmBytes;
      return decoded;
    }).catch((error: unknown) => {
      if (generation === this.generation) this.cached.delete(key);
      throw error;
    });
    this.cached.set(key, task);
    return task;
  }

  get pcmBytes(): number { return this.residentBytes; }
  clear(): void { this.generation++; this.cached.clear(); this.residentBytes = 0; }
}
