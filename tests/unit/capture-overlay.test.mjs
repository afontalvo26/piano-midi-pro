import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureOverlay } from "../../app/src/composition/captureOverlay.ts";
import { MidiRecorder } from "../../app/src/midi/recorder.ts";

const tempoMap = [{ tick: 0, microsPerQuarter: 500_000 }];
const meterMap = [{ tick: 0, numerator: 4, denominator: 4 }];
const options = (nowPerfMs, extra = {}) => ({ startPerfMs: 1000, startTick: 0,
  nowPerfMs, tempoMap, meterMap, ...extra });

function on(note, timeStamp, velocity = 100, inputId = "SMK-37", channel = 0) {
  return { kind: "noteOn", inputId, channel, status: 0x90 | channel, timeStamp,
    raw: Uint8Array.from([0x90 | channel, note, velocity]), note, velocity };
}

function off(note, timeStamp, releaseVelocity = 64, inputId = "SMK-37", channel = 0) {
  return { kind: "noteOff", inputId, channel, status: 0x80 | channel, timeStamp,
    raw: Uint8Array.from([0x80 | channel, note, releaseVelocity]), note, releaseVelocity };
}

test("acorde de tres teclas muestra duración, velocity y origen de cada pulso sin escribir PRJ", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  [60, 64, 67].forEach((note) => recorder.record(on(note, 1000, note)));
  recorder.record(off(60, 1250, 10));
  recorder.record(off(64, 1300, 20));
  recorder.record(off(67, 1500, 30));
  const snapshot = recorder.snapshot();
  const before = snapshot.events.length;
  const notes = createCaptureOverlay(snapshot, options(1500));
  assert.equal(snapshot.events.length, before);
  assert.deepEqual(notes.map((note) => [note.pitch, note.startTick, note.durationTick,
    note.velocity, note.releaseVelocity]), [
    [60, 0, 480, 60, 10], [64, 0, 576, 64, 20], [67, 0, 960, 67, 30],
  ]);
  assert.deepEqual(notes.map((note) => note.origin.captureDurationMs), [250, 300, 500]);
  assert.equal(notes[0].origin.sourcePitch, 60);
  assert.equal(notes[0].origin.inputId, "SMK-37");
});

test("mismo pitch repetido se empareja FIFO y puerto, canal y pitch interpretado son independientes", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(on(60, 1000), { playedNote: 62, playedChannel: 2 });
  recorder.record(on(60, 1050), { playedNote: 62, playedChannel: 2 });
  recorder.record(on(60, 1075, 90, "otro", 0));
  recorder.record(off(60, 1100), { playedChannel: 2 });
  recorder.record(off(60, 1200), { playedChannel: 2 });
  const notes = createCaptureOverlay(recorder.snapshot(), options(1250));
  assert.deepEqual(notes.map((note) => [note.pitch, note.channel, note.startTick,
    note.durationTick, note.origin.inputId]), [
    [62, 2, 0, 192, "SMK-37"],
    [62, 2, 96, 288, "SMK-37"],
    [60, 0, 144, 336, "otro"],
  ]);
  assert.equal(notes[0].origin.sourcePitch, 60);
  assert.equal(notes[0].origin.playedPitch, 62);
});

test("dos pulsaciones del mismo origen en canales interpretados distintos cierran su voz exacta", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(on(60, 1000), { playedChannel: 0 });
  recorder.record(on(60, 1010), { playedChannel: 1 });
  recorder.record(off(60, 1100), { playedChannel: 1 });
  recorder.record(off(60, 1200), { playedChannel: 0 });
  const notes = createCaptureOverlay(recorder.snapshot(), options(1200));
  assert.deepEqual(notes.map((note) => [note.channel, note.startTick, note.durationTick]), [
    [0, 0, 384], [1, 19, 173],
  ]);
});

test("nota abierta crece sin Note Off, conserva ID y se cierra al detener la toma", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(on(48, 1050, 88));
  const snapshot = recorder.snapshot();
  const first = createCaptureOverlay(snapshot, options(1250));
  const next = createCaptureOverlay(snapshot, options(1500));
  assert.equal(first[0].startTick, 96);
  assert.equal(first[0].durationTick, 384);
  assert.equal(next[0].durationTick, 864);
  assert.equal(first[0].id, next[0].id);
  assert.equal(first[0].origin.captureDurationMs, undefined);
  const stopped = createCaptureOverlay(recorder.stop(1500), options(5000));
  assert.equal(stopped[0].durationTick, 864);
  assert.equal(stopped[0].origin.captureDurationMs, 450);
});

test("37+37 notas de dos acordes dejan IDs únicos y ninguna nota abierta", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  for (let chord = 0; chord < 2; chord++) {
    const start = 1000 + chord * 300;
    for (let pitch = 48; pitch < 85; pitch++) recorder.record(on(pitch, start, 100));
    for (let pitch = 48; pitch < 85; pitch++) recorder.record(off(pitch, start + 200, 64));
  }
  const notes = createCaptureOverlay(recorder.snapshot(), options(1600));
  assert.equal(notes.length, 74);
  assert.equal(new Set(notes.map((note) => note.id)).size, 74);
  assert.equal(notes.filter((note) => note.origin.captureDurationMs === undefined).length, 0);
  assert.deepEqual(notes.slice(0, 37).map((note) => note.durationTick), Array(37).fill(384));
  assert.deepEqual(notes.slice(37).map((note) => note.startTick), Array(37).fill(576));
});

test("tempo del proyecto cruza cambios desde startTick absoluto y entrega ticks locales", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(on(60, 1000));
  recorder.record(off(60, 1500));
  const notes = createCaptureOverlay(recorder.snapshot(), options(1500, {
    startTick: 960, tempoMap: [{ tick: 0, microsPerQuarter: 500_000 },
      { tick: 1440, microsPerQuarter: 1_000_000 }],
  }));
  assert.equal(notes[0].startTick, 0);
  assert.equal(notes[0].durationTick, 720);
});

test("tiempo no válido falla sin transformar la captura", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  assert.throws(() => createCaptureOverlay(recorder.snapshot(), options(Number.NaN)), /Tiempo de captura/);
  assert.throws(() => createCaptureOverlay(recorder.snapshot(), options(1200, { startTick: -1 })),
    /Tiempo de captura/);
});
