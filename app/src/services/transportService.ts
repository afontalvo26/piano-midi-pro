import * as Tone from "tone";

// Thin wrapper around Tone.Transport so non-React layers can drive playback
// without importing Tone directly.
export const transportService = {
  start(offsetSec?: number): void {
    Tone.getTransport().start(undefined, offsetSec);
  },
  pause(): void {
    Tone.getTransport().pause();
  },
  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
  },
  seek(sec: number): void {
    Tone.getTransport().seconds = sec;
  },
  getPosition(): number {
    return Tone.getTransport().seconds;
  },
  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  },
  setPlaybackRate(rate: number): void {
    Tone.getTransport().bpm.rampTo(120 * rate, 0.05);
  },
  cancel(): void {
    Tone.getTransport().cancel();
  },
};
