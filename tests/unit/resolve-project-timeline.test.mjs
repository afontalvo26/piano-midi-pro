import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { validateProjectDocument } from "../../app/src/project/validate.ts";
import { createArrangementResolver, quantizeSceneLaunchTick } from "../../app/src/composition/resolveProjectTimeline.ts";
import { createAudioRoutingPolicy } from "../../app/src/project/mixRouting.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
const track = { id: "track-piano", name: "Piano", kind: "instrument", mix };
const pattern = { id: "pattern-a", name: "Fuente", version: 1, lengthTicks: 960,
  notes: [
    { id: "note-a", startTick: 0, durationTick: 240, pitch: 60, velocity: 101,
      releaseVelocity: 60, channel: 0, origin: { kind: "drawn", sourcePitch: 60 } },
    { id: "note-tail", startTick: 900, durationTick: 120, pitch: 64, velocity: 90,
      releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } },
  ], expression: [
    { id: "cc-1", kind: "cc", tick: 0, sequence: 0, channel: 0, controller: 11, value: 80 },
    { id: "bend-1", kind: "pitchBend", tick: 480, sequence: 1, channel: 0, value14: 8192 },
    { id: "pressure-1", kind: "polyPressure", tick: 600, sequence: 2, channel: 0, pitch: 60, pressure: 70 },
  ] };
const clip = { id: "clip-a", kind: "pattern", trackId: track.id, sourceId: pattern.id,
  sourceVersion: pattern.version, startTick: 0, lengthTicks: 1_920, sourceOffsetTick: 0,
  loopMode: "loop", tailPolicy: "cut", transpose: 2, gainDb: -3, muted: false };
const scene = { id: "scene-a", name: "Hook", launchQuantizationTicks: 960,
  slots: [{ id: "slot-a", trackId: track.id, patternId: pattern.id }] };
const base = { ...createProjectDocument({ id: "project-a", at: 1000 }),
  tracks: [track], trackOrder: [track.id], patterns: [pattern], clips: [clip], scenes: [scene] };
validateProjectDocument(base);

test("offset, loop y borde semiabierto no duplican ataques ni cambian velocity", () => {
  const resolve = createArrangementResolver(base);
  const notes = resolve(0, 1_920, 0).filter((event) => event.kind === "note");
  assert.deepEqual(notes.map((event) => event.tick), [0, 900, 960, 1860]);
  assert.equal(notes[1].durationTicks, 60);
  assert.equal(notes[3].durationTicks, 60);
  assert.equal(notes[0].velocity, 101);
  assert.equal(notes[0].pitch, 62);
  assert.equal(notes[0].sourcePitch, 60);
  assert.equal(notes[0].gainDb, -3);
  assert.equal(resolve(960, 961, 0).filter((event) => event.kind === "note").length, 1);
  const shifted = createArrangementResolver({ ...base, clips: [{ ...clip, sourceOffsetTick: 240 }] });
  assert.deepEqual(shifted(0, 960, 0).filter((event) => event.kind === "note").map((event) => event.tick), [660, 720]);
});

test("CC, bend y presión comparten owner con notas y conservan orden", () => {
  const events = createArrangementResolver(base)(0, 961, 0);
  assert.equal(events[0].kind, "cc");
  const owner = events.find((event) => event.kind === "note").ownerPath;
  assert.ok(events.every((event) => event.ownerPath === owner));
  assert.equal(events.find((event) => event.kind === "pitchBend").value14, 8192);
  assert.equal(events.find((event) => event.kind === "polyPressure").pitch, 62);
  assert.ok(events.every((event) => event.eventId.includes("iteration-0")));
});

test("microdesplazamiento, ratchet y probabilidad se resuelven con semilla reproducible", () => {
  const seeded = { ...pattern, notes: [{ ...pattern.notes[0], startTick: 120, durationTick: 120,
    microOffsetTick: 5, ratchetCount: 3, probability: 1 }] };
  const snapshot = { ...base, patterns: [seeded] };
  const resolver = createArrangementResolver(snapshot);
  assert.deepEqual(resolver(0, 960, 0).filter((event) => event.kind === "note").map((event) => event.tick), [125, 165, 205]);
  const chance = { ...seeded, notes: [{ ...seeded.notes[0], probability: 0.5 }] };
  const chanceResolver = createArrangementResolver({ ...base, patterns: [chance] });
  assert.deepEqual(chanceResolver(0, 1920, 2), chanceResolver(0, 1920, 2));
  const none = { ...seeded, notes: [{ ...seeded.notes[0], probability: 0 }] };
  assert.equal(createArrangementResolver({ ...base, patterns: [none] })(0, 960, 0).filter((event) => event.kind === "note").length, 0);
});

test("semilla explícita de probabilidad es reproducible y el default conserva ID de proyecto", () => {
  const chance = { ...pattern, notes: [{ ...pattern.notes[0], probability: 0.5 }] };
  const repeated = { ...base, patterns: [chance], clips: [{ ...clip, lengthTicks: 16 * pattern.lengthTicks }] };
  const notes = (mode) => createArrangementResolver(repeated, mode)(0, 16 * pattern.lengthTicks, 0)
    .filter((event) => event.kind === "note").map((event) => event.tick);
  assert.deepEqual(notes(), notes({ probabilitySeed: repeated.id }));
  assert.deepEqual(notes({ probabilitySeed: "export-37" }), notes({ probabilitySeed: "export-37" }));
  assert.notDeepEqual(notes({ probabilitySeed: "export-37" }), notes({ probabilitySeed: "export-38" }));
  assert.throws(() => createArrangementResolver(repeated, { probabilitySeed: "x".repeat(129) }), /Semilla/);
});

test("escena cuantizada toma sólo su pista, sin evento doble en el cambio", () => {
  assert.equal(quantizeSceneLaunchTick(scene, 961), 1920);
  const resolver = createArrangementResolver(base, { launcher: { sceneId: scene.id, startTick: 960, stopTick: 1920 } });
  const notes = resolver(0, 1920, 0).filter((event) => event.kind === "note");
  assert.deepEqual(notes.map((event) => [event.tick, event.sourceKind]), [
    [0, "arrangement"], [900, "arrangement"], [960, "launcher"], [1860, "launcher"],
  ]);
  const control = resolver(960, 961, 0).find((event) => event.kind === "cc");
  assert.equal(control.ownerPath, notes[2].ownerPath);
  assert.ok(notes[2].ownerPath.includes("launcher/scene-a/slot/slot-a"));
});

test("versión inconsistente falla antes de programar", () => {
  assert.throws(() => createArrangementResolver({ ...base, clips: [{ ...clip, sourceVersion: 2 }] }), /Versión/);
});

test("audio grabado conserva trim y fades al Seek y se segmenta por prioridad sin duplicarse", () => {
  const audioTrack = { id: "track-audio", name: "Voz", kind: "audio", mix };
  const asset = { id: "asset-voice", sha256: "a".repeat(64), byteLength: 4096,
    mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 24000,
    sampleRate: 48000, channelCount: 1 };
  const audio = { id: "clip-voice", kind: "audio", trackId: audioTrack.id,
    sourceId: asset.id, startTick: 0, lengthTicks: 960, sourceOffsetTick: 0,
    loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: -2, muted: false,
    sourceStartFrame: 100, sourceEndFrame: 20000, fadeInFrames: 240, fadeOutFrames: 480 };
  const interrupt = { ...audio, id: "clip-interrupt", startTick: 240, lengthTicks: 240,
    sourceStartFrame: 800, sourceEndFrame: 10000 };
  const snapshot = { ...base, tracks: [...base.tracks, audioTrack],
    trackOrder: [...base.trackOrder, audioTrack.id], assets: [asset],
    clips: [...base.clips, audio, interrupt] };
  validateProjectDocument(snapshot);
  const resolver = createArrangementResolver(snapshot);
  const audioEvents = resolver(0, 960, 0).filter((event) => event.kind === "audioClip");
  assert.deepEqual(audioEvents.map((event) => [event.clipId, event.tick, event.clipStartTick,
    event.clipEndTick]), [
    ["clip-voice", 0, 0, 240],
    ["clip-interrupt", 240, 240, 480],
    ["clip-voice", 480, 0, 960],
  ]);
  assert.equal(new Set(audioEvents.map((event) => event.eventId)).size, 3);
  assert.deepEqual(resolver(300, 400, 0).filter((event) => event.kind === "audioClip")
    .map((event) => event.eventId), ["audio:clip-interrupt:segment-125000-250000"]);
  const seek = resolver(600, 601, 0).find((event) => event.kind === "audioClip");
  assert.equal(seek?.tick, 480);
  assert.equal(seek?.clipStartTick, 0);
  assert.equal(seek?.sourceStartFrame, 100);
  assert.equal(seek?.fadeOutFrames, 480);
  assert.equal(seek?.gainDb, -2);
  assert.equal(resolver(240, 480, 0).filter((event) => event.kind === "audioClip").length, 1);
  assert.equal(resolver(480, 481, 0).filter((event) => event.kind === "audioClip").length, 1);
  assert.throws(() => createArrangementResolver({ ...snapshot,
    clips: [...base.clips, { ...audio, loopMode: "loop" }] }), /loop, offset o transposición/);
});

test("crossfade en µs conserva dos owners sin reataque en inicio de solape y Seek", () => {
  const audioTrack = { id: "track-crossfade", name: "Voz", kind: "audio", mix };
  const asset = { id: "asset-crossfade", sha256: "b".repeat(64), byteLength: 96000,
    mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 48000,
    sampleRate: 48000, channelCount: 1 };
  const outgoing = { id: "clip-out", kind: "audio", trackId: audioTrack.id,
    sourceId: asset.id, startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0,
    loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: -3, muted: false,
    sourceStartFrame: 0, sourceEndFrame: 48000, fadeInFrames: 0, fadeOutFrames: 0 };
  const incoming = { ...outgoing, id: "clip-in", startTick: 960, lengthTicks: 1920,
    timeMode: "absolute", absoluteStartUs: 499740, absoluteEndUs: 1499740,
    envelopeStartFrame: 0, envelopeEndFrame: 48000 };
  const fade = { id: "fade-1", outgoingClipId: outgoing.id,
    incomingClipId: incoming.id, curve: "equalPower" };
  const snapshot = { ...base, tracks: [...base.tracks, audioTrack],
    trackOrder: [...base.trackOrder, audioTrack.id], assets: [asset],
    clips: [...base.clips, outgoing, incoming], audioCrossfades: [fade] };
  validateProjectDocument(snapshot);
  const resolve = createArrangementResolver(snapshot);
  const full = resolve(0, 2881, 0).filter((event) => event.kind === "audioClip");
  assert.deepEqual(full.map((event) => [event.clipId, event.tick, event.clipStartTick,
    event.clipEndTick, event.segmentStartUs, event.segmentEndUs]), [
    ["clip-out", 0, 0, 1920, 0, 1000000],
    ["clip-in", 959, 959, 2880, 499740, 1499740],
  ]);
  assert.deepEqual(full.map((event) => event.crossfades), [
    [{ id: "fade-1", role: "out", startUs: 499740, endUs: 1000000, curve: "equalPower" }],
    [{ id: "fade-1", role: "in", startUs: 499740, endUs: 1000000, curve: "equalPower" }],
  ]);
  assert.deepEqual(full.map((event) => event.ownerPath), [
    "track/track-crossfade/clip/clip-out", "track/track-crossfade/clip/clip-in",
  ]);
  assert.equal(new Set(full.map((event) => event.eventId)).size, 2);
  assert.deepEqual(resolve(959, 960, 0).filter((event) => event.kind === "audioClip")
    .map((event) => event.clipId), ["clip-out", "clip-in"]);
  assert.deepEqual(resolve(1200, 1201, 0).filter((event) => event.kind === "audioClip")
    .map((event) => event.clipId), ["clip-out", "clip-in"]);
  assert.deepEqual(resolve(1920, 1921, 0).filter((event) => event.kind === "audioClip")
    .map((event) => event.clipId), ["clip-in"]);
  const withoutFade = createArrangementResolver({ ...snapshot, audioCrossfades: [] });
  assert.deepEqual(withoutFade(0, 2881, 0).filter((event) => event.kind === "audioClip")
    .map((event) => [event.clipId, event.segmentStartUs, event.segmentEndUs]), [
    ["clip-out", 0, 499740], ["clip-in", 499740, 1499740],
  ]);
});

test("rack de 16 pads repite cada vuelta base hasta LCM sin duplicar bordes", () => {
  const pads = Array.from({ length: 16 }, (_, index) => ({
    id: `pad-${index}`, name: `Pad ${index}`, color: "#1288cc", midiNote: 36 + index,
    channel: 9, source: null, gainDb: 0, pan: 0, pitchSemitones: 0,
    startFrame: 0, attackMs: 0, decayMs: 20, playMode: "oneShot",
    mute: false, solo: false, stepTicks: index === 1 ? 180 : 240, stepCount: 16,
  }));
  const drumTrack = { id: "track-drum", name: "Batería", kind: "drum",
    mix, drumRack: { pads } };
  const drumPattern = { id: "pattern-drum", name: "Polirritmo", version: 1,
    lengthTicks: 11520, expression: [], notes: [
      { id: "kick", startTick: 0, durationTick: 90, ratchetCount: 3,
        pitch: 36, velocity: 110, releaseVelocity: 0, channel: 9,
        origin: { kind: "drawn" } },
      { id: "snare", startTick: 0, durationTick: 90, pitch: 37,
        velocity: 100, releaseVelocity: 0, channel: 9,
        origin: { kind: "drawn" } },
    ] };
  const drumClip = { ...clip, id: "clip-drum", trackId: drumTrack.id,
    sourceId: drumPattern.id, sourceVersion: 1, startTick: 0,
    lengthTicks: 11520, loopMode: "none", transpose: 0 };
  const snapshot = { ...base, tracks: [...base.tracks, drumTrack],
    trackOrder: [...base.trackOrder, drumTrack.id], patterns: [...base.patterns, drumPattern],
    clips: [...base.clips, drumClip] };
  validateProjectDocument(snapshot);
  const resolver = createArrangementResolver(snapshot);
  const notes = resolver(0, 11520, 0).filter((event) =>
    event.kind === "note" && event.trackId === drumTrack.id);
  assert.deepEqual(notes.filter((event) => event.pitch === 36).map((event) => event.tick),
    [0, 30, 60, 3840, 3870, 3900, 7680, 7710, 7740]);
  assert.deepEqual(notes.filter((event) => event.pitch === 37).map((event) => event.tick),
    [0, 2880, 5760, 8640]);
  assert.equal(new Set(notes.map((event) => event.eventId)).size, notes.length);
  assert.deepEqual(resolver(3840, 3841, 0).filter((event) =>
    event.kind === "note" && event.trackId === drumTrack.id).map((event) => event.pitch), [36]);
});

test("10.000 clips comparten índice de autoridad y resuelven una ventana focal", () => {
  const clips = Array.from({ length: 10_000 }, (_, index) => ({ ...clip,
    id: `clip-many-${index}`, startTick: index * 960, lengthTicks: 960,
    transpose: 0 }));
  const resolver = createArrangementResolver({ ...base, clips });
  const notes = resolver(5_000 * 960, 5_000 * 960 + 1, 0)
    .filter((event) => event.kind === "note");
  assert.deepEqual(notes.map((event) => [event.tick, event.clipId]),
    [[5_000 * 960, "clip-many-5000"]]);
});

test("routing audible conserva un send auxiliar cuando el bus principal está mudo", () => {
  const main = { id: "bus-main-muted", name: "Principal mudo", kind: "bus",
    mix: { ...mix, mute: true } };
  const aux = { id: "bus-aux", name: "Auxiliar", kind: "bus", mix };
  const routedTrack = { ...track, mix: { ...mix, outputBusTrackId: main.id,
    sends: [{ id: "send-aux", busTrackId: aux.id, gainDb: 0 }] } };
  const routed = { ...base, tracks: [routedTrack, main, aux],
    trackOrder: [routedTrack.id, main.id, aux.id] };
  const policy = createAudioRoutingPolicy(routed.tracks);
  assert.equal(policy.canSourceReachOutput(routedTrack.id), true);
  assert.equal(policy.shouldOpenTrackGate(routedTrack.id), true);
  assert.equal(policy.shouldOpenTrackGate(main.id), false);
  assert.equal(policy.shouldOpenTrackGate(aux.id), true);
  assert.equal(createArrangementResolver(routed)(0, 1, 0)
    .filter((event) => event.kind === "note").length, 1);
  const withoutSend = { ...routed, tracks: [{ ...routedTrack,
    mix: { ...routedTrack.mix, sends: [] } }, main, aux] };
  assert.equal(createArrangementResolver(withoutSend)(0, 1, 0)
    .filter((event) => event.kind === "note").length, 0);
});

test("routing audible hereda solo desde una fuente y hacia un bus", () => {
  const bus = { id: "bus-solo", name: "Bus solo", kind: "bus",
    mix: { ...mix, solo: true } };
  const feeding = { ...track, mix: { ...mix,
    sends: [{ id: "send-solo", busTrackId: bus.id, gainDb: -6 }] } };
  const other = { ...track, id: "track-other", name: "Otra" };
  const policy = createAudioRoutingPolicy([feeding, other, bus]);
  assert.equal(policy.canSourceReachOutput(feeding.id), true);
  assert.equal(policy.canSourceReachOutput(other.id), false);
  assert.equal(policy.shouldOpenTrackGate(bus.id), true);
  const sourceSolo = createAudioRoutingPolicy([
    { ...feeding, mix: { ...feeding.mix, solo: true } },
    { ...bus, mix: { ...bus.mix, solo: false } },
  ]);
  assert.equal(sourceSolo.canSourceReachOutput(feeding.id), true);
  assert.equal(sourceSolo.shouldOpenTrackGate(bus.id), true);
});
