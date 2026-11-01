/** Frame coordinates always refer to the decoded asset, never rounded seconds. */
export function equalSliceBoundaries(frameCount: number, count: number): number[] {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 ||
      !Number.isSafeInteger(count) || count < 1 || count > 16 || count > frameCount) {
    throw new RangeError("Cantidad de cortes fuera del audio disponible");
  }
  return Array.from({ length: count + 1 }, (_, index) => Math.floor(index * frameCount / count));
}

export interface SliceAudioBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/** Lightweight onset suggestion; the user confirms or corrects every boundary. */
export function detectTransientBoundaries(audio: SliceAudioBuffer, sensitivity: number,
  maxSlices = 16): number[] {
  if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 1 ||
      !Number.isSafeInteger(maxSlices) || maxSlices < 1 || maxSlices > 16 ||
      !Number.isSafeInteger(audio.length) || audio.length < 1 ||
      !Number.isFinite(audio.sampleRate) || audio.sampleRate < 8_000 ||
      audio.numberOfChannels < 1 || audio.numberOfChannels > 2) {
    throw new RangeError("Parámetros de detección de cortes inválidos");
  }
  if (maxSlices === 1) return [0, audio.length];
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
  const hop = Math.max(64, Math.round(audio.sampleRate / 200));
  const minimumGap = Math.max(hop, Math.round(audio.sampleRate * 0.06));
  const floor = 0.012 + (1 - sensitivity) * 0.05;
  const rise = 1.18 + (1 - sensitivity) * 1.6;
  const candidates: { frame: number; score: number }[] = [];
  let baseline = 0;
  let lastCandidate = -minimumGap;
  for (let start = 0; start < audio.length; start += hop) {
    let peak = 0;
    const end = Math.min(audio.length, start + hop);
    for (let frame = start; frame < end; frame += 8) {
      for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
    }
    if (start >= minimumGap && start <= audio.length - minimumGap &&
        peak > floor && peak > Math.max(floor, baseline * rise) &&
        start - lastCandidate >= minimumGap) {
      const edge = Math.max(floor, peak * 0.25);
      let refinedFrame = start;
      for (let frame = start; frame < end; frame++) {
        if (channels.some((channel) => Math.abs(channel[frame] ?? 0) >= edge)) {
          refinedFrame = frame;
          break;
        }
      }
      candidates.push({ frame: refinedFrame, score: peak - baseline });
      lastCandidate = refinedFrame;
    }
    baseline = baseline * 0.88 + peak * 0.12;
  }
  const strongest = candidates.sort((a, b) => b.score - a.score);
  const chosen: number[] = [];
  for (const candidate of strongest) {
    if (chosen.every((frame) => Math.abs(frame - candidate.frame) >= minimumGap)) {
      chosen.push(candidate.frame);
      if (chosen.length === maxSlices - 1) break;
    }
  }
  chosen.sort((a, b) => a - b);
  return [0, ...chosen, audio.length];
}
