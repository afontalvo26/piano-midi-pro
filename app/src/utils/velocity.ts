/**
 * Velocity → expression mapping (mathematically correct for piano)
 *
 * Background
 * ──────────
 * The MIDI spec doesn't pin down the velocity → loudness curve, but the
 * General MIDI 2 spec DOES define Channel Volume (CC7) and Expression (CC11)
 * as:
 *
 *     dB = 40 · log₁₀(127 / value)
 *
 * Converting from dB to linear gain (10^(dB/20)) gives:
 *
 *     gain(v) = (v / 127)²
 *
 * which is the de-facto "GM Piano" curve. Empirical analysis of commercial
 * synths (J.J. Burred, "The Interpretation of MIDI Velocity", ICMC 2006)
 * confirms most modern instruments follow ~x² rather than pure exponential.
 *
 * In a real acoustic piano, velocity also drives:
 *   • Loudness (peak RMS amplitude)
 *   • Brightness (faster hammer = more high-frequency content)
 *   • Attack envelope (harder strikes = more percussive transient)
 *
 * This module provides curves that map both:
 *
 *   gain       — multiplicative amplitude factor (0..1)
 *   brightness — relative high-frequency emphasis (0..1)
 *
 * Curves
 * ──────
 *   linear    γ = 1.0  →  flat, technical reference
 *   soft      γ = 0.6  →  light touch — easy to play loud (good for synths)
 *   piano     γ = 2.0  →  GM spec default (matches Channel Volume formula)
 *   hard      γ = 3.0  →  demands force — wide dynamic range
 *   natural   piecewise → "PianoTouch" — biased toward mid-high range,
 *                          mirrors how acoustic piano players normally play
 *   fixed     constant → 0.78 (no touch sensitivity, classic synth piano)
 */

export type VelocityCurve =
  | "linear"
  | "soft"
  | "piano"
  | "hard"
  | "natural"
  | "fixed";

export const VELOCITY_CURVES: VelocityCurve[] = [
  "linear",
  "soft",
  "piano",
  "hard",
  "natural",
  "fixed",
];

export interface VelocityCurveDescriptor {
  id: VelocityCurve;
  label: string;
  description: string;
  gamma: number | null;
  recommendedFor: string;
}

export const VELOCITY_CURVE_DESCRIPTORS: Record<
  VelocityCurve,
  VelocityCurveDescriptor
> = {
  linear: {
    id: "linear",
    label: "Lineal",
    description: "Sin curva: gain = v/127 (referencia técnica)",
    gamma: 1,
    recommendedFor: "MIDI editing, debugging",
  },
  soft: {
    id: "soft",
    label: "Suave",
    description: "Realza velocities bajas: gain = (v/127)^0.6",
    gamma: 0.6,
    recommendedFor: "Teclados pesados, principiantes, synth pads",
  },
  piano: {
    id: "piano",
    label: "Piano (GM)",
    description: "Curva spec MIDI: gain = (v/127)² ≡ dB = 40·log₁₀(127/v)",
    gamma: 2,
    recommendedFor: "Piano realista (default)",
  },
  hard: {
    id: "hard",
    label: "Duro",
    description: "Más rango dinámico: gain = (v/127)^3",
    gamma: 3,
    recommendedFor: "Tocadores expresivos, controladores con peso",
  },
  natural: {
    id: "natural",
    label: "Natural",
    description:
      "Curva piecewise tipo Yamaha CFX — más resolución en mezzo/forte",
    gamma: null,
    recommendedFor: "Piano acústico (toque humano)",
  },
  fixed: {
    id: "fixed",
    label: "Fijo",
    description: "Sin sensibilidad: gain constante = 0.78",
    gamma: null,
    recommendedFor: "Demos, controladores sin sensibilidad",
  },
};

/**
 * Apply the velocity curve to a normalized value (0..1).
 *
 * The implementation uses pure power functions (or piecewise lookup) on
 * the unit interval, so it's monotonically increasing, continuous, and
 * f(0) = 0, f(1) = 1 for every curve except `fixed`.
 *
 * @param normalized  Velocity in [0, 1]
 * @param curve       Selected curve preset
 * @returns Output gain in [0, 1]
 */
export function applyVelocityCurve(
  normalized: number,
  curve: VelocityCurve,
): number {
  const v = Math.max(0, Math.min(1, normalized));

  switch (curve) {
    case "linear":
      return v;

    case "soft":
      // γ < 1 boosts low values
      return Math.pow(v, 0.6);

    case "piano":
      // GM spec: gain = (v/127)² when v∈[0,127]; equivalent to v² in normalized
      return v * v;

    case "hard":
      // γ > 1 emphasizes high values, demands more force
      return v * v * v;

    case "natural":
      // Piecewise: more resolution in the mp..mf range where humans normally
      // play. Approximates the response curve of a Yamaha CFX / Steinway D
      // sample as captured in commercial libraries.
      //
      //   v ≤ 0.5  →  0.5 · (v/0.5)^1.8
      //   v > 0.5  →  0.5 + 0.5 · ((v-0.5)/0.5)^1.4
      if (v <= 0.5) {
        return 0.5 * Math.pow(v / 0.5, 1.8);
      }
      return 0.5 + 0.5 * Math.pow((v - 0.5) / 0.5, 1.4);

    case "fixed":
      // No sensitivity — classic basic synth piano
      return v > 0 ? 0.78 : 0;
  }
}

/**
 * Convenience wrapper: takes raw 0..127 MIDI velocity and returns 0..1 gain.
 */
export function midiVelocityToGain(
  midiVelocity: number,
  curve: VelocityCurve,
): number {
  return applyVelocityCurve(midiVelocity / 127, curve);
}

/**
 * Brightness factor — how much harmonic content / high-frequency emphasis
 * a note should have based on its velocity. This is independent of the gain
 * curve and reflects the physical reality of hammer-on-string instruments:
 * a harder strike excites higher partials.
 *
 * Returns a value in [0, 1] where:
 *   0   = max muffled (very soft)
 *   0.5 = neutral
 *   1   = max bright (very hard)
 *
 * Uses a softer curve than the gain curve (γ=0.7) so timbre changes are
 * audible across the full dynamic range, not just at the extremes.
 */
export function midiVelocityToBrightness(midiVelocity: number): number {
  const v = Math.max(0, Math.min(1, midiVelocity / 127));
  // γ=0.7 — slightly soft so the brightest tones are reachable below max velocity
  return Math.pow(v, 0.7);
}

/**
 * Filter cutoff frequency (Hz) for a given velocity, using a perceptual
 * mapping. Use this as the cutoff of a low-pass filter applied to a sample
 * to simulate hammer dynamics.
 *
 *   minHz at v=0   (default 800 Hz, deeply muffled)
 *   maxHz at v=127 (default 18000 Hz, fully bright)
 *
 * The mapping is logarithmic in frequency space (matches human hearing),
 * which is why we use exponent on the log of the bounds.
 */
export function midiVelocityToCutoffHz(
  midiVelocity: number,
  minHz = 800,
  maxHz = 18000,
): number {
  const brightness = midiVelocityToBrightness(midiVelocity);
  // logarithmic interpolation between minHz and maxHz
  const logMin = Math.log(minHz);
  const logMax = Math.log(maxHz);
  return Math.exp(logMin + (logMax - logMin) * brightness);
}

/**
 * Compute a piano-realistic note expression from a raw MIDI velocity.
 * Returns gain (for the sampler), brightness (0..1) and cutoffHz for an
 * optional low-pass filter.
 */
export interface VelocityExpression {
  /** Output gain in [0, 1], applied as multiplicative volume. */
  gain: number;
  /** Brightness in [0, 1], for tone control. */
  brightness: number;
  /** Suggested low-pass cutoff in Hz (use to attenuate highs on soft notes). */
  cutoffHz: number;
  /** Original raw 0..127 velocity (unmodified, for display). */
  raw: number;
}

export function computeVelocityExpression(
  midiVelocity: number,
  curve: VelocityCurve,
): VelocityExpression {
  return {
    gain: midiVelocityToGain(midiVelocity, curve),
    brightness: midiVelocityToBrightness(midiVelocity),
    cutoffHz: midiVelocityToCutoffHz(midiVelocity),
    raw: midiVelocity,
  };
}
