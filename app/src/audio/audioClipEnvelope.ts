export interface AudioClipCrossfadeRamp {
  readonly id: string;
  readonly role: "in" | "out";
  readonly startUs: number;
  readonly endUs: number;
  readonly curve: "linear" | "equalPower";
}

export interface AudioClipEnvelope {
  readonly envelopeStartFrame: number;
  readonly envelopeEndFrame: number;
  readonly fadeInFrames: number;
  readonly fadeOutFrames: number;
  readonly crossfades: readonly AudioClipCrossfadeRamp[];
}

interface GainAutomation {
  setValueAtTime(value: number, at: number): unknown;
  linearRampToValueAtTime(value: number, at: number): unknown;
}

const CURVE_STEPS = 64;
const END_SAFETY_SECONDS = 0.005;

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Source-frame anchors survive split, so child clips keep the original fade curve. */
export function clipEnvelopeGainAt(envelope: AudioClipEnvelope, sourceFrame: number,
  songUs: number): number {
  const inGain = envelope.fadeInFrames > 0
    ? clamp01((sourceFrame - envelope.envelopeStartFrame) / envelope.fadeInFrames) : 1;
  const outGain = envelope.fadeOutFrames > 0
    ? clamp01((envelope.envelopeEndFrame - sourceFrame) / envelope.fadeOutFrames) : 1;
  let gain = Math.min(inGain, outGain);
  for (const fade of envelope.crossfades) {
    const progress = clamp01((songUs - fade.startUs) / (fade.endUs - fade.startUs));
    const factor = fade.curve === "equalPower"
      ? fade.role === "in" ? Math.sin(progress * Math.PI / 2)
        : Math.cos(progress * Math.PI / 2)
      : fade.role === "in" ? progress : 1 - progress;
    gain *= factor;
  }
  return gain;
}

/** Bounded AudioParam plan; musical fades and crossfades share exact song time. */
export function scheduleClipEnvelope(param: GainAutomation, envelope: AudioClipEnvelope,
  at: number, endAt: number, sourceFrame: number, sampleRate: number,
  songTimeUs: number, level: number): void {
  if (!Number.isFinite(at) || !Number.isFinite(endAt) || endAt <= at ||
      !Number.isFinite(sourceFrame) || !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(songTimeUs) || !Number.isFinite(level) || level < 0) {
    throw new RangeError("Envolvente de clip inválida");
  }
  const times = new Set<number>([at, endAt]);
  const frameTime = (frame: number): number => at + (frame - sourceFrame) / sampleRate;
  const songTime = (us: number): number => at + (us - songTimeUs) / 1_000_000;
  for (const frame of [envelope.envelopeStartFrame,
    envelope.envelopeStartFrame + envelope.fadeInFrames,
    envelope.envelopeEndFrame - envelope.fadeOutFrames,
    envelope.envelopeEndFrame]) {
    const time = frameTime(frame);
    if (time > at && time < endAt) times.add(time);
  }
  for (const fade of envelope.crossfades) {
    for (let step = 0; step <= CURVE_STEPS; step++) {
      const us = fade.startUs + (fade.endUs - fade.startUs) * step / CURVE_STEPS;
      const time = songTime(us);
      if (time > at && time < endAt) times.add(time);
    }
  }
  const atEnd = clipEnvelopeGainAt(envelope,
    sourceFrame + (endAt - at) * sampleRate,
    songTimeUs + (endAt - at) * 1_000_000);
  if (atEnd > 1e-8) times.add(Math.max(at, endAt - END_SAFETY_SECONDS));
  const valueAt = (time: number): number => {
    const frame = sourceFrame + (time - at) * sampleRate;
    const us = songTimeUs + (time - at) * 1_000_000;
    const musical = clipEnvelopeGainAt(envelope, frame, us);
    const safety = atEnd > 1e-8 && time > endAt - END_SAFETY_SECONDS
      ? clamp01((endAt - time) / Math.min(END_SAFETY_SECONDS, endAt - at)) : 1;
    return level * musical * safety;
  };
  const ordered = [...times].sort((left, right) => left - right);
  param.setValueAtTime(valueAt(at), at);
  for (const time of ordered) {
    if (time > at) param.linearRampToValueAtTime(valueAt(time), time);
  }
}
