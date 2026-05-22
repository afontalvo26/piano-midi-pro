/**
 * Velocity → expression mapping (mathematically correct for piano)
 *
 * Pipeline overview
 * ─────────────────
 *
 *   raw 1..127 (MIDI hardware)
 *     ↓ rangeRemap(min, max)             ← compensates for cheap controllers
 *                                          that send velocity 32..127 instead
 *                                          of 1..127 (no real ppp)
 *   normalized 0..1
 *     ↓ applyVelocityCurve(curve)        ← γ-curve / piecewise shaping
 *   shaped 0..1
 *     ↓ floor(audibilityFloor)            ← guarantees the softest stroke is
 *                                          still audible (default 4 % gain)
 *   final gain 0.04..1
 *
 * Background
 * ──────────
 * The General MIDI 2 spec defines Channel Volume / Expression as
 * dB = 40·log₁₀(127/v), equivalent to gain = (v/127)² in linear amplitude.
 * Empirical analysis (Burred, ICMC 2006) confirms most synths follow ~x².
 *
 * BUT cheap MIDI keyboards rarely transmit velocities below ~30, so applying
 * (v/127)² directly to a hardware-clamped 32..127 range gives a minimum
 * gain of (32/127)² = 6.3 %, which sounds nearly silent and kills the
 * pianissimo end of the dynamic range.
 *
 * The fix: linearly stretch the hardware's effective min..max into 0..1
 * BEFORE applying the curve. Then the user gets the full expressive range
 * of their controller — soft strokes feel ppp, hard strokes feel ff.
 *
 * The auto-calibration learns min/max as the user plays, and persists them
 * via the existing settings storage (caller responsibility).
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
    description: "gain = v (sin curva, referencia técnica)",
    gamma: 1,
    recommendedFor: "MIDI editing, debugging",
  },
  soft: {
    id: "soft",
    label: "Suave",
    description: "Realza velocities bajas: gain = v^0.5",
    gamma: 0.5,
    recommendedFor: "Teclados sin peso, recomendado por defecto",
  },
  piano: {
    id: "piano",
    label: "Piano (GM)",
    description: "Curva spec MIDI: gain = v² ≡ dB = 40·log₁₀(1/v)",
    gamma: 2,
    recommendedFor: "Piano realista en controlador con peso completo",
  },
  hard: {
    id: "hard",
    label: "Duro",
    description: "Mucho rango dinámico: gain = v³",
    gamma: 3,
    recommendedFor: "Controladores con peso pesado, tocadores expresivos",
  },
  natural: {
    id: "natural",
    label: "Natural",
    description: "Piecewise tipo Yamaha CFX — más resolución en mezzo/forte",
    gamma: null,
    recommendedFor: "Piano acústico simulado",
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
 * Velocity calibration data. Persisted via storageService so the app
 * remembers the user's controller range across sessions.
 */
export interface VelocityCalibration {
  /** Lowest velocity actually observed from this controller (1..127). */
  minObserved: number;
  /** Highest velocity actually observed (1..127). */
  maxObserved: number;
  /** Minimum gain at the bottom of the curve (0..0.2). Prevents inaudible
   *  pianissimo even on extreme γ-curves like "hard". */
  audibilityFloor: number;
  /** When true, observed values are remapped to 0..1 before the curve. */
  autoCalibrationEnabled: boolean;
  /** Sample count, used to give the calibration confidence. */
  sampleCount: number;
}

export const DEFAULT_CALIBRATION: VelocityCalibration = {
  minObserved: 1,
  maxObserved: 127,
  audibilityFloor: 0.04, // 4% — quiet but always audible
  autoCalibrationEnabled: true,
  sampleCount: 0,
};

/**
 * Update calibration with a new observed velocity. Returns a new object
 * (immutable). The caller is expected to persist the result if desired.
 *
 * Convergence strategy:
 *   - First N samples: track absolute min / max
 *   - After N samples: keep min/max but slowly relax toward observation,
 *     so a one-off heavy strike doesn't permanently widen the range.
 */
export function recordVelocityObservation(
  cal: VelocityCalibration,
  rawVelocity: number,
): VelocityCalibration {
  if (rawVelocity <= 0) return cal;
  const v = Math.max(1, Math.min(127, Math.round(rawVelocity)));
  const next: VelocityCalibration = { ...cal, sampleCount: cal.sampleCount + 1 };

  if (cal.sampleCount < 32) {
    // Fast convergence: pure min/max during the first 32 strikes
    next.minObserved = Math.min(cal.minObserved === 1 && cal.sampleCount === 0 ? v : cal.minObserved, v);
    next.maxObserved = Math.max(cal.maxObserved === 127 && cal.sampleCount === 0 ? v : cal.maxObserved, v);
    // Force the initial bounds to be reset to the first observation so
    // the defaults of 1/127 don't permanently hold the range open.
    if (cal.sampleCount === 0) {
      next.minObserved = v;
      next.maxObserved = v;
    }
  } else {
    // Decay toward observation with low alpha, so outliers don't dominate
    const alpha = 0.05;
    if (v < next.minObserved) next.minObserved = v; // always shrink immediately
    else next.minObserved = cal.minObserved + alpha * (v - cal.minObserved) * 0.1;

    if (v > next.maxObserved) next.maxObserved = v; // always grow immediately
    else next.maxObserved = cal.maxObserved + alpha * (v - cal.maxObserved) * 0.1;
  }

  // Sanity clamps
  next.minObserved = Math.max(1, Math.min(126, Math.round(next.minObserved)));
  next.maxObserved = Math.max(next.minObserved + 1, Math.min(127, Math.round(next.maxObserved)));

  return next;
}

/**
 * Map a raw 1..127 MIDI velocity into a normalized 0..1 value, taking the
 * controller's actual observed range into account.
 *
 * If autoCalibration is off, simply returns v/127.
 */
export function normalizeVelocity(
  rawVelocity: number,
  cal: VelocityCalibration,
): number {
  if (rawVelocity <= 0) return 0;
  if (!cal.autoCalibrationEnabled || cal.maxObserved <= cal.minObserved) {
    return Math.max(0, Math.min(1, rawVelocity / 127));
  }
  const stretched =
    (rawVelocity - cal.minObserved) / (cal.maxObserved - cal.minObserved);
  return Math.max(0, Math.min(1, stretched));
}

/**
 * Apply the velocity curve to a normalized value (0..1).
 *
 * Monotonically increasing, continuous, and f(0)=0, f(1)=1 for every curve
 * except `fixed` (constant) and `linear` (identity).
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
      // γ = 0.5 (square root) — very generous on soft strokes
      return Math.sqrt(v);

    case "piano":
      // GM spec: gain = v²
      return v * v;

    case "hard":
      // γ = 3 — emphasizes high values
      return v * v * v;

    case "natural":
      // Piecewise: more resolution in the mp..mf range.
      //   v ≤ 0.5  →  0.5 · (v/0.5)^1.8
      //   v > 0.5  →  0.5 + 0.5 · ((v-0.5)/0.5)^1.4
      if (v <= 0.5) return 0.5 * Math.pow(v / 0.5, 1.8);
      return 0.5 + 0.5 * Math.pow((v - 0.5) / 0.5, 1.4);

    case "fixed":
      return v > 0 ? 0.78 : 0;
  }
}

/**
 * Apply a configurable audibility floor. Guarantees the softest playable
 * note still produces audible sound, while preserving relative dynamics.
 *
 *   gain = 0   →  output = floor (still audible)
 *   gain = 1   →  output = 1
 *   inputs in between → linearly mapped to [floor, 1]
 *
 * Output range: [floor, 1]
 */
export function applyAudibilityFloor(gain: number, floor: number): number {
  const f = Math.max(0, Math.min(0.2, floor));
  const g = Math.max(0, Math.min(1, gain));
  return f + (1 - f) * g;
}

/**
 * One-stop conversion: raw MIDI velocity → final gain ready for the sampler.
 *
 * Pipeline:  raw → calibration remap → curve → audibility floor.
 */
export function midiVelocityToGain(
  midiVelocity: number,
  curve: VelocityCurve,
  calibration: VelocityCalibration = DEFAULT_CALIBRATION,
): number {
  if (midiVelocity <= 0) return 0;
  const normalized = normalizeVelocity(midiVelocity, calibration);
  const shaped = applyVelocityCurve(normalized, curve);
  // `fixed` curve already encodes its own value (0.78); skip the floor.
  if (curve === "fixed") return shaped;
  // Apply audibility floor so the softest stroke is always audible —
  // even at v == minObserved (where the curve returns 0).
  return applyAudibilityFloor(shaped, calibration.audibilityFloor);
}

/**
 * Brightness factor — how much harmonic content / high-frequency emphasis
 * a note should have based on its velocity. This is independent of the gain
 * curve and reflects the physical reality of hammer-on-string instruments:
 * a harder strike excites higher partials.
 *
 * Uses the same calibration-aware normalization so the brightest tones are
 * reachable across the controller's actual range.
 */
export function midiVelocityToBrightness(
  midiVelocity: number,
  calibration: VelocityCalibration = DEFAULT_CALIBRATION,
): number {
  const v = normalizeVelocity(midiVelocity, calibration);
  // γ=0.7 — slightly soft so the brightest tones are reachable below max
  return Math.pow(v, 0.7);
}

/**
 * Filter cutoff frequency (Hz) for a given velocity, using a perceptual
 * mapping. Use this as the cutoff of a low-pass filter applied to a sample
 * to simulate hammer dynamics.
 *
 *   minHz at v=0   (default 800 Hz, deeply muffled)
 *   maxHz at v=127 (default 18000 Hz, fully bright)
 */
export function midiVelocityToCutoffHz(
  midiVelocity: number,
  minHz = 800,
  maxHz = 18000,
  calibration: VelocityCalibration = DEFAULT_CALIBRATION,
): number {
  const brightness = midiVelocityToBrightness(midiVelocity, calibration);
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
  /** Output gain in [floor, 1], applied as multiplicative volume. */
  gain: number;
  /** Brightness in [0, 1], for tone control. */
  brightness: number;
  /** Suggested low-pass cutoff in Hz. */
  cutoffHz: number;
  /** Original raw 1..127 velocity (unmodified, for display). */
  raw: number;
  /** Normalized 0..1 after calibration (debug/HUD). */
  normalized: number;
}

export function computeVelocityExpression(
  midiVelocity: number,
  curve: VelocityCurve,
  calibration: VelocityCalibration = DEFAULT_CALIBRATION,
): VelocityExpression {
  return {
    gain: midiVelocityToGain(midiVelocity, curve, calibration),
    brightness: midiVelocityToBrightness(midiVelocity, calibration),
    cutoffHz: midiVelocityToCutoffHz(midiVelocity, 800, 18000, calibration),
    raw: midiVelocity,
    normalized: normalizeVelocity(midiVelocity, calibration),
  };
}
