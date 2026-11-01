/** A MIDI port visible through Web MIDI. Its name suggests, but cannot prove, its role. */
export interface MidiInputCandidate {
  readonly id: string;
  readonly name: string;
  readonly manufacturer?: string | null;
  readonly state?: "connected" | "disconnected";
}

export interface MidiInputSelectionOptions {
  /** Raw localStorage value of piano_selected_midi_input_id (JSON string). */
  readonly storedSelectionRaw?: string | null;
  /** Raw localStorage value of a separate boolean set only by a manual All choice. */
  readonly explicitAllRaw?: string | null;
}

export type MidiInputSelectionReason =
  | "explicit-port" | "explicit-port-disconnected" | "explicit-all"
  | "single-input" | "smk37-primary-name" | "no-inputs" | "selection-required";

export interface MidiInputSelection {
  /** __auto__ means attach no ports until a unique candidate is available. */
  readonly selectedInputId: string;
  readonly reason: MidiInputSelectionReason;
  /** A name-based choice is a suggestion, not a verified performance-port role. */
  readonly provisional: boolean;
}

export const AUTO_MIDI_INPUT_ID = "__auto__";
export const ALL_MIDI_INPUTS_ID = "__all__";

/** Accept the existing JSON storage format and a legacy unquoted port ID. */
export function parseStoredMidiInputId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded: unknown = JSON.parse(raw);
    return typeof decoded === "string" && decoded.length > 0 ? decoded : null;
  } catch {
    const value = raw.trim();
    return value && !["{", "[", '"'].some((prefix) => value.startsWith(prefix)) &&
      value !== "undefined" ? value : null;
  }
}

function isSmk37(input: MidiInputCandidate): boolean {
  return /smk[\s_-]*37/i.test(`${input.manufacturer ?? ""} ${input.name}`);
}

function isAuxiliaryPort(input: MidiInputCandidate): boolean {
  // Windows commonly labels the additional SMK ports MIDIIN2/MIDIIN3; some
  // browsers use "MIDI USB 2" or "Port 2". This is only a name heuristic.
  return /\b(?:midi\s*in|midiin|midi|usb|port)\s*(?:[2-9]|[1-9]\d+)\b/i.test(input.name);
}

/**
 * Choose one input without guessing by enumeration order or silently opening
 * all ports. The only automatic multi-port choice is an unambiguous SMK-37
 * primary *name*; the caller should label it provisional until physically
 * verified. A disconnected explicit port stays selected for reconnection.
 */
export function selectMidiInput(
  inputs: readonly MidiInputCandidate[],
  options: MidiInputSelectionOptions = {},
): MidiInputSelection {
  const available = inputs.filter((input) => input.state !== "disconnected" && input.id.length > 0);
  const stored = parseStoredMidiInputId(options.storedSelectionRaw);

  if (stored && stored !== ALL_MIDI_INPUTS_ID && stored !== AUTO_MIDI_INPUT_ID) {
    return available.some((input) => input.id === stored)
      ? { selectedInputId: stored, reason: "explicit-port", provisional: false }
      : { selectedInputId: stored, reason: "explicit-port-disconnected", provisional: false };
  }

  // The old app persisted __all__ as its default, so that value alone cannot
  // distinguish a deliberate All choice from the default. The separate flag
  // is written only when the user explicitly selects All in the new UI.
  if (options.explicitAllRaw === "true") {
    return { selectedInputId: ALL_MIDI_INPUTS_ID, reason: "explicit-all", provisional: false };
  }

  if (available.length === 0) {
    return { selectedInputId: AUTO_MIDI_INPUT_ID, reason: "no-inputs", provisional: false };
  }
  if (available.length === 1) {
    return { selectedInputId: available[0]!.id, reason: "single-input", provisional: false };
  }

  const primary = available.filter((input) => isSmk37(input) && !isAuxiliaryPort(input));
  if (primary.length === 1) {
    return { selectedInputId: primary[0]!.id, reason: "smk37-primary-name", provisional: true };
  }
  return { selectedInputId: AUTO_MIDI_INPUT_ID, reason: "selection-required", provisional: false };
}
