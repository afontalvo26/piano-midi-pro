import assert from "node:assert/strict";
import test from "node:test";
import { MidiRecorder } from "../../app/src/midi/recorder.ts";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { convertRecordedTake } from "../../app/src/project/smfImport.ts";
import { preparePatternOverdub } from "../../app/src/composition/recordedOverdub.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
const track = { id: "piano", name: "Piano", kind: "instrument", mix };
const originalNote = { id: "prior", startTick: 0, durationTick: 240, pitch: 72,
  velocity: 77, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } };
const originalExpression = { id: "prior-cc", kind: "cc", tick: 0, channel: 0,
  sequence: 4, controller: 11, value: 100 };
const pattern = { id: "pattern", name: "Hook", version: 1, lengthTicks: 3840,
  notes: [originalNote], expression: [originalExpression] };
const clip = { id: "clip", kind: "pattern", trackId: track.id, sourceId: pattern.id,
  sourceVersion: 1, startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0,
  loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
const project = { ...createProjectDocument({ id: "overdub-project" }), tracks: [track],
  trackOrder: [track.id], patterns: [pattern], clips: [clip],
  tempoMap: [{ tick: 0, microsPerQuarter: 1_000_000 }] };

function on(note, timeStamp) {
  return { kind: "noteOn", inputId: "SMK-37", channel: 0, status: 0x90,
    timeStamp, raw: Uint8Array.from([0x90, note, 100]), note, velocity: 100 };
}
function off(note, timeStamp) {
  return { kind: "noteOff", inputId: "SMK-37", channel: 0, status: 0x80,
    timeStamp, raw: Uint8Array.from([0x80, note, 64]), note, releaseVelocity: 64 };
}
function cc(timeStamp) {
  return { kind: "cc", inputId: "SMK-37", channel: 0, status: 0xb0,
    timeStamp, raw: Uint8Array.from([0xb0, 11, 95]), controller: 11, value: 95 };
}
async function savedTake(events) {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  events.forEach((event) => recorder.record(event));
  recorder.stop(Math.max(1500, ...events.map((event) => event.timeStamp)));
  const originalBytes = recorder.toMidiBytes();
  let id = 0;
  const converted = await convertRecordedTake({ getBytes: async () => originalBytes }, "own-take",
    { patternId: "source", nextId: () => `converted-${++id}` });
  return { originalBytes, converted };
}

test("SMF 480 PPQ entra al patrón activo en tempo 60 sin alterar eventos previos ni bytes", async () => {
  const { originalBytes, converted } = await savedTake([on(60, 1000), cc(1100), off(60, 1250)]);
  const bytesBefore = originalBytes.slice();
  let id = 0;
  const prepared = preparePatternOverdub(project, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 960,
    sourceTakeId: "take-ref", nextId: () => `new-${++id}`,
  });
  assert.equal(prepared.destinationClipId, clip.id);
  assert.equal(prepared.patternInsertTick, 960);
  assert.equal(prepared.sourcePpq, 480);
  assert.equal(prepared.addedNotes, 1);
  assert.equal(prepared.addedExpression, 1);
  assert.equal(prepared.pattern.version, 2);
  assert.equal(prepared.pattern.notes[0], originalNote);
  assert.equal(prepared.pattern.expression[0], originalExpression);
  assert.deepEqual(prepared.pattern.notes[1], {
    ...converted.pattern.notes[0], id: "new-1", startTick: 960, durationTick: 240,
    origin: { ...converted.pattern.notes[0].origin, sourceTakeId: "take-ref",
      importedProjectStartTick: 960, importedProjectDurationTick: 240 },
  });
  assert.equal(prepared.pattern.expression[1].tick, 1056);
  assert.equal(prepared.pattern.expression[1].sequence, 5);
  assert.equal(prepared.pattern.expression[1].sourceTakeId, "take-ref");
  assert.deepEqual(originalBytes, bytesBefore);
});

test("instancia superpuesta sin autoridad y cambio de clip durante toma se rechazan", async () => {
  const { converted } = await savedTake([on(60, 1000), off(60, 1050),
    on(62, 1100), off(62, 1250)]);
  const later = { ...clip, id: "later", sourceId: "other",
    startTick: 960, lengthTicks: 960 };
  const noAuthority = { ...project, patterns: [pattern, { ...pattern, id: "other" }],
    clips: [clip, later] };
  assert.throws(() => preparePatternOverdub(noAuthority, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 960, sourceTakeId: "take-ref",
  }), /no tiene autoridad/);
  const movingAuthority = { ...noAuthority, clips: [clip, { ...later, startTick: 1020 }] };
  assert.throws(() => preparePatternOverdub(movingAuthority, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 960, sourceTakeId: "take-ref",
  }), /cambia de clip/);
});

test("offset del clip se respeta y un nuevo ataque tras el borde no se envuelve", async () => {
  const { converted } = await savedTake([on(60, 1000), off(60, 1050),
    on(62, 1100), off(62, 1250)]);
  const nearEnd = { ...clip, sourceOffsetTick: 3800 };
  assert.throws(() => preparePatternOverdub({ ...project, clips: [nearEnd] }, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 0, sourceTakeId: "take-ref",
  }), /cruza el ciclo/);
  const offset = { ...clip, sourceOffsetTick: 480 };
  const prepared = preparePatternOverdub({ ...project, clips: [offset] }, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 960,
    sourceTakeId: "take-ref", nextId: () => "new-offset",
  });
  assert.equal(prepared.patternInsertTick, 1440);
  assert.equal(prepared.pattern.notes[1].startTick, 1440);
});

test("toma con cola tras patrón conserva duración y advierte; rack incompatible se rechaza", async () => {
  const { converted } = await savedTake([on(60, 1000), off(60, 1250)]);
  const nearEnd = { ...clip, sourceOffsetTick: 3800 };
  const prepared = preparePatternOverdub({ ...project, clips: [nearEnd] }, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 0,
    sourceTakeId: "take-ref", nextId: () => "tail-note",
  });
  assert.equal(prepared.pattern.notes[1].startTick, 3800);
  assert.equal(prepared.pattern.notes[1].durationTick, 240);
  assert.equal(prepared.pattern.notes[1].origin.importedProjectStartTick, 3800);
  assert.equal(prepared.pattern.notes[1].origin.importedProjectDurationTick, 240);
  assert.equal(prepared.tailsBeyondPattern, 1);
  assert.throws(() => preparePatternOverdub({ ...project,
    tracks: [{ ...track, kind: "drum", drumRack: { pads: [] } }] }, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 0, sourceTakeId: "take-ref",
  }), /pista instrumental/);
  assert.throws(() => preparePatternOverdub({ ...project,
    clips: [{ ...clip, transpose: 2 }] }, converted, {
    trackId: track.id, patternId: pattern.id, projectStartTick: 0, sourceTakeId: "take-ref",
  }), /transpuesta/);
});
