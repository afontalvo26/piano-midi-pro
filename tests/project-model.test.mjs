import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument, PROJECT_PPQ } from "../app/src/project/model.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { canonicalizeProjectDocument, hashProjectDocument } from "../app/src/project/canonical.ts";
import { applyCommand, applySessionCommand, duplicateProjectDocument } from "../app/src/project/commands.ts";
import { drumRackCycleTicks, MAX_DRUM_RACK_CYCLE_TICKS } from "../app/src/project/drumRack.ts";
import { VIRTUOSITY_CORE_VERSION } from "../app/src/audio/virtuosityCore.ts";

const sha256 = "a".repeat(64);

function fixture() {
  const base = createProjectDocument({ id: "project-1", name: "Beat propio", at: 1000 });
  return {
    ...base,
    trackOrder: ["piano", "audio", "bus"],
    tracks: [
      {
        id: "piano", name: "Piano", kind: "instrument",
        instrument: { instrumentId: "salamander", packageVersion: "1", presetId: "grand" },
        mix: { gainDb: -6, pan: 0, mute: false, solo: false, armed: false, outputBusTrackId: "bus", sends: [], effects: [] },
      },
      {
        id: "audio", name: "Voz", kind: "audio",
        mix: { gainDb: -3, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
      },
      {
        id: "bus", name: "Bus", kind: "bus",
        mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
      },
    ],
    patterns: [{
      id: "pattern-1", name: "Melodía", version: 1, lengthTicks: 3840,
      notes: [{ id: "note-1", startTick: 960, durationTick: 240, pitch: 60, velocity: 96,
        releaseVelocity: 0, channel: 0, microOffsetTick: -10, probability: 1, ratchetCount: 1, stepId: "grid-1",
        origin: { kind: "imported", sourcePpq: 480, sourceStartTick: 480, sourceDurationTick: 120, playedPitch: 60, originalVelocity: 96 } }],
      expression: [{ id: "cc-1", kind: "cc", tick: 900, channel: 0, sequence: 1, controller: 64, value: 127 }],
    }],
    clips: [
      { id: "clip-1", kind: "pattern", trackId: "piano", sourceId: "pattern-1", sourceVersion: 1,
        startTick: 0, lengthTicks: 7680, sourceOffsetTick: 0, loopMode: "loop", tailPolicy: "cut",
        transpose: 0, gainDb: 0, muted: false },
      { id: "clip-2", kind: "audio", trackId: "audio", sourceId: "asset-1",
        startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "continue",
        transpose: 0, gainDb: 0, muted: false, sourceStartFrame: 0, sourceEndFrame: 48000,
        fadeInFrames: 100, fadeOutFrames: 100 },
    ],
    scenes: [{ id: "scene-1", name: "Hook", launchQuantizationTicks: 3840,
      slots: [{ id: "slot-1", trackId: "piano", patternId: "pattern-1" }] }],
    sections: [{ id: "section-1", name: "Intro", startTick: 0, lengthTicks: 3840 },
      { id: "section-2", name: "Hook", startTick: 3840, lengthTicks: 3840 }],
    assets: [{ id: "asset-1", sha256, byteLength: 96000, mimeType: "audio/wav", sourceKind: "recorded",
      license: "user-owned", frameCount: 48000, sampleRate: 48000, channelCount: 1 }],
    takes: [{ id: "take-1", kind: "midi", recordingId: "historical-recording-1", createdAt: 1000 }],
    automation: [{ id: "lane-1", target: { scope: "track", ownerId: "piano", parameterId: "volume" },
      points: [{ id: "point-1", tick: 0, value: -6, shape: "linear" },
        { id: "point-2", tick: 3840, value: 0, shape: "linear" }] }],
  };
}

function reversedKeys(value) {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reversedKeys(child)]));
  }
  return value;
}

test("full V1 document validates at 960 PPQ and hashes independent of key insertion order", async () => {
  const document = fixture();
  validateProjectDocument(document);
  assert.equal(document.ppq, PROJECT_PPQ);
  assert.equal(document.patterns[0].notes[0].origin.sourcePitch, undefined);
  const reordered = reversedKeys(document);
  assert.equal(canonicalizeProjectDocument(document), canonicalizeProjectDocument(reordered));
  assert.equal(await hashProjectDocument(document), await hashProjectDocument(reordered));
  assert.match(await hashProjectDocument(document), /^[0-9a-f]{64}$/);
});

test("pure commands keep input unchanged and their inverse restores the exact document", () => {
  const original = fixture();
  const renamed = applyCommand(original, { kind: "renameProject", name: "Verso", at: 2000 });
  assert.equal(original.name, "Beat propio");
  assert.equal(renamed.document.name, "Verso");
  assert.deepEqual(applyCommand(renamed.document, renamed.inverse).document, original);
  const tempo = applyCommand(original, { kind: "replaceTempoMap", tempoMap: [
    { tick: 0, microsPerQuarter: 500000 }, { tick: 3840, microsPerQuarter: 600000 },
  ], at: 2000 });
  assert.deepEqual(applyCommand(tempo.document, tempo.inverse).document, original);
  const meter = applyCommand(original, { kind: "replaceMeterMap", meterMap: [
    { tick: 0, numerator: 4, denominator: 4 }, { tick: 7680, numerator: 3, denominator: 4 },
  ], at: 2000 });
  assert.deepEqual(applyCommand(meter.document, meter.inverse).document, original);
  const shared = { ...original, clips: [...original.clips,
    { ...original.clips[0], id: "clip-shared", startTick: 7680 }] };
  const nextPattern = structuredClone(shared.patterns[0]);
  nextPattern.version = 2;
  nextPattern.notes[0].velocity = 100;
  const edited = applyCommand(shared, { kind: "replacePattern", expectedVersion: 1,
    pattern: nextPattern, at: 2000 });
  assert.equal(edited.document.patterns[0].version, 2);
  assert.equal(edited.document.clips[0].sourceVersion, 2);
  assert.equal(edited.document.clips[2].sourceVersion, 2);
  assert.equal(original.patterns[0].notes[0].velocity, 96);
  assert.deepEqual(applyCommand(edited.document, edited.inverse).document, shared);
});

test("invalid references, duplicate IDs, routing feedback and nonfinite values reject before commit", () => {
  const original = fixture();
  const orphan = structuredClone(original);
  orphan.clips[0].sourceId = "missing";
  assert.throws(() => validateProjectDocument(orphan), /patrón inexistente/);
  const duplicate = structuredClone(original);
  duplicate.patterns[0].notes[0].id = "piano";
  assert.throws(() => validateProjectDocument(duplicate), /duplicado/);
  const badStep = structuredClone(original);
  badStep.patterns[0].notes[0].stepId = "bad step id";
  assert.throws(() => validateProjectDocument(badStep), /stepId.*seguro/);
  const feedback = structuredClone(original);
  feedback.tracks[2].mix.outputBusTrackId = "bus";
  assert.throws(() => validateProjectDocument(feedback), /retroalimentación/);
  const nonfinite = structuredClone(original);
  nonfinite.tracks[0].mix.gainDb = Number.NaN;
  assert.throws(() => canonicalizeProjectDocument(nonfinite), /serializable|número/);
  const badFocusedPattern = { ...original.patterns[0], version: 2,
    notes: original.patterns[0].notes.map((note) => ({ ...note, velocity: 0 })) };
  assert.throws(() => applySessionCommand(original, { kind: "replacePattern", expectedVersion: 1,
    pattern: badFocusedPattern, at: 2000 }), /velocity/);
  const audioOverflow = structuredClone(original);
  audioOverflow.clips[1].sourceEndFrame = 48001;
  assert.throws(() => validateProjectDocument(audioOverflow), /excede los frames/);
  assert.throws(() => applyCommand(original, { kind: "replaceTempoMap", tempoMap: [
    { tick: 0, microsPerQuarter: 500000 }, { tick: 0, microsPerQuarter: 600000 },
  ], at: 2000 }), /ordenados/);
  assert.equal(original.tempoMap.length, 1);
});

test("create track/pattern/clip, duplicate and make one clip unique with exact undo", () => {
  const initial = createProjectDocument({ id: "commands-1", at: 1000 });
  const track = { id: "track-new", name: "Drums", kind: "drum",
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
  const withTrack = applyCommand(initial, { kind: "createTrack", track, at: 1100 });
  assert.deepEqual(applyCommand(withTrack.document, withTrack.inverse).document, initial);
  const pattern = { id: "pattern-new", name: "Beat", version: 1, lengthTicks: 3840,
    notes: [{ id: "kick-1", startTick: 0, durationTick: 120, pitch: 36, velocity: 100,
      releaseVelocity: 0, channel: 9, stepId: "step-1", origin: { kind: "drawn" } }],
    expression: [{ id: "control-1", kind: "cc", tick: 0, channel: 9, sequence: 0, controller: 7, value: 100 }] };
  const withPattern = applyCommand(withTrack.document, { kind: "createPattern", pattern, at: 1200 });
  assert.deepEqual(applyCommand(withPattern.document, withPattern.inverse).document, withTrack.document);
  const clip = { id: "clip-new", kind: "pattern", trackId: track.id, sourceId: pattern.id, sourceVersion: 1,
    startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
    transpose: 0, gainDb: 0, muted: false };
  const withClip = applyCommand(withPattern.document, { kind: "createClip", clip, at: 1300 });
  assert.deepEqual(applyCommand(withClip.document, withClip.inverse).document, withPattern.document);
  const duplicated = applyCommand(withClip.document, { kind: "duplicateClip", clipId: clip.id,
    newClipId: "clip-copy", startTick: 3840, at: 1400 });
  assert.equal(duplicated.document.clips.length, 2);
  assert.equal(duplicated.document.clips[1].sourceId, pattern.id);
  assert.deepEqual(applyCommand(duplicated.document, duplicated.inverse).document, withClip.document);
  const unique = applyCommand(duplicated.document, { kind: "makeClipUnique", clipId: "clip-copy",
    newPatternId: "pattern-unique", noteIds: ["kick-unique"], expressionIds: ["control-unique"],
    stepIds: { "step-1": "step-unique" }, at: 1500 });
  assert.equal(unique.document.clips[0].sourceId, pattern.id);
  assert.equal(unique.document.clips[1].sourceId, "pattern-unique");
  assert.equal(unique.document.patterns[1].notes[0].id, "kick-unique");
  assert.equal(unique.document.patterns[1].notes[0].stepId, "step-unique");
  const undone = applyCommand(unique.document, unique.inverse);
  assert.deepEqual(undone.document, duplicated.document);
  assert.deepEqual(applyCommand(undone.document, undone.inverse).document, unique.document);
  assert.throws(() => applyCommand(unique.document, { kind: "removeTrack", trackId: track.id, at: 1600 }),
    /pista inexistente/);
});

test("archiving is reversible and a project copy gets a new document identity", () => {
  const original = fixture();
  const archived = applyCommand(original, { kind: "setArchived", archived: true, at: 2000 });
  assert.equal(archived.document.archived, true);
  assert.deepEqual(applyCommand(archived.document, archived.inverse).document, original);
  const copy = duplicateProjectDocument(original, { id: "project-copy", name: "Beat copia", at: 3000 });
  assert.equal(copy.id, "project-copy");
  assert.equal(copy.archived, false);
  assert.equal(copy.createdAt, 3000);
  assert.equal(copy.patterns[0].id, original.patterns[0].id);
  assert.equal(copy.clips[0].sourceId, copy.patterns[0].id);
  assert.equal(original.id, "project-1");
});

test("arrangement replacements reject stale snapshots and undo clips, scenes and sections", () => {
  const original = fixture();
  const moved = applyCommand(original, { kind: "replaceClips", expected: original.clips,
    clips: original.clips.map((clip) => clip.id === "clip-1" ? { ...clip, startTick: 1920 } : clip), at: 2000 });
  assert.equal(moved.document.clips[0].startTick, 1920);
  assert.deepEqual(applyCommand(moved.document, moved.inverse).document, original);
  assert.throws(() => applyCommand(moved.document, { kind: "replaceClips", expected: original.clips,
    clips: original.clips, at: 2100 }), /desactualizado/);
  const changedScenes = applyCommand(original, { kind: "replaceScenes", expected: original.scenes,
    scenes: original.scenes.map((scene) => ({ ...scene, name: "Verso" })), at: 2000 });
  assert.deepEqual(applyCommand(changedScenes.document, changedScenes.inverse).document, original);
  const changedSections = applyCommand(original, { kind: "replaceSections", expected: original.sections,
    sections: original.sections.map((section) => section.id === "section-2"
      ? { ...section, name: "Estribillo" } : section), at: 2000 });
  assert.deepEqual(applyCommand(changedSections.document, changedSections.inverse).document, original);
  assert.throws(() => applyCommand(original, { kind: "replaceClips", expected: original.clips,
    clips: [{ ...original.clips[0], sourceId: "missing" }, original.clips[1]], at: 2000 }), /patrón inexistente/);
});

test("CC, bend and pressure can share an exact tick with stable source sequence", () => {
  const original = fixture();
  const expression = [
    { id: "same-cc", kind: "cc", tick: 0, channel: 0, sequence: 3, controller: 11, value: 90 },
    { id: "same-bend", kind: "pitchBend", tick: 0, channel: 0, sequence: 4, value14: 8192 },
    { id: "same-pressure", kind: "channelPressure", tick: 0, channel: 1, sequence: 5, pressure: 70 },
  ];
  const document = { ...original, patterns: [{ ...original.patterns[0], expression }] };
  validateProjectDocument(document);
  assert.deepEqual(document.patterns[0].expression.map(({ tick, sequence }) => [tick, sequence]),
    [[0, 3], [0, 4], [0, 5]]);
});

test("arrangement clip, section and clip automation change atomically with one inverse", () => {
  const original = fixture();
  const expected = { clips: original.clips, sections: original.sections, automation: original.automation };
  const clips = [...original.clips, { ...original.clips[0], id: "clip-copied", startTick: 7680 }];
  const sections = [...original.sections, { id: "section-copied", name: "Hook copia",
    startTick: 7680, lengthTicks: 3840 }];
  const automation = [...original.automation, { id: "lane-copied",
    target: { scope: "clip", ownerId: "clip-copied", parameterId: "volume" },
    points: [{ id: "point-copied", tick: 7680, value: -3, shape: "linear" }] }];
  const changed = applyCommand(original, { kind: "replaceArrangement", expected,
    clips, sections, automation, at: 2000 });
  assert.equal(changed.document.clips.length, 3);
  assert.equal(changed.document.sections.length, 3);
  assert.equal(changed.document.automation.length, 2);
  assert.deepEqual(applyCommand(changed.document, changed.inverse).document, original);
  assert.throws(() => applyCommand(original, { kind: "replaceArrangement", expected,
    clips, sections, automation: automation.map((lane) => lane.id === "lane-copied"
      ? { ...lane, target: { ...lane.target, ownerId: "missing" } } : lane), at: 2000 }),
  /clip inexistente/);
  assert.equal(original.clips.length, 2);
});

test("audio take capture provenance matches its immutable asset", () => {
  const original = fixture();
  const capture = { startTick: 960, startAudioTime: 12.5, frameCount: 48000,
    sampleRate: 48000, channelCount: 1, deviceId: "own-mic", latencyOffsetFrames: -128,
    incomplete: false };
  const take = { id: "take-audio", kind: "audio", assetId: "asset-1", createdAt: 1000,
    audioCapture: capture };
  const document = { ...original, takes: [...original.takes, take] };
  validateProjectDocument(document);
  assert.throws(() => validateProjectDocument({ ...document, takes: [original.takes[0],
    { ...take, audioCapture: { ...capture, frameCount: 47999 } }] }), /no coinciden/);
  assert.throws(() => validateProjectDocument({ ...document, takes: [original.takes[0],
    { ...take, audioCapture: { ...capture, incomplete: true } }] }), /requiere motivo/);
  assert.throws(() => validateProjectDocument({ ...document, clips: document.clips.map((clip) =>
    clip.kind === "audio" ? { ...clip, loopMode: "loop" } : clip) }), /audio v1 requiere/);
  assert.throws(() => validateProjectDocument({ ...document, clips: document.clips.map((clip) =>
    clip.kind === "audio" ? { ...clip, sourceOffsetTick: 120 } : clip) }), /audio v1 requiere/);
  assert.throws(() => validateProjectDocument({ ...document, clips: document.clips.map((clip) =>
    clip.kind === "audio" ? { ...clip, transpose: 2 } : clip) }), /audio v1 requiere/);
});

test("16-pad rack validates exact recorded sources, cycles and reversible replacement", () => {
  const original = fixture();
  const drumTrack = { id: "drum-track", name: "Batería", kind: "drum",
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
  const pattern = { id: "drum-pattern", name: "Pulso", version: 1, lengthTicks: 3840,
    notes: [{ id: "drum-hit", startTick: 0, durationTick: 120, pitch: 36, velocity: 110,
      releaseVelocity: 0, channel: 9, origin: { kind: "drawn" } }], expression: [] };
  const clip = { id: "drum-clip", kind: "pattern", trackId: drumTrack.id,
    sourceId: pattern.id, sourceVersion: 1, startTick: 0, lengthTicks: 3840,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
    gainDb: 0, muted: false };
  const base = { ...original, tracks: [...original.tracks, drumTrack],
    trackOrder: [...original.trackOrder, drumTrack.id], patterns: [...original.patterns, pattern],
    clips: [...original.clips, clip] };
  const rack = { pads: Array.from({ length: 16 }, (_, index) => ({
    id: `pad-${index}`, name: `Pad ${index + 1}`, color: "#1288cc",
    midiNote: 36 + index, channel: 9,
    source: index === 0 ? { kind: "instrument", sourceNote: 36,
      ref: { instrumentId: "virtuosity-core", packageVersion: VIRTUOSITY_CORE_VERSION,
        presetId: "core" } } : null,
    gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0,
    attackMs: 0, decayMs: 20, playMode: "oneShot", mute: false, solo: false,
    stepTicks: 240, stepCount: 16,
  })) };
  assert.equal(drumRackCycleTicks(rack), 3840);
  const applied = applyCommand(base, { kind: "replaceDrumRack", trackId: drumTrack.id,
    expected: undefined, rack, at: 2000 });
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document, base);
  assert.throws(() => applyCommand(applied.document, { kind: "replaceDrumRack",
    trackId: drumTrack.id, expected: undefined, rack, at: 2100 }), /desactualizado/);
  assert.throws(() => applyCommand(applied.document, { kind: "replaceDrumRack",
    trackId: drumTrack.id, expected: rack,
    rack: { pads: rack.pads.map((pad, index) => index === 0
      ? { ...pad, id: "pad-renamed" } : pad) }, at: 2100 }), /permanecer estables/);
  const badTrigger = { pads: rack.pads.map((pad, index) => index === 1
    ? { ...pad, midiNote: 36 } : pad) };
  assert.throws(() => applyCommand(base, { kind: "replaceDrumRack", trackId: drumTrack.id,
    expected: undefined, rack: badTrigger, at: 2000 }), /duplicados/);
  const badSource = { pads: rack.pads.map((pad, index) => index === 0
    ? { ...pad, source: { ...pad.source, sourceNote: 37 } } : pad) };
  assert.throws(() => applyCommand(base, { kind: "replaceDrumRack", trackId: drumTrack.id,
    expected: undefined, rack: badSource, at: 2000 }), /no aprobados/);
  const polyrhythm = { pads: rack.pads.map((pad, index) => index === 1
    ? { ...pad, stepTicks: 180 } : pad) };
  assert.equal(drumRackCycleTicks(polyrhythm), 11520);
  const expanded = applyCommand(applied.document, { kind: "replaceDrumRackPatterns",
    trackId: drumTrack.id, expectedRack: rack, rack: polyrhythm,
    patterns: [{ expectedVersion: 1, pattern: { ...pattern, version: 2,
      lengthTicks: 11520 } }], at: 2100 });
  assert.equal(expanded.document.patterns.at(-1).lengthTicks, 11520);
  assert.equal(expanded.document.clips.at(-1).sourceVersion, 2);
  assert.deepEqual(applyCommand(expanded.document, expanded.inverse).document, applied.document);
  assert.throws(() => applyCommand(expanded.document, { kind: "replaceDrumRackPatterns",
    trackId: drumTrack.id, expectedRack: rack, rack: polyrhythm,
    patterns: [{ expectedVersion: 1, pattern: { ...pattern, version: 2,
      lengthTicks: 11520 } }], at: 2200 }), /desactualizado/);
  const runaway = { pads: rack.pads.map((pad, index) => index === 1
    ? { ...pad, stepTicks: 3839, stepCount: 1 } : pad) };
  assert.throws(() => drumRackCycleTicks(runaway), /64 compases/);
  assert.equal(MAX_DRUM_RACK_CYCLE_TICKS, 245760);
  const outsideBase = { ...applied.document, patterns: applied.document.patterns.map((item) =>
    item.id === pattern.id ? { ...item, notes: [{ ...item.notes[0], pitch: 37,
      startTick: 3000 }] } : item),
    tracks: applied.document.tracks.map((item) => item.id === drumTrack.id
      ? { ...item, drumRack: { pads: rack.pads.map((pad, index) => index === 1
        ? { ...pad, stepTicks: 120 } : pad) } } : item) };
  assert.throws(() => validateProjectDocument(outsideBase), /fuera de la vuelta base/);
  assert.throws(() => applySessionCommand(applied.document, { kind: "replacePattern",
    expectedVersion: 1, pattern: { ...pattern, version: 2,
      notes: [{ ...pattern.notes[0], pitch: 90 }] }, at: 2100 }), /golpe sin pad/);
  assert.throws(() => validateProjectDocument({ ...applied.document,
    clips: applied.document.clips.map((item) => item.id === clip.id
      ? { ...item, transpose: 1 } : item) }), /pitch MIDI exacto/);
});

test("track and master mix commands are CAS-checked, reversible and reject routing cycles", () => {
  const original = fixture();
  const piano = original.tracks[0];
  const mix = { ...piano.mix, gainDb: -3, pan: 0.25, mute: true,
    sends: [{ id: "send-new", busTrackId: "bus", gainDb: -12 }],
    effects: [{ id: "effect-new", kind: "filter", enabled: true,
      parameters: { cutoffHz: 1200 } }] };
  const changed = applyCommand(original, { kind: "replaceTrackMix", trackId: piano.id,
    expected: piano.mix, mix, at: 2000 });
  assert.deepEqual(changed.document.tracks[0].mix, mix);
  assert.deepEqual(applyCommand(changed.document, changed.inverse).document, original);
  assert.throws(() => applyCommand(changed.document, { kind: "replaceTrackMix", trackId: piano.id,
    expected: piano.mix, mix, at: 2100 }), /desactualizado/);
  const master = { masterGainDb: -4, masterEffects: [{ id: "master-fx", kind: "limiter",
    enabled: true, parameters: { thresholdDb: -1 } }] };
  const changedMaster = applyCommand(original, { kind: "replaceMasterMix",
    expected: original.mix, mix: master, at: 2000 });
  assert.deepEqual(applyCommand(changedMaster.document, changedMaster.inverse).document, original);
  assert.throws(() => applyCommand(changedMaster.document, { kind: "replaceMasterMix",
    expected: original.mix, mix: master, at: 2100 }), /desactualizado/);
  assert.throws(() => applyCommand(original, { kind: "replaceTrackMix", trackId: piano.id,
    expected: piano.mix, mix: { ...mix, sends: [{ ...mix.sends[0], busTrackId: "missing" }] },
    at: 2000 }), /bus destino inexistente/);
  const secondBus = { id: "bus-2", name: "Bus 2", kind: "bus",
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      outputBusTrackId: "bus", sends: [], effects: [] } };
  const twoBuses = { ...original, tracks: [...original.tracks, secondBus],
    trackOrder: [...original.trackOrder, secondBus.id] };
  assert.throws(() => applyCommand(twoBuses, { kind: "replaceTrackMix", trackId: "bus",
    expected: original.tracks[2].mix,
    mix: { ...original.tracks[2].mix, outputBusTrackId: secondBus.id }, at: 2000 }),
  /ciclo de enrutamiento/);
});
