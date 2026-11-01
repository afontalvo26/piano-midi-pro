/** Persisted MIX-02 parameter contract shared by project validation and editor controls. */
export type ProjectEffectKind = "eq3" | "filter" | "compressor" | "saturation" |
  "reverb" | "delay" | "limiter";

export type ProjectEffectParameterDescriptor =
  | { readonly kind: ProjectEffectKind; readonly parameterId: string;
      readonly valueType: "number"; readonly min: number; readonly max: number;
      readonly unit: "dB" | "Hz" | "ms" | "ratio" | "Q" | "normalized" }
  | { readonly kind: ProjectEffectKind; readonly parameterId: string;
      readonly valueType: "choice"; readonly values: readonly string[] };

export const PROJECT_EFFECT_PARAMETERS: readonly ProjectEffectParameterDescriptor[] = Object.freeze([
  { kind: "eq3", parameterId: "lowDb", valueType: "number", min: -18, max: 18, unit: "dB" },
  { kind: "eq3", parameterId: "midDb", valueType: "number", min: -18, max: 18, unit: "dB" },
  { kind: "eq3", parameterId: "highDb", valueType: "number", min: -18, max: 18, unit: "dB" },
  { kind: "eq3", parameterId: "lowHz", valueType: "number", min: 80, max: 1000, unit: "Hz" },
  { kind: "eq3", parameterId: "highHz", valueType: "number", min: 1500, max: 12000, unit: "Hz" },
  { kind: "filter", parameterId: "type", valueType: "choice", values: ["lowpass", "highpass"] },
  { kind: "filter", parameterId: "cutoffHz", valueType: "number", min: 20, max: 20000, unit: "Hz" },
  { kind: "filter", parameterId: "q", valueType: "number", min: 0.1, max: 10, unit: "Q" },
  { kind: "compressor", parameterId: "thresholdDb", valueType: "number", min: -60, max: 0, unit: "dB" },
  { kind: "compressor", parameterId: "ratio", valueType: "number", min: 1, max: 20, unit: "ratio" },
  { kind: "compressor", parameterId: "attackMs", valueType: "number", min: 0, max: 1000, unit: "ms" },
  { kind: "compressor", parameterId: "releaseMs", valueType: "number", min: 1, max: 1000, unit: "ms" },
  { kind: "compressor", parameterId: "kneeDb", valueType: "number", min: 0, max: 40, unit: "dB" },
  { kind: "saturation", parameterId: "drive", valueType: "number", min: 0, max: 1, unit: "normalized" },
  { kind: "saturation", parameterId: "wet", valueType: "number", min: 0, max: 1, unit: "normalized" },
  { kind: "reverb", parameterId: "roomSize", valueType: "number", min: 0, max: 1, unit: "normalized" },
  { kind: "reverb", parameterId: "dampeningHz", valueType: "number", min: 100, max: 12000, unit: "Hz" },
  { kind: "reverb", parameterId: "wet", valueType: "number", min: 0, max: 1, unit: "normalized" },
  { kind: "delay", parameterId: "timeMs", valueType: "number", min: 1, max: 2000, unit: "ms" },
  { kind: "delay", parameterId: "feedback", valueType: "number", min: 0, max: 0.9, unit: "normalized" },
  { kind: "delay", parameterId: "wet", valueType: "number", min: 0, max: 1, unit: "normalized" },
  { kind: "limiter", parameterId: "thresholdDb", valueType: "number", min: -24, max: 0, unit: "dB" },
]);

export function projectEffectParameters(kind: string):
readonly ProjectEffectParameterDescriptor[] | undefined {
  const descriptors = PROJECT_EFFECT_PARAMETERS.filter((entry) => entry.kind === kind);
  return descriptors.length ? descriptors : undefined;
}

export function numericProjectEffectParameter(kind: string, parameterId: string):
Extract<ProjectEffectParameterDescriptor, { readonly valueType: "number" }> | undefined {
  const descriptor = PROJECT_EFFECT_PARAMETERS.find((entry) => entry.kind === kind &&
    entry.parameterId === parameterId);
  return descriptor?.valueType === "number" ? descriptor : undefined;
}
