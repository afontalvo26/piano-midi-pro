/**
 * Audio Constants
 * 
 * Contains all audio-related constants including default values,
 * ranges, and audio engine configuration.
 */

// Default Audio Settings
export const DEFAULT_VOLUME = 0.8;
export const DEFAULT_REVERB_DECAY = 1.8; // seconds
export const DEFAULT_REVERB_WET = 0.15; // 15% wet signal
export const DEFAULT_SUSTAIN_TIME = 1.2; // seconds
export const DEFAULT_ATTACK_TIME = 0.005; // seconds
export const DEFAULT_RELEASE_TIME = 0.8; // seconds

// Audio Ranges
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const REVERB_DECAY_MIN = 0.1;
export const REVERB_DECAY_MAX = 10;
export const SUSTAIN_TIME_MIN = 0.1;
export const SUSTAIN_TIME_MAX = 4;
export const PAN_MIN = -1; // Full left
export const PAN_MAX = 1;  // Full right

// Voice allocation for the Tone.PolySynth fallback instruments.
//
// `Tone.PolySynth` does NOT steal voices: once the pool is exhausted it logs
// "Max polyphony exceeded. Note dropped." and the note never sounds — heard by
// the player as a key that was ignored. Piano music routinely holds 10-20 notes
// (chords plus sustain pedal), so the old cap of 6 dropped notes during ordinary
// two-hand playing.
//
// `DEFAULT_POLYPHONY` covers live input (track index 99) and any instrument with
// no dedicated engine. Notes beyond the cap are still protected by the growth
// guard in `triggerAttack`.
export const DEFAULT_POLYPHONY = 32;
export const MAX_POLYPHONY = 96;
export const TRACK_POLYPHONY: Record<number, number> = {
  0: 32,
  1: 24,
  2: 24,
  99: 32,
};

// Sample Rates
export const SAMPLE_RATE = 44100; // Hz
export const BUFFER_SIZE = 2048;

// Audio Context Settings
export const AUDIO_CONTEXT_LATENCY = "interactive" as const; // or "balanced" or "playback"
export const AUDIO_CONTEXT_SAMPLE_RATE = 44100;

// Tone.js Transport Settings
export const DEFAULT_BPM = 120;
export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const DEFAULT_TIME_SIGNATURE = "4/4" as const;

// Piano Pedal Settings
export const SUSTAIN_PEDAL_RELEASE_TIME = 0.5; // seconds
export const SOSTENUTO_PEDAL_RELEASE_TIME = 0.3; // seconds
export const UNA_CORDA_VOLUME_REDUCTION = 0.7; // 30% volume reduction
export const HALF_PEDAL_MIN = 0;
export const HALF_PEDAL_MAX = 1;

// Reverb Presets
export const REVERB_PRESETS = {
  none: { decay: 0, wet: 0 },
  small: { decay: 0.8, wet: 0.1 },
  medium: { decay: 1.8, wet: 0.15 },
  large: { decay: 3.5, wet: 0.25 },
  hall: { decay: 5.0, wet: 0.35 },
} as const;

// Instrument Volume Defaults (by family)
export const INSTRUMENT_VOLUMES = {
  piano: 0.8,
  strings: 0.7,
  brass: 0.75,
  woodwinds: 0.7,
  percussion: 0.85,
  synth: 0.75,
  default: 0.8,
} as const;

// Audio File Formats
export const SUPPORTED_AUDIO_FORMATS = [
  "audio/wav",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
] as const;

// MIDI Velocity Ranges
export const VELOCITY_MIN = 0;
export const VELOCITY_MAX = 127;
export const VELOCITY_DEFAULT = 64;

// MIDI Velocity to Volume Mapping
export function velocityToVolume(velocity: number): number {
  // Exponential curve for more natural dynamics
  const normalized = Math.max(0, Math.min(1, velocity / 127));
  return Math.pow(normalized, 1.5);
}

// Volume to dB conversion
export function volumeToDb(volume: number): number {
  if (volume <= 0) return -Infinity;
  return 20 * Math.log10(volume);
}

// dB to Volume conversion
export function dbToVolume(db: number): number {
  if (db === -Infinity) return 0;
  return Math.pow(10, db / 20);
}

// Pan to stereo position (returns [left, right] gains)
export function panToStereo(pan: number): [number, number] {
  // Equal power panning
  const normalized = Math.max(-1, Math.min(1, pan));
  const angle = (normalized + 1) * Math.PI / 4; // 0 to π/2
  const left = Math.cos(angle);
  const right = Math.sin(angle);
  return [left, right];
}

// Frequency to MIDI note conversion
export function frequencyToMIDI(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

// MIDI note to frequency conversion
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Calculate note duration in seconds from BPM and note value
export function calculateNoteDuration(
  bpm: number,
  noteValue: number = 4, // 4 = quarter note
): number {
  const quarterNoteDuration = 60 / bpm; // seconds per quarter note
  return quarterNoteDuration * (4 / noteValue);
}

// Audio Engine States
export const AUDIO_ENGINE_STATES = {
  uninitialized: "uninitialized",
  initializing: "initializing",
  ready: "ready",
  error: "error",
} as const;

export type AudioEngineState = typeof AUDIO_ENGINE_STATES[keyof typeof AUDIO_ENGINE_STATES];

// Sampler Loading States
export const SAMPLER_STATES = {
  idle: "idle",
  loading: "loading",
  loaded: "loaded",
  error: "error",
} as const;

export type SamplerState = typeof SAMPLER_STATES[keyof typeof SAMPLER_STATES];

// Made with Bob
