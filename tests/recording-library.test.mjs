import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMidiMessage } from "../app/src/midi/message.ts";
import { MidiRecorder } from "../app/src/midi/recorder.ts";
import { summarizeRecording } from "../app/src/midi/recordingLibrary.ts";

const midiEvent = (bytes, inputId, timeStamp) =>
  parseMidiMessage(Uint8Array.from(bytes), inputId, timeStamp);

test("take summary groups the played channel by port and counts played pitches", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 93 });
  recorder.record(midiEvent([0x92, 48, 100], "elite-main", 1100), {
    playedNote: 60,
    playedChannel: 9,
  });
  recorder.record(midiEvent([0x82, 48, 0], "elite-main", 1300), {
    playedChannel: 9,
  });
  recorder.record(midiEvent([0x90, 64, 80], "generic", 1400));
  recorder.record(midiEvent([0x80, 64, 0], "generic", 1500));
  const snapshot = recorder.stop(1700);
  const bytes = recorder.toMidiBytes();

  const summary = summarizeRecording(snapshot, bytes, {
    id: "take-1",
    name: "  Ensayo 1  ",
    createdAt: 1_800_000_000_000,
    durationMs: 700,
    inputNames: { "elite-main": "SMK-37 Elite MIDI" },
  });

  assert.equal(summary.name, "Ensayo 1");
  assert.equal(summary.durationMs, 700);
  assert.equal(summary.tempoBpm, 93);
  assert.equal(summary.eventCount, 4);
  assert.equal(summary.byteLength, bytes.byteLength);
  assert.deepEqual(summary.tracks.map(({ inputId, channel }) => [inputId, channel]), [
    ["elite-main", 9], ["generic", 0],
  ]);
  assert.deepEqual(summary.tracks[0], {
    inputId: "elite-main",
    inputName: "SMK-37 Elite MIDI",
    channel: 9,
    sourceChannels: [2],
    eventCount: 2,
    noteCount: 1,
    notes: [{ note: 60, count: 1 }],
  });
  assert.deepEqual(summary.tracks[1].notes, [{ note: 64, count: 1 }]);
});

test("a stopped take remains usable after the recorder starts a new take", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 100, tempo: 120 });
  recorder.record(midiEvent([0x90, 60, 90], "A", 120));
  recorder.record(midiEvent([0x80, 60, 0], "A", 220));
  const finished = recorder.stop(250);
  const bytes = recorder.toMidiBytes();
  const summary = summarizeRecording(finished, bytes, { id: "first", createdAt: 1_800_000_000_000 });

  recorder.start({ timeStamp: 300, tempo: 140 });
  assert.equal(recorder.eventCount, 0);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.tracks[0].noteCount, 1);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "MThd");
});

test("invalid or incomplete captures are rejected before persistence", () => {
  const recorder = new MidiRecorder(1);
  recorder.start({ timeStamp: 100, tempo: 120 });
  const active = recorder.snapshot();
  assert.throws(() => summarizeRecording(active, Uint8Array.of(0x4d), {
    id: "active", createdAt: 1_800_000_000_000,
  }), /detenida/i);
  recorder.record(midiEvent([0x90, 60, 90], "A", 120));
  const overflowed = recorder.stop(200);
  assert.equal(overflowed.overflowed, true);
  assert.throws(() => summarizeRecording(overflowed, Uint8Array.of(0x4d), {
    id: "overflow", createdAt: 1_800_000_000_000,
  }), /capacidad/i);
});

test("metadata calculation handles a recorder-sized event log without spreading it", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 100, tempo: 120 });
  recorder.record(midiEvent([0x90, 60, 90], "A", 120));
  const oneEvent = recorder.stop(120).events[0];
  const snapshot = {
    recording: false,
    overflowed: false,
    tempoChanges: [{ atMs: 0, bpm: 120 }],
    events: Array(100_000).fill(oneEvent),
  };
  const summary = summarizeRecording(snapshot, recorder.toMidiBytes(), {
    id: "large", createdAt: 1_800_000_000_000,
  });
  assert.equal(summary.eventCount, 100_000);
  assert.equal(summary.tracks[0].noteCount, 100_000);
});
