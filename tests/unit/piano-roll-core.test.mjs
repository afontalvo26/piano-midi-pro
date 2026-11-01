import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand } from "../../app/src/project/commands.ts";
import { createProjectDocument } from "../../app/src/project/model.ts";
import {
  PianoRollNoteIndex, createPianoRollNote, editPianoRollNote, movePianoRollNotes,
  pianoRollReplaceCommand, snapTick, tickToX, xToTick, yToPitch, pitchToY,
} from "../../app/src/composition/pianoRollModel.ts";

const pattern = {
  id: "pattern-1", name: "Verso", version: 1, lengthTicks: 960 * 16,
  notes: [], expression: [{ id: "cc-1", kind: "cc", tick: 120, channel: 0, sequence: 0, controller: 11, value: 84 }],
};

function note(id, startTick, pitch = 60, durationTick = 240) {
  return { id, startTick, durationTick, pitch, velocity: 89, releaseVelocity: 48,
    channel: 0, origin: { kind: "drawn", playedPitch: pitch } };
}

test("la transformación píxel-tick mantiene precisión de un tick con zoom y scroll", () => {
  for (const zoom of [32, 96, 320]) {
    const viewport = { scrollLeft: 719, scrollTop: 800, width: 390, height: 300, pixelsPerQuarter: zoom };
    for (const tick of [0, 1, 960, 15_359]) {
      assert.ok(Math.abs(xToTick(tickToX(tick, viewport), viewport) - tick) < 1e-9);
    }
    assert.equal(yToPitch(pitchToY(64, viewport) + 10, viewport), 64);
  }
  assert.equal(snapTick(319, 320), 320);
  assert.equal(snapTick(319, 320, "floor"), 0);
  assert.equal(snapTick(7, 1), 7);
});

test("crear, editar, mover y deshacer preserva ID, expresión y otras notas", () => {
  const first = createPianoRollNote(pattern, note("note-1", 240));
  const second = createPianoRollNote(first, note("note-2", 480, 67));
  const edited = editPianoRollNote(second, "note-1", {
    startTick: 241, durationTick: 360, pitch: 61, velocity: 111, releaseVelocity: 12, channel: 2,
  });
  const moved = movePianoRollNotes(edited, new Set(["note-1"]), 1, 1);
  assert.equal(moved.notes.find((item) => item.id === "note-1").startTick, 242);
  assert.equal(moved.notes.find((item) => item.id === "note-1").pitch, 62);
  assert.deepEqual(moved.notes.find((item) => item.id === "note-2"), second.notes[1]);
  assert.deepEqual(moved.expression, pattern.expression);

  const now = Date.now();
  const document = { ...createProjectDocument({ id: "project-1", at: now }), patterns: [pattern] };
  const applied = applyCommand(document, pianoRollReplaceCommand(pattern, first, now + 1));
  assert.equal(applied.document.patterns[0].notes[0].id, "note-1");
  const undone = applyCommand(applied.document, applied.inverse);
  assert.deepEqual(undone.document.patterns[0], pattern);
});

test("una edición fuera del patrón falla completa y no modifica el origen", () => {
  const source = createPianoRollNote(pattern, note("note-1", pattern.lengthTicks - 1));
  assert.throws(() => movePianoRollNotes(source, new Set(["note-1"]), 1, 0), /dentro del patrón/);
  assert.throws(() => editPianoRollNote(source, "note-1", {
    startTick: 0, durationTick: 0, pitch: 60, velocity: 89, releaseVelocity: 48, channel: 0,
  }), /dentro del patrón/);
  assert.equal(source.notes[0].startTick, pattern.lengthTicks - 1);
  assert.equal(source.version, 2);
});

test("índice de 10.000 notas encuentra sólo la ventana y las notas largas", () => {
  const notes = Array.from({ length: 10_000 }, (_, index) =>
    note(`note-${index}`, index * 60, 36 + index % 48, 30));
  notes.push(note("long", 0, 60, 600_100));
  const index = new PianoRollNoteIndex(notes);
  const visible = index.query(300_000, 300_060);
  assert.deepEqual(visible.map((item) => item.id), ["long", "note-5000"]);
  assert.equal(index.hit(300_000, 60)?.id, "long");
  assert.equal(index.query(900_000, 900_060).length, 0);
});
