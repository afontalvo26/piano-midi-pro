import assert from "node:assert/strict";
import test from "node:test";
import { pianoKeyboardStore as store } from "../../app/src/state/pianoKeyboardStore.ts";

test.beforeEach(() => store.clearMidi());
test.afterEach(() => store.clearMidi());

test("dos fuentes sostienen la misma tecla sin apagarse mutuamente", () => {
  store.noteOn(60, "elite-port-1");
  store.noteOn(60, "computer-keyboard");
  assert.deepEqual([...store.getSnapshot().midiNotes], [60]);

  store.noteOff(60, "elite-port-1");
  assert.equal(store.getSnapshot().midiNotes.has(60), true);
  store.noteOff(60, "computer-keyboard");
  assert.equal(store.getSnapshot().midiNotes.has(60), false);
});

test("repeticiones del mismo origen requieren sus liberaciones correspondientes", () => {
  store.noteOn(62, "elite-port-1");
  store.noteOn(62, "elite-port-1");
  store.noteOff(62, "elite-port-1");
  assert.equal(store.getSnapshot().midiNotes.has(62), true);
  store.noteOff(62, "elite-port-1");
  store.noteOff(62, "elite-port-1"); // unmatched release is harmless
  assert.equal(store.getSnapshot().midiNotes.has(62), false);
});

test("releaseSource libera sólo su propietario y clearMidi limpia todos", () => {
  store.noteOn(64, "elite-port-1");
  store.noteOn(64, "elite-port-2");
  store.noteOn(65, "elite-port-1");
  store.releaseSource("elite-port-1");
  assert.deepEqual([...store.getSnapshot().midiNotes], [64]);
  store.releaseSource("elite-port-1"); // idempotent
  store.clearMidi();
  assert.equal(store.getSnapshot().midiNotes.size, 0);
  store.noteOff(64, "elite-port-2"); // old note-off cannot affect a new session
  assert.equal(store.getSnapshot().midiNotes.size, 0);
});

test("llamadas antiguas sin sourceId conservan su fuente predeterminada", () => {
  store.noteOn(67);
  store.noteOn(67, "other");
  store.noteOff(67);
  assert.equal(store.getSnapshot().midiNotes.has(67), true);
  store.releaseSource("other");
  assert.equal(store.getSnapshot().midiNotes.has(67), false);
});
