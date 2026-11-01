import assert from "node:assert/strict";
import { test } from "node:test";
import { renderArrangementMidi } from "../app/src/export/arrangementMidi.ts";
import { createProjectDocument } from "../app/src/project/model.ts";
import { convertRecordedTake } from "../app/src/project/smfImport.ts";

function fixture() {
  const base = createProjectDocument({ id: "export-beat", at: 1000 });
  const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
  const piano = { id: "piano-track", name: "Piano propio", kind: "instrument", mix: { ...mix, pan: 0.25 } };
  const drums = { id: "drum-track", name: "Batería propia", kind: "drum", mix };
  const note = (id, startTick, durationTick, pitch, channel, extra = {}) => ({
    id, startTick, durationTick, pitch, velocity: 100, releaseVelocity: 20, channel,
    origin: { kind: "drawn", playedPitch: pitch }, ...extra,
  });
  const pianoPattern = { id: "piano-pattern", name: "Melodía", version: 1, lengthTicks: 7680,
    notes: [note("piano-a", 0, 960, 60, 0), note("piano-b", 960, 480, 64, 0, { ratchetCount: 2 }),
      ...Array.from({ length: 32 }, (_, index) => note(`chance-${index}`, 2000 + index * 100,
        60, 65 + index % 12, 0, { probability: 0.5 }))],
    expression: [
      { id: "program", tick: 0, sequence: 0, channel: 0, kind: "programChange", program: 0 },
      { id: "cc", tick: 960, sequence: 1, channel: 0, kind: "cc", controller: 11, value: 80 },
      { id: "bend", tick: 1200, sequence: 2, channel: 0, kind: "pitchBend", value14: 9000 },
      { id: "poly", tick: 1300, sequence: 3, channel: 0, kind: "polyPressure", pitch: 64, pressure: 55 },
      { id: "pressure", tick: 1400, sequence: 4, channel: 0, kind: "channelPressure", pressure: 66 },
    ] };
  const drumPattern = { id: "drum-pattern", name: "Groove", version: 1, lengthTicks: 7680,
    notes: [note("kick", 0, 240, 36, 9), note("snare", 1920, 240, 38, 9)], expression: [] };
  const clip = (id, trackId, sourceId) => ({ id, kind: "pattern", trackId, sourceId, sourceVersion: 1,
    startTick: 0, lengthTicks: 7680, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
    transpose: 0, gainDb: 0, muted: false });
  return { ...base, tempoMap: [{ tick: 0, microsPerQuarter: 500000 },
    { tick: 3840, microsPerQuarter: 666667 }], meterMap: [{ tick: 0, numerator: 4, denominator: 4 },
    { tick: 3840, numerator: 3, denominator: 4 }],
  tracks: [piano, drums], trackOrder: [piano.id, drums.id], patterns: [pianoPattern, drumPattern],
  clips: [clip("piano-clip", piano.id, pianoPattern.id), clip("drum-clip", drums.id, drumPattern.id)],
  automation: [{ id: "auto-1", target: { scope: "track", ownerId: piano.id, parameterId: "volume" },
    points: [{ id: "point-1", tick: 0, value: 0.5, shape: "linear" }] }] };
}

test("SMF type 1 uses 960 PPQ, preserves event classes and round-trips tempo/meter", async () => {
  const document = fixture();
  const first = renderArrangementMidi(document, { seed: "beat-seed" });
  const again = renderArrangementMidi(document, { seed: "beat-seed" });
  const other = renderArrangementMidi(document, { seed: "different-seed" });
  assert.deepEqual(first.bytes, again.bytes);
  assert.notDeepEqual(first.bytes, other.bytes);
  assert.deepEqual(Array.from(first.bytes.slice(0, 14)),
    [77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 3, 3, 192]);
  assert.equal(first.report.midiTrackCount, 2);
  assert.equal(first.report.tempoCount, 2);
  assert.equal(first.report.meterCount, 2);
  assert.equal(first.report.controlCount, 5);
  assert.ok(first.report.warnings.some((item) => item.code === "automation-omitted"));
  assert.ok(first.report.warnings.some((item) => item.code === "mix-omitted"));
  assert.ok(first.report.warnings.some((item) => item.code === "probability-resolved"));
  assert.ok(first.report.warnings.some((item) => item.code === "ratchet-resolved"));
  let id = 0;
  const parsed = await convertRecordedTake({ getBytes: async () => first.bytes }, "exported",
    { patternId: "roundtrip", nextId: () => `roundtrip-event-${id++}` });
  assert.equal(parsed.report.sourcePpq, 960);
  assert.equal(parsed.report.trackCount, 3);
  assert.equal(parsed.report.noteCount, first.report.noteCount);
  assert.equal(parsed.report.expressionCount, first.report.controlCount);
  assert.deepEqual(parsed.tempoMap, document.tempoMap);
  assert.deepEqual(parsed.meterMap, document.meterMap);
  assert.deepEqual(new Set(parsed.pattern.expression.map((event) => event.kind)),
    new Set(["programChange", "cc", "pitchBend", "polyPressure", "channelPressure"]));
  assert.deepEqual(new Set(parsed.pattern.notes.map((note) => note.channel)), new Set([0, 9]));
});

test("audio clips block MIDI export and a selected range carries effective tempo at tick zero", async () => {
  const document = fixture();
  const selected = renderArrangementMidi(document, { startTick: 3840, endTick: 7680, seed: "range" });
  let id = 0;
  const parsed = await convertRecordedTake({ getBytes: async () => selected.bytes }, "range",
    { patternId: "range-pattern", nextId: () => `range-${id++}` });
  assert.deepEqual(parsed.tempoMap, [{ tick: 0, microsPerQuarter: 666667 }]);
  assert.deepEqual(parsed.meterMap, [{ tick: 0, numerator: 3, denominator: 4 }]);
  const audioTrack = { id: "audio-track", name: "Toma WAV", kind: "audio",
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
  const audio = { ...document, tracks: [...document.tracks, audioTrack],
    trackOrder: [...document.trackOrder, audioTrack.id],
    assets: [{ id: "audio-asset", sha256: "a".repeat(64), byteLength: 100,
      mimeType: "audio/wav", sourceKind: "user", license: "user-owned", frameCount: 100 }],
    clips: [...document.clips, { id: "audio-clip", kind: "audio", trackId: audioTrack.id,
      sourceId: "audio-asset", startTick: 0, lengthTicks: 7680, sourceOffsetTick: 0,
      sourceStartFrame: 0, sourceEndFrame: 100, fadeInFrames: 0, fadeOutFrames: 0,
      loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false }] };
  assert.throws(() => renderArrangementMidi(audio), /Clip de audio/);
});
