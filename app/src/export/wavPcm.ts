export type WavPcmFormat = "pcm16" | "pcm24";

export interface StereoPcm {
  readonly sampleRate: 44_100 | 48_000;
  readonly left: Float32Array;
  readonly right: Float32Array;
}

export interface WavPcmOptions {
  readonly format: WavPcmFormat;
  /** Omitted preserves source gain. When set, peak is brought to this dBFS. */
  readonly normalizePeakDbfs?: number;
  /** TPDF dither is deterministic for the same seed. Default: true. */
  readonly dither?: boolean;
  readonly seed?: string;
}

export interface WavPcmReport {
  readonly channels: 2;
  readonly sampleRate: number;
  readonly frames: number;
  readonly durationSeconds: number;
  readonly format: WavPcmFormat;
  readonly sourcePeak: number;
  readonly outputPeak: number;
  readonly rmsDbfs: number;
  readonly normalizationGainDb: number;
  readonly byteLength: number;
  readonly dithered: boolean;
}

export interface EncodedWavPcm {
  readonly bytes: Uint8Array;
  readonly report: WavPcmReport;
}

export class WavPcmError extends Error {
  readonly code: "invalid-pcm" | "silent" | "clipping" | "oversize";
  readonly count: number;

  constructor(code: WavPcmError["code"], message: string, count = 0) {
    super(message);
    this.name = "WavPcmError";
    this.code = code;
    this.count = count;
  }
}

const MAX_WAV_BYTES = 256 * 1024 * 1024;
const MAX_SECONDS = 15 * 60;
const HEADER_BYTES = 44;

function randomSeed(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function analyze(pcm: StereoPcm): { peak: number; rms: number; overs: number } {
  if (!(pcm.left instanceof Float32Array) || !(pcm.right instanceof Float32Array) ||
      pcm.left.length !== pcm.right.length || pcm.left.length < 1 ||
      (pcm.sampleRate !== 44_100 && pcm.sampleRate !== 48_000) ||
      pcm.left.length > pcm.sampleRate * MAX_SECONDS) {
    throw new WavPcmError("invalid-pcm", "PCM estéreo, frecuencia o duración inválidos");
  }
  let peak = 0;
  let sumSquares = 0;
  let overs = 0;
  for (let index = 0; index < pcm.left.length; index++) {
    const left = pcm.left[index]!;
    const right = pcm.right[index]!;
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      throw new WavPcmError("invalid-pcm", `PCM no finito en frame ${index}`);
    }
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    sumSquares += left * left + right * right;
    if (Math.abs(left) > 1) overs++;
    if (Math.abs(right) > 1) overs++;
  }
  return { peak, rms: Math.sqrt(sumSquares / (pcm.left.length * 2)), overs };
}

/** RIFF/WAVE PCM16 or PCM24. This pure function belongs in the Worker for mobile UI calls. */
export function encodeWavPcm(pcm: StereoPcm, options: WavPcmOptions): EncodedWavPcm {
  if (options.format !== "pcm16" && options.format !== "pcm24") {
    throw new WavPcmError("invalid-pcm", "Formato WAV no implementado");
  }
  const target = options.normalizePeakDbfs;
  if (target !== undefined && (!Number.isFinite(target) || target < -18 || target > -0.1)) {
    throw new WavPcmError("invalid-pcm", "Normalización debe estar entre -18 y -0.1 dBFS");
  }
  const seed = options.seed ?? "pmp-wav-v1";
  if (typeof seed !== "string" || seed.length < 1 || seed.length > 128) {
    throw new WavPcmError("invalid-pcm", "Semilla de dither inválida");
  }
  const { peak, rms, overs } = analyze(pcm);
  if (peak < 0.00001 || rms < 0.000001) {
    throw new WavPcmError("silent", "El render no contiene señal audible verificable");
  }
  if (overs > 0 && target === undefined) {
    throw new WavPcmError("clipping", "El render excede 0 dBFS; normaliza o corrige la mezcla", overs);
  }
  const gain = target === undefined ? 1 : 10 ** (target / 20) / peak;
  const outputPeak = peak * gain;
  if (!Number.isFinite(gain) || outputPeak > 1) {
    throw new WavPcmError("clipping", "La normalización excede 0 dBFS");
  }
  const bytesPerSample = options.format === "pcm16" ? 2 : 3;
  const dataBytes = pcm.left.length * 2 * bytesPerSample;
  const total = HEADER_BYTES + dataBytes;
  if (!Number.isSafeInteger(total) || total > MAX_WAV_BYTES || total > 0xffff_ffff) {
    throw new WavPcmError("oversize", "WAV excede 256 MiB o el límite RIFF");
  }
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  for (const [offset, name] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
    for (let index = 0; index < 4; index++) bytes[offset + index] = name.charCodeAt(index);
  }
  view.setUint32(4, total - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * 2 * bytesPerSample, true);
  view.setUint16(32, 2 * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  view.setUint32(40, dataBytes, true);
  const dithered = options.dither !== false;
  const random = randomSeed(seed);
  const integerMax = options.format === "pcm16" ? 32767 : 8388607;
  let offset = HEADER_BYTES;
  for (let index = 0; index < pcm.left.length; index++) {
    for (let channel = 0; channel < 2; channel++) {
      const raw = channel === 0 ? pcm.left[index]! : pcm.right[index]!;
      const value = raw * gain;
      // At exact full scale, one dither LSB could overflow the signed format.
      const noise = dithered && Math.abs(value) < 1 - 1 / integerMax ? random() - random() : 0;
      const quantized = Math.round(value * integerMax + noise);
      if (quantized < -integerMax - 1 || quantized > integerMax) {
        throw new WavPcmError("clipping", "El PCM cuantizado excede el formato");
      }
      if (bytesPerSample === 2) {
        view.setInt16(offset, quantized, true);
      } else {
        bytes[offset] = quantized & 0xff;
        bytes[offset + 1] = (quantized >>> 8) & 0xff;
        bytes[offset + 2] = (quantized >>> 16) & 0xff;
      }
      offset += bytesPerSample;
    }
  }
  return { bytes, report: { channels: 2, sampleRate: pcm.sampleRate, frames: pcm.left.length,
    durationSeconds: pcm.left.length / pcm.sampleRate, format: options.format,
    sourcePeak: peak, outputPeak, rmsDbfs: 20 * Math.log10(rms * gain),
    normalizationGainDb: 20 * Math.log10(gain), byteLength: bytes.byteLength, dithered } };
}

/** Validates a delivered WAV header and frame alignment before download. */
export function validateWavPcm(bytes: Uint8Array): {
  readonly frames: number; readonly sampleRate: number; readonly format: WavPcmFormat } {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_BYTES) {
    throw new WavPcmError("invalid-pcm", "WAV vacío o truncado");
  }
  const fourcc = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bits = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  const rate = view.getUint32(24, true);
  if (fourcc(0) !== "RIFF" || fourcc(8) !== "WAVE" || fourcc(12) !== "fmt " ||
      fourcc(36) !== "data" || view.getUint32(4, true) !== bytes.byteLength - 8 ||
      view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 2 || (rate !== 44_100 && rate !== 48_000) ||
      (bits !== 16 && bits !== 24) || view.getUint16(32, true) !== bits / 4 ||
      view.getUint32(28, true) !== rate * bits / 4 ||
      dataBytes !== bytes.byteLength - HEADER_BYTES || dataBytes < bits / 4 ||
      dataBytes % (bits / 4) !== 0) {
    throw new WavPcmError("invalid-pcm", "Cabecera, duración o canales WAV inválidos");
  }
  return { frames: dataBytes / (bits / 4), sampleRate: rate,
    format: bits === 16 ? "pcm16" : "pcm24" };
}
