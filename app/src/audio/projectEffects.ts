import * as Tone from "tone";
import type { ProjectEffect } from "../project/model";
import { numericProjectEffectParameter } from "../project/effectParameters";

type Parameters = ProjectEffect["parameters"];

function exactKeys(effect: ProjectEffect, keys: readonly string[]): Parameters {
  const actual = Object.keys(effect.parameters).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`Efecto ${effect.id} (${effect.kind}): parámetros no coinciden con catálogo`);
  }
  return effect.parameters;
}

function number(parameters: Parameters, key: string, low: number, high: number,
  effect: ProjectEffect): number {
  const value = parameters[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`Efecto ${effect.id}: ${key} fuera de rango`);
  }
  return value;
}

function create(effect: ProjectEffect): Tone.ToneAudioNode {
  switch (effect.kind) {
    case "eq3": {
      const p = exactKeys(effect, ["lowDb", "midDb", "highDb", "lowHz", "highHz"]);
      const lowHz = number(p, "lowHz", 80, 1000, effect);
      const highHz = number(p, "highHz", 1500, 12000, effect);
      if (lowHz >= highHz) throw new RangeError(`Efecto ${effect.id}: cruces EQ invertidos`);
      return new Tone.EQ3({ low: number(p, "lowDb", -18, 18, effect),
        mid: number(p, "midDb", -18, 18, effect),
        high: number(p, "highDb", -18, 18, effect), lowFrequency: lowHz,
        highFrequency: highHz });
    }
    case "filter": {
      const p = exactKeys(effect, ["type", "cutoffHz", "q"]);
      if (p.type !== "lowpass" && p.type !== "highpass") {
        throw new RangeError(`Efecto ${effect.id}: tipo de filtro inválido`);
      }
      return new Tone.Filter({ type: p.type,
        frequency: number(p, "cutoffHz", 20, 20000, effect),
        Q: number(p, "q", 0.1, 10, effect), rolloff: -12 });
    }
    case "compressor": {
      const p = exactKeys(effect,
        ["thresholdDb", "ratio", "attackMs", "releaseMs", "kneeDb"]);
      return new Tone.Compressor({ threshold: number(p, "thresholdDb", -60, 0, effect),
        ratio: number(p, "ratio", 1, 20, effect),
        attack: number(p, "attackMs", 0, 1000, effect) / 1000,
        release: number(p, "releaseMs", 1, 1000, effect) / 1000,
        knee: number(p, "kneeDb", 0, 40, effect) });
    }
    case "saturation": {
      const p = exactKeys(effect, ["drive", "wet"]);
      return new Tone.Distortion({ distortion: number(p, "drive", 0, 1, effect),
        wet: number(p, "wet", 0, 1, effect), oversample: "4x" });
    }
    case "reverb": {
      const p = exactKeys(effect, ["roomSize", "dampeningHz", "wet"]);
      return new Tone.Freeverb({ roomSize: number(p, "roomSize", 0, 1, effect),
        dampening: number(p, "dampeningHz", 100, 12000, effect),
        wet: number(p, "wet", 0, 1, effect) });
    }
    case "delay": {
      const p = exactKeys(effect, ["timeMs", "feedback", "wet"]);
      return new Tone.FeedbackDelay({ delayTime: number(p, "timeMs", 1, 2000, effect) / 1000,
        maxDelay: 2, feedback: number(p, "feedback", 0, 0.9, effect),
        wet: number(p, "wet", 0, 1, effect) });
    }
    case "limiter": {
      const p = exactKeys(effect, ["thresholdDb"]);
      return new Tone.Limiter(number(p, "thresholdDb", -24, 0, effect));
    }
    default:
      throw new Error(`Efecto ${effect.id} (${effect.kind}) no disponible`);
  }
}

/** Chain order is document order; disabled effects preserve data and pass through. */
export function connectProjectEffects(effects: readonly ProjectEffect[],
  input: Tone.ToneAudioNode, output: Tone.ToneAudioNode): Tone.ToneAudioNode[] {
  const nodes: Tone.ToneAudioNode[] = [];
  try {
    for (const effect of effects) if (effect.enabled) nodes.push(create(effect));
    let previous = input;
    for (const node of nodes) { previous.connect(node); previous = node; }
    previous.connect(output);
    return nodes;
  } catch (error) {
    for (const node of nodes) node.dispose();
    throw error;
  }
}


export interface ProjectEffectAutomationParam {
  readonly param: {
    cancelAndHoldAtTime(time: number): unknown;
    setValueAtTime(value: number, time: number): unknown;
    linearRampToValueAtTime(value: number, time: number): unknown;
  };
  /** Persisted units stay human-readable; Tone uses seconds for selected time parameters. */
  readonly toAudioValue: (value: number) => number;
}

const EFFECT_AUTOMATION_PROPERTIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  eq3: { lowDb: "low", midDb: "mid", highDb: "high",
    lowHz: "lowFrequency", highHz: "highFrequency" },
  filter: { cutoffHz: "frequency", q: "Q" },
  compressor: { thresholdDb: "threshold", ratio: "ratio", attackMs: "attack",
    releaseMs: "release", kneeDb: "knee" },
  saturation: { wet: "wet" },
  reverb: { roomSize: "roomSize", dampeningHz: "dampening", wet: "wet" },
  delay: { timeMs: "delayTime", feedback: "feedback", wet: "wet" },
  limiter: { thresholdDb: "threshold" },
};

function automatableParamCandidate(value: unknown): value is ProjectEffectAutomationParam["param"] {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectEffectAutomationParam["param"]>;
  return typeof candidate.cancelAndHoldAtTime === "function" &&
    typeof candidate.setValueAtTime === "function" &&
    typeof candidate.linearRampToValueAtTime === "function";
}

/** Resolve only parameters that can move without rebuilding the DSP node. */
export function projectEffectAutomationParam(effect: ProjectEffect, node: Tone.ToneAudioNode,
  parameterId: string): ProjectEffectAutomationParam | undefined {
  if (!effect.enabled || (effect.kind === "saturation" && parameterId === "drive")) return undefined;
  if (!numericProjectEffectParameter(effect.kind, parameterId)) return undefined;
  const property = EFFECT_AUTOMATION_PROPERTIES[effect.kind]?.[parameterId];
  if (!property) return undefined;
  const candidate = (node as unknown as Record<string, unknown>)[property];
  if (!automatableParamCandidate(candidate)) {
    throw new Error(`Efecto ${effect.id} (${effect.kind}): ${parameterId} no expone AudioParam continuo`);
  }
  const inMilliseconds = (effect.kind === "compressor" &&
      (parameterId === "attackMs" || parameterId === "releaseMs")) ||
    (effect.kind === "delay" && parameterId === "timeMs");
  return { param: candidate, toAudioValue: inMilliseconds ? (value) => value / 1000 : (value) => value };
}
