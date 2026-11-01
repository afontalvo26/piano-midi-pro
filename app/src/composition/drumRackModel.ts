import type { ProjectDocumentV1, ProjectDrumPad, ProjectDrumRack, ProjectNote, ProjectPattern,
  ProjectTrack } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";
import { drumRackCycleTicks } from "../project/drumRack.ts";

export function editDrumRackPad(track: ProjectTrack, nextPad: ProjectDrumPad,
  at = Date.now()): ProjectCommand {
  if (track.kind !== "drum" || !track.drumRack) throw new RangeError("Pista sin rack de batería");
  const index = track.drumRack.pads.findIndex((pad) => pad.id === nextPad.id);
  if (index < 0) throw new RangeError("Pad inexistente");
  const pads = track.drumRack.pads.map((pad, position) => position === index ? nextPad : pad);
  return { kind: "replaceDrumRack", trackId: track.id, expected: track.drumRack,
    rack: { pads }, at };
}

/** Cycle edits update every pattern used by this track in one reversible project command. */
export function editDrumRackPadInProject(document: ProjectDocumentV1, trackId: string,
  nextPad: ProjectDrumPad, at = Date.now()): ProjectCommand {
  const track = document.tracks.find((item) => item.id === trackId);
  if (!track?.drumRack) throw new RangeError("Pista sin rack de batería");
  const simple = editDrumRackPad(track, nextPad, at);
  if (simple.kind !== "replaceDrumRack" || !simple.rack) throw new RangeError("Rack inválido");
  const previousPad = track.drumRack.pads.find((pad) => pad.id === nextPad.id)!;
  const nextCycle = drumRackCycleTicks(simple.rack);
  const triggerChanged = previousPad.midiNote !== nextPad.midiNote ||
    previousPad.channel !== nextPad.channel;
  if (nextCycle === drumRackCycleTicks(track.drumRack) && !triggerChanged) return simple;
  const used = new Set<string>();
  for (const clip of document.clips) {
    if (clip.kind === "pattern" && clip.trackId === trackId) used.add(clip.sourceId);
  }
  for (const scene of document.scenes) {
    for (const slot of scene.slots) {
      if (slot.trackId === trackId) used.add(slot.patternId);
    }
  }
  const patterns = document.patterns.filter((pattern) => used.has(pattern.id)).map((pattern) => {
    const notes = triggerChanged ? pattern.notes.map((note) =>
      note.channel === previousPad.channel && note.pitch === previousPad.midiNote
        ? { ...note, channel: nextPad.channel, pitch: nextPad.midiNote } : note) : pattern.notes;
    if (notes.some((note) => note.startTick + note.durationTick > nextCycle) ||
        pattern.expression.some((event) => event.tick >= nextCycle)) {
      throw new RangeError(`El patrón ${pattern.name} excede el nuevo ciclo común`);
    }
    const padCycle = drumPadCycleTicks(nextPad);
    if (notes.some((note) => note.channel === nextPad.channel &&
        note.pitch === nextPad.midiNote && note.startTick >= padCycle)) {
      throw new RangeError(`Hay golpes fuera del nuevo ciclo de ${nextPad.name}`);
    }
    return { expectedVersion: pattern.version,
      pattern: { ...pattern, notes, lengthTicks: nextCycle, version: pattern.version + 1 } };
  });
  return { kind: "replaceDrumRackPatterns", trackId, expectedRack: track.drumRack,
    rack: simple.rack, patterns, at };
}

export function drumPadCycleTicks(pad: ProjectDrumPad): number {
  const ticks = pad.stepTicks * pad.stepCount;
  if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError("Ciclo de pad inválido");
  return ticks;
}

/** Shared horizon is bounded by the project validator to avoid unbounded LCM scheduling. */
export function commonDrumCycleTicks(rack: ProjectDrumRack): number {
  return drumRackCycleTicks(rack);
}

export function drumPadStepAtTick(pad: ProjectDrumPad, tick: number): number {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Tick de pad inválido");
  return Math.floor((tick % drumPadCycleTicks(pad)) / pad.stepTicks);
}

export interface DrumRackStepCell {
  readonly stepIndex: number;
  readonly startTick: number;
  readonly exactNotes: readonly ProjectNote[];
  readonly offsetNotes: readonly ProjectNote[];
}

/** The editor exposes one canonical pad turn; the timeline resolver repeats it to the LCM. */
export function projectDrumPadCycle(pattern: ProjectPattern, pad: ProjectDrumPad): readonly DrumRackStepCell[] {
  const cycle = drumPadCycleTicks(pad);
  if (pattern.lengthTicks < cycle || pattern.lengthTicks % cycle !== 0) {
    throw new RangeError("Ciclo de pad incompatible con el patrón");
  }
  const cells: DrumRackStepCell[] = Array.from({ length: pad.stepCount }, (_, stepIndex) => ({
    stepIndex, startTick: stepIndex * pad.stepTicks, exactNotes: [], offsetNotes: [],
  }));
  for (const note of pattern.notes) {
    if (note.channel !== pad.channel || note.pitch !== pad.midiNote) continue;
    if (note.startTick < 0 || note.startTick >= cycle) throw new RangeError("Golpe fuera de la vuelta base del pad");
    const cell = cells[Math.floor(note.startTick / pad.stepTicks)]!;
    const target = note.startTick === cell.startTick ? cell.exactNotes : cell.offsetNotes;
    (target as ProjectNote[]).push(note);
  }
  return cells;
}

export function addDrumRackStep(pattern: ProjectPattern, pad: ProjectDrumPad,
  stepIndex: number, id = crypto.randomUUID()): ProjectPattern {
  if (!pad.source) throw new RangeError("Asigna una muestra grabada antes de crear el golpe");
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex >= pad.stepCount ||
      pattern.notes.some((note) => note.id === id)) throw new RangeError("Paso o ID inválido");
  const startTick = stepIndex * pad.stepTicks;
  if (startTick >= pattern.lengthTicks) throw new RangeError("Paso fuera del patrón");
  const note: ProjectNote = { id, startTick, durationTick: pad.stepTicks,
    pitch: pad.midiNote, velocity: 100, releaseVelocity: 64, channel: pad.channel,
    origin: { kind: "drawn", playedPitch: pad.midiNote }, stepId: `${pad.id}:${stepIndex}` };
  return { ...pattern, version: pattern.version + 1, notes: [...pattern.notes, note] };
}

/** Swing offsets odd pad steps in their own grid, preserving velocity and microtiming. */
export function swingDrumRackPattern(pattern: ProjectPattern, rack: ProjectDrumRack,
  amount: number): ProjectPattern {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new RangeError("Swing de batería fuera de 0…100 %");
  }
  const pads = new Map(rack.pads.map((pad) => [`${pad.channel}:${pad.midiNote}`, pad]));
  let changed = false;
  const notes = pattern.notes.map((note) => {
    const pad = pads.get(`${note.channel}:${note.pitch}`);
    if (!pad) throw new RangeError(`Golpe ${note.id} sin pad del rack`);
    const stepIndex = Math.floor(note.startTick / pad.stepTicks);
    if (stepIndex % 2 === 0) return note;
    const shift = Math.min(Math.round(pad.stepTicks * amount / 2),
      Math.max(0, pattern.lengthTicks - note.startTick - note.durationTick),
      Math.max(0, drumPadCycleTicks(pad) - 1 - note.startTick));
    if (shift === 0) return note;
    changed = true;
    return { ...note, startTick: note.startTick + shift };
  });
  return changed ? { ...pattern, version: pattern.version + 1, notes } : pattern;
}
