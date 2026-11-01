import type { ProjectNote, ProjectPattern } from "../project/model.ts";

export interface DrumPadDefinition {
  readonly id: string;
  readonly label: string;
  readonly midiNote: number | null;
  readonly channel: number;
  readonly sourceStatus: "ready" | "loading" | "missing";
  readonly sourceCredit?: string;
}

export interface DrumStepCell {
  readonly stepIndex: number;
  readonly startTick: number;
  readonly exactNotes: readonly ProjectNote[];
  readonly offsetNotes: readonly ProjectNote[];
}

export function drumBarTicks(numerator: number, denominator: number): number {
  const ticks = 960 * numerator * 4 / denominator;
  if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError("Compás inválido");
  return ticks;
}

export function projectDrumBar(pattern: ProjectPattern, pads: readonly (DrumPadDefinition | null)[],
  barStartTick: number, barTicks: number, stepTicks: number): ReadonlyMap<string, readonly DrumStepCell[]> {
  if (!Number.isSafeInteger(barStartTick) || barStartTick < 0 || !Number.isSafeInteger(stepTicks) || stepTicks < 1) {
    throw new RangeError("Rejilla de batería inválida");
  }
  const count = Math.ceil(barTicks / stepTicks);
  const byPitchChannel = new Map<string, ProjectNote[]>();
  for (const note of pattern.notes) {
    if (note.startTick < barStartTick || note.startTick >= Math.min(pattern.lengthTicks, barStartTick + barTicks)) continue;
    const key = `${note.pitch}:${note.channel}`;
    let group = byPitchChannel.get(key);
    if (!group) { group = []; byPitchChannel.set(key, group); }
    group.push(note);
  }
  const result = new Map<string, readonly DrumStepCell[]>();
  for (const pad of pads) {
    if (!pad || pad.midiNote === null) continue;
    const cells: DrumStepCell[] = Array.from({ length: count }, (_, stepIndex) => ({
      stepIndex, startTick: barStartTick + stepIndex * stepTicks, exactNotes: [], offsetNotes: [],
    }));
    for (const note of byPitchChannel.get(`${pad.midiNote}:${pad.channel}`) ?? []) {
      const stepIndex = Math.floor((note.startTick - barStartTick) / stepTicks);
      const cell = cells[stepIndex];
      if (!cell) continue;
      const target = note.startTick === cell.startTick ? cell.exactNotes : cell.offsetNotes;
      (target as ProjectNote[]).push(note);
    }
    result.set(pad.id, cells);
  }
  return result;
}

/** One grid press creates one canonical NoteEvent; other notes and expression are untouched. */
export function addDrumStep(pattern: ProjectPattern, pad: DrumPadDefinition, startTick: number,
  stepTicks: number, id = crypto.randomUUID()): ProjectPattern {
  if (pad.midiNote === null || pad.sourceStatus !== "ready") throw new RangeError("El pad no tiene una fuente disponible");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(pad.id)) throw new RangeError("ID de pad inválido");
  if (!Number.isSafeInteger(startTick) || startTick < 0 || startTick >= pattern.lengthTicks ||
      !Number.isSafeInteger(stepTicks) || stepTicks < 1 || pattern.notes.some((note) => note.id === id)) {
    throw new RangeError("Paso fuera del patrón o ID duplicado");
  }
  if (!Number.isSafeInteger(pad.midiNote) || pad.midiNote < 0 || pad.midiNote > 127 ||
      !Number.isSafeInteger(pad.channel) || pad.channel < 0 || pad.channel > 15) {
    throw new RangeError("Nota o canal MIDI inválido");
  }
  const note: ProjectNote = {
    id, startTick, durationTick: Math.min(stepTicks, pattern.lengthTicks - startTick),
    pitch: pad.midiNote, velocity: 100, releaseVelocity: 64, channel: pad.channel,
    origin: { kind: "drawn", playedPitch: pad.midiNote }, stepId: `${pad.id}:${startTick}`,
  };
  return { ...pattern, version: pattern.version + 1, notes: [...pattern.notes, note] };
}

export function removeDrumStep(pattern: ProjectPattern, noteId: string): ProjectPattern {
  if (!pattern.notes.some((note) => note.id === noteId)) throw new RangeError("Golpe inexistente");
  return { ...pattern, version: pattern.version + 1, notes: pattern.notes.filter((note) => note.id !== noteId) };
}

/** Change the canonical pattern horizon only when no existing event would be discarded. */
export function resizeDrumPattern(pattern: ProjectPattern, stepTicks: number,
  stepCount: number): ProjectPattern {
  if (!Number.isSafeInteger(stepTicks) || stepTicks < 1 ||
      !Number.isSafeInteger(stepCount) || stepCount < 1 || stepCount > 4096 ||
      stepTicks * stepCount > Number.MAX_SAFE_INTEGER) throw new RangeError("Longitud de batería inválida");
  const lengthTicks = stepTicks * stepCount;
  if (lengthTicks === pattern.lengthTicks) return pattern;
  if (pattern.notes.some((note) => note.startTick >= lengthTicks ||
      note.startTick + note.durationTick > lengthTicks) ||
      pattern.expression.some((event) => event.tick >= lengthTicks)) {
    throw new RangeError("El patrón contiene golpes o expresión fuera de la nueva longitud");
  }
  return { ...pattern, version: pattern.version + 1, lengthTicks };
}
