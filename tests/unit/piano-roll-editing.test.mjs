import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand } from "../../app/src/project/commands.ts";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { createPianoRollExpression, deletePianoRollExpression, duplicatePianoRollNotes,
  editPianoRollExpression, humanizePianoRollNotes, joinPianoRollNotes,
  editPianoRollNote, editPianoRollNoteWithPerformance, movePianoRollNotes,
  pastePianoRollNotes, pianoRollReplaceCommand, quantizePianoRollNotes,
  resizePianoRollNotes, restorePianoRollSourceTiming, setPianoRollMuted,
  splitPianoRollNotes } from "../../app/src/composition/pianoRollModel.ts";

const note = (id, startTick, durationTick = 240, pitch = 60) => ({ id, startTick, durationTick, pitch,
  velocity: 95, releaseVelocity: 61, channel: 0, origin: { kind: "drawn" } });
const pattern = { id: "edit-pattern", name: "Edición", version: 1, lengthTicks: 3840,
  notes: [note("a", 241), note("b", 480), note("c", 960, 120, 64)],
  expression: [{ id: "cc-1", kind: "cc", tick: 0, channel: 0, sequence: 0, controller: 11, value: 82 }] };

test("duplicar y pegar clonan IDs; mutear y resize preservan expresión ajena", () => {
  const ids = new Set(["a", "b"]);
  const duplicate = duplicatePianoRollNotes(pattern, ids, 960, (() => { let index = 0; return () => `copy-${++index}`; })());
  assert.deepEqual(duplicate.notes.slice(-2).map((item) => [item.id, item.startTick]),
    [["copy-1", 1201], ["copy-2", 1440]]);
  const pasted = pastePianoRollNotes(pattern, pattern.notes.slice(0, 2), 1920,
    (() => { let index = 0; return () => `paste-${++index}`; })());
  assert.deepEqual(pasted.notes.slice(-2).map((item) => item.startTick), [1920, 2159]);
  const muted = setPianoRollMuted(pattern, ids, true);
  assert.equal(muted.notes[0].muted, true);
  assert.equal(muted.notes[2].muted, undefined);
  const resized = resizePianoRollNotes(muted, ids, 120);
  assert.equal(resized.notes[1].durationTick, 360);
  assert.deepEqual(resized.expression, pattern.expression);
  assert.throws(() => duplicatePianoRollNotes(pattern, ids, 3600), /dentro del patrón/);
});

test("dividir y unir notas contiguas conserva ID izquierdo y demás notas", () => {
  const source = { ...pattern, notes: [note("left", 0, 480), note("other", 960, 120, 64)] };
  const split = splitPianoRollNotes(source, new Set(["left"]), 240, () => "right");
  assert.deepEqual(split.notes.filter((item) => item.pitch === 60).map((item) =>
    [item.id, item.startTick, item.durationTick]), [["left", 0, 240], ["right", 240, 240]]);
  const joined = joinPianoRollNotes(split, new Set(["left", "right"]));
  assert.deepEqual(joined.notes[0], source.notes[0]);
  assert.deepEqual(joined.notes[1], source.notes[1]);
  assert.throws(() => joinPianoRollNotes(pattern, new Set(["a", "c"])), /mismo pitch/);
  assert.throws(() => splitPianoRollNotes(pattern, new Set(["a", "b"]), 300), /dentro de todas/);
});

test("cuantización por fuerza y swing respeta ticks, microoffset y límites", () => {
  const source = { ...pattern, notes: [{ ...pattern.notes[0], microOffsetTick: -20 }, pattern.notes[1]] };
  const half = quantizePianoRollNotes(source, new Set(["a"]),
    { gridTicks: 240, strength: 0.5, swing: 0 });
  assert.equal(half.notes[0].startTick, 241);
  const full = quantizePianoRollNotes(source, new Set(["a", "b"]),
    { gridTicks: 240, strength: 1, swing: 0.5 });
  assert.equal(full.notes[0].startTick, 300);
  assert.equal(full.notes[1].startTick, 480);
  assert.equal(full.notes[0].microOffsetTick, -20);
  assert.equal(full.notes[2], source.notes[2]);
  const document = { ...createProjectDocument({ id: "edit-project" }), patterns: [source] };
  const applied = applyCommand(document, pianoRollReplaceCommand(source, full));
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document.patterns[0], source);
  const groove = quantizePianoRollNotes(source, new Set(["a"]),
    { gridTicks: 240, strength: 1, swing: 0, grooveOffsets: [0, 20, -10, 15] });
  assert.equal(groove.notes[0].startTick, 260);
  assert.throws(() => quantizePianoRollNotes(source, new Set(["a"]),
    { gridTicks: 240, strength: 1, swing: 0, grooveOffsets: [200] }), /groove/);
});

test("restaurar tiempo de toma usa PPQ de origen y preserva notas dibujadas", () => {
  const captured = { ...note("captured", 241), origin: { kind: "imported",
    sourcePpq: 480, sourceStartTick: 120, sourceDurationTick: 120 } };
  const source = { ...pattern, notes: [captured, note("drawn", 500)] };
  const restored = restorePianoRollSourceTiming(source, new Set(["captured"]));
  assert.equal(restored.notes[0].startTick, 240);
  assert.equal(restored.notes[0].durationTick, 240);
  assert.equal(restored.notes[1], source.notes[1]);
  assert.throws(() => restorePianoRollSourceTiming(source, new Set(["drawn"])), /tiempo original/);
});

test("restaurar overdub retimado usa anclas locales del proyecto, no sólo PPQ de la toma", () => {
  const retimed = { ...note("take-note", 1200, 300), origin: { kind: "captured", sourceTakeId: "take-1",
    sourcePpq: 480, sourceStartTick: 120, sourceDurationTick: 120,
    importedProjectStartTick: 960, importedProjectDurationTick: 240 } };
  const source = { ...pattern, notes: [retimed, note("other", 100)] };
  const restored = restorePianoRollSourceTiming(source, new Set(["take-note"]));
  assert.deepEqual([restored.notes[0].startTick, restored.notes[0].durationTick], [960, 240]);
  assert.equal(restored.notes[0].origin, retimed.origin);
  assert.equal(restored.notes[1], source.notes[1]);
  const legacy = { ...source, notes: [{ ...retimed, origin: { ...retimed.origin,
    importedProjectStartTick: undefined, importedProjectDurationTick: undefined } }] };
  assert.throws(() => restorePianoRollSourceTiming(legacy, new Set(["take-note"])), /no conserva tiempo original/);
});

test("humanización con semilla repite resultados y no adelanta Note Off", () => {
  const source = { ...pattern, notes: [note("edge-start", 0, 100),
    note("edge-end", 3740, 100), note("middle", 1200, 240)] };
  const ids = new Set(source.notes.map((item) => item.id));
  const options = { seed: "beat-37", timingTicks: 100, velocity: 30 };
  const first = humanizePianoRollNotes(source, ids, options);
  assert.deepEqual(first, humanizePianoRollNotes(source, ids, options));
  assert.ok(first.notes.every((item) => item.startTick >= 0 && item.startTick + item.durationTick <= source.lengthTicks));
  assert.ok(first.notes.every((item) => item.velocity >= 1 && item.velocity <= 127));
  assert.deepEqual(first.expression, source.expression);
});

test("cola de toma que cruza el fin conserva duración al editar, mover, cuantizar y dividir", () => {
  const tail = { ...note("tail", 3720, 480), origin: { kind: "captured" } };
  const source = { ...pattern, notes: [tail, note("other", 300)] };
  const fields = { startTick: 3720, durationTick: 480, pitch: 60,
    velocity: 112, releaseVelocity: 61, channel: 0 };
  const edited = editPianoRollNote(source, "tail", fields);
  assert.equal(edited.notes[0].velocity, 112);
  assert.equal(edited.notes[0].durationTick, 480);
  const moved = movePianoRollNotes(edited, new Set(["tail"]), 100, 0);
  assert.deepEqual([moved.notes[0].startTick, moved.notes[0].durationTick], [3820, 480]);
  const quantized = quantizePianoRollNotes(source, new Set(["tail"]),
    { gridTicks: 240, strength: 1, swing: 0 });
  assert.deepEqual([quantized.notes[0].startTick, quantized.notes[0].durationTick], [3839, 480]);
  const humanized = humanizePianoRollNotes(source, new Set(["tail"]),
    { seed: "tail", timingTicks: 120, velocity: 0 });
  assert.equal(humanized.notes[0].durationTick, 480);
  assert.ok(humanized.notes[0].startTick < source.lengthTicks);
  const split = splitPianoRollNotes(source, new Set(["tail"]), 3800, () => "tail-right");
  assert.deepEqual(split.notes.filter((item) => item.id.startsWith("tail")).map((item) =>
    [item.startTick, item.durationTick]), [[3720, 80], [3800, 400]]);
  const joined = joinPianoRollNotes(split, new Set(["tail", "tail-right"]));
  assert.deepEqual(joined.notes[0], tail);
  const document = { ...createProjectDocument({ id: "tail-project" }), patterns: [source] };
  const applied = applyCommand(document, pianoRollReplaceCommand(source, edited));
  assert.deepEqual(applied.document.patterns[0].notes[0], edited.notes[0]);
  assert.deepEqual(applied.document.patterns[0].notes[1], source.notes[1]);
  assert.deepEqual(applied.document.patterns[0].expression, source.expression);
});

test("carril MIDI crea, edita y borra CC, presión y bend sin tocar notas", () => {
  const bend = { id: "bend-1", kind: "pitchBend", tick: 241, channel: 0, sequence: 1, value14: 8192 };
  const withBend = createPianoRollExpression(pattern, bend);
  assert.equal(withBend.expression.length, 2);
  const pressure = { id: "pressure-1", kind: "polyPressure", tick: 720, channel: 0,
    sequence: 2, pitch: 60, pressure: 82 };
  const withPressure = createPianoRollExpression(withBend, pressure);
  const edited = editPianoRollExpression(withPressure, { ...bend, tick: 300, value14: 9000 });
  assert.equal(edited.expression.find((event) => event.id === bend.id).value14, 9000);
  assert.deepEqual(edited.notes, pattern.notes);
  assert.equal(deletePianoRollExpression(edited, pressure.id).expression.length, 2);
  assert.throws(() => createPianoRollExpression(pattern, { ...bend, value14: 20000 }), /Bend/);
});

test("un golpe edita probabilidad, ratchet y microtiming sin cambiar expresión ni defaults ausentes", () => {
  const baseFields = { startTick: 241, durationTick: 240, pitch: 60,
    velocity: 95, releaseVelocity: 61, channel: 0 };
  const unchanged = editPianoRollNoteWithPerformance(pattern, "a", baseFields,
    { microOffsetTick: 0, probability: 1, ratchetCount: 1, muted: false });
  assert.equal(unchanged, pattern);
  const edited = editPianoRollNoteWithPerformance(pattern, "a", baseFields,
    { microOffsetTick: -20, probability: 0.75, ratchetCount: 3, muted: true });
  assert.equal(edited.notes[0].microOffsetTick, -20);
  assert.equal(edited.notes[0].probability, 0.75);
  assert.equal(edited.notes[0].ratchetCount, 3);
  assert.equal(edited.notes[0].muted, true);
  assert.equal(edited.notes[1], pattern.notes[1]);
  assert.deepEqual(edited.expression, pattern.expression);
  assert.throws(() => editPianoRollNoteWithPerformance(pattern, "a", baseFields,
    { microOffsetTick: -242, probability: 0.5, ratchetCount: 2, muted: false }), /microdesplazamiento/);
});
