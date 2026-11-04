const PREFIX = "drum.pad:";

export interface DrumPadMidiAction {
  readonly padId: string;
}

export function drumPadMidiAction(padId: string): string {
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(padId)) {
    throw new RangeError("Pad MIDI Learn inválido");
  }
  return `${PREFIX}${padId}`;
}

export function parseDrumPadMidiAction(action: string): DrumPadMidiAction | null {
  if (!action.startsWith(PREFIX)) return null;
  const padId = action.slice(PREFIX.length);
  return /^[a-zA-Z0-9_.:-]{1,80}$/.test(padId) ? { padId } : null;
}
