import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMidiMessage } from "../app/src/midi/message.ts";
import { MidiRecorder } from "../app/src/midi/recorder.ts";
import { convertRecordedTake, RecordedTakeConversionError } from "../app/src/project/smfImport.ts";

const message = (data, at) => parseMidiMessage(Uint8Array.from(data), "smk37-test", at);

function ownTake() {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(message([0x90, 60, 96], 1100));
  recorder.record(message([0xb0, 64, 127], 1150));
  recorder.record(message([0xe0, 0, 96], 1200));
  recorder.record(message([0xd0, 80], 1250));
  recorder.record(message([0x80, 60, 12], 1300));
  recorder.record(message([0xb0, 64, 0], 1400));
  recorder.setTempo(1400, 90);
  recorder.stop(1500);
  return recorder.toMidiBytes();
}

function simpleSmf(ppq = 480) {
  const body = [0, 0x90, 60, 100, 0, 62, 110, 0x81, 0x70, 0x80, 60, 0,
    0, 62, 0, 0, 0xff, 0x2f, 0];
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ppq >> 8, ppq & 255,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, body.length, ...body,
  ]);
}

test("own 480 PPQ take converts exactly while keeping original bytes and unknown physical pitch", async () => {
  const bytes = ownTake();
  const original = Uint8Array.from(bytes);
  let reads = 0;
  let counter = 0;
  const result = await convertRecordedTake({ getBytes: async () => { reads++; return bytes; } }, "take-1",
    { patternId: "pattern-1", patternName: "Toma importada", nextId: () => `event-${counter++}` });
  assert.equal(reads, 1);
  assert.deepEqual(bytes, original);
  assert.equal(result.report.sourcePpq, 480);
  assert.equal(result.report.roundedPositions, 0);
  assert.equal(result.report.noteCount, 1);
  assert.equal(result.report.expressionCount, 4);
  assert.match(result.report.sourceSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.pattern.notes.map(({ startTick, durationTick, pitch, velocity, releaseVelocity }) =>
    [startTick, durationTick, pitch, velocity, releaseVelocity]), [[192, 384, 60, 96, 12]]);
  assert.equal(result.pattern.notes[0].origin.sourcePitch, undefined);
  assert.deepEqual(result.pattern.notes[0].origin, {
    kind: "imported", playedPitch: 60, sourcePpq: 480, sourceStartTick: 96,
    sourceDurationTick: 192, sourceTrackIndex: 1, sourceSequence: 6, originalVelocity: 96,
  });
  assert.deepEqual(result.tempoMap, [
    { tick: 0, microsPerQuarter: 500000 }, { tick: 768, microsPerQuarter: 666667 },
  ]);
  assert.deepEqual(result.meterMap, [{ tick: 0, numerator: 4, denominator: 4 }]);
  assert.deepEqual(result.pattern.expression.map((event) => event.kind),
    ["cc", "pitchBend", "channelPressure", "cc"]);
});

test("running status and non-480 PPQ preserve source ticks and report rounding", async () => {
  const bytes = simpleSmf(127);
  let counter = 0;
  const result = await convertRecordedTake({ getBytes: async () => bytes }, "running",
    { patternId: "running-pattern", nextId: () => `id-${counter++}` });
  assert.equal(result.pattern.notes.length, 2);
  assert.equal(result.report.sourcePpq, 127);
  assert.ok(result.report.roundedPositions > 0);
  assert.equal(result.pattern.notes[0].origin.sourceDurationTick, 240);
  assert.equal(result.pattern.notes[0].durationTick, Math.round(240 * 960 / 127));
  assert.equal(result.report.defaultTempoInserted, true);
  assert.equal(result.report.defaultMeterInserted, true);
});

test("truncated, unsupported and unpaired takes fail without modifying source bytes", async () => {
  const original = ownTake();
  const badCases = [
    { bytes: original.slice(0, -1), code: "invalid-smf" },
    { bytes: (() => { const copy = original.slice(); copy[12] |= 0x80; return copy; })(), code: "unsupported" },
    { bytes: (() => { const copy = original.slice();
      let found = false;
      for (let index = 0; index < copy.length - 2; index++) {
        if (copy[index] === 0x80 && copy[index + 1] === 60 && copy[index + 2] === 12) {
          copy[index + 1] = 61; found = true; break;
        }
      }
      assert.equal(found, true);
      return copy;
    })(), code: "unpaired-note" },
  ];
  for (const { bytes, code } of badCases) {
    const before = bytes.slice();
    await assert.rejects(() => convertRecordedTake({ getBytes: async () => bytes }, "bad",
      { patternId: "bad-pattern" }), (error) =>
      error instanceof RecordedTakeConversionError && error.code === code);
    assert.deepEqual(bytes, before);
  }
  await assert.rejects(() => convertRecordedTake({ getBytes: async () => null }, "missing",
    { patternId: "missing-pattern" }), (error) =>
    error instanceof RecordedTakeConversionError && error.code === "missing");
});
