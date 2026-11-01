/**
 * Velocity → expression mapping for sampled instruments
 *
 * Pipeline overview
 * ─────────────────
 *
 *   raw 1..127 (MIDI hardware)
 *     ↓ bounded, confidence-weighted correction ← preserves every raw step
 *   normalized 0..1
 *     ↓ applyVelocityCurve(curve)        ← γ-curve / piecewise shaping
 *   shaped 0..1
 *     ↓ floor(audibilityFloor)            ← guarantees the softest stroke is
 *                                          still audible (default 4 % gain)
 *   final gain floor..1
 *
 * Velocity-to-gain curves are selectable. MIDI transmits strike velocity;
 * it does not prescribe a universal acoustic-piano amplitude curve. The
 * timbre and attack of a sampled piano must also respond to that value.
 *
 * Remapping needs enough observations and a meaningful velocity span. A
 * controller sending the same velocity repeatedly must retain its raw level;
 * treating that value as the learned minimum would nearly silence every note.
 *
 * Auto-calibration learns the observed range but blends only a bounded
 * correction. Unobserved stronger strikes retain room above the learned max.
 */

export type VelocityCurve =
  | "linear"
  | "soft"
  | "expressive"
  | "piano"
  | "hard"
  | "natural"
  | "fixed";

export const VELOCITY_CURVES: VelocityCurve[] = [
  "linear",
  "soft",
  "expressive",
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
    recommendedFor: "Teclados sin peso que necesitan realzar golpes suaves",
  },
  expressive: {
    id: "expressive",
    label: "Expresiva",
    description: "Rango amplio de pianissimo a forte: gain = v^1.7",
    gamma: 1.7,
    recommendedFor: "Piano MIDI con sensibilidad a la velocidad",
  },
  piano: {
    id: "piano",
    label: "Piano (cuadrática)",
    description: "Curva de amplitud pronunciada: gain = v²",
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
    description: "Curva por tramos con más resolución en mezzo/forte",
    gamma: null,
    recommendedFor: "Piano acústico simulado",
  },
  fixed: {
    id: "fixed",
    label: "Fijo",
    description: "Sin sensibilidad: gain constante = 0.78",
    gamma: null,
    recommendedFor: "Pruebas, controladores sin sensibilidad",
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
  /** When true, a bounded correction uses the observed controller range. */
  autoCalibrationEnabled: boolean;
  /** Sample count, used to give the calibration confidence. */
  sampleCount: number;
  /** Fractional estimates survive rounding of the displayed MIDI bounds. */
  minEstimate?: number;
  maxEstimate?: number;
}

export const DEFAULT_CALIBRATION: VelocityCalibration = {
  minObserved: 1,
  maxObserved: 127,
  audibilityFloor: 0.04, // 4% — quiet but always audible
  autoCalibrationEnabled: true,
  sampleCount: 0,
};

/** A physical controller starts with the full 1..127 range and a quieter floor. */
export const DEFAULT_PHYSICAL_CALIBRATION: VelocityCalibration = {
  ...DEFAULT_CALIBRATION,
  audibilityFloor: 0.005,
};

export const VELOCITY_CALIBRATIONS_STORAGE_KEY = "piano_velocity_calibrations_v1";

export interface VelocityCalibrationScope {
  readonly profileId: string;
  readonly inputId: string;
  readonly inputName?: string | null;
}

export interface PortVelocityCalibration {
  readonly profileId: string;
  readonly inputId: string;
  readonly inputName: string;
  readonly updatedAtIso: string;
  readonly calibration: VelocityCalibration;
}

export interface VelocityCalibrationBank {
  readonly version: 1;
  readonly entries: Readonly<Record<string, PortVelocityCalibration>>;
}

export const DEFAULT_VELOCITY_CALIBRATION_BANK: VelocityCalibrationBank = {
  version: 1,
  entries: {},
};

function portKey(scope: VelocityCalibrationScope): string {
  return JSON.stringify([scope.profileId, scope.inputId]);
}

function validCalibration(cal: VelocityCalibration | undefined): cal is VelocityCalibration {
  return !!cal && Number.isInteger(cal.minObserved) && cal.minObserved >= 1 && cal.minObserved <= 126 &&
    Number.isInteger(cal.maxObserved) && cal.maxObserved > cal.minObserved && cal.maxObserved <= 127 &&
    Number.isFinite(cal.audibilityFloor) && cal.audibilityFloor >= 0 && cal.audibilityFloor <= 0.2 &&
    typeof cal.autoCalibrationEnabled === "boolean" &&
    Number.isInteger(cal.sampleCount) && cal.sampleCount >= 0 &&
    (cal.minEstimate === undefined || Number.isFinite(cal.minEstimate)) &&
    (cal.maxEstimate === undefined || Number.isFinite(cal.maxEstimate));
}

function bankEntries(bank: VelocityCalibrationBank): Readonly<Record<string, PortVelocityCalibration>> {
  return bank?.version === 1 && bank.entries && typeof bank.entries === "object" &&
    !Array.isArray(bank.entries) ? bank.entries : {};
}

/** No global calibration is imported: its source device is unknown. */
export function getPortVelocityCalibration(
  bank: VelocityCalibrationBank,
  scope: VelocityCalibrationScope,
): VelocityCalibration {
  if (!scope.profileId || !scope.inputId) return DEFAULT_PHYSICAL_CALIBRATION;
  const entry = bankEntries(bank)[portKey(scope)];
  return entry?.profileId === scope.profileId && entry.inputId === scope.inputId &&
    validCalibration(entry.calibration) ? entry.calibration : DEFAULT_PHYSICAL_CALIBRATION;
}

/** Save a per-port setting, such as an explicitly chosen floor or curve mode. */
export function setPortVelocityCalibration(
  bank: VelocityCalibrationBank,
  scope: VelocityCalibrationScope,
  calibration: VelocityCalibration,
  nowIso = new Date().toISOString(),
): VelocityCalibrationBank {
  if (!scope.profileId || !scope.inputId) return bank;
  if (!validCalibration(calibration)) throw new RangeError("invalid velocity calibration");
  const key = portKey(scope);
  const previous = bankEntries(bank)[key];
  const entry: PortVelocityCalibration = {
    profileId: scope.profileId,
    inputId: scope.inputId,
    inputName: scope.inputName ?? previous?.inputName ?? "",
    updatedAtIso: nowIso,
    calibration,
  };
  return { version: 1, entries: { ...bankEntries(bank), [key]: entry } };
}

/** Observe hardware only; virtual keys must never train this bank. */
export function recordPortVelocity(
  bank: VelocityCalibrationBank,
  scope: VelocityCalibrationScope,
  rawVelocity: number,
  nowIso = new Date().toISOString(),
): VelocityCalibrationBank {
  if (!scope.profileId || !scope.inputId || !Number.isFinite(rawVelocity) || rawVelocity < 1) return bank;
  const calibration = getPortVelocityCalibration(bank, scope);
  if (!calibration.autoCalibrationEnabled) return bank;
  return setPortVelocityCalibration(bank, scope, recordVelocityObservation(calibration, rawVelocity), nowIso);
}

export function resetPortVelocityCalibration(
  bank: VelocityCalibrationBank,
  scope: VelocityCalibrationScope,
): VelocityCalibrationBank {
  const key = portKey(scope);
  const entries = { ...bankEntries(bank) };
  if (!(key in entries)) return bank;
  delete entries[key];
  return { version: 1, entries };
}

/**
 * Update calibration with a new observed velocity. Returns a new object
 * (immutable). The caller is expected to persist the result if desired.
 *
 * Convergence strategy:
 *   - First N samples: track absolute min / max
 *   - After N samples: keep fractional estimators and slowly relax them
 *     toward observation, so a one-off strike does not permanently dominate.
 */
export function recordVelocityObservation(
  cal: VelocityCalibration,
  rawVelocity: number,
): VelocityCalibration {
  if (!Number.isFinite(rawVelocity) || rawVelocity <= 0) return cal;
  const v = Math.max(1, Math.min(127, Math.round(rawVelocity)));
  const next: VelocityCalibration = { ...cal, sampleCount: cal.sampleCount + 1 };

  if (cal.sampleCount < 32) {
    const minimum = cal.sampleCount === 0 ? v : Math.min(cal.minObserved, v);
    const maximum = cal.sampleCount === 0 ? v : Math.max(cal.maxObserved, v);
    next.minEstimate = minimum;
    next.maxEstimate = maximum;
    next.minObserved = minimum;
    next.maxObserved = Math.max(minimum + 1, maximum);
  } else {
    // Never round the estimators before the next observation: rounding each
    // 0.5%-step made most learned bounds freeze permanently after 32 notes.
    const alpha = 0.005;
    const minimum = Number.isFinite(cal.minEstimate)
      ? cal.minEstimate! : cal.minObserved;
    const maximum = Number.isFinite(cal.maxEstimate)
      ? cal.maxEstimate! : cal.maxObserved;
    next.minEstimate = v < minimum ? v : minimum + alpha * (v - minimum);
    next.maxEstimate = v > maximum ? v : maximum + alpha * (v - maximum);
    next.minObserved = Math.round(next.minEstimate);
    next.maxObserved = Math.round(next.maxEstimate);
  }

  // Keep the displayed bounds valid even for a single repeated velocity.
  next.minObserved = Math.max(1, Math.min(126, Math.round(next.minObserved)));
  next.maxObserved = Math.max(next.minObserved + 1, Math.min(127, Math.round(next.maxObserved)));

  return next;
}

/**
 * Map raw MIDI velocity into 0..1. The unmodified value retains at least 75%
 * of the slope, including above the strongest velocity observed so far.
 *
 * If autoCalibration is off, simply returns v/127.
 */
export function normalizeVelocity(
  rawVelocity: number,
  cal: VelocityCalibration,
): number {
  if (!Number.isFinite(rawVelocity) || rawVelocity <= 0) return 0;
  const raw = Math.max(0, Math.min(1, rawVelocity / 127));
  const span = cal.maxObserved - cal.minObserved;
  if (!cal.autoCalibrationEnabled || !Number.isFinite(cal.sampleCount) ||
      cal.sampleCount < 32 || !Number.isFinite(span) || span < 16) {
    return raw;
  }
  const stretched = Math.max(0, Math.min(1, (rawVelocity - cal.minObserved) / span));
  // A full observed-range remap saturates at its early maximum. Blend at most
  // 25% so all 127 raw steps remain distinguishable and later forte strikes
  // can still exceed the learned maximum.
  const confidence = Math.min(1, (cal.sampleCount - 32) / 96) *
    Math.min(1, (span - 16) / 32);
  return raw + (stretched - raw) * (0.25 * confidence);
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

    case "expressive":
      // 1.7 retains a wide pianissimo-to-forte span on an unweighted keyboard.
      return Math.pow(v, 1.7);

    case "piano":
      // Squared amplitude response, offered as an explicit curve choice.
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
 * Uses the same confidence-aware normalization as gain.
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
