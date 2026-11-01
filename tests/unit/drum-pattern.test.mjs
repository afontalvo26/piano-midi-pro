import assert from "node:assert/strict";
import test from "node:test";
import { addDrumStep, drumBarTicks, projectDrumBar, removeDrumStep,
  resizeDrumPattern } from "../../app/src/composition/drumPattern.ts";
import { editPianoRollNote } from "../../app/src/composition/pianoRollModel.ts";

const kick = { id: "kick-36", label: "Kick", midiNote: 36, channel: 9,
  sourceStatus: "ready", sourceCredit: "Virtuosity Drums" };
const missing = { id: "missing-39", label: "Pad sin fuente", midiNote: 39, channel: 9,
  sourceStatus: "missing" };
const source = { id: "drum-pattern", name: "Ritmo", version: 1, lengthTicks: 15_360,
  notes: [], expression: [{ id: "cc-1", kind: "cc", tick: 0, channel: 9, sequence: 0, controller: 7, value: 100 }] };

test("paso y piano roll comparten el mismo NoteEvent, con expresión intacta", () => {
  const added = addDrumStep(source, kick, 240, 240, "hit-1");
  assert.equal(added.notes.length, 1);
  assert.equal(added.notes[0].stepId, "kick-36:240");
  const bar = projectDrumBar(added, [kick], 0, drumBarTicks(4, 4), 240);
  assert.equal(bar.get(kick.id)[1].exactNotes[0], added.notes[0]);
  const editedInPianoRoll = editPianoRollNote(added, "hit-1", {
    startTick: 241, durationTick: 120, pitch: 36, velocity: 111, releaseVelocity: 64, channel: 9,
  });
  const projected = projectDrumBar(editedInPianoRoll, [kick], 0, 3_840, 240);
  assert.equal(projected.get(kick.id)[1].exactNotes.length, 0);
  assert.equal(projected.get(kick.id)[1].offsetNotes[0].velocity, 111);
  assert.deepEqual(editedInPianoRoll.expression, source.expression);
  const removed = removeDrumStep(editedInPianoRoll, "hit-1");
  assert.equal(removed.notes.length, 0);
  assert.deepEqual(removed.expression, source.expression);
});

test("pad sin decode no crea un golpe silencioso", () => {
  assert.throws(() => addDrumStep(source, missing, 0, 240, "silent"), /fuente disponible/);
  assert.equal(source.notes.length, 0);
});

test("compás y duración parcial conservan ticks exactos", () => {
  assert.equal(drumBarTicks(7, 8), 3_360);
  const short = { ...source, lengthTicks: 1_000 };
  const added = addDrumStep(short, kick, 960, 240, "last-hit");
  assert.equal(added.notes[0].durationTick, 40);
  assert.equal(projectDrumBar(added, [kick], 0, 3_840, 240).get(kick.id)[4].exactNotes[0].id, "last-hit");
});

test("longitud en pasos cambia horizonte sin cortar golpes ni expresión", () => {
  const added = addDrumStep(source, kick, 14_880, 240, "last-hit");
  assert.throws(() => resizeDrumPattern(added, 240, 62), /fuera de la nueva longitud/);
  const extended = resizeDrumPattern(added, 240, 80);
  assert.equal(extended.lengthTicks, 19_200);
  assert.equal(extended.notes[0].id, "last-hit");
  assert.deepEqual(extended.expression, source.expression);
  assert.equal(extended.version, added.version + 1);
  assert.throws(() => resizeDrumPattern(added, 240, 4097), /Longitud/);
});
