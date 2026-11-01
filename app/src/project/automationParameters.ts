import type { ProjectAutomationLane } from "./model.ts";

export interface AutomationParameterDescriptor {
  readonly typeId: "base-mix";
  readonly version: 1;
  readonly scope: "track" | "clip" | "master";
  readonly parameterId: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly unit: "dB" | "pan";
  readonly scale: "linear";
  /** DSP ramp used for live mix changes. Playback of automation lanes is a separate capability. */
  readonly smoothingMs: number;
}

export const BASE_AUTOMATION_PARAMETERS: readonly AutomationParameterDescriptor[] = Object.freeze([
  { typeId: "base-mix", version: 1, scope: "track", parameterId: "gainDb",
    min: -120, max: 24, defaultValue: 0, unit: "dB", scale: "linear", smoothingMs: 15 },
  { typeId: "base-mix", version: 1, scope: "track", parameterId: "pan",
    min: -1, max: 1, defaultValue: 0, unit: "pan", scale: "linear", smoothingMs: 15 },
  { typeId: "base-mix", version: 1, scope: "clip", parameterId: "gainDb",
    min: -120, max: 24, defaultValue: 0, unit: "dB", scale: "linear", smoothingMs: 0 },
  { typeId: "base-mix", version: 1, scope: "master", parameterId: "masterGainDb",
    min: -120, max: 24, defaultValue: 0, unit: "dB", scale: "linear", smoothingMs: 15 },
]);

/** Describes persisted value semantics only; UI must separately require proven live/offline scheduling. */
export function baseAutomationParameter(target: ProjectAutomationLane["target"]):
AutomationParameterDescriptor | undefined {
  if (target.effectId !== undefined) return undefined;
  return BASE_AUTOMATION_PARAMETERS.find((descriptor) =>
    descriptor.scope === target.scope && descriptor.parameterId === target.parameterId);
}
