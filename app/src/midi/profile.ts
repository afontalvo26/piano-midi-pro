import type { MidiEvent } from "./message.ts";

export type MidiProfileId = "smk37-elite" | "smk37-pro" | "generic";

export interface MidiIdentity {
  readonly name?: string | null;
  readonly manufacturer?: string | null;
}

export interface MidiProfile {
  readonly id: MidiProfileId;
  readonly label: string;
  /** Physical controls to inspect. These are not claims about emitted bytes. */
  readonly controls: readonly string[];
}

const SMK37_CONTROLS = [
  "keys", "pitch", "mod", "sustainPedal", "knobBank", "faderBank", "padBank",
  ...Array.from({ length: 16 }, (_, i) => `K${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 32 }, (_, i) => `Pad${i + 1}`),
  "octaveDown", "octaveUp", "left", "right", "play", "arp", "noteRepeat",
  "scale", "chord", "globe", "bt", "patch", "para", "fx", "seq",
  "seqPlay", "seqRec",
] as const;

export const MIDI_PROFILES: Readonly<Record<MidiProfileId, MidiProfile>> = {
  "smk37-elite": { id: "smk37-elite", label: "M-VAVE SMK-37 Elite", controls: SMK37_CONTROLS },
  "smk37-pro": { id: "smk37-pro", label: "M-VAVE SMK-37 Pro", controls: SMK37_CONTROLS },
  generic: { id: "generic", label: "Controlador MIDI genérico", controls: ["keys", "pitch", "mod", "sustainPedal"] },
};

/** A name is a suggestion only. Web MIDI does not expose firmware or USB VID/PID. */
export function isSmk37Identity(identity: MidiIdentity): boolean {
  return /smk[\s_-]*37/i.test(`${identity.manufacturer ?? ""} ${identity.name ?? ""}`);
}

export function identifyProfile(identity: MidiIdentity): MidiProfileId {
  const label = `${identity.manufacturer ?? ""} ${identity.name ?? ""}`.toLowerCase();
  if (!isSmk37Identity(identity)) return "generic";
  if (/elite/.test(label)) return "smk37-elite";
  if (/\bpro\b/.test(label)) return "smk37-pro";
  return "generic";
}

export interface PhysicalNoteMappingOptions {
  readonly physicalBase: number;
  readonly rangeStart: number;
  readonly profileId: MidiProfileId;
  readonly identity: MidiIdentity;
  /** A user-calibrated generic controller opts in to the visible 37-key span. */
  readonly explicitlyCalibrated?: boolean;
}

/**
 * Preserve raw pitch for a generic controller until its first key is calibrated.
 * An identifiable SMK-37 family port can use the 37-key visible-range anchor
 * even when its Web MIDI name does not reveal Elite versus Pro. This does not
 * assert a control map, port role or the device's actual lowest MIDI note.
 */
export function mapPhysicalNote(note: number, options: PhysicalNoteMappingOptions): number {
  if (!Number.isInteger(note) || note < 0 || note > 127 ||
      !Number.isInteger(options.physicalBase) || !Number.isInteger(options.rangeStart)) {
    throw new RangeError("physical note mapping requires MIDI integers");
  }
  const anchored = options.profileId !== "generic" || isSmk37Identity(options.identity) ||
    options.explicitlyCalibrated === true;
  const mapped = anchored ? options.rangeStart + note - options.physicalBase : note;
  return Math.max(0, Math.min(127, mapped));
}

export type MidiBindableKind =
  | "noteOn" | "noteOff" | "cc" | "pitchBend" | "polyPressure"
  | "channelPressure" | "programChange" | "start" | "continue" | "stop";

export interface MidiMatcher {
  readonly kind: MidiBindableKind;
  /** Restricts a binding to one Web MIDI input; absent matches any input. */
  readonly inputId?: string;
  /** Zero based MIDI channel, absent for global/system messages. */
  readonly channel?: number;
  /** CC number, note number or program number, depending on kind. */
  readonly number?: number;
  /** A bank may match only when an observed state supplies it to the resolver. */
  readonly bank?: string;
}

export type MidiValueMode = "absolute" | "trigger" | "relative-twos-complement" | "relative-binary-offset";

export interface MidiBinding {
  readonly id: string;
  /** Stable semantic action ID selected by the app, e.g. recording.toggle. */
  readonly action: string;
  readonly matcher: MidiMatcher;
  readonly valueMode: MidiValueMode;
  /** Note messages remain musical unless the user explicitly chooses this. */
  readonly consumeNote?: boolean;
  readonly enabled: boolean;
}

export interface MidiBindingScope {
  readonly profileId: MidiProfileId;
  /** Stable port label chosen by the app; include input ID if names collide. */
  readonly portKey: string;
  /** Optional firmware/MidiSuite template label supplied by the user. */
  readonly configurationKey?: string;
}

export interface BindingConflict {
  readonly first: MidiBinding;
  readonly second: MidiBinding;
}

export interface MidiBindingContext {
  readonly bank?: string;
}

export interface MidiLearnOptions {
  readonly id: string;
  readonly action: string;
  readonly bank?: string;
  readonly matchInput?: boolean;
  readonly matchChannel?: boolean;
  readonly valueMode?: MidiValueMode;
  readonly consumeNote?: boolean;
}

export type BindingConflictPolicy = "reject" | "replace" | "disable-old";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const BINDABLE_KINDS: readonly MidiBindableKind[] = [
  "noteOn", "noteOff", "cc", "pitchBend", "polyPressure", "channelPressure",
  "programChange", "start", "continue", "stop",
];
const VALUE_MODES: readonly MidiValueMode[] = [
  "absolute", "trigger", "relative-twos-complement", "relative-binary-offset",
];
const NUMBERED_KINDS: readonly MidiBindableKind[] = ["noteOn", "noteOff", "cc", "polyPressure", "programChange"];

export function isMidiBinding(value: unknown): value is MidiBinding {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MidiBinding>;
  const matcher = candidate.matcher;
  if (!matcher || typeof matcher !== "object") return false;
  if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(candidate.id)) return false;
  if (typeof candidate.action !== "string" || !/^[a-z][a-zA-Z0-9_.:-]{0,127}$/.test(candidate.action)) return false;
  if (!BINDABLE_KINDS.includes(matcher.kind as MidiBindableKind)) return false;
  if (!VALUE_MODES.includes(candidate.valueMode as MidiValueMode)) return false;
  if (typeof candidate.enabled !== "boolean") return false;
  if (candidate.consumeNote !== undefined && typeof candidate.consumeNote !== "boolean") return false;
  if (matcher.inputId !== undefined && (typeof matcher.inputId !== "string" || matcher.inputId.length > 256)) return false;
  if (matcher.bank !== undefined && (typeof matcher.bank !== "string" || matcher.bank.length > 80)) return false;
  if (matcher.channel !== undefined && (!Number.isInteger(matcher.channel) || matcher.channel < 0 || matcher.channel > 15)) return false;
  if (matcher.number !== undefined && (!NUMBERED_KINDS.includes(matcher.kind) || !Number.isInteger(matcher.number) || matcher.number < 0 || matcher.number > 127)) return false;
  if ((matcher.kind === "start" || matcher.kind === "continue" || matcher.kind === "stop") && matcher.channel !== undefined) return false;
  return true;
}

function eventNumber(event: MidiEvent): number | undefined {
  switch (event.kind) {
    case "noteOn": case "noteOff": case "polyPressure": return event.note;
    case "cc": return event.controller;
    case "programChange": return event.program;
    default: return undefined;
  }
}

/** Build a binding solely from an observed event, never a guessed CC number. */
export function learnMidiBinding(event: MidiEvent, options: MidiLearnOptions): MidiBinding | null {
  if (!BINDABLE_KINDS.includes(event.kind as MidiBindableKind)) return null;
  const matcher: MidiMatcher = {
    kind: event.kind as MidiBindableKind,
    ...(options.matchInput === false ? {} : { inputId: event.inputId }),
    ...(options.matchChannel === false || !("channel" in event) ? {} : { channel: event.channel }),
    ...(eventNumber(event) === undefined ? {} : { number: eventNumber(event) }),
    ...(options.bank === undefined ? {} : { bank: options.bank }),
  };
  const binding: MidiBinding = {
    id: options.id, action: options.action, matcher,
    valueMode: options.valueMode ?? (event.kind === "cc" || event.kind === "pitchBend" ? "absolute" : "trigger"),
    consumeNote: options.consumeNote ?? false,
    enabled: true,
  };
  if (!isMidiBinding(binding)) throw new TypeError("invalid MIDI Learn binding options");
  return binding;
}

export function isBindingMatch(event: MidiEvent, binding: MidiBinding, context: MidiBindingContext = {}): boolean {
  if (!binding.enabled || binding.matcher.kind !== event.kind) return false;
  const { matcher } = binding;
  if (matcher.inputId !== undefined && matcher.inputId !== event.inputId) return false;
  if (matcher.bank !== undefined && matcher.bank !== context.bank) return false;
  if (matcher.number !== undefined && matcher.number !== eventNumber(event)) return false;
  if (matcher.channel !== undefined && (!("channel" in event) || matcher.channel !== event.channel)) return false;
  return true;
}

function specificity(binding: MidiBinding): number {
  const matcher = binding.matcher;
  return Number(matcher.inputId !== undefined) * 8 + Number(matcher.channel !== undefined) * 4 +
    Number(matcher.number !== undefined) * 2 + Number(matcher.bank !== undefined);
}

export function resolveBindings(
  event: MidiEvent,
  bindings: readonly MidiBinding[],
  context: MidiBindingContext = {},
): MidiBinding[] {
  const matches = bindings.filter((binding) => isBindingMatch(event, binding, context));
  // A corrupt or older storage document can contain conflicts even though
  // saveMidiBindings refuses them. Keep them visible in the panel, but never
  // run two actions for the same physical message.
  return matches.length > 1 ? [] : matches.sort((a, b) => specificity(b) - specificity(a));
}

function overlaps<T>(first: T | undefined, second: T | undefined): boolean {
  return first === undefined || second === undefined || first === second;
}

export function findBindingConflicts(bindings: readonly MidiBinding[]): BindingConflict[] {
  const conflicts: BindingConflict[] = [];
  for (let i = 0; i < bindings.length; i++) {
    const first = bindings[i]!;
    if (!first.enabled) continue;
    for (let j = i + 1; j < bindings.length; j++) {
      const second = bindings[j]!;
      if (!second.enabled || first.matcher.kind !== second.matcher.kind) continue;
      const a = first.matcher;
      const b = second.matcher;
      if (overlaps(a.inputId, b.inputId) && overlaps(a.channel, b.channel) &&
          overlaps(a.number, b.number) && overlaps(a.bank, b.bank)) {
        conflicts.push({ first, second });
      }
    }
  }
  return conflicts;
}

/** A collision must be rejected or resolved explicitly by the caller. */
export function upsertMidiBinding(
  bindings: readonly MidiBinding[],
  incoming: MidiBinding,
  policy: BindingConflictPolicy = "reject",
): { bindings: MidiBinding[]; conflicts: BindingConflict[] } {
  if (!isMidiBinding(incoming)) throw new TypeError("invalid MIDI binding");
  const previous = bindings.filter((binding) => binding.id !== incoming.id);
  const conflicts = findBindingConflicts([...previous, incoming])
    .filter((conflict) => conflict.second.id === incoming.id);
  if (conflicts.length > 0 && policy === "reject") return { bindings: [...bindings], conflicts };
  const replacedIds = new Set(conflicts.map((conflict) => conflict.first.id));
  const next = previous
    .filter((binding) => policy !== "replace" || !replacedIds.has(binding.id))
    .map((binding) => policy === "disable-old" && replacedIds.has(binding.id)
      ? { ...binding, enabled: false } : binding);
  return { bindings: [...next, incoming], conflicts };
}

/** Returns the raw 0..127 control level, or a signed encoder step. */
export function bindingValue(event: MidiEvent, mode: MidiValueMode): number {
  const raw = event.kind === "cc" ? event.value
    : event.kind === "noteOn" ? event.velocity
    : event.kind === "noteOff" ? 0
    : event.kind === "polyPressure" || event.kind === "channelPressure" ? event.pressure
    : event.kind === "pitchBend" ? Math.round((event.value14 / 16383) * 127)
    : event.kind === "programChange" ? event.program : 127;
  if (mode === "trigger") return event.kind === "noteOff" ? 0 : 1;
  if (mode === "relative-twos-complement") return raw <= 63 ? raw : raw - 128;
  if (mode === "relative-binary-offset") return raw - 64;
  return raw;
}

export function midiBindingStorageKey(scope: MidiBindingScope): string {
  const suffix = scope.configurationKey === undefined ? "" : `.${encodeURIComponent(scope.configurationKey)}`;
  return `piano.midi.bindings.v1.${encodeURIComponent(scope.profileId)}.${encodeURIComponent(scope.portKey)}${suffix}`;
}

export function loadMidiBindings(storage: StorageLike, scope: MidiBindingScope): MidiBinding[] {
  try {
    const raw = storage.getItem(midiBindingStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const document = parsed as { version?: unknown; bindings?: unknown };
    if (document.version !== 1 || !Array.isArray(document.bindings)) return [];
    const unique = new Set<string>();
    return document.bindings.filter((binding): binding is MidiBinding => {
      if (!isMidiBinding(binding) || unique.has(binding.id)) return false;
      unique.add(binding.id);
      return true;
    });
  } catch {
    return [];
  }
}

export function saveMidiBindings(storage: StorageLike, scope: MidiBindingScope, bindings: readonly MidiBinding[]): void {
  if (bindings.some((binding) => !isMidiBinding(binding))) throw new TypeError("invalid MIDI binding");
  if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length) throw new TypeError("duplicate MIDI binding IDs");
  if (findBindingConflicts(bindings).length > 0) throw new TypeError("unresolved MIDI binding conflict");
  storage.setItem(midiBindingStorageKey(scope), JSON.stringify({ version: 1, bindings }));
}
