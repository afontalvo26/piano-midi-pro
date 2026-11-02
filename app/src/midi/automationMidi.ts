import type { ProjectAutomationLane } from "../project/model.ts";
import type { AutomationParameterDescriptor } from "../project/automationParameters.ts";
import type { MidiValueMode } from "./profile.ts";

export type AutomationMidiTakeover =
  | "pickup" | "absolute" | "relative-twos-complement" | "relative-binary-offset";

export interface AutomationMidiAction {
  readonly laneId: string;
  readonly takeover: AutomationMidiTakeover;
}

const PREFIX = "automation.";
const MODES: readonly AutomationMidiTakeover[] = [
  "pickup", "absolute", "relative-twos-complement", "relative-binary-offset",
];

export function automationMidiAction(laneId: string, takeover: AutomationMidiTakeover): string {
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(laneId) || !MODES.includes(takeover)) {
    throw new RangeError("MIDI Learn de automatización inválido");
  }
  return `${PREFIX}${takeover}:${laneId}`;
}

export function parseAutomationMidiAction(action: string): AutomationMidiAction | null {
  if (!action.startsWith(PREFIX)) return null;
  const separator = action.indexOf(":", PREFIX.length);
  if (separator < 0) return null;
  const takeover = action.slice(PREFIX.length, separator) as AutomationMidiTakeover;
  const laneId = action.slice(separator + 1);
  return MODES.includes(takeover) && /^[a-zA-Z0-9_.:-]{1,80}$/.test(laneId)
    ? { laneId, takeover } : null;
}

export function automationMidiValueMode(takeover: AutomationMidiTakeover): MidiValueMode {
  return takeover === "pickup" ? "absolute" : takeover;
}

export function automationBaseValue(
  lane: ProjectAutomationLane,
  document: { readonly mix: { readonly masterGainDb: number };
    readonly tracks: readonly { readonly id: string;
      readonly mix: { readonly gainDb: number; readonly pan: number } }[] },
): number {
  if (lane.target.scope === "master") return document.mix.masterGainDb;
  const track = document.tracks.find((item) => item.id === lane.target.ownerId);
  return lane.target.parameterId === "pan" ? track?.mix.pan ?? 0 : track?.mix.gainDb ?? 0;
}

export function scaleAutomationMidiValue(raw: number, valueMode: MidiValueMode,
  currentValue: number, descriptor: Pick<AutomationParameterDescriptor, "min" | "max">): number {
  const span = descriptor.max - descriptor.min;
  if (!Number.isFinite(raw) || !Number.isFinite(currentValue) || !(span > 0)) {
    throw new RangeError("Valor MIDI de automatización inválido");
  }
  const relative = valueMode === "relative-twos-complement" ||
    valueMode === "relative-binary-offset";
  const value = relative
    ? currentValue + (raw / 127) * span
    : descriptor.min + (Math.max(0, Math.min(127, raw)) / 127) * span;
  return Math.max(descriptor.min, Math.min(descriptor.max, value));
}

export interface PickupState {
  readonly lastPhysical?: number;
  readonly acquired: boolean;
}

/**
 * Pickup owns the target only after the physical fader reaches/crosses the
 * current software value. The target never jumps merely because Learn ended.
 */
export function advancePickup(state: PickupState | undefined, physical: number,
  target: number, tolerance = 2 / 127): { readonly state: PickupState; readonly acquired: boolean } {
  const p = Math.max(0, Math.min(1, physical));
  const t = Math.max(0, Math.min(1, target));
  if (state?.acquired) return { state: { lastPhysical: p, acquired: true }, acquired: true };
  const previous = state?.lastPhysical;
  const reached = Math.abs(p - t) <= tolerance ||
    (previous !== undefined && ((previous < t && p >= t) || (previous > t && p <= t)));
  return { state: { lastPhysical: p, acquired: reached }, acquired: reached };
}
