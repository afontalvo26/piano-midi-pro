import { PROJECT_PPQ, type ProjectExpressionEvent, type ProjectNote, type ProjectPattern } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";

export const PIANO_ROLL_ROW_HEIGHT = 22;
export const PIANO_ROLL_KEY_WIDTH = 50;

export const PIANO_ROLL_SNAPS = [
  { label: "Libre · 1 tick", ticks: 1 },
  { label: "1/4", ticks: 960 },
  { label: "1/8", ticks: 480 },
  { label: "1/8T", ticks: 320 },
  { label: "1/16", ticks: 240 },
  { label: "1/16T", ticks: 160 },
  { label: "1/32", ticks: 120 },
  { label: "1/32T", ticks: 80 },
  { label: "1/64", ticks: 60 },
  { label: "1/64T", ticks: 40 },
] as const;

export interface PianoRollViewport {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly width: number;
  readonly height: number;
  readonly pixelsPerQuarter: number;
}

export interface NoteRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function pixelsPerTick(pixelsPerQuarter: number): number {
  return pixelsPerQuarter / PROJECT_PPQ;
}

export function tickToX(tick: number, viewport: PianoRollViewport): number {
  return PIANO_ROLL_KEY_WIDTH + tick * pixelsPerTick(viewport.pixelsPerQuarter) - viewport.scrollLeft;
}

export function xToTick(x: number, viewport: PianoRollViewport): number {
  return Math.max(0, (x + viewport.scrollLeft - PIANO_ROLL_KEY_WIDTH) / pixelsPerTick(viewport.pixelsPerQuarter));
}

export function pitchToY(pitch: number, viewport: PianoRollViewport): number {
  return (127 - pitch) * PIANO_ROLL_ROW_HEIGHT - viewport.scrollTop;
}

export function yToPitch(y: number, viewport: PianoRollViewport): number {
  return Math.max(0, Math.min(127, 127 - Math.floor((y + viewport.scrollTop) / PIANO_ROLL_ROW_HEIGHT)));
}

export function noteRect(note: ProjectNote, viewport: PianoRollViewport): NoteRect {
  return {
    x: tickToX(note.startTick, viewport),
    y: pitchToY(note.pitch, viewport),
    width: Math.max(1, note.durationTick * pixelsPerTick(viewport.pixelsPerQuarter)),
    height: PIANO_ROLL_ROW_HEIGHT,
  };
}

export function snapTick(tick: number, step: number, mode: "nearest" | "floor" = "nearest"): number {
  if (!Number.isSafeInteger(step) || step < 1) throw new RangeError("Rejilla inválida");
  const position = Math.max(0, tick) / step;
  return Math.max(0, (mode === "floor" ? Math.floor(position) : Math.round(position)) * step);
}

export function visibleTickRange(viewport: PianoRollViewport): readonly [number, number] {
  const start = Math.max(0, Math.floor(xToTick(PIANO_ROLL_KEY_WIDTH, viewport)));
  const end = Math.max(start + 1, Math.ceil(xToTick(viewport.width, viewport)));
  return [start, end];
}

/** Start-sorted interval tree. Long notes do not force scans of all intervening events. */
export class PianoRollNoteIndex {
  private readonly ordered: readonly ProjectNote[];
  private readonly base: number;
  private readonly maxEnd: Float64Array;

  constructor(notes: readonly ProjectNote[]) {
    this.ordered = [...notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id));
    let base = 1;
    while (base < this.ordered.length) base *= 2;
    this.base = base;
    this.maxEnd = new Float64Array(base * 2);
    this.ordered.forEach((note, index) => {
      this.maxEnd[base + index] = note.startTick + note.durationTick;
    });
    for (let index = base - 1; index > 0; index -= 1) {
      this.maxEnd[index] = Math.max(this.maxEnd[index * 2]!, this.maxEnd[index * 2 + 1]!);
    }
  }

  query(startTick: number, endTick: number, minPitch = 0, maxPitch = 127): ProjectNote[] {
    if (endTick <= startTick) return [];
    const result: ProjectNote[] = [];
    const visit = (node: number, first: number, last: number): void => {
      if (first >= this.ordered.length || this.maxEnd[node]! <= startTick ||
          this.ordered[first]!.startTick >= endTick) return;
      if (last - first === 1) {
        const note = this.ordered[first]!;
        if (note.pitch >= minPitch && note.pitch <= maxPitch) result.push(note);
        return;
      }
      const middle = (first + last) >>> 1;
      visit(node * 2, first, middle);
      visit(node * 2 + 1, middle, last);
    };
    visit(1, 0, this.base);
    return result;
  }

  hit(tick: number, pitch: number): ProjectNote | null {
    const candidates = this.query(tick, tick + 1, pitch, pitch);
    return candidates.at(-1) ?? null;
  }
}

function assertEditedNote(note: ProjectNote, pattern: ProjectPattern): void {
  if (!Number.isSafeInteger(note.startTick) || note.startTick < 0 || note.startTick >= pattern.lengthTicks ||
      !Number.isSafeInteger(note.durationTick) || note.durationTick < 1 ||
      !Number.isSafeInteger(note.startTick + note.durationTick)) {
    throw new RangeError("El inicio de la nota debe quedar dentro del patrón y su duración debe ser válida");
  }
  if (!Number.isSafeInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 ||
      !Number.isSafeInteger(note.velocity) || note.velocity < 1 || note.velocity > 127 ||
      !Number.isSafeInteger(note.releaseVelocity) || note.releaseVelocity < 0 || note.releaseVelocity > 127 ||
      !Number.isSafeInteger(note.channel) || note.channel < 0 || note.channel > 15) {
    throw new RangeError("Pitch, velocidad o canal fuera del rango MIDI");
  }
  if (note.microOffsetTick !== undefined && note.startTick + note.microOffsetTick < 0) {
    throw new RangeError("El microdesplazamiento dejaría la nota antes del inicio");
  }
  if (note.microOffsetTick !== undefined && (!Number.isSafeInteger(note.microOffsetTick) ||
      note.startTick + note.microOffsetTick > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Microdesplazamiento inválido");
  }
  if (note.probability !== undefined && (!Number.isFinite(note.probability) ||
      note.probability < 0 || note.probability > 1)) throw new RangeError("Probabilidad inválida");
  if (note.ratchetCount !== undefined && (!Number.isSafeInteger(note.ratchetCount) ||
      note.ratchetCount < 1 || note.ratchetCount > 64)) throw new RangeError("Ratchet inválido");
  if (note.muted !== undefined && typeof note.muted !== "boolean") throw new RangeError("Mute inválido");
}

function replaced(pattern: ProjectPattern, notes: readonly ProjectNote[]): ProjectPattern {
  return { ...pattern, version: pattern.version + 1, notes };
}

export function createPianoRollNote(pattern: ProjectPattern, note: ProjectNote): ProjectPattern {
  if (pattern.notes.some((existing) => existing.id === note.id)) throw new RangeError("ID de nota duplicado");
  assertEditedNote(note, pattern);
  return replaced(pattern, [...pattern.notes, note]);
}

export type EditableNoteFields = Pick<ProjectNote, "startTick" | "durationTick" | "pitch" | "velocity" | "releaseVelocity" | "channel">;
export interface EditablePerformanceFields {
  readonly microOffsetTick: number;
  readonly probability: number;
  readonly ratchetCount: number;
  readonly muted: boolean;
}

export function editPianoRollNote(pattern: ProjectPattern, noteId: string, fields: EditableNoteFields): ProjectPattern {
  const note = pattern.notes.find((entry) => entry.id === noteId);
  if (!note) throw new RangeError("La nota seleccionada ya no existe");
  const next = { ...note, ...fields };
  assertEditedNote(next, pattern);
  if (Object.keys(fields).every((key) => Object.is(next[key as keyof EditableNoteFields], note[key as keyof EditableNoteFields]))) {
    return pattern;
  }
  return replaced(pattern, pattern.notes.map((entry) => entry.id === noteId ? next : entry));
}

export function editPianoRollNoteWithPerformance(pattern: ProjectPattern, noteId: string,
  fields: EditableNoteFields, performance: EditablePerformanceFields): ProjectPattern {
  const note = pattern.notes.find((entry) => entry.id === noteId);
  if (!note) throw new RangeError("La nota seleccionada ya no existe");
  const optional = {
    ...(performance.microOffsetTick !== 0 || note.microOffsetTick !== undefined
      ? { microOffsetTick: performance.microOffsetTick } : {}),
    ...(performance.probability !== 1 || note.probability !== undefined
      ? { probability: performance.probability } : {}),
    ...(performance.ratchetCount !== 1 || note.ratchetCount !== undefined
      ? { ratchetCount: performance.ratchetCount } : {}),
    ...(performance.muted || note.muted !== undefined ? { muted: performance.muted } : {}),
  };
  const next = { ...note, ...fields, ...optional };
  assertEditedNote(next, pattern);
  if (Object.keys({ ...fields, ...optional }).every((key) =>
    Object.is(next[key as keyof ProjectNote], note[key as keyof ProjectNote]))) return pattern;
  return replaced(pattern, pattern.notes.map((entry) => entry.id === noteId ? next : entry));
}

export function movePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>, deltaTick: number, deltaPitch: number): ProjectPattern {
  if (!Number.isSafeInteger(deltaTick) || !Number.isSafeInteger(deltaPitch)) throw new RangeError("Movimiento inválido");
  if (noteIds.size === 0 || (deltaTick === 0 && deltaPitch === 0)) return pattern;
  let matched = 0;
  const notes = pattern.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    matched += 1;
    const next = { ...note, startTick: note.startTick + deltaTick, pitch: note.pitch + deltaPitch };
    assertEditedNote(next, pattern);
    return next;
  });
  if (matched !== noteIds.size) throw new RangeError("La selección contiene notas que ya no existen");
  return replaced(pattern, notes);
}

export function deletePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>): ProjectPattern {
  if (noteIds.size === 0) return pattern;
  const notes = pattern.notes.filter((note) => !noteIds.has(note.id));
  if (notes.length === pattern.notes.length) return pattern;
  if (pattern.notes.length - notes.length !== noteIds.size) throw new RangeError("La selección contiene notas que ya no existen");
  return replaced(pattern, notes);
}

function selectedNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>): ProjectNote[] {
  const notes = pattern.notes.filter((note) => noteIds.has(note.id));
  if (notes.length !== noteIds.size) throw new RangeError("La selección contiene notas que ya no existen");
  return notes;
}

export function duplicatePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>,
  deltaTick: number, newId: () => string = () => crypto.randomUUID()): ProjectPattern {
  if (!Number.isSafeInteger(deltaTick)) throw new RangeError("Desplazamiento inválido");
  const source = selectedNotes(pattern, noteIds);
  if (!source.length) return pattern;
  const copies = source.map((note) => {
    const id = newId();
    return { ...note, id, startTick: note.startTick + deltaTick,
      ...(note.stepId === undefined ? {} : { stepId: id }) };
  });
  const existing = new Set(pattern.notes.map((note) => note.id));
  for (const note of copies) {
    if (existing.has(note.id)) throw new RangeError("ID de nota duplicado");
    existing.add(note.id);
    assertEditedNote(note, pattern);
  }
  return replaced(pattern, [...pattern.notes, ...copies]);
}

export function pastePianoRollNotes(pattern: ProjectPattern, clipboard: readonly ProjectNote[],
  atTick: number, newId: () => string = () => crypto.randomUUID()): ProjectPattern {
  if (!clipboard.length) return pattern;
  if (!Number.isSafeInteger(atTick) || atTick < 0) throw new RangeError("Tick de pegado inválido");
  const firstTick = clipboard.reduce((first, note) => Math.min(first, note.startTick), Number.MAX_SAFE_INTEGER);
  const copies = clipboard.map((note) => {
    const id = newId();
    return { ...note, id, startTick: atTick + note.startTick - firstTick,
      ...(note.stepId === undefined ? {} : { stepId: id }) };
  });
  const existing = new Set(pattern.notes.map((note) => note.id));
  for (const note of copies) {
    if (existing.has(note.id)) throw new RangeError("ID de nota duplicado");
    existing.add(note.id);
    assertEditedNote(note, pattern);
  }
  return replaced(pattern, [...pattern.notes, ...copies]);
}

export function splitPianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>, atTick: number,
  newId: () => string = () => crypto.randomUUID()): ProjectPattern {
  const source = selectedNotes(pattern, noteIds);
  if (!source.length) return pattern;
  if (!Number.isSafeInteger(atTick) || source.some((note) =>
    atTick <= note.startTick || atTick >= note.startTick + note.durationTick)) {
    throw new RangeError("El corte debe estar dentro de todas las notas seleccionadas");
  }
  const right = source.map((note) => {
    const id = newId();
    return { ...note, id, startTick: atTick, durationTick: note.startTick + note.durationTick - atTick,
      ...(note.stepId === undefined ? {} : { stepId: id }) };
  });
  const existing = new Set(pattern.notes.map((note) => note.id));
  for (const note of right) {
    if (existing.has(note.id)) throw new RangeError("ID de nota duplicado");
    existing.add(note.id);
    assertEditedNote(note, pattern);
  }
  const notes = pattern.notes.map((note) => noteIds.has(note.id)
    ? { ...note, durationTick: atTick - note.startTick } : note);
  return replaced(pattern, [...notes, ...right]);
}

export function joinPianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>): ProjectPattern {
  const source = selectedNotes(pattern, noteIds).sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
  if (source.length < 2) throw new RangeError("Selecciona dos o más notas para unir");
  if (source.some((note) => note.pitch !== source[0]!.pitch || note.channel !== source[0]!.channel)) {
    throw new RangeError("Sólo se unen notas del mismo pitch y canal");
  }
  let end = source[0]!.startTick + source[0]!.durationTick;
  for (const note of source.slice(1)) {
    if (note.startTick > end) throw new RangeError("Las notas deben tocarse o solaparse para unirlas");
    end = Math.max(end, note.startTick + note.durationTick);
  }
  const kept = { ...source[0]!, durationTick: end - source[0]!.startTick };
  assertEditedNote(kept, pattern);
  return replaced(pattern, pattern.notes.flatMap((note) => note.id === kept.id ? [kept] :
    noteIds.has(note.id) ? [] : [note]));
}

export function setPianoRollMuted(pattern: ProjectPattern, noteIds: ReadonlySet<string>, muted: boolean): ProjectPattern {
  const source = selectedNotes(pattern, noteIds);
  if (!source.length || source.every((note) => !!note.muted === muted)) return pattern;
  return replaced(pattern, pattern.notes.map((note) => noteIds.has(note.id) ? { ...note, muted } : note));
}

export function resizePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>, deltaTick: number): ProjectPattern {
  if (!Number.isSafeInteger(deltaTick)) throw new RangeError("Duración inválida");
  const source = selectedNotes(pattern, noteIds);
  if (!source.length || deltaTick === 0) return pattern;
  const changed = pattern.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    const next = { ...note, durationTick: note.durationTick + deltaTick };
    assertEditedNote(next, pattern);
    return next;
  });
  return replaced(pattern, changed);
}

export interface QuantizeOptions {
  readonly gridTicks: number;
  readonly strength: number;
  readonly swing: number;
  readonly grooveOffsets?: readonly number[];
}

export function quantizePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>,
  { gridTicks, strength, swing, grooveOffsets = [0] }: QuantizeOptions): ProjectPattern {
  if (!Number.isSafeInteger(gridTicks) || gridTicks < 1 ||
      !Number.isFinite(strength) || strength < 0 || strength > 1 ||
      !Number.isFinite(swing) || swing < -1 || swing > 1 ||
      grooveOffsets.length < 1 || grooveOffsets.length > 64 ||
      grooveOffsets.some((offset) => !Number.isSafeInteger(offset) || Math.abs(offset) > gridTicks / 2)) {
    throw new RangeError("Cuantización o patrón de groove inválido");
  }
  const source = selectedNotes(pattern, noteIds);
  if (!source.length || strength === 0) return pattern;
  let changed = false;
  const notes = pattern.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    const index = Math.round(note.startTick / gridTicks);
    const target = index * gridTicks + (Math.abs(index % 2) === 1 ? Math.round(swing * gridTicks / 2) : 0) +
      grooveOffsets[((index % grooveOffsets.length) + grooveOffsets.length) % grooveOffsets.length]!;
    const minimum = Math.max(0, -(note.microOffsetTick ?? 0));
    const latestStart = note.startTick + note.durationTick > pattern.lengthTicks
      ? pattern.lengthTicks - 1 : pattern.lengthTicks - note.durationTick;
    const nextTick = Math.max(minimum, Math.min(latestStart,
      Math.round(note.startTick + (target - note.startTick) * strength)));
    if (nextTick === note.startTick) return note;
    changed = true;
    const next = { ...note, startTick: nextTick };
    assertEditedNote(next, pattern);
    return next;
  });
  return changed ? replaced(pattern, notes) : pattern;
}

export function restorePianoRollSourceTiming(pattern: ProjectPattern, noteIds: ReadonlySet<string>): ProjectPattern {
  const source = selectedNotes(pattern, noteIds);
  if (!source.length) return pattern;
  let changed = false;
  const notes = pattern.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    const { sourcePpq, sourceStartTick, sourceDurationTick, sourceTakeId,
      importedProjectStartTick, importedProjectDurationTick } = note.origin;
    if (sourceTakeId && (importedProjectStartTick === undefined || importedProjectDurationTick === undefined)) {
      throw new RangeError("La toma no conserva tiempo original en el patrón del proyecto");
    }
    if (!sourceTakeId && (!sourcePpq || sourceStartTick === undefined)) {
      throw new RangeError("Una nota no conserva tiempo original de toma");
    }
    const next = { ...note,
      startTick: sourceTakeId ? importedProjectStartTick!
        : Math.round(sourceStartTick! * PROJECT_PPQ / sourcePpq!),
      durationTick: sourceTakeId ? importedProjectDurationTick!
        : sourceDurationTick === undefined ? note.durationTick
          : Math.max(1, Math.round(sourceDurationTick * PROJECT_PPQ / sourcePpq!)) };
    assertEditedNote(next, pattern);
    if (next.startTick !== note.startTick || next.durationTick !== note.durationTick) changed = true;
    return next;
  });
  return changed ? replaced(pattern, notes) : pattern;
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export interface HumanizeOptions {
  readonly seed: string;
  readonly timingTicks: number;
  readonly velocity: number;
}

export function humanizePianoRollNotes(pattern: ProjectPattern, noteIds: ReadonlySet<string>,
  { seed, timingTicks, velocity }: HumanizeOptions): ProjectPattern {
  if (!seed || seed.length > 128 || !Number.isSafeInteger(timingTicks) || timingTicks < 0 || timingTicks > 960 ||
      !Number.isSafeInteger(velocity) || velocity < 0 || velocity > 127) throw new RangeError("Humanización inválida");
  const source = selectedNotes(pattern, noteIds);
  if (!source.length || (timingTicks === 0 && velocity === 0)) return pattern;
  let changed = false;
  const notes = pattern.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    const timingDelta = Math.round((stableUnit(`${seed}:${note.id}:time`) * 2 - 1) * timingTicks);
    const velocityDelta = Math.round((stableUnit(`${seed}:${note.id}:velocity`) * 2 - 1) * velocity);
    const minimum = Math.max(0, -(note.microOffsetTick ?? 0));
    const latestStart = note.startTick + note.durationTick > pattern.lengthTicks
      ? pattern.lengthTicks - 1 : pattern.lengthTicks - note.durationTick;
    const next = { ...note, startTick: Math.max(minimum,
      Math.min(latestStart, note.startTick + timingDelta)),
      velocity: Math.max(1, Math.min(127, note.velocity + velocityDelta)) };
    assertEditedNote(next, pattern);
    if (next.startTick !== note.startTick || next.velocity !== note.velocity) changed = true;
    return next;
  });
  return changed ? replaced(pattern, notes) : pattern;
}

function assertExpression(event: ProjectExpressionEvent, pattern: ProjectPattern): void {
  if (!Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick >= pattern.lengthTicks ||
      !Number.isSafeInteger(event.channel) || event.channel < 0 || event.channel > 15 ||
      !Number.isSafeInteger(event.sequence) || event.sequence < 0) throw new RangeError("Tick, canal o secuencia MIDI inválida");
  if (event.kind === "cc" && (!Number.isSafeInteger(event.controller) || event.controller < 0 ||
      event.controller > 127 || !Number.isSafeInteger(event.value) || event.value < 0 || event.value > 127)) {
    throw new RangeError("CC fuera de MIDI");
  }
  if (event.kind === "pitchBend" && (!Number.isSafeInteger(event.value14) || event.value14 < 0 || event.value14 > 16383)) {
    throw new RangeError("Bend fuera de MIDI");
  }
  if ((event.kind === "channelPressure" || event.kind === "polyPressure") &&
      (!Number.isSafeInteger(event.pressure) || event.pressure < 0 || event.pressure > 127)) {
    throw new RangeError("Presión fuera de MIDI");
  }
  if (event.kind === "polyPressure" && (!Number.isSafeInteger(event.pitch) || event.pitch < 0 || event.pitch > 127)) {
    throw new RangeError("Pitch de presión inválido");
  }
  if (event.kind === "programChange" && (!Number.isSafeInteger(event.program) || event.program < 0 || event.program > 127)) {
    throw new RangeError("Programa fuera de MIDI");
  }
}

export function createPianoRollExpression(pattern: ProjectPattern, event: ProjectExpressionEvent): ProjectPattern {
  if (pattern.expression.some((existing) => existing.id === event.id)) throw new RangeError("ID de expresión duplicado");
  assertExpression(event, pattern);
  return { ...pattern, version: pattern.version + 1, expression: [...pattern.expression, event]
    .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence || a.id.localeCompare(b.id)) };
}

export function editPianoRollExpression(pattern: ProjectPattern, event: ProjectExpressionEvent): ProjectPattern {
  if (!pattern.expression.some((existing) => existing.id === event.id)) throw new RangeError("Evento MIDI inexistente");
  assertExpression(event, pattern);
  return { ...pattern, version: pattern.version + 1,
    expression: pattern.expression.map((item) => item.id === event.id ? event : item)
      .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence || a.id.localeCompare(b.id)) };
}

export function deletePianoRollExpression(pattern: ProjectPattern, eventId: string): ProjectPattern {
  if (!pattern.expression.some((event) => event.id === eventId)) return pattern;
  return { ...pattern, version: pattern.version + 1,
    expression: pattern.expression.filter((event) => event.id !== eventId) };
}

export function pianoRollReplaceCommand(current: ProjectPattern, next: ProjectPattern, at = Date.now()): ProjectCommand {
  if (next.id !== current.id || next.version !== current.version + 1) throw new RangeError("Versión de patrón inesperada");
  return { kind: "replacePattern", expectedVersion: current.version, pattern: next, at };
}
