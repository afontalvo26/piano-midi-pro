import type { ProjectEffect } from "../../project/model.ts";

export type StudioMacroId = "brightness" | "body" | "reverb" | "dynamics";
export const STUDIO_MACROS: readonly { id: StudioMacroId; label: string; neutral: number }[] = [
  { id: "brightness", label: "Brillo", neutral: 100 },
  { id: "body", label: "Cuerpo", neutral: 50 },
  { id: "reverb", label: "Reverb", neutral: 0 },
  { id: "dynamics", label: "Dinámica", neutral: 0 },
];

function idFor(trackId: string, kind: StudioMacroId): string {
  return `studio-${trackId}-${kind}`;
}

function parameters(kind: StudioMacroId, value: number): ProjectEffect["parameters"] {
  const normalized = value / 100;
  switch (kind) {
    case "brightness": return { type: "lowpass", cutoffHz: Math.round(
      300 * Math.pow(20000 / 300, normalized)), q: 0.7 };
    case "body": return { lowDb: (value - 50) * 0.24, midDb: 0, highDb: 0,
      lowHz: 300, highHz: 3000 };
    case "reverb": return { roomSize: 0.53, dampeningHz: 5500,
      wet: 0.48 * normalized };
    case "dynamics": return { thresholdDb: -20, ratio: 1 + 7 * normalized,
      attackMs: 10, releaseMs: 120, kneeDb: 6 };
  }
}

export function readStudioMacro(effects: readonly ProjectEffect[], trackId: string,
  kind: StudioMacroId): number {
  const def = STUDIO_MACROS.find((macro) => macro.id === kind)!;
  const effect = effects.find((item) => item.id === idFor(trackId, kind));
  if (!effect || !effect.enabled) return def.neutral;
  const p = effect.parameters;
  switch (kind) {
    case "brightness": return Math.round(Math.max(0, Math.min(100,
      Math.log(Number(p.cutoffHz) / 300) / Math.log(20000 / 300) * 100)));
    case "body": return Math.round(Math.max(0, Math.min(100,
      50 + Number(p.lowDb) / 0.24)));
    case "reverb": return Math.round(Math.max(0, Math.min(100,
      Number(p.wet) / 0.48 * 100)));
    case "dynamics": return Math.round(Math.max(0, Math.min(100,
      (Number(p.ratio) - 1) / 7 * 100)));
  }
}

/** Return immutable FX chain; original effects and their order are untouched. */
export function applyStudioMacro(effects: readonly ProjectEffect[], trackId: string,
  kind: StudioMacroId, value: number): readonly ProjectEffect[] {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError("El control del instrumento debe estar entre 0 y 100");
  }
  const macro = STUDIO_MACROS.find((item) => item.id === kind);
  if (!macro) throw new RangeError("Control de instrumento desconocido");
  const id = idFor(trackId, kind);
  const existing = effects.find((effect) => effect.id === id);
  if (!existing && value === macro.neutral) return effects;
  const effect: ProjectEffect = {
    id,
    kind: kind === "brightness" ? "filter" :
      kind === "body" ? "eq3" : kind === "dynamics" ? "compressor" : "reverb",
    enabled: value !== macro.neutral,
    parameters: parameters(kind, value),
  };
  return existing
    ? effects.map((item) => item.id === id ? effect : item)
    : [...effects, effect];
}
