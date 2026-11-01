import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { formatMidiHex, parseMidiMessage } from "../app/src/midi/message.ts";
import {
  MIDI_PROFILES, bindingValue, findBindingConflicts, identifyProfile,
  learnMidiBinding, loadMidiBindings, resolveBindings, saveMidiBindings, upsertMidiBinding,
} from "../app/src/midi/profile.ts";
import { MidiMonitor } from "../app/src/midi/diagnostics.ts";
import { MidiRecorder } from "../app/src/midi/recorder.ts";
import { AUTO_MIDI_INPUT_ID, ALL_MIDI_INPUTS_ID, parseStoredMidiInputId, selectMidiInput } from "../app/src/midi/inputSelection.ts";
import { MidiPhysicalTrace } from "../app/src/midi/physicalTrace.ts";

const requireFromApp = createRequire(new URL("../app/package.json", import.meta.url));
const { Midi } = requireFromApp("@tonejs/midi");
const event = (bytes, inputId = "Elite Port 1", timeStamp = 1000) =>
  parseMidiMessage(Uint8Array.from(bytes), inputId, timeStamp);

test("parser preserves source/channel and handles 1, 2 and 3 byte messages", () => {
  const on = event([0x92, 60, 99]);
  assert.equal(on.kind, "noteOn");
  assert.equal(on.channel, 2);
  assert.equal(on.note, 60);
  assert.equal(on.velocity, 99);
  assert.equal(on.inputId, "Elite Port 1");
  assert.equal(on.timeStamp, 1000);
  assert.equal(formatMidiHex(on.raw), "92 3C 63");

  const off = event([0x92, 60, 0]);
  assert.equal(off.kind, "noteOff");
  assert.equal(off.status, 0x92); // raw bytes were not rewritten
  assert.equal(event([0xc4, 7]).kind, "programChange");
  assert.equal(event([0xd4, 67]).kind, "channelPressure");
  assert.equal(event([0xf8]).kind, "clock");
  assert.equal(event([0xfa]).kind, "start");
  assert.equal(event([0xfb]).kind, "continue");
  assert.equal(event([0xfc]).kind, "stop");
  assert.equal(event([0xf2, 1, 2]).position16th, 257);
});

test("parser classifies pressure, exact pitch center and malformed messages safely", () => {
  assert.equal(event([0xa9, 36, 88]).kind, "polyPressure");
  assert.equal(event([0xb9, 11, 34]).kind, "cc");
  assert.equal(event([0xe0, 0, 64]).normalized, 0);
  assert.equal(event([0xe0, 0, 0]).normalized, -1);
  assert.equal(event([0xe0, 127, 127]).normalized, 1);
  for (const bytes of [[], [0x90, 60], [0xc0, 7, 0], [0x90, 60, 0x80], [0xf2, 1], [0xf4]]) {
    assert.equal(event(bytes).kind, "unknown", formatMidiHex(bytes));
  }
  const sysex = event([0xf0, 0x7d, 1, 0xf7]);
  assert.equal(sysex.kind, "sysex");
  assert.deepEqual(Array.from(sysex.payload), [0x7d, 1]);
  assert.equal(event([0xf0, 1]).kind, "unknown");
  const source = Uint8Array.from([0x90, 60, 100]);
  const parsed = parseMidiMessage(source, "A", 1);
  source[2] = 0;
  assert.equal(parsed.raw[2], 100);
});

test("profiles suggest a model but contain no guessed numeric mappings", () => {
  assert.equal(identifyProfile({ name: "SMK-37 Elite Midi" }), "smk37-elite");
  assert.equal(identifyProfile({ name: "SMK-37 PRO" }), "smk37-pro");
  assert.equal(identifyProfile({ name: "USB MIDI Device" }), "generic");
  assert.ok(MIDI_PROFILES["smk37-elite"].controls.includes("seqRec"));
  assert.equal("bindings" in MIDI_PROFILES["smk37-elite"], false);
});

test("MIDI Learn bindings match exact source/bank, preserve notes and expose collisions", () => {
  const learned = learnMidiBinding(event([0xb0, 17, 127], "Elite Port 2"), {
    id: "k1", action: "mixer.masterGain", bank: "K1-8", valueMode: "relative-twos-complement",
  });
  assert.deepEqual(learned.matcher, { inputId: "Elite Port 2", channel: 0, kind: "cc", number: 17, bank: "K1-8" });
  const other = {
    id: "k1-duplicate", action: "piano.modulation", enabled: true, valueMode: "absolute",
    matcher: { inputId: "Elite Port 2", channel: 0, kind: "cc", number: 17 },
  };
  assert.equal(resolveBindings(event([0xb0, 17, 127], "Elite Port 2"), [learned], { bank: "K1-8" }).length, 1);
  assert.equal(resolveBindings(event([0xb0, 17, 127], "Elite Port 1"), [learned], { bank: "K1-8" }).length, 0);
  assert.equal(resolveBindings(event([0xb0, 17, 127], "Elite Port 2"), [learned]).length, 0);
  assert.equal(bindingValue(event([0xb0, 17, 127]), "relative-twos-complement"), -1);
  assert.equal(findBindingConflicts([learned, other]).length, 1);
  assert.deepEqual(resolveBindings(event([0xb0, 17, 127], "Elite Port 2"),
    [learned, other], { bank: "K1-8" }), []); // corrupt stored overlap never fires twice
  const nextBank = {
    ...learned, id: "k1-bank-2", action: "track.volume.5",
    matcher: { ...learned.matcher, bank: "K9-16" },
  };
  assert.equal(findBindingConflicts([learned, nextBank]).length, 0);
  assert.deepEqual(resolveBindings(event([0xb0, 17, 127], "Elite Port 2"),
    [learned, nextBank], { bank: "K9-16" }), [nextBank]);
  assert.deepEqual(upsertMidiBinding([other], learned).bindings, [other]);
  assert.deepEqual(upsertMidiBinding([other], learned, "replace").bindings, [learned]);
  assert.equal(upsertMidiBinding([other], learned, "disable-old").bindings[0].enabled, false);
  assert.equal(resolveBindings(event([0x90, 60, 80]), [learned]).length, 0);
  assert.equal(learned.consumeNote, false);
  assert.equal(learnMidiBinding(event([0xf8]), { id: "clock", action: "transport.play" }), null);
  assert.equal(bindingValue(event([0xe0, 0, 0]), "absolute"), 0);
  assert.equal(bindingValue(event([0xe0, 0, 64]), "absolute"), 64);
  assert.equal(bindingValue(event([0xe0, 127, 127]), "absolute"), 127);

  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const scope = { profileId: "smk37-elite", portKey: "Elite Port 2" };
  saveMidiBindings(storage, scope, [learned]);
  assert.deepEqual(loadMidiBindings(storage, scope), [learned]);
  assert.deepEqual(loadMidiBindings(storage, { profileId: "smk37-pro", portKey: "Elite Port 2" }), []);
  assert.deepEqual(loadMidiBindings(storage, { ...scope, configurationKey: "V016/template 2" }), []);
  assert.throws(() => saveMidiBindings(storage, scope, [learned, other]), /conflict/);
  memory.set([...memory.keys()][0], JSON.stringify({ version: 1, bindings: [{ ...learned, matcher: { kind: "cc", number: 200 } }] }));
  assert.deepEqual(loadMidiBindings(storage, scope), []);
});

test("monitor is bounded and mirror detection is advisory", () => {
  const monitor = new MidiMonitor(2);
  monitor.annotatePort("A", "performance");
  monitor.observe(event([0x90, 60, 100], "A", 1000));
  const mirror = monitor.observe(event([0x90, 60, 100], "B", 1002));
  assert.equal(mirror.possibleMirrorOf, "A");
  assert.equal(mirror.rawHex, "90 3C 64");
  assert.equal(monitor.observe(event([0x90, 60, 100], "B", 1007)).possibleMirrorOf, undefined);
  monitor.observe(event([0x80, 60, 0], "A", 1010));
  assert.equal(monitor.snapshot().length, 2);
  assert.equal(monitor.portRoles().get("A"), "performance");
  monitor.clear();
  assert.equal(monitor.snapshot().length, 0);
  assert.equal(monitor.portRoles().get("A"), "performance");
});

test("recording closes held notes/pedal and exports a real type-1 MIDI", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 1000, tempo: 120 });
  recorder.record(event([0xb0, 64, 127], "A", 1000));
  recorder.record(event([0xb0, 11, 80], "A", 1010));
  recorder.record(event([0xe0, 0, 64], "A", 1020));
  recorder.record(event([0xa0, 60, 90], "A", 1030));
  recorder.record(event([0xd0, 70], "A", 1035));
  recorder.record(event([0x90, 60, 100], "A", 1100), { playedNote: 72 });
  recorder.record(event([0x90, 60, 90], "B", 1200));
  recorder.record(event([0x80, 60, 0], "B", 1450));
  const snapshot = recorder.stop(1600);
  assert.equal(snapshot.recording, false);
  assert.equal(snapshot.events.filter((e) => e.synthetic && e.event.kind === "noteOff").length, 1);
  assert.equal(snapshot.events.filter((e) => e.synthetic && e.event.kind === "cc" && e.event.value === 0).length, 1);
  const bytes = recorder.toMidiBytes();
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "MThd");
  assert.equal((bytes[8] << 8) | bytes[9], 1); // SMF type 1
  assert.equal((bytes[10] << 8) | bytes[11], 3); // tempo + two ports
  assert.ok(bytes.includes(0xa0)); // poly pressure preserved in raw SMF
  assert.ok(bytes.includes(0xd0)); // channel pressure preserved in raw SMF
  const parsed = new Midi(bytes.buffer);
  const notes = parsed.tracks.flatMap((track) => track.notes);
  assert.deepEqual(notes.map((note) => note.midi).sort((a, b) => a - b), [60, 72]);
  assert.ok(parsed.tracks.some((track) => track.controlChanges[11]?.length === 1));
  assert.ok(parsed.tracks.some((track) => track.pitchBends.length === 1));
});

test("tempo change integrates ticks; capacity overflow refuses incomplete export", () => {
  const recorder = new MidiRecorder(3);
  recorder.start({ timeStamp: 0, tempo: 120 });
  recorder.record(event([0x90, 60, 90], "A", 0));
  recorder.setTempo(500, 60);
  recorder.record(event([0x80, 60, 0], "A", 1000));
  recorder.stop(1000);
  const midi = new Midi(recorder.toMidiBytes().buffer);
  assert.equal(midi.tracks.flatMap((track) => track.notes)[0].durationTicks, 720);
  assert.equal(midi.header.tempos.length, 2);

  const full = new MidiRecorder(1);
  full.start({ timeStamp: 0, tempo: 120 });
  assert.equal(full.record(event([0x90, 60, 90], "A", 0)), true);
  assert.equal(full.record(event([0x90, 61, 90], "A", 1)), false);
  assert.equal(full.stop(2).overflowed, true);
  assert.throws(() => full.toMidiBytes(), /capacity/);

  const heldAtLimit = new MidiRecorder(1);
  heldAtLimit.start({ timeStamp: 0, tempo: 120 });
  assert.equal(heldAtLimit.record(event([0x90, 60, 90], "A", 0)), true);
  const closed = heldAtLimit.stop(100);
  assert.equal(closed.events.length, 1);
  assert.equal(closed.overflowed, true); // synthetic Note Off cannot exceed cap
  assert.throws(() => heldAtLimit.toMidiBytes(), /capacity/);
});

test("recorder keeps simultaneous ports/channels and repeated pitches separate", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 0, tempo: 120 });
  recorder.record(event([0x90, 60, 90], "A", 0), { playedNote: 72 });
  recorder.record(event([0x91, 60, 80], "A", 10), { playedNote: 60 });
  recorder.record(event([0x90, 60, 70], "B", 20), { playedNote: 48 });
  recorder.record(event([0x90, 60, 60], "A", 30), { playedNote: 84 });
  recorder.record(event([0x80, 60, 0], "A", 100));
  const result = recorder.stop(500);
  const releases = result.events.filter((item) => item.event.kind === "noteOff");
  assert.deepEqual(releases.map((item) => item.playedNote), [72, 84, 60, 48]);
  assert.equal(releases.filter((item) => item.synthetic).length, 3);
  const notes = new Midi(recorder.toMidiBytes().buffer).tracks.flatMap((track) => track.notes);
  assert.deepEqual(notes.map((note) => note.midi).sort((a, b) => a - b), [48, 60, 72, 84]);
});

test("pad routing preserves observed channel but reimports on GM drum channel 10", () => {
  const recorder = new MidiRecorder();
  recorder.start({ timeStamp: 0, tempo: 120 });
  recorder.record(event([0x90, 60, 90], "A", 0));
  recorder.record(event([0x80, 60, 0], "A", 100));
  recorder.record(event([0x90, 36, 100], "A", 200), { playedChannel: 9 });
  recorder.record(event([0x80, 36, 0], "A", 400));
  assert.throws(() => recorder.record(event([0x90, 36, 90]), { playedChannel: 16 }), /invalid played MIDI channel/);
  const recorded = recorder.stop(500);
  const padEvents = recorded.events.filter((item) =>
    (item.event.kind === "noteOn" || item.event.kind === "noteOff") && item.event.note === 36);
  assert.deepEqual(padEvents.map((item) => item.event.channel), [0, 0]);
  assert.deepEqual(padEvents.map((item) => item.playedChannel), [9, 9]);

  const reimported = new Midi(recorder.toMidiBytes().buffer);
  assert.deepEqual(reimported.tracks.filter((track) => track.notes.length > 0)
    .map((track) => track.channel).sort((a, b) => a - b), [0, 9]);
  assert.deepEqual(reimported.tracks.find((track) => track.channel === 9).notes.map((note) => note.midi), [36]);
});

test("recorder telemetry counters include synthesized closures and reset on restart", () => {
  const recorder = new MidiRecorder();
  assert.equal(recorder.isRecording, false);
  assert.equal(recorder.eventCount, 0);
  recorder.start({ timeStamp: 1000, tempo: 120 });
  assert.equal(recorder.isRecording, true);
  recorder.record(event([0xb0, 64, 127], "A", 1010));
  recorder.record(event([0x90, 60, 100], "A", 1020));
  assert.equal(recorder.eventCount, 2);
  recorder.stop(1200);
  assert.equal(recorder.isRecording, false);
  assert.equal(recorder.eventCount, 4); // pending Note Off and pedal-up are recorded
  recorder.start({ timeStamp: 2000, tempo: 120 });
  assert.equal(recorder.isRecording, true);
  assert.equal(recorder.eventCount, 0);
});

test("input selection migrates legacy All to one named Elite primary, preserving explicit choices", () => {
  const elite = [
    { id: "third", name: "MIDIIN3 (SMK-37 Elite Midi)", state: "connected" },
    { id: "main", name: "SMK-37 Elite Midi", state: "connected" },
    { id: "second", name: "MIDIIN2 (SMK-37 Elite Midi)", state: "connected" },
  ];
  assert.equal(parseStoredMidiInputId('"main"'), "main");
  assert.equal(parseStoredMidiInputId("main"), "main");
  assert.equal(parseStoredMidiInputId("true"), null);
  assert.deepEqual(selectMidiInput(elite, { storedSelectionRaw: '"__all__"' }), {
    selectedInputId: "main", reason: "smk37-primary-name", provisional: true,
  });
  assert.equal(selectMidiInput(elite, { storedSelectionRaw: '"second"' }).selectedInputId, "second");
  assert.equal(selectMidiInput(elite, {
    storedSelectionRaw: '"__all__"', explicitAllRaw: "true",
  }).selectedInputId, ALL_MIDI_INPUTS_ID);
  assert.deepEqual(selectMidiInput(elite, { storedSelectionRaw: '"removed-port"' }), {
    selectedInputId: "removed-port", reason: "explicit-port-disconnected", provisional: false,
  });
  assert.equal(selectMidiInput([], { storedSelectionRaw: '"main"' }).selectedInputId, "main");
  assert.equal(selectMidiInput([], { storedSelectionRaw: '"__all__"' }).selectedInputId, AUTO_MIDI_INPUT_ID);
});

test("input selection never guesses enumeration order for ambiguous multi-port devices", () => {
  const generic = [
    { id: "A", name: "Generic Keyboard" },
    { id: "B", name: "Generic MIDI interface" },
  ];
  assert.deepEqual(selectMidiInput(generic), {
    selectedInputId: AUTO_MIDI_INPUT_ID, reason: "selection-required", provisional: false,
  });
  assert.equal(selectMidiInput(generic.slice().reverse()).selectedInputId, AUTO_MIDI_INPUT_ID);
  assert.equal(selectMidiInput(generic.slice(0, 1)).selectedInputId, "A");
  assert.equal(selectMidiInput([]).selectedInputId, AUTO_MIDI_INPUT_ID);
  assert.equal(selectMidiInput([
    { id: "one", name: "SMK-37 Elite MIDI USB 1" },
    { id: "two", name: "SMK-37 Elite MIDI USB 2" },
    { id: "three", name: "SMK-37 Elite MIDI USB 3" },
  ]).selectedInputId, "one");
  assert.equal(selectMidiInput([
    { id: "A", name: "SMK-37 Elite Midi" },
    { id: "B", name: "SMK-37 Elite Midi" },
  ]).selectedInputId, AUTO_MIDI_INPUT_ID);
});

test("physical trace keeps raw per-port timing, connection changes and bounded JSON", () => {
  const trace = new MidiPhysicalTrace({ capacity: 3, durationLimitMs: 1000 });
  trace.start({
    nowMs: 100, selectedInputId: ALL_MIDI_INPUTS_ID, wallTimeIso: "2026-10-31T00:00:00.000Z",
    ports: [{ id: "main", name: "SMK-37 Elite Midi", type: "input", state: "connected", connection: "open" }],
  });
  const attack = trace.recordMessage(event([0x90, 60, 100], "main", 112), {
    handlerTimeMs: 115, selectedInputId: ALL_MIDI_INPUTS_ID,
    inputName: "SMK-37 Elite Midi", inputState: "connected", inputConnection: "open",
  });
  assert.equal(attack, 0);
  assert.equal(trace.recordRoute(attack, "note-attacked", 116, { attackId: 9, activeVoices: 1 }), true);
  assert.equal(trace.recordMessage(event([0x90, 60, 100], "mirror", 113), {
    handlerTimeMs: 117, selectedInputId: ALL_MIDI_INPUTS_ID,
    inputName: "MIDIIN2", inputState: "connected", inputConnection: "open",
  }), 2);
  assert.equal(trace.recordPortChange({ id: "main", type: "input", state: "disconnected", connection: "pending" }, 120, "main"), true);
  const snapshot = trace.stop(125);
  assert.equal(snapshot.overwrittenRecords, 1);
  assert.deepEqual(snapshot.records.map((item) => item.sequence), [1, 2, 3]);
  assert.equal(snapshot.records[1].rawHex, "90 3C 64");
  assert.equal(snapshot.records[1].dispatchDelayMs, 4);
  assert.equal(snapshot.records[1].inputId, "mirror");
  assert.equal(snapshot.records[2].port.connection, "pending");
  const encoded = JSON.parse(trace.toJSON());
  assert.equal(encoded.initialPorts[0].name, "SMK-37 Elite Midi");
  assert.equal(encoded.records[1].rawHex, "90 3C 64");
  assert.equal(trace.isCapturing, false);
});

test("physical trace expires at 30 seconds, caps raw bytes and makes snapshots independent", () => {
  const trace = new MidiPhysicalTrace();
  trace.start({ nowMs: 0, selectedInputId: "main", ports: [{ id: "main", name: "bad\nname" }] });
  const oversized = event([0xf0, ...Array(70).fill(1), 0xf7], "main", 2);
  assert.equal(trace.recordMessage(oversized, { handlerTimeMs: 3, selectedInputId: "main" }), 0);
  const before = trace.snapshot();
  assert.equal(before.records[0].rawLength, 72);
  assert.equal(before.records[0].rawTruncated, true);
  assert.equal(before.records[0].rawHex.split(" ").length, 64);
  assert.equal(before.initialPorts[0].name, "bad name");
  before.initialPorts[0].name = "mutated";
  assert.equal(trace.snapshot().initialPorts[0].name, "bad name");
  assert.equal(trace.recordMessage(event([0x80, 60, 0], "main", 30_000), {
    handlerTimeMs: 30_000, selectedInputId: "main",
  }), null);
  assert.equal(trace.isCapturing, false);
  assert.equal(trace.snapshot().endedAtMs, 30_000);
  assert.throws(() => new MidiPhysicalTrace({ capacity: 0 }), /capacity/);
});
