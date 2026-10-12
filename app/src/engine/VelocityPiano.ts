// ============================================================
// VelocityPiano — studio-realistic multi-velocity piano for Tone 15.
//
// Loads N real velocity layers of the Salamander Grand Piano (Yamaha C5),
// one Tone.Sampler per layer, and on each note picks the layer that matches
// how hard the key was struck. This reproduces the *timbral* change of a real
// piano (a hard strike is brighter, not just louder) — impossible with a
// single-layer sampler where velocity only scales volume.
//
// Samples: @audio-samples/piano-velocity{1..16} (Salamander V3, ogg) served
// from jsDelivr. Each package is one velocity layer, 30 notes (every 3rd
// semitone A0..C8); Tone.Sampler pitch-shifts to fill the gaps.
//
// API-compatible (the subset App.tsx uses) with Tone.Sampler so it is a
// drop-in replacement: triggerAttack / triggerRelease / releaseAll / set /
// dispose / connect / loaded.
// ============================================================

import * as Tone from "tone";

/** npm version of the @audio-samples/piano-velocity{N} packages on jsDelivr. */
const PKG_VERSION = "1.0.5";

const cdnBase = (layer: number): string =>
  `https://cdn.jsdelivr.net/npm/@audio-samples/piano-velocity${layer}@${PKG_VERSION}/audio/`;

/** Salamander sampled pitches: every 3rd semitone from A0 (21) to C8 (108). */
const SAMPLE_MIDIS: number[] = (() => {
  const out: number[] = [];
  for (let m = 21; m <= 108; m += 3) out.push(m);
  return out;
})();

/**
 * Which of the 16 Salamander velocity layers to load for a requested count.
 * Mirrors @tonejs/piano's velocitiesMap so the spread stays musical.
 */
const VELOCITIES_MAP: Record<number, number[]> = {
  1: [8],
  2: [6, 12],
  3: [1, 7, 15],
  4: [1, 5, 10, 15],
  5: [1, 4, 8, 12, 16],
  6: [1, 3, 7, 10, 13, 16],
  8: [1, 3, 5, 7, 9, 11, 13, 16],
  10: [1, 2, 3, 5, 7, 9, 11, 13, 15, 16],
  16: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

/** Build the Tone.Sampler url map for one velocity layer. */
function buildUrls(layer: number): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const midi of SAMPLE_MIDIS) {
    const note = Tone.Frequency(midi, "midi").toNote(); // "A0", "C1", "D#1", ...
    // Sharps contain a literal '#' in the filename which must be %23-encoded
    // for the HTTP request (otherwise '#' starts a URL fragment → 404).
    urls[note] = `${note.replace("#", "%23")}v${layer}.ogg`;
  }
  return urls;
}

export interface VelocityPianoOptions {
  /** How many velocity layers to load (1..16). Higher = more realism + weight. */
  velocities?: number;
  /** Release time in seconds (passed to every layer). */
  release?: number;
  /** Node to connect the piano output to. */
  destination?: Tone.ToneAudioNode;
}

export class VelocityPiano {
  private readonly output: Tone.Gain;
  private layers: Tone.Sampler[] = [];
  private readonly loadPromises: Promise<void>[] = [];
  private layerCount: number;
  private _loaded = false;

  constructor(opts: VelocityPianoOptions = {}) {
    const requested = opts.velocities ?? 16;
    const release = opts.release ?? 1.2;
    const steps = VELOCITIES_MAP[requested] ?? VELOCITIES_MAP[16];
    this.layerCount = steps.length;

    this.output = new Tone.Gain(1);
    if (opts.destination) this.output.connect(opts.destination);

    this.layers = steps.map((layer) => {
      let resolveLoad!: () => void;
      this.loadPromises.push(new Promise<void>((res) => (resolveLoad = res)));
      const sampler = new Tone.Sampler({
        urls: buildUrls(layer),
        baseUrl: cdnBase(layer),
        release,
        // Resolve on either outcome so one bad file can't hang the whole load.
        onload: () => resolveLoad(),
        onerror: () => resolveLoad(),
      }).connect(this.output);
      return sampler;
    });
  }

  /** Resolves once every velocity layer has finished loading its samples. */
  async load(): Promise<void> {
    await Promise.all(this.loadPromises);
    this._loaded = true;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * Map a 0..1 velocity to a layer index. The incoming value is already the
   * shaped gain from the velocity curve, so soft strokes pick the mellow
   * (low) layers and hard strokes pick the bright (high) layers — exactly the
   * timbral behaviour of a real piano.
   */
  private pickLayer(velocity: number): number {
    const v = Math.max(0, Math.min(1, velocity));
    return Math.min(this.layerCount - 1, Math.floor(v * this.layerCount));
  }

  /** Drop-in for Tone.Sampler.triggerAttack(note, time?, velocity?). */
  triggerAttack(
    note: Tone.Unit.Frequency,
    time?: Tone.Unit.Time,
    velocity = 0.8,
  ): this {
    const layer = this.layers[this.pickLayer(velocity)];
    if (layer) layer.triggerAttack(note, time, velocity);
    return this;
  }

  /**
   * Release the note. We release on every layer because a note may have been
   * struck on any of them; releasing a note a sampler isn't holding is a no-op.
   */
  triggerRelease(note: Tone.Unit.Frequency, time?: Tone.Unit.Time): this {
    for (const layer of this.layers) layer.triggerRelease(note, time);
    return this;
  }

  releaseAll(time?: Tone.Unit.Time): this {
    for (const layer of this.layers) layer.releaseAll(time);
    return this;
  }

  /** Drop-in for Tone.Sampler.set — only the release time is forwarded. */
  set(opts: { release?: number }): this {
    if (opts.release !== undefined) {
      for (const layer of this.layers) layer.set({ release: opts.release });
    }
    return this;
  }

  connect(destination: Tone.ToneAudioNode): this {
    this.output.connect(destination);
    return this;
  }

  dispose(): this {
    for (const layer of this.layers) layer.dispose();
    this.output.dispose();
    this.layers = [];
    return this;
  }
}
