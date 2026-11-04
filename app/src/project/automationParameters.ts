import type { ProjectAutomationLane, ProjectDocumentV1, ProjectEffect } from "./model.ts";
import { numericProjectEffectParameter, projectEffectParameters } from "./effectParameters.ts";

export interface AutomationParameterDescriptor {
  readonly typeId: "base-mix" | "effect";
  readonly version: 1;
  readonly scope: "track" | "clip" | "master";
  readonly parameterId: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly unit: "dB" | "pan" | "Hz" | "ms" | "ratio" | "Q" | "normalized";
  readonly scale: "linear";
  /** Physical/Touch re-entry smoothing. Timeline ramps remain sample scheduled. */
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

const SEND_GAIN_AUTOMATION: AutomationParameterDescriptor = {
  typeId: "base-mix", version: 1, scope: "track", parameterId: "gainDb",
  min: -120, max: 24, defaultValue: -12, unit: "dB", scale: "linear", smoothingMs: 15,
};

function sendForTarget(document: ProjectDocumentV1, target: ProjectAutomationLane["target"]) {
  if (!target.sendId || target.scope !== "track" || !target.ownerId ||
      target.effectId !== undefined || target.parameterId !== "gainDb") return undefined;
  return document.tracks.find((track) => track.id === target.ownerId)?.mix.sends
    .find((send) => send.id === target.sendId);
}

/** Distortion drive rebuilds a waveshaper curve, so it is intentionally static. */
export function isAutomatableEffectParameter(effect: ProjectEffect, parameterId: string): boolean {
  if (!effect.enabled || (effect.kind === "saturation" && parameterId === "drive")) return false;
  return numericProjectEffectParameter(effect.kind, parameterId) !== undefined;
}

export function baseAutomationParameter(target: ProjectAutomationLane["target"]):
AutomationParameterDescriptor | undefined {
  if (target.effectId !== undefined) return undefined;
  return BASE_AUTOMATION_PARAMETERS.find((descriptor) =>
    descriptor.scope === target.scope && descriptor.parameterId === target.parameterId);
}

function effectForTarget(document: ProjectDocumentV1, target: ProjectAutomationLane["target"]):
ProjectEffect | undefined {
  if (!target.effectId) return undefined;
  if (target.scope === "master") {
    return document.mix.masterEffects.find((effect) => effect.id === target.effectId);
  }
  if (target.scope !== "track" || !target.ownerId) return undefined;
  return document.tracks.find((track) => track.id === target.ownerId)?.mix.effects
    .find((effect) => effect.id === target.effectId);
}

/** Runtime-safe descriptor: only enabled effect parameters backed by continuous Tone params. */
export function projectAutomationParameter(document: ProjectDocumentV1,
  target: ProjectAutomationLane["target"]): AutomationParameterDescriptor | undefined {
  if (target.sendId !== undefined) {
    return sendForTarget(document, target) ? SEND_GAIN_AUTOMATION : undefined;
  }
  const base = baseAutomationParameter(target);
  if (base) {
    if (target.scope === "clip") {
      const clip = document.clips.find((item) => item.id === target.ownerId);
      return clip?.kind === "audio" && (clip.timeMode ?? "beat") === "beat" ? base : undefined;
    }
    return base;
  }
  const effect = effectForTarget(document, target);
  if (!effect || !isAutomatableEffectParameter(effect, target.parameterId)) return undefined;
  const descriptor = numericProjectEffectParameter(effect.kind, target.parameterId);
  const current = effect.parameters[target.parameterId];
  if (!descriptor || typeof current !== "number" || !Number.isFinite(current)) return undefined;
  return { typeId: "effect", version: 1, scope: target.scope,
    parameterId: target.parameterId, min: descriptor.min, max: descriptor.max,
    defaultValue: current, unit: descriptor.unit, scale: "linear", smoothingMs: 15 };
}

export function projectAutomationBaseValue(document: ProjectDocumentV1,
  target: ProjectAutomationLane["target"]): number | undefined {
  if (target.sendId !== undefined) return sendForTarget(document, target)?.gainDb;
  const base = baseAutomationParameter(target);
  if (base) {
    if (target.scope === "master") return document.mix.masterGainDb;
    if (target.scope === "clip") {
      const clip = document.clips.find((item) => item.id === target.ownerId);
      return clip?.kind === "audio" ? clip.gainDb : undefined;
    }
    const track = document.tracks.find((item) => item.id === target.ownerId);
    return target.parameterId === "pan" ? track?.mix.pan : track?.mix.gainDb;
  }
  const effect = effectForTarget(document, target);
  const value = effect?.parameters[target.parameterId];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}


/** Exact continuous targets currently backed by the live/offline mixer graph. */
export function projectAutomationTargets(document: ProjectDocumentV1):
readonly ProjectAutomationLane["target"][] {
  const targets: ProjectAutomationLane["target"][] = [
    { scope: "master", parameterId: "masterGainDb" },
  ];
  for (const effect of document.mix.masterEffects) {
    if (!effect.enabled) continue;
    for (const descriptor of projectEffectParameters(effect.kind) ?? []) {
      if (descriptor.valueType === "number" &&
          isAutomatableEffectParameter(effect, descriptor.parameterId)) {
        targets.push({ scope: "master", effectId: effect.id,
          parameterId: descriptor.parameterId });
      }
    }
  }
  for (const clip of document.clips) {
    if (clip.kind === "audio" && (clip.timeMode ?? "beat") === "beat") {
      targets.push({ scope: "clip", ownerId: clip.id, parameterId: "gainDb" });
    }
  }
  for (const track of document.tracks) {
    targets.push({ scope: "track", ownerId: track.id, parameterId: "gainDb" },
      { scope: "track", ownerId: track.id, parameterId: "pan" });
    for (const send of track.mix.sends) {
      targets.push({ scope: "track", ownerId: track.id, sendId: send.id,
        parameterId: "gainDb" });
    }
    for (const effect of track.mix.effects) {
      if (!effect.enabled) continue;
      for (const descriptor of projectEffectParameters(effect.kind) ?? []) {
        if (descriptor.valueType === "number" &&
            isAutomatableEffectParameter(effect, descriptor.parameterId)) {
          targets.push({ scope: "track", ownerId: track.id, effectId: effect.id,
            parameterId: descriptor.parameterId });
        }
      }
    }
  }
  return targets;
}
