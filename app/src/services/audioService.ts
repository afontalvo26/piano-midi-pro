import * as Tone from "tone";

// Salamander Grand Piano sample map used by Tone.Sampler.
// Mirrors the constant in App.tsx; kept here so non-React code can configure
// the sampler without pulling in component state.
export const salamanderSamples: Record<string, string> = {
  A0: "A0.ogg",
  C1: "C1.ogg",
  "D#1": "Ds1.ogg",
  "F#1": "Fs1.ogg",
  A1: "A1.ogg",
  C2: "C2.ogg",
  "D#2": "Ds2.ogg",
  "F#2": "Fs2.ogg",
  A2: "A2.ogg",
  C3: "C3.ogg",
  "D#3": "Ds3.ogg",
  "F#3": "Fs3.ogg",
  A3: "A3.ogg",
  C4: "C4.ogg",
  "D#4": "Ds4.ogg",
  "F#4": "Fs4.ogg",
  A4: "A4.ogg",
  C5: "C5.ogg",
  "D#5": "Ds5.ogg",
  "F#5": "Fs5.ogg",
  A5: "A5.ogg",
  C6: "C6.ogg",
  "D#6": "Ds6.ogg",
  "F#6": "Fs6.ogg",
  A6: "A6.ogg",
  C7: "C7.ogg",
  "D#7": "Ds7.ogg",
  "F#7": "Fs7.ogg",
  A7: "A7.ogg",
  C8: "C8.ogg",
};

// Clamp a raw dB-ish value into the safe master volume range [-40, 0] dB.
export function dbFromFloat(value: number): number {
  if (!Number.isFinite(value)) return -40;
  return Math.max(-40, Math.min(0, value));
}

// Smoothly ramp the master volume node to the target dB value.
export function setMasterVolume(
  volNode: Tone.Volume | null,
  db: number,
): void {
  if (!volNode) return;
  const safe = dbFromFloat(db);
  volNode.volume.rampTo(safe, 0.05);
}

// Update the reverb decay time. Tone.Reverb requires positive seconds.
export function setReverbDecay(
  reverb: Tone.Reverb | null,
  decay: number,
): void {
  if (!reverb) return;
  if (!Number.isFinite(decay) || decay <= 0) return;
  reverb.decay = decay;
}

// Update the chorus wet amount (0..1) — used as the user-facing "depth" knob.
export function setChorusDepth(
  chorus: Tone.Chorus | null,
  depth: number,
): void {
  if (!chorus) return;
  const clamped = Math.max(0, Math.min(1, depth));
  chorus.wet.value = clamped;
}
