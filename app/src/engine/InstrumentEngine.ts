// ============================================================
// InstrumentEngine — World-class multi-instrument synthesis
// Piano, Trumpet, Trombone, Strings, Woodwinds, Latin Percussion
// ============================================================

import * as Tone from "tone";
import type { ScoreNote, ArticulationType } from "../types/score";
import {
  getTrumpetSampler,
  getTromboneSampler,
  disposeBrassSamplers,
} from "./BrassSamplerEngine";

// ================================================================
// SHARED TYPES
// ================================================================

export type BrassMuteType =
  | "none"
  | "straight"
  | "cup"
  | "harmon"
  | "harmon-open"
  | "plunger"
  | "bucket";

export type BrassTonguing =
  | "single"
  | "double"
  | "triple"
  | "flutter"
  | "slur"
  | "legato";

export type BrassArticulation =
  | "normal"
  | "staccato"
  | "marcato"
  | "sforzando"
  | "legato"
  | "tenuto";

export type PianoVoiceLayer = "soprano" | "alto" | "tenor" | "bass" | "auto";
export type PianoArticulation =
  | "normal"
  | "staccato"
  | "staccatissimo"
  | "tenuto"
  | "marcato"
  | "legato"
  | "portato";

export type StringBowing =
  | "legato"
  | "detache"
  | "spiccato"
  | "sautille"
  | "martele"
  | "tremolo"
  | "col-legno"
  | "ricochet";
export type StringContactPoint = "ordinario" | "sul-ponticello" | "sul-tasto";
export type WoodwindFamily =
  | "flute"
  | "oboe"
  | "clarinet"
  | "bassoon"
  | "saxophone";

export type PercussionVoice =
  | "claves"
  | "conga-high"
  | "conga-mid"
  | "conga-low"
  | "bongo-high"
  | "bongo-low"
  | "timbale-high"
  | "timbale-low"
  | "cowbell"
  | "guiro"
  | "maracas"
  | "shaker"
  | "snare"
  | "kick"
  | "hihat-open"
  | "hihat-closed"
  | "crash"
  | "ride"
  | "tom-high"
  | "tom-mid"
  | "tom-low";

// Re-export legacy names for backward compat
export type TrumpetTonguing = BrassTonguing;
export type TrumpetArticulation = BrassArticulation;

// ================================================================
// PARAM INTERFACES
// ================================================================

export interface PianoNoteParams {
  midi: number;
  velocity: number;
  duration: number;
  sustainPedal: boolean;
  sostenutoActive: boolean;
  unaChordaActive: boolean;
  halfPedalLevel: number;
  voiceLayer: PianoVoiceLayer;
  isArpeggio: boolean;
  arpeggioDelay: number;
  articulation: PianoArticulation;
}

export interface TrumpetNoteParams {
  midi: number;
  velocity: number;
  duration: number;
  mute: BrassMuteType;
  tonguing: BrassTonguing;
  vibratoRate: number;
  vibratoDepth: number;
  vibratoDelay: number;
  fall?: number;
  fallSemitones?: number;
  doit?: number;
  doitSemitones?: number;
  shake?: boolean;
  shakeSemitones?: number;
  bend?: number;
  halfValve?: boolean;
  flutterRate?: number;
  articulation: BrassArticulation;
}

export interface TromboneNoteParams {
  midi: number;
  velocity: number;
  duration: number;
  mute: BrassMuteType;
  tonguing: BrassTonguing;
  vibratoRate: number;
  vibratoDepth: number;
  vibratoDelay: number;
  // Trombone-specific: natural portamento via slide
  portamento: number; // seconds to slide (0=none, 0.05-0.15=natural)
  pedalTone: boolean; // Notas pedal: timbre especial muy grave
  fall?: number;
  fallSemitones?: number;
  doit?: number;
  doitSemitones?: number;
  articulation: BrassArticulation;
}

export interface StringNoteParams {
  midi: number;
  velocity: number;
  duration: number;
  bowing: StringBowing;
  contactPoint: StringContactPoint;
  pizzicato: boolean;
  harmonic: boolean;
  snapPizzicato: boolean;
  vibrato: { rate: number; depth: number; delay: number };
  articulation: "normal" | "staccato" | "marcato" | "tenuto" | "legato";
}

export interface WoodwindNoteParams {
  midi: number;
  velocity: number;
  duration: number;
  family: WoodwindFamily;
  tonguing: "single" | "double" | "flutter" | "slur";
  vibrato: { rate: number; depth: number; delay: number };
  overblown: boolean;
  articulation: "normal" | "staccato" | "marcato" | "tenuto" | "legato";
}

export interface PercussionNoteParams {
  voice: PercussionVoice;
  velocity: number;
}

// ================================================================
// ARTICULATION TABLES
// ================================================================

const PIANO_DUR: Record<PianoArticulation, number> = {
  normal: 0.9,
  staccato: 0.45,
  staccatissimo: 0.22,
  tenuto: 1.0,
  marcato: 0.7,
  legato: 0.98,
  portato: 0.8,
};
const PIANO_VEL: Record<PianoArticulation, number> = {
  normal: 1.0,
  staccato: 0.85,
  staccatissimo: 0.75,
  tenuto: 0.95,
  marcato: 1.15,
  legato: 0.9,
  portato: 0.92,
};

const BRASS_DUR: Record<BrassArticulation, number> = {
  normal: 0.88,
  staccato: 0.42,
  marcato: 0.65,
  sforzando: 0.75,
  legato: 1.0,
  tenuto: 0.95,
};
const BRASS_VEL: Record<BrassArticulation, number> = {
  normal: 1.0,
  staccato: 0.9,
  marcato: 1.2,
  sforzando: 1.3,
  legato: 0.85,
  tenuto: 0.95,
};

const STRING_DUR: Record<StringNoteParams["articulation"], number> = {
  normal: 0.92,
  staccato: 0.35,
  marcato: 0.6,
  tenuto: 1.0,
  legato: 0.98,
};

const WOODWIND_DUR: Record<WoodwindNoteParams["articulation"], number> = {
  normal: 0.88,
  staccato: 0.4,
  marcato: 0.65,
  tenuto: 1.0,
  legato: 0.96,
};

const MUTE_PARAMS: Record<
  BrassMuteType,
  { gain: number; freq: number; type: BiquadFilterType; Q: number }
> = {
  none: { gain: 0, freq: 7800, type: "lowpass", Q: 1 },
  straight: { gain: -4, freq: 9000, type: "lowpass", Q: 1 },
  cup: { gain: -6, freq: 4500, type: "lowpass", Q: 1 },
  harmon: { gain: -8, freq: 800, type: "bandpass", Q: 4 },
  "harmon-open": { gain: -5, freq: 1200, type: "bandpass", Q: 3 },
  plunger: { gain: -3, freq: 4000, type: "lowpass", Q: 2 },
  bucket: { gain: -10, freq: 2800, type: "lowpass", Q: 1 },
};

const TONGUE_ATTACK: Record<BrassTonguing, number> = {
  single: 0.012,
  double: 0.008,
  triple: 0.006,
  flutter: 0.015,
  slur: 0.001,
  legato: 0.02,
};

// ================================================================
// PIANO ENGINE
// ================================================================

export class PianoEngine {
  private vol: Tone.Volume;
  private reverb: Tone.Reverb;
  private synth: Tone.PolySynth;
  private sampler: Tone.Sampler | null = null;
  private sustainedNotes = new Set<number>();
  private sostenutoNotes = new Set<number>();
  private sustainDown = false;
  private sostenutoDown = false;
  private halfPedalLevel = 1.0;
  unaChordaActive = false;

  constructor(destination: Tone.ToneAudioNode) {
    this.reverb = new Tone.Reverb({ decay: 1.8, wet: 0.15 });
    this.vol = new Tone.Volume(0).connect(destination);
    this.reverb.connect(this.vol);
    this.reverb.generate();

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.002, decay: 0.8, sustain: 0.3, release: 1.5 },
    }).connect(this.reverb);
    this.synth.maxPolyphony = 32;
  }

  setSampler(sampler: Tone.Sampler) {
    sampler.connect(this.reverb);
    this.sampler = sampler;
  }

  triggerNote(p: PianoNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    const vel = Math.min(
      1,
      p.velocity *
        PIANO_VEL[p.articulation] *
        this.voiceLayerMult(p.voiceLayer),
    );
    const dur = p.duration * PIANO_DUR[p.articulation];
    const release = 0.4 + this.halfPedalLevel * 2.6;
    const note = Tone.Frequency(p.midi, "midi").toNote();
    const effectiveDur = p.sustainPedal || this.sustainDown ? dur * 2.5 : dur;

    if (this.unaChordaActive) this.vol.volume.rampTo(-6, 0.05);
    else this.vol.volume.rampTo(0, 0.05);

    const offset = p.isArpeggio ? p.arpeggioDelay : 0;
    if (this.sampler?.loaded) {
      this.sampler.triggerAttackRelease(note, effectiveDur, t + offset, vel);
    } else {
      this.synth.set({ envelope: { release } });
      this.synth.triggerAttackRelease(note, effectiveDur, t + offset, vel);
    }

    if (p.sustainPedal || this.sustainDown) this.sustainedNotes.add(p.midi);
    if (p.sostenutoActive || this.sostenutoDown)
      this.sostenutoNotes.add(p.midi);
  }

  pressSustainPedal() {
    this.sustainDown = true;
  }
  releaseSustainPedal() {
    this.sustainDown = false;
    this.sustainedNotes.forEach((m) => {
      try {
        this.sampler?.triggerRelease(
          Tone.Frequency(m, "midi").toNote(),
          Tone.now() + 0.05,
        );
      } catch {
        /**/
      }
    });
    this.sustainedNotes.clear();
  }
  pressSostenuto() {
    this.sostenutoDown = true;
    this.sostenutoNotes = new Set(this.sustainedNotes);
  }
  releaseSostenuto() {
    this.sostenutoDown = false;
    this.sostenutoNotes.clear();
  }
  pressUnaCorda() {
    this.unaChordaActive = true;
    this.vol.volume.rampTo(-6, 0.05);
  }
  releaseUnaCorda() {
    this.unaChordaActive = false;
    this.vol.volume.rampTo(0, 0.05);
  }
  setHalfPedalLevel(v: number) {
    this.halfPedalLevel = Math.max(0, Math.min(1, v));
  }

  private voiceLayerMult(l: PianoVoiceLayer): number {
    return (
      { soprano: 1.1, alto: 0.92, tenor: 0.85, bass: 0.95, auto: 1.0 }[l] ?? 1.0
    );
  }

  dispose() {
    this.synth.dispose();
    this.reverb.dispose();
    this.vol.dispose();
  }
}

// ================================================================
// BRASS ENGINE (shared core for Trumpet & Trombone)
// ================================================================

class BrassEngine {
  protected vol: Tone.Volume;
  protected filter: Tone.Filter;
  protected vibrato: Tone.Vibrato;
  protected tremolo: Tone.Tremolo;
  protected distortion: Tone.Distortion;
  protected reverb: Tone.Reverb;
  protected synth: Tone.PolySynth;
  protected sampler: Tone.Sampler | null = null;
  protected currentMute: BrassMuteType = "none";

  constructor(
    destination: Tone.ToneAudioNode,
    oscType: OscillatorType = "sawtooth",
    reverbDecay = 0.8,
  ) {
    this.reverb = new Tone.Reverb({ decay: reverbDecay, wet: 0.12 });
    this.vol = new Tone.Volume(0).connect(destination);
    this.reverb.connect(this.vol);

    this.vibrato = new Tone.Vibrato({
      frequency: 5.5,
      depth: 0,
      wet: 1,
    }).connect(this.reverb);
    this.tremolo = new Tone.Tremolo({ frequency: 0, depth: 0, wet: 0 }).connect(
      this.vibrato,
    );
    this.tremolo.start();
    this.filter = new Tone.Filter({
      type: "lowpass",
      frequency: 7800,
      Q: 1,
    }).connect(this.tremolo);
    this.distortion = new Tone.Distortion(0).connect(this.filter);

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: oscType },
      envelope: { attack: 0.015, decay: 0.1, sustain: 0.85, release: 0.25 },
    }).connect(this.distortion);
    this.synth.maxPolyphony = 4;
    this.reverb.generate();
  }

  protected applyMute(mute: BrassMuteType) {
    if (mute === this.currentMute) return;
    const p = MUTE_PARAMS[mute];
    this.vol.volume.rampTo(p.gain, 0.05);
    this.filter.type = p.type as BiquadFilterType;
    this.filter.frequency.rampTo(p.freq, 0.05);
    this.filter.Q.rampTo(p.Q, 0.05);
    this.distortion.distortion = mute === "bucket" ? 0.05 : 0;
    this.currentMute = mute;
  }

  setMute(mute: BrassMuteType) {
    this.applyMute(mute);
  }

  setRealSampler(sampler: Tone.Sampler) {
    this.sampler = sampler;
  }

  releaseNote(midi: number) {
    const note = Tone.Frequency(midi, "midi").toNote();
    this.synth.triggerRelease(note);
    try {
      this.sampler?.triggerRelease(note);
    } catch {
      /* sampler may not have this note loaded */
    }
  }

  dispose() {
    this.synth.dispose();
    this.distortion.dispose();
    this.filter.dispose();
    this.tremolo.dispose();
    this.vibrato.dispose();
    this.reverb.dispose();
    this.vol.dispose();
  }
}

// ================================================================
// TRUMPET ENGINE
// ================================================================

export class TrumpetEngine extends BrassEngine {
  constructor(destination: Tone.ToneAudioNode) {
    super(destination, "sawtooth", 0.8);
  }

  triggerNote(p: TrumpetNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    this.applyMute(p.mute);

    const dur = p.duration * BRASS_DUR[p.articulation];
    const vel = Math.min(1, p.velocity * BRASS_VEL[p.articulation]);
    const note = Tone.Frequency(p.midi, "midi").toNote();

    // ── Samples reales (si disponibles) ──
    if (this.sampler?.loaded) {
      this.sampler.triggerAttackRelease(note, dur, t, vel);
      // Efectos avanzados (fall/doit/shake) usan synth fallback
      if (p.fall && p.fallSemitones) {
        Tone.Transport.scheduleOnce(() => {
          const fn = Tone.Frequency(p.midi + p.fallSemitones!, "midi").toNote();
          this.synth.triggerAttackRelease(fn, p.fall!, Tone.now(), vel * 0.35);
        }, `+${dur}`);
      }
      if (p.doit && p.doitSemitones) {
        Tone.Transport.scheduleOnce(() => {
          const dn = Tone.Frequency(p.midi + p.doitSemitones!, "midi").toNote();
          this.synth.triggerAttackRelease(dn, p.doit!, Tone.now(), vel * 0.35);
        }, `+${dur}`);
      }
      return;
    }

    // ── Fallback síntesis ──
    this.synth.set({ envelope: { attack: TONGUE_ATTACK[p.tonguing] } });

    if (p.halfValve) {
      this.synth.set({ detune: -80 });
      this.vol.volume.rampTo(MUTE_PARAMS[p.mute].gain - 10, 0.01);
    } else {
      this.synth.set({ detune: 0 });
      this.vol.volume.rampTo(MUTE_PARAMS[p.mute].gain, 0.01);
    }

    if (p.tonguing === "flutter" && p.flutterRate) {
      this.tremolo.frequency.value = p.flutterRate;
      this.tremolo.depth.value = 0.45;
      this.tremolo.wet.value = 1;
      this.distortion.distortion = 0.08;
    } else {
      this.tremolo.wet.value = 0;
      this.distortion.distortion = p.mute === "bucket" ? 0.05 : 0;
    }

    this.vibrato.frequency.value = p.vibratoRate;
    this.vibrato.depth.value = 0;
    if (p.vibratoDepth > 0) {
      const d = Math.min(1, p.vibratoDepth / 100) * 0.3;
      this.vibrato.depth.rampTo(d, p.vibratoDelay, t + p.vibratoDelay);
    }

    this.synth.triggerAttack(note, t, vel);
    this.synth.triggerRelease(note, t + dur);

    Tone.Transport.scheduleOnce(
      () => {
        this.vibrato.depth.value = 0;
        if (p.tonguing === "flutter") {
          this.tremolo.wet.value = 0;
          this.distortion.distortion = 0;
        }
      },
      `+${dur + 0.05}`,
    );

    if (p.fall && p.fallSemitones) {
      Tone.Transport.scheduleOnce(() => {
        const fn = Tone.Frequency(p.midi + p.fallSemitones!, "midi").toNote();
        this.synth.triggerAttackRelease(fn, p.fall!, Tone.now(), vel * 0.35);
      }, `+${dur}`);
    }
    if (p.doit && p.doitSemitones) {
      Tone.Transport.scheduleOnce(() => {
        const dn = Tone.Frequency(p.midi + p.doitSemitones!, "midi").toNote();
        this.synth.triggerAttackRelease(dn, p.doit!, Tone.now(), vel * 0.35);
      }, `+${dur}`);
    }
    if (p.shake && p.shakeSemitones) {
      const shakeNote = Tone.Frequency(
        p.midi + p.shakeSemitones,
        "midi",
      ).toNote();
      let alive = true,
        toggle = false;
      Tone.Transport.scheduleOnce(
        () => {
          const id = setInterval(() => {
            if (!alive) {
              clearInterval(id);
              return;
            }
            toggle = !toggle;
            if (toggle)
              this.synth.triggerAttack(shakeNote, Tone.now(), vel * 0.7);
            else this.synth.triggerRelease(shakeNote, Tone.now());
          }, 80);
          Tone.Transport.scheduleOnce(
            () => {
              alive = false;
            },
            `+${dur * 0.5}`,
          );
        },
        `+${dur * 0.4}`,
      );
    }
  }
}

// ================================================================
// TROMBONE ENGINE
// ================================================================

export class TromboneEngine extends BrassEngine {
  private lastMidi = 0;

  constructor(destination: Tone.ToneAudioNode) {
    // Trombone: darker than trumpet — lower filter, slower attack, more body
    super(destination, "sawtooth", 1.0);
    // Adjust synth for trombone character: more fundamental, less harmonics
    this.synth.set({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3 },
    });
    // Lower filter than trumpet for darker tone
    this.filter.frequency.value = 5500;
    this.reverb.wet.value = 0.14;
  }

  triggerNote(p: TromboneNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    this.applyMute(p.mute);

    const dur = p.duration * BRASS_DUR[p.articulation];
    const vel = Math.min(1, p.velocity * BRASS_VEL[p.articulation]);
    const note = Tone.Frequency(p.midi, "midi").toNote();

    // ── Samples reales (si disponibles) ──
    if (this.sampler?.loaded) {
      this.sampler.triggerAttackRelease(note, dur, t, vel);
      this.lastMidi = p.midi;
      if (p.fall && p.fallSemitones) {
        Tone.Transport.scheduleOnce(() => {
          const fn = Tone.Frequency(p.midi + p.fallSemitones!, "midi").toNote();
          this.synth.triggerAttackRelease(fn, p.fall!, Tone.now(), vel * 0.3);
        }, `+${dur}`);
      }
      if (p.doit && p.doitSemitones) {
        Tone.Transport.scheduleOnce(() => {
          const dn = Tone.Frequency(p.midi + p.doitSemitones!, "midi").toNote();
          this.synth.triggerAttackRelease(dn, p.doit!, Tone.now(), vel * 0.3);
        }, `+${dur}`);
      }
      return;
    }

    // ── Fallback síntesis ──
    // Trombone attack is slightly slower than trumpet (slide has inertia)
    const attack =
      p.tonguing === "slur"
        ? 0.001
        : p.tonguing === "flutter"
          ? 0.02
          : p.tonguing === "double"
            ? 0.01
            : 0.018;
    this.synth.set({ envelope: { attack } });

    // Pedal tones: very low fundamental, different envelope
    if (p.pedalTone) {
      this.synth.set({ envelope: { attack: 0.05, sustain: 0.95 } });
      this.filter.frequency.value = 2000;
    } else {
      this.filter.frequency.value =
        p.mute === "none" ? 5500 : MUTE_PARAMS[p.mute].freq;
    }

    // Natural portamento from slide movement
    if (p.portamento > 0 && this.lastMidi !== 0 && this.lastMidi !== p.midi) {
      // Schedule intermediate note for the glide
      const semitonesDiff = p.midi - this.lastMidi;
      const steps = Math.abs(semitonesDiff);
      const stepTime = p.portamento / steps;
      const dir = semitonesDiff > 0 ? 1 : -1;
      for (let s = 1; s < steps; s++) {
        const glideNote = Tone.Frequency(
          this.lastMidi + dir * s,
          "midi",
        ).toNote();
        const glideTime = t + s * stepTime * 0.5;
        this.synth.triggerAttackRelease(
          glideNote,
          stepTime * 0.6,
          glideTime,
          vel * 0.3,
        );
      }
    }

    // Flutter tongue
    if (p.tonguing === "flutter") {
      this.tremolo.frequency.value = 28;
      this.tremolo.depth.value = 0.4;
      this.tremolo.wet.value = 1;
    } else {
      this.tremolo.wet.value = 0;
    }

    // Vibrato
    this.vibrato.frequency.value = p.vibratoRate;
    this.vibrato.depth.value = 0;
    if (p.vibratoDepth > 0) {
      const d = Math.min(1, p.vibratoDepth / 100) * 0.28;
      this.vibrato.depth.rampTo(d, p.vibratoDelay, t + p.vibratoDelay);
    }

    this.synth.triggerAttack(note, t, vel);
    this.synth.triggerRelease(note, t + dur);

    Tone.Transport.scheduleOnce(
      () => {
        this.vibrato.depth.value = 0;
        if (p.tonguing === "flutter") this.tremolo.wet.value = 0;
      },
      `+${dur + 0.05}`,
    );

    if (p.fall && p.fallSemitones) {
      Tone.Transport.scheduleOnce(() => {
        const fn = Tone.Frequency(p.midi + p.fallSemitones!, "midi").toNote();
        this.synth.triggerAttackRelease(fn, p.fall!, Tone.now(), vel * 0.3);
      }, `+${dur}`);
    }
    if (p.doit && p.doitSemitones) {
      Tone.Transport.scheduleOnce(() => {
        const dn = Tone.Frequency(p.midi + p.doitSemitones!, "midi").toNote();
        this.synth.triggerAttackRelease(dn, p.doit!, Tone.now(), vel * 0.3);
      }, `+${dur}`);
    }

    this.lastMidi = p.midi;
  }
}

// ================================================================
// STRING ENGINE
// ================================================================

export class StringEngine {
  private vol: Tone.Volume;
  private filter: Tone.Filter;
  private vibrato: Tone.Vibrato;
  private tremolo: Tone.Tremolo;
  private reverb: Tone.Reverb;
  private synth: Tone.PolySynth;
  private pizzSynth: Tone.PolySynth;

  constructor(destination: Tone.ToneAudioNode) {
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 });
    this.vol = new Tone.Volume(0).connect(destination);
    this.reverb.connect(this.vol);

    this.vibrato = new Tone.Vibrato({
      frequency: 5.5,
      depth: 0,
      wet: 1,
    }).connect(this.reverb);
    this.tremolo = new Tone.Tremolo({
      frequency: 12,
      depth: 0,
      wet: 0,
    }).connect(this.vibrato);
    this.tremolo.start();
    this.filter = new Tone.Filter({
      type: "lowpass",
      frequency: 6000,
      Q: 1,
    }).connect(this.tremolo);

    // Arco synth: sawtooth for rich harmonics
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.12, decay: 0.1, sustain: 0.85, release: 0.5 },
    }).connect(this.filter);
    this.synth.maxPolyphony = 16;

    // Pizzicato synth: sharp attack, quick decay
    this.pizzSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.0, release: 0.2 },
    }).connect(this.reverb);
    this.pizzSynth.maxPolyphony = 8;

    this.reverb.generate();
  }

  triggerNote(p: StringNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    const dur = p.duration * STRING_DUR[p.articulation];
    const vel = Math.min(1, p.velocity);
    const note = Tone.Frequency(p.midi, "midi").toNote();

    // ---- Pizzicato ----
    if (p.pizzicato) {
      if (p.snapPizzicato) {
        // Bartók snap: loud, percussive, brief
        const noise = new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
        }).connect(this.reverb);
        noise.triggerAttackRelease("16n", t, vel * 1.2);
        setTimeout(() => noise.dispose(), 500);
      }
      this.pizzSynth.triggerAttackRelease(note, "8n", t, vel);
      return;
    }

    // ---- Arco: contact point & bowing ----
    switch (p.contactPoint) {
      case "sul-ponticello":
        this.filter.type = "bandpass";
        this.filter.frequency.rampTo(3000, 0.1);
        this.filter.Q.rampTo(3, 0.1);
        break;
      case "sul-tasto":
        this.filter.type = "lowpass";
        this.filter.frequency.rampTo(1200, 0.1);
        this.filter.Q.rampTo(1, 0.1);
        break;
      default:
        this.filter.type = "lowpass";
        this.filter.frequency.rampTo(6000, 0.1);
        this.filter.Q.rampTo(1, 0.1);
    }

    // ---- Bowing type → attack + duration ----
    let attack: number;
    let bowDur = dur;
    let tremoloOn = false;
    let colLegno = false;

    switch (p.bowing) {
      case "detache":
        attack = 0.02;
        bowDur = dur * 0.85;
        break;
      case "spiccato":
        attack = 0.008;
        bowDur = dur * 0.25;
        break;
      case "sautille":
        attack = 0.006;
        bowDur = dur * 0.2;
        tremoloOn = false;
        break;
      case "martele":
        attack = 0.005;
        bowDur = dur * 0.65;
        break;
      case "tremolo":
        attack = 0.02;
        tremoloOn = true;
        break;
      case "col-legno":
        attack = 0.001;
        bowDur = dur * 0.5;
        colLegno = true;
        this.filter.frequency.value = 800;
        break;
      case "ricochet":
        attack = 0.005;
        bowDur = dur * 0.15;
        break;
      default:
        attack = 0.1; // legato
    }

    if (colLegno) {
      // col legno: percussive, no vibrato, filtered
      this.synth.set({ envelope: { attack: 0.001, sustain: 0.3 } });
      this.filter.frequency.value = 800;
    } else if (p.harmonic) {
      // Natural/artificial harmonic: high, pure
      this.filter.frequency.value = 9000;
      attack = 0.05;
    }

    this.synth.set({ envelope: { attack } });

    // Bow tremolo
    if (tremoloOn) {
      this.tremolo.frequency.value = 12;
      this.tremolo.depth.value = 0.6;
      this.tremolo.wet.value = 1;
    } else {
      this.tremolo.wet.value = 0;
    }

    // Vibrato
    this.vibrato.frequency.value = p.vibrato.rate;
    this.vibrato.depth.value = 0;
    if (p.vibrato.depth > 0 && !colLegno) {
      const d = Math.min(1, p.vibrato.depth / 100) * 0.35;
      this.vibrato.depth.rampTo(d, p.vibrato.delay, t + p.vibrato.delay);
    }

    this.synth.triggerAttack(note, t, vel);
    this.synth.triggerRelease(note, t + bowDur);

    Tone.Transport.scheduleOnce(
      () => {
        this.vibrato.depth.value = 0;
        if (tremoloOn) this.tremolo.wet.value = 0;
      },
      `+${bowDur + 0.05}`,
    );
  }

  releaseNote(midi: number) {
    const note = Tone.Frequency(midi, "midi").toNote();
    this.synth.triggerRelease(note);
    this.pizzSynth.triggerRelease(note);
  }

  dispose() {
    this.synth.dispose();
    this.pizzSynth.dispose();
    this.filter.dispose();
    this.vibrato.dispose();
    this.tremolo.dispose();
    this.reverb.dispose();
    this.vol.dispose();
  }
}

// ================================================================
// WOODWIND ENGINE
// ================================================================

// Character settings per instrument family
const WOODWIND_CHAR: Record<
  WoodwindFamily,
  {
    osc: OscillatorType;
    filterFreq: number;
    attack: number;
    reverb: number;
    breathiness: number;
  }
> = {
  flute: {
    osc: "sine",
    filterFreq: 5000,
    attack: 0.06,
    reverb: 0.15,
    breathiness: 0.15,
  },
  oboe: {
    osc: "sawtooth",
    filterFreq: 2500,
    attack: 0.04,
    reverb: 0.1,
    breathiness: 0.02,
  },
  clarinet: {
    osc: "square",
    filterFreq: 4000,
    attack: 0.04,
    reverb: 0.12,
    breathiness: 0.04,
  },
  bassoon: {
    osc: "sawtooth",
    filterFreq: 1800,
    attack: 0.05,
    reverb: 0.14,
    breathiness: 0.02,
  },
  saxophone: {
    osc: "sawtooth",
    filterFreq: 3500,
    attack: 0.03,
    reverb: 0.1,
    breathiness: 0.03,
  },
};

export class WoodwindEngine {
  private vol: Tone.Volume;
  private filter: Tone.Filter;
  private vibrato: Tone.Vibrato;
  private tremolo: Tone.Tremolo;
  private reverb: Tone.Reverb;
  private synths = new Map<WoodwindFamily, Tone.PolySynth>();
  private breathNoise: Tone.Noise | null = null;
  private breathGain: Tone.Volume | null = null;

  constructor(destination: Tone.ToneAudioNode) {
    this.reverb = new Tone.Reverb({ decay: 0.9, wet: 0.12 });
    this.vol = new Tone.Volume(0).connect(destination);
    this.reverb.connect(this.vol);

    this.vibrato = new Tone.Vibrato({
      frequency: 5.5,
      depth: 0,
      wet: 1,
    }).connect(this.reverb);
    this.tremolo = new Tone.Tremolo({
      frequency: 28,
      depth: 0,
      wet: 0,
    }).connect(this.vibrato);
    this.tremolo.start();
    this.filter = new Tone.Filter({
      type: "lowpass",
      frequency: 4000,
      Q: 1.2,
    }).connect(this.tremolo);

    // Lazy-create synths per family
    this.reverb.generate();
  }

  private getSynth(family: WoodwindFamily): Tone.PolySynth {
    if (!this.synths.has(family)) {
      const char = WOODWIND_CHAR[family];
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: char.osc },
        envelope: {
          attack: char.attack,
          decay: 0.1,
          sustain: 0.85,
          release: 0.25,
        },
      }).connect(this.filter);
      synth.maxPolyphony = 4;
      this.synths.set(family, synth);
    }
    return this.synths.get(family)!;
  }

  triggerNote(p: WoodwindNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    const char = WOODWIND_CHAR[p.family];
    const dur = p.duration * WOODWIND_DUR[p.articulation];
    const vel = Math.min(1, p.velocity);
    const note = Tone.Frequency(p.midi, "midi").toNote();
    const synth = this.getSynth(p.family);

    // Set filter per family
    this.filter.frequency.rampTo(char.filterFreq, 0.05);
    this.reverb.wet.value = char.reverb;

    // Clarinet register break: darker below Bb3 (MIDI 58), brighter above
    if (p.family === "clarinet") {
      const isLowRegister = p.midi < 58;
      this.filter.frequency.rampTo(isLowRegister ? 2000 : 5000, 0.05);
    }

    // Overblown: sharp, harmonic squeak
    if (p.overblown) {
      synth.set({ envelope: { attack: 0.001 } });
      this.filter.frequency.rampTo(8000, 0.02);
    }

    // Tonguing
    const attack =
      p.tonguing === "slur"
        ? 0.001
        : p.tonguing === "double"
          ? 0.008
          : p.tonguing === "flutter"
            ? char.attack * 1.5
            : char.attack;
    synth.set({ envelope: { attack } });

    // Flutter tongue
    if (p.tonguing === "flutter") {
      this.tremolo.frequency.value = 28;
      this.tremolo.depth.value = 0.4;
      this.tremolo.wet.value = 1;
    } else {
      this.tremolo.wet.value = 0;
    }

    // Vibrato
    this.vibrato.frequency.value = p.vibrato.rate;
    this.vibrato.depth.value = 0;
    if (p.vibrato.depth > 0) {
      const d = Math.min(1, p.vibrato.depth / 100) * 0.28;
      this.vibrato.depth.rampTo(d, p.vibrato.delay, t + p.vibrato.delay);
    }

    synth.triggerAttack(note, t, vel);
    synth.triggerRelease(note, t + dur);

    Tone.Transport.scheduleOnce(
      () => {
        this.vibrato.depth.value = 0;
        if (p.tonguing === "flutter") this.tremolo.wet.value = 0;
      },
      `+${dur + 0.05}`,
    );
  }

  releaseNote(midi: number) {
    const note = Tone.Frequency(midi, "midi").toNote();
    this.synths.forEach((synth) => {
      try {
        synth.triggerRelease(note);
      } catch {
        /* ignore */
      }
    });
  }

  dispose() {
    this.synths.forEach((s) => s.dispose());
    this.filter.dispose();
    this.tremolo.dispose();
    this.vibrato.dispose();
    this.reverb.dispose();
    this.vol.dispose();
    this.breathNoise?.dispose();
    this.breathGain?.dispose();
  }
}

// ================================================================
// PERCUSSION ENGINE (Latin + Standard)
// ================================================================

// GM channel 10 MIDI note → percussion voice mapping
export const GM_PERC_MAP: Record<number, PercussionVoice> = {
  35: "kick",
  36: "kick",
  38: "snare",
  40: "snare",
  42: "hihat-closed",
  44: "hihat-closed",
  46: "hihat-open",
  49: "crash",
  51: "ride",
  45: "tom-low",
  47: "tom-mid",
  48: "tom-high",
  75: "claves",
  60: "bongo-high",
  61: "bongo-low",
  62: "conga-mid",
  63: "conga-high",
  64: "conga-low",
  65: "timbale-high",
  66: "timbale-low",
  56: "cowbell",
  73: "maracas",
  74: "shaker",
  70: "maracas",
  79: "guiro",
  80: "guiro",
};

export class PercussionEngine {
  private vol: Tone.Volume;
  private reverb: Tone.Reverb;
  // Different synth types per sound category
  private metalSynth: Tone.MetalSynth; // claves, cowbell, hihat
  private membraneSynth: Tone.MembraneSynth; // kick, tom, conga
  private noiseSynth: Tone.NoiseSynth; // snare, guiro, shaker

  constructor(destination: Tone.ToneAudioNode) {
    this.reverb = new Tone.Reverb({ decay: 0.6, wet: 0.08 });
    this.vol = new Tone.Volume(-2).connect(destination);
    this.reverb.connect(this.vol);

    this.metalSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(this.reverb);

    this.membraneSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(this.reverb);

    this.noiseSynth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    }).connect(this.reverb);

    this.reverb.generate();
  }

  triggerNote(p: PercussionNoteParams, startTime?: number) {
    const t = startTime ?? Tone.now();
    const v = p.velocity;

    switch (p.voice) {
      // ---- Latin percussion ----
      case "claves":
        this.metalSynth.frequency.value = 1200;
        this.metalSynth.envelope.decay = 0.04;
        this.metalSynth.resonance = 6000;
        this.metalSynth.triggerAttack(t, v * 0.9);
        break;

      case "conga-high":
        this.membraneSynth.frequency.value = 260;
        this.membraneSynth.pitchDecay = 0.04;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;

      case "conga-mid":
        this.membraneSynth.frequency.value = 200;
        this.membraneSynth.pitchDecay = 0.06;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;

      case "conga-low":
        this.membraneSynth.frequency.value = 150;
        this.membraneSynth.pitchDecay = 0.1;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;

      case "bongo-high":
        this.membraneSynth.frequency.value = 380;
        this.membraneSynth.pitchDecay = 0.025;
        this.membraneSynth.triggerAttackRelease("16n", t, v);
        break;

      case "bongo-low":
        this.membraneSynth.frequency.value = 300;
        this.membraneSynth.pitchDecay = 0.035;
        this.membraneSynth.triggerAttackRelease("16n", t, v);
        break;

      case "timbale-high":
        this.membraneSynth.frequency.value = 500;
        this.membraneSynth.pitchDecay = 0.02;
        this.membraneSynth.octaves = 3;
        this.membraneSynth.triggerAttackRelease("16n", t, v);
        break;

      case "timbale-low":
        this.membraneSynth.frequency.value = 400;
        this.membraneSynth.pitchDecay = 0.03;
        this.membraneSynth.octaves = 3;
        this.membraneSynth.triggerAttackRelease("16n", t, v);
        break;

      case "cowbell":
        this.metalSynth.frequency.value = 560;
        this.metalSynth.envelope.decay = 0.35;
        this.metalSynth.resonance = 5600;
        this.metalSynth.triggerAttack(t, v * 0.7);
        break;

      case "maracas":
      case "shaker":
        this.noiseSynth.noise.type = "white";
        this.noiseSynth.envelope.decay = p.voice === "maracas" ? 0.06 : 0.12;
        this.noiseSynth.triggerAttackRelease("32n", t, v * 0.6);
        break;

      case "guiro":
        // Simulate guiro scrape with noise burst
        this.noiseSynth.noise.type = "pink";
        this.noiseSynth.envelope.decay = 0.15;
        this.noiseSynth.triggerAttackRelease("8n", t, v * 0.5);
        break;

      // ---- Standard drum kit ----
      case "kick":
        this.membraneSynth.frequency.value = 60;
        this.membraneSynth.pitchDecay = 0.15;
        this.membraneSynth.octaves = 8;
        this.membraneSynth.triggerAttackRelease("4n", t, v);
        break;

      case "snare":
        // Combine noise + membrane
        this.noiseSynth.noise.type = "white";
        this.noiseSynth.envelope.decay = 0.12;
        this.noiseSynth.triggerAttackRelease("16n", t, v * 0.9);
        this.membraneSynth.frequency.value = 180;
        this.membraneSynth.pitchDecay = 0.05;
        this.membraneSynth.octaves = 4;
        this.membraneSynth.triggerAttackRelease("16n", t, v * 0.5);
        break;

      case "hihat-closed":
        this.metalSynth.frequency.value = 8000;
        this.metalSynth.envelope.decay = 0.035;
        this.metalSynth.resonance = 8000;
        this.metalSynth.harmonicity = 2;
        this.metalSynth.triggerAttack(t, v * 0.6);
        break;

      case "hihat-open":
        this.metalSynth.frequency.value = 8000;
        this.metalSynth.envelope.decay = 0.28;
        this.metalSynth.resonance = 8000;
        this.metalSynth.harmonicity = 2;
        this.metalSynth.triggerAttack(t, v * 0.6);
        break;

      case "crash":
        this.metalSynth.frequency.value = 6000;
        this.metalSynth.envelope.decay = 0.8;
        this.metalSynth.resonance = 4000;
        this.metalSynth.harmonicity = 5.1;
        this.metalSynth.triggerAttack(t, v * 0.8);
        break;

      case "ride":
        this.metalSynth.frequency.value = 5000;
        this.metalSynth.envelope.decay = 0.5;
        this.metalSynth.resonance = 5000;
        this.metalSynth.harmonicity = 3.5;
        this.metalSynth.triggerAttack(t, v * 0.55);
        break;

      case "tom-high":
        this.membraneSynth.frequency.value = 200;
        this.membraneSynth.pitchDecay = 0.08;
        this.membraneSynth.octaves = 6;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;

      case "tom-mid":
        this.membraneSynth.frequency.value = 150;
        this.membraneSynth.pitchDecay = 0.1;
        this.membraneSynth.octaves = 6;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;

      case "tom-low":
        this.membraneSynth.frequency.value = 100;
        this.membraneSynth.pitchDecay = 0.15;
        this.membraneSynth.octaves = 7;
        this.membraneSynth.triggerAttackRelease("8n", t, v);
        break;
    }
  }

  dispose() {
    this.metalSynth.dispose();
    this.membraneSynth.dispose();
    this.noiseSynth.dispose();
    this.reverb.dispose();
    this.vol.dispose();
  }
}

// ================================================================
// INSTRUMENT ENGINE REGISTRY
// ================================================================

export type InstrumentType =
  | "piano"
  | "trumpet"
  | "trombone"
  | "strings"
  | "woodwind"
  | "percussion"
  | "generic";

export function getInstrumentType(instrument: string): InstrumentType {
  const l = instrument.toLowerCase();
  if (
    l.includes("piano") ||
    l.includes("harpsichord") ||
    l.includes("electric piano") ||
    l.includes("organ")
  )
    return "piano";
  if (
    l.includes("trumpet") ||
    l.includes("trompeta") ||
    l.includes("muted trumpet") ||
    l.includes("cornet")
  )
    return "trumpet";
  if (l.includes("trombone") || l.includes("trombón") || l.includes("tuba"))
    return "trombone";
  if (
    l.includes("violin") ||
    l.includes("viola") ||
    l.includes("cello") ||
    l.includes("contrabass") ||
    l.includes("double bass") ||
    l.includes("string") ||
    l.includes("harp") ||
    l.includes("pizzicato") ||
    l.includes("guitar") ||
    (l.includes("bass") && !l.includes("bassoon")) ||
    l.includes("banjo") ||
    l.includes("mandolin")
  )
    return "strings";
  if (
    l.includes("flute") ||
    l.includes("oboe") ||
    l.includes("clarinet") ||
    l.includes("bassoon") ||
    l.includes("saxophone") ||
    l.includes("sax") ||
    l.includes("recorder") ||
    l.includes("piccolo") ||
    l.includes("pan flute") ||
    l.includes("shakuhachi") ||
    l.includes("whistle") ||
    l.includes("ocarina")
  )
    return "woodwind";
  if (
    l.includes("percussion") ||
    l.includes("drum") ||
    l.includes("timpani") ||
    l.includes("claves") ||
    l.includes("conga") ||
    l.includes("bongo") ||
    l.includes("timbale") ||
    l.includes("cowbell") ||
    l.includes("guiro") ||
    l.includes("maracas") ||
    l.includes("shaker") ||
    l.includes("steel drum") ||
    l.includes("vibraphone") ||
    l.includes("xylophone") ||
    l.includes("marimba") ||
    l.includes("glockenspiel")
  )
    return "percussion";
  if (
    l.includes("french horn") ||
    l.includes("horn") ||
    l.includes("brass section")
  )
    return "trombone"; // Use trombone engine for other brass
  return "generic";
}

export function woodwindFamily(instrument: string): WoodwindFamily {
  const l = instrument.toLowerCase();
  if (l.includes("flute") || l.includes("piccolo") || l.includes("recorder"))
    return "flute";
  if (l.includes("oboe") || l.includes("english horn")) return "oboe";
  if (l.includes("clarinet")) return "clarinet";
  if (l.includes("bassoon") || l.includes("fagot")) return "bassoon";
  return "saxophone";
}

export class InstrumentEngineRegistry {
  private pianoEngines = new Map<string, PianoEngine>();
  private trumpetEngines = new Map<string, TrumpetEngine>();
  private tromboneEngines = new Map<string, TromboneEngine>();
  private stringEngines = new Map<string, StringEngine>();
  private woodwindEngines = new Map<string, WoodwindEngine>();
  private percEngines = new Map<string, PercussionEngine>();
  private destination: Tone.ToneAudioNode;
  private trumpetSampler: Tone.Sampler | null = null;
  private tromboneSampler: Tone.Sampler | null = null;

  constructor(destination: Tone.ToneAudioNode) {
    this.destination = destination;
    // Precargar samplers reales de brass si existen los archivos
    try {
      this.trumpetSampler = getTrumpetSampler(this.destination);
      this.tromboneSampler = getTromboneSampler(this.destination);
    } catch {
      // Si no hay samples, el fallback a síntesis sigue funcionando
    }
  }

  getPiano(id: string): PianoEngine {
    if (!this.pianoEngines.has(id))
      this.pianoEngines.set(id, new PianoEngine(this.destination));
    return this.pianoEngines.get(id)!;
  }
  getTrumpet(id: string): TrumpetEngine {
    if (!this.trumpetEngines.has(id)) {
      const eng = new TrumpetEngine(this.destination);
      if (this.trumpetSampler) eng.setRealSampler(this.trumpetSampler);
      this.trumpetEngines.set(id, eng);
    }
    return this.trumpetEngines.get(id)!;
  }
  getTrombone(id: string): TromboneEngine {
    if (!this.tromboneEngines.has(id)) {
      const eng = new TromboneEngine(this.destination);
      if (this.tromboneSampler) eng.setRealSampler(this.tromboneSampler);
      this.tromboneEngines.set(id, eng);
    }
    return this.tromboneEngines.get(id)!;
  }
  getStrings(id: string): StringEngine {
    if (!this.stringEngines.has(id))
      this.stringEngines.set(id, new StringEngine(this.destination));
    return this.stringEngines.get(id)!;
  }
  getWoodwind(id: string): WoodwindEngine {
    if (!this.woodwindEngines.has(id))
      this.woodwindEngines.set(id, new WoodwindEngine(this.destination));
    return this.woodwindEngines.get(id)!;
  }
  getPercussion(id: string): PercussionEngine {
    if (!this.percEngines.has(id))
      this.percEngines.set(id, new PercussionEngine(this.destination));
    return this.percEngines.get(id)!;
  }

  getType(instrument: string): InstrumentType {
    return getInstrumentType(instrument);
  }

  disposeTrack(id: string) {
    [
      this.pianoEngines,
      this.trumpetEngines,
      this.tromboneEngines,
      this.stringEngines,
      this.woodwindEngines,
      this.percEngines,
    ].forEach((m) => {
      m.get(id)?.dispose();
      m.delete(id);
    });
  }

  disposeAll() {
    [
      this.pianoEngines,
      this.trumpetEngines,
      this.tromboneEngines,
      this.stringEngines,
      this.woodwindEngines,
      this.percEngines,
    ].forEach((m) => {
      m.forEach((e) => e.dispose());
      m.clear();
    });
    disposeBrassSamplers();
    this.trumpetSampler = null;
    this.tromboneSampler = null;
  }
}

// ================================================================
// ARTICULATION INFERENCE
// ================================================================

export function inferPianoParams(
  note: ScoreNote,
  sustainDown: boolean,
): PianoNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,
    sustainPedal: sustainDown,
    sostenutoActive: false,
    unaChordaActive: false,
    halfPedalLevel: sustainDown ? 1.0 : 0,
    voiceLayer: inferVoiceLayer(note),
    isArpeggio: false,
    arpeggioDelay: 0,
    articulation: inferPianoArticulation(note.articulations),
  };
}

export function inferTrumpetParams(note: ScoreNote): TrumpetNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,
    mute: note.muted ? "straight" : "none",
    tonguing: note.isTied ? "slur" : inferBrassTonguing(note.articulations),
    vibratoRate: 5.5,
    vibratoDepth: note.duration > 0.4 ? 40 : 0,
    vibratoDelay: 0.15,
    articulation: inferBrassArticulation(note.articulations),
  };
}

export function inferTromboneParams(note: ScoreNote): TromboneNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,
    mute: note.muted ? "straight" : "none",
    tonguing: note.isTied ? "slur" : inferBrassTonguing(note.articulations),
    vibratoRate: 5.0,
    vibratoDepth: note.duration > 0.5 ? 35 : 0,
    vibratoDelay: 0.2,
    portamento: note.isTied ? 0.06 : 0,
    pedalTone: note.midi < 40,
    articulation: inferBrassArticulation(note.articulations),
  };
}

export function inferStringParams(note: ScoreNote): StringNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,
    bowing: note.pizzicato
      ? "legato"
      : note.tremolo
        ? "tremolo"
        : inferStringBowing(note.articulations),
    contactPoint: "ordinario",
    pizzicato: note.pizzicato ?? false,
    harmonic: note.harmonic ?? false,
    snapPizzicato: false,
    vibrato: { rate: 5.5, depth: note.duration > 0.3 ? 45 : 0, delay: 0.12 },
    articulation: inferStringArticulation(note.articulations),
  };
}

export function inferWoodwindParams(
  note: ScoreNote,
  instrument: string,
): WoodwindNoteParams {
  return {
    midi: note.midi,
    velocity: note.velocity,
    duration: note.duration,
    family: woodwindFamily(instrument),
    tonguing: note.isTied ? "slur" : "single",
    vibrato: { rate: 5.5, depth: note.duration > 0.4 ? 30 : 0, delay: 0.15 },
    overblown: false,
    articulation: inferStringArticulation(note.articulations),
  };
}

export function inferPercussionFromMidi(
  midiNote: number,
  velocity: number,
): PercussionNoteParams {
  const voice = GM_PERC_MAP[midiNote] ?? "conga-mid";
  return { voice, velocity };
}

// ---- Internal helpers ----

function inferVoiceLayer(note: ScoreNote): PianoVoiceLayer {
  if (note.staffNumber === 1) return note.voice === 1 ? "soprano" : "alto";
  if (note.staffNumber === 2) return note.voice === 1 ? "tenor" : "bass";
  return "auto";
}

function inferPianoArticulation(a: ArticulationType[]): PianoArticulation {
  if (a.includes("staccatissimo")) return "staccatissimo";
  if (a.includes("staccato")) return "staccato";
  if (a.includes("marcato")) return "marcato";
  if (a.includes("tenuto")) return "tenuto";
  if (a.includes("portato")) return "portato";
  return "normal";
}

function inferBrassArticulation(a: ArticulationType[]): BrassArticulation {
  if (a.includes("staccato")) return "staccato";
  if (a.includes("marcato") || a.includes("accent")) return "marcato";
  if (a.includes("tenuto")) return "tenuto";
  return "normal";
}

function inferBrassTonguing(a: ArticulationType[]): BrassTonguing {
  if (a.includes("tenuto")) return "legato";
  return "single";
}

function inferStringBowing(a: ArticulationType[]): StringBowing {
  if (a.includes("staccato") || a.includes("staccatissimo")) return "spiccato";
  if (a.includes("marcato")) return "martele";
  if (a.includes("tenuto")) return "legato";
  return "detache";
}

function inferStringArticulation(
  a: ArticulationType[],
): StringNoteParams["articulation"] {
  if (a.includes("staccato") || a.includes("staccatissimo")) return "staccato";
  if (a.includes("marcato")) return "marcato";
  if (a.includes("tenuto")) return "tenuto";
  return "normal";
}

export function soundingDuration(
  notatedSeconds: number,
  articulation: PianoArticulation,
  instrument: "piano" | "brass" = "piano",
): number {
  if (instrument === "brass")
    return (
      notatedSeconds * (BRASS_DUR[articulation as BrassArticulation] ?? 0.88)
    );
  return notatedSeconds * (PIANO_DUR[articulation as PianoArticulation] ?? 0.9);
}
