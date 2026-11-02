import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { applyCommand } from "../../app/src/project/commands.ts";
import { validateProjectDocument } from "../../app/src/project/validate.ts";
import { createArrangementResolver } from "../../app/src/composition/resolveProjectTimeline.ts";
import { addArrangementSection, captureArrangementPerformance, captureArrangementScene,
  createArrangementClip, duplicateArrangementClip, duplicateArrangementSection,
  editArrangementClip, editArrangementScene, editArrangementSection, groupArrangementClips,
  moveArrangementClipGroup, removeArrangementScene, removeArrangementSection, splitArrangementClip,
  ungroupArrangementClip, uniqueArrangementClip } from "../../app/src/composition/arrangementModel.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
const track = { id: "arr-track", name: "Piano", kind: "instrument", mix };
const pattern = { id: "arr-pattern", name: "Hook propio", version: 1, lengthTicks: 960,
  notes: [{ id: "arr-note", startTick: 0, durationTick: 240, pitch: 60,
    velocity: 100, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" }, stepId: "step-one" }],
  expression: [{ id: "arr-cc", kind: "cc", tick: 0, channel: 0, sequence: 0, controller: 11, value: 82 }] };
const clip = { id: "arr-clip", kind: "pattern", trackId: track.id, sourceId: pattern.id,
  sourceVersion: 1, startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0,
  loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
const base = { ...createProjectDocument({ id: "arr-project", at: 1000 }),
  tracks: [track], trackOrder: [track.id], patterns: [pattern], clips: [clip] };
validateProjectDocument(base);

test("crear, editar y duplicar clip conservan la fuente y admiten undo", () => {
  const created = applyCommand({ ...base, clips: [] }, createArrangementClip(base, track.id, pattern.id, 240, 2000));
  assert.equal(created.document.clips[0].sourceId, pattern.id);
  assert.equal(created.document.clips[0].startTick, 240);
  assert.equal(created.document.clips[0].sourceVersion, 1);
  const changed = applyCommand(base, editArrangementClip(base, clip.id,
    { startTick: 240, lengthTicks: 1440, sourceOffsetTick: 120, loopMode: "none",
      tailPolicy: "continue", transpose: 2, gainDb: -3, muted: true }, 2000));
  assert.equal(changed.document.clips[0].sourceOffsetTick, 120);
  assert.equal(changed.document.clips[0].loopMode, "none");
  assert.equal(changed.document.patterns[0].notes[0].pitch, 60);
  assert.deepEqual(applyCommand(changed.document, changed.inverse).document.clips, base.clips);
  const duplicated = applyCommand(base, duplicateArrangementClip(base, clip.id, 2000));
  assert.equal(duplicated.document.clips.length, 2);
  assert.equal(duplicated.document.clips[1].sourceId, duplicated.document.clips[0].sourceId);
  assert.equal(duplicated.document.clips[1].startTick, 1920);
});

test("duplicar clip con curva local copia owner, puntos e IDs en un solo Undo", () => {
  const lane = { id: "clip-gain", target: { scope: "clip", ownerId: clip.id, parameterId: "gainDb" },
    writeMode: "read", points: [
      { id: "gain-a", tick: 240, value: -3, shape: "step" },
      { id: "gain-b", tick: 1500, value: -6, shape: "linear" },
    ] };
  const source = { ...base, automation: [lane] };
  const command = duplicateArrangementClip(source, clip.id, 2000, "clip-copy");
  assert.equal(command.kind, "duplicateClipWithAutomation");
  const copied = applyCommand(source, command);
  assert.equal(copied.document.clips[1].id, "clip-copy");
  assert.equal(copied.document.automation[1].target.ownerId, "clip-copy");
  assert.deepEqual(copied.document.automation[1].points.map((point) => point.tick), [240, 1500]);
  assert.notEqual(copied.document.automation[1].id, lane.id);
  assert.notEqual(copied.document.automation[1].points[0].id, lane.points[0].id);
  assert.deepEqual(applyCommand(copied.document, copied.inverse).document, source);
});

test("clip de audio guarda trim/fades exactos y rechaza controles de pitch o loop no admitidos", () => {
  const audioTrack = { id: "arr-audio-track", name: "Voz", kind: "audio", mix };
  const asset = { id: "arr-voice", sha256: "a".repeat(64), byteLength: 4096,
    mimeType: "audio/wav", sourceKind: "recorded", license: "Propio",
    frameCount: 24000, sampleRate: 48000, channelCount: 1 };
  const audio = { id: "arr-audio-clip", kind: "audio", trackId: audioTrack.id,
    sourceId: asset.id, startTick: 0, lengthTicks: 960, sourceOffsetTick: 0,
    loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false,
    sourceStartFrame: 0, sourceEndFrame: 20000, fadeInFrames: 0, fadeOutFrames: 0 };
  const document = { ...base, tracks: [...base.tracks, audioTrack],
    trackOrder: [...base.trackOrder, audioTrack.id], clips: [...base.clips, audio], assets: [asset] };
  validateProjectDocument(document);
  const fields = { startTick: 120, lengthTicks: 840, sourceOffsetTick: 0,
    loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: -3, muted: false,
    sourceStartFrame: 100, sourceEndFrame: 16000, fadeInFrames: 240, fadeOutFrames: 480 };
  const edited = applyCommand(document, editArrangementClip(document, audio.id, fields, 2000));
  assert.equal(edited.document.clips[1].sourceStartFrame, 100);
  assert.equal(edited.document.clips[1].fadeOutFrames, 480);
  assert.deepEqual(applyCommand(edited.document, edited.inverse).document, document);
  assert.throws(() => editArrangementClip(document, audio.id,
    { ...fields, transpose: 2 }), /modo no admitido/);
  assert.throws(() => editArrangementClip(document, audio.id,
    { ...fields, fadeInFrames: 20000 }), /trim\/fades inválidos/);
});

test("hacer único clona notas, expresión y pasos, sin tocar la otra instancia", () => {
  const duplicate = applyCommand(base, duplicateArrangementClip(base, clip.id, 2000)).document;
  const result = applyCommand(duplicate, uniqueArrangementClip(duplicate, duplicate.clips[1].id, 3000));
  assert.equal(result.document.patterns.length, 2);
  assert.equal(result.document.clips[0].sourceId, pattern.id);
  assert.notEqual(result.document.clips[1].sourceId, pattern.id);
  assert.notEqual(result.document.patterns[1].notes[0].id, pattern.notes[0].id);
  assert.notEqual(result.document.patterns[1].notes[0].stepId, pattern.notes[0].stepId);
  assert.notEqual(result.document.patterns[1].expression[0].id, pattern.expression[0].id);
  const undone = applyCommand(result.document, result.inverse).document;
  assert.equal(undone.patterns.length, 1);
  assert.equal(undone.clips[1].sourceId, pattern.id);
});

test("corte mantiene fuente y desplazamiento por ciclo sin destruir eventos", () => {
  const split = applyCommand(base, splitArrangementClip(base, clip.id, 1440, 2000));
  assert.deepEqual(split.document.clips.map((item) => [item.startTick, item.lengthTicks, item.sourceOffsetTick]),
    [[0, 1440, 0], [1440, 480, 480]]);
  assert.equal(split.document.patterns[0].notes.length, 1);
  assert.deepEqual(applyCommand(split.document, split.inverse).document.clips, base.clips);
  assert.throws(() => splitArrangementClip(base, clip.id, 1920), /dentro del clip/);
});

test("secciones sin solape y escenas capturadas son reversibles", () => {
  const sectionResult = applyCommand(base, addArrangementSection(base, "Intro", 0, 960, 2000));
  const withSection = sectionResult.document;
  assert.throws(() => addArrangementSection(withSection, "Verso", 480, 960), /solapada/);
  const copied = applyCommand(withSection, duplicateArrangementSection(withSection, withSection.sections[0].id, 3000));
  assert.deepEqual(copied.document.sections.map((section) => section.startTick), [0, 960]);
  assert.equal(copied.document.clips.length, 2);
  assert.equal(copied.document.clips[1].lengthTicks, 960);
  assert.equal(copied.document.clips[1].sourceId, pattern.id);
  assert.deepEqual(applyCommand(copied.document, copied.inverse).document, withSection);
  assert.equal(applyCommand(copied.document,
    removeArrangementSection(copied.document, copied.document.sections[1].id, 4000)).document.sections.length, 1);
  const captured = applyCommand(base, captureArrangementScene(base, 480, "Hook", 960, 2000));
  assert.equal(captured.document.scenes[0].slots[0].patternId, pattern.id);
  assert.equal(captured.document.scenes[0].slots[0].trackId, track.id);
  assert.equal(applyCommand(captured.document,
    removeArrangementScene(captured.document, captured.document.scenes[0].id, 3000)).document.scenes.length, 0);
  assert.deepEqual(applyCommand(captured.document, captured.inverse).document.scenes, []);
});

test("duplicar sección clona automatización pertinente con IDs nuevos y rollback único", () => {
  const lanes = [
    { id: "lane-track", target: { scope: "track", ownerId: track.id, parameterId: "gain" },
      points: [{ id: "point-track", tick: 120, value: 0.5, shape: "linear" }] },
    { id: "lane-clip", target: { scope: "clip", ownerId: clip.id, parameterId: "pan" },
      points: [{ id: "point-clip", tick: 240, value: 0.2, shape: "step" },
        { id: "point-later", tick: 1500, value: 0.3, shape: "step" }] },
  ];
  const source = { ...base, sections: [{ id: "section-one", name: "Intro", startTick: 0,
    lengthTicks: 960 }], automation: lanes };
  validateProjectDocument(source);
  const copied = applyCommand(source, duplicateArrangementSection(source, "section-one", 2000));
  assert.equal(copied.document.clips.length, 2);
  assert.equal(copied.document.sections.length, 2);
  assert.equal(copied.document.automation.length, 3);
  assert.equal(copied.document.automation[0].points[1].tick, 1080);
  assert.equal(copied.document.automation[2].target.ownerId, copied.document.clips[1].id);
  assert.deepEqual(copied.document.automation[2].points.map((point) => point.tick), [240]);
  assert.deepEqual(applyCommand(copied.document, copied.inverse).document, source);
  const edited = applyCommand(source, editArrangementSection(source, "section-one",
    { name: "Verso", startTick: 0, lengthTicks: 480 }, 2000));
  assert.equal(edited.document.sections[0].name, "Verso");
});

test("escena editable y actuación terminada se materializa sin clonar notas", () => {
  const withScene = applyCommand(base, captureArrangementScene(base, 480, "Hook", 960, 2000)).document;
  const sceneId = withScene.scenes[0].id;
  const changed = applyCommand(withScene, editArrangementScene(withScene, sceneId,
    { name: "Puente", launchQuantizationTicks: 240,
      slots: [{ trackId: track.id, patternId: pattern.id }] }, 3000));
  assert.equal(changed.document.scenes[0].name, "Puente");
  assert.equal(changed.document.scenes[0].slots[0].id, withScene.scenes[0].slots[0].id);
  const performance = applyCommand(changed.document, captureArrangementPerformance(changed.document,
    [{ sceneId, startTick: 1920, endTick: 3840 }], 4000));
  assert.equal(performance.document.clips[1].startTick, 1920);
  assert.equal(performance.document.clips[1].sourceId, pattern.id);
  assert.equal(performance.document.patterns[0].notes[0].id, "arr-note");
  assert.deepEqual(applyCommand(performance.document, performance.inverse).document.clips, changed.document.clips);
});

test("volcar escena recorta autoridad previa y sus curvas en un único undo", () => {
  const oldLater = { ...clip, id: "old-later", startTick: 700, lengthTicks: 500 };
  const scenePattern = { ...pattern, id: "scene-pattern", name: "Scene",
    notes: [{ ...pattern.notes[0], id: "scene-note", startTick: 200, pitch: 67 }], expression: [] };
  const scene = { id: "scene-live", name: "Hook", launchQuantizationTicks: 0,
    slots: [{ id: "scene-slot", trackId: track.id, patternId: scenePattern.id }] };
  const lane = { id: "old-lane", target: { scope: "clip", ownerId: oldLater.id,
    parameterId: "pan" }, points: [{ id: "old-point", tick: 100, value: 0.4, shape: "step" }] };
  const baseLane = { id: "base-lane", target: { scope: "clip", ownerId: clip.id,
    parameterId: "gainDb" }, points: [
      { id: "base-before", tick: 240, value: -3, shape: "step" },
      { id: "base-cut", tick: 960, value: -5, shape: "linear" },
      { id: "base-after", tick: 1700, value: -7, shape: "linear" },
    ] };
  const source = { ...base, clips: [clip, oldLater], patterns: [pattern, scenePattern],
    scenes: [scene], automation: [lane, baseLane] };
  validateProjectDocument(source);
  const command = captureArrangementPerformance(source,
    [{ sceneId: scene.id, startTick: 500, endTick: 1500 }], 3000);
  assert.equal(command.kind, "replaceArrangement");
  const result = applyCommand(source, command);
  assert.equal(result.document.clips.some((item) => item.id === oldLater.id), false);
  assert.equal(result.document.automation.some((item) => item.id === lane.id), false);
  const keptLanes = result.document.automation.filter((item) => item.target.ownerId === clip.id ||
    item.target.ownerId === result.document.clips.find((item) => item.sourceId === pattern.id &&
      item.startTick === 1500)?.id);
  assert.deepEqual(keptLanes.map((item) => item.points.map((point) => point.tick)), [[240], [200]]);
  assert.deepEqual(result.document.clips.filter((item) => item.sourceId === pattern.id)
    .map((item) => [item.startTick, item.lengthTicks, item.sourceOffsetTick]),
  [[0, 500, 0], [1500, 420, 540]]);
  const inScene = createArrangementResolver(result.document)(500, 1500, 0)
    .filter((event) => event.kind === "note" && event.trackId === track.id);
  assert.deepEqual(inScene.map((event) => [event.tick, event.pitch]), [[700, 67]]);
  assert.deepEqual(applyCommand(result.document, result.inverse).document, source);
  assert.throws(() => captureArrangementPerformance(source, [
    { sceneId: scene.id, startTick: 500, endTick: 1500 },
    { sceneId: scene.id, startTick: 1400, endTick: 2000 },
  ]), /solapado/);
});

test("duplicar sección copia audio absoluto, crossfade, comp y curva local en un Undo", () => {
  const audioTrack = { id: "voice-track", name: "Voz", kind: "audio", mix };
  const asset = (id) => ({ id, sha256: "a".repeat(64), byteLength: 192044,
    mimeType: "audio/wav", sourceKind: "recorded", license: "Propio",
    frameCount: 96000, sampleRate: 48000, channelCount: 1 });
  const take = (id, assetId, startTick, startAudioTime) => ({ id, kind: "audio",
    assetId, createdAt: 1000, audioCapture: { startTick, startAudioTime,
      frameCount: 96000, sampleRate: 48000, channelCount: 1,
      latencyOffsetFrames: 480, incomplete: false } });
  const audioClip = (id, sourceId, sourceTakeId, startTick, absoluteStartUs) => ({
    id, kind: "audio", trackId: audioTrack.id, sourceId, sourceTakeId,
    startTick, lengthTicks: 3840, sourceOffsetTick: 0, loopMode: "none",
    tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false,
    timeMode: "absolute", absoluteStartUs, absoluteEndUs: absoluteStartUs + 2_000_000,
    sourceStartFrame: 0, sourceEndFrame: 96000, fadeInFrames: 0, fadeOutFrames: 0,
  });
  const voiceA = audioClip("voice-a", "asset-a", "take-a", 1901, 990_000);
  const voiceB = audioClip("voice-b", "asset-b", "take-b", 4781, 2_490_000);
  const fade = { id: "voice-fade", outgoingClipId: voiceA.id,
    incomingClipId: voiceB.id, curve: "equalPower" };
  const comp = { id: "voice-comp", name: "Voz elegida", trackId: audioTrack.id,
    segments: [{ id: "seg-a", clipId: voiceA.id, takeId: "take-a" },
      { id: "seg-b", clipId: voiceB.id, takeId: "take-b" }] };
  const lane = { id: "voice-lane", target: { scope: "clip", ownerId: voiceA.id,
    parameterId: "gainDb" }, points: [{ id: "voice-point", tick: 120,
    value: -3, shape: "linear" }] };
  const section = { id: "section-a", name: "Verso", startTick: 0, lengthTicks: 9600 };
  const source = { ...base, tracks: [track, audioTrack], trackOrder: [track.id, audioTrack.id],
    clips: [clip, voiceA, voiceB], assets: [asset("asset-a"), asset("asset-b")],
    takes: [take("take-a", "asset-a", 1920, 1), take("take-b", "asset-b", 4800, 2.5)],
    sections: [section], audioCrossfades: [fade], audioComps: [comp], automation: [lane] };
  validateProjectDocument(source);
  const command = duplicateArrangementSection(source, section.id, 2000);
  assert.equal(command.kind, "replaceFullArrangement");
  const copied = applyCommand(source, command);
  const audioCopies = copied.document.clips.filter((item) => item.kind === "audio" &&
    item.id !== voiceA.id && item.id !== voiceB.id);
  assert.deepEqual(audioCopies.map((item) => [item.absoluteStartUs, item.absoluteEndUs]),
    [[5_990_000, 7_990_000], [7_490_000, 9_490_000]]);
  assert.deepEqual(copied.document.audioCrossfades[1], { ...fade,
    id: copied.document.audioCrossfades[1].id,
    outgoingClipId: audioCopies[0].id, incomingClipId: audioCopies[1].id });
  assert.deepEqual(copied.document.audioComps[1].segments.map((item) => item.clipId),
    audioCopies.map((item) => item.id));
  assert.equal(copied.document.automation[1].target.ownerId, audioCopies[0].id);
  assert.equal(copied.document.automation[1].points[0].tick, 120);
  assert.deepEqual(applyCommand(copied.document, copied.inverse).document, source);
  const partialSection = { ...section, lengthTicks: 6000 };
  const partial = { ...source, sections: [partialSection] };
  assert.throws(() => duplicateArrangementSection(partial, section.id, 2000), /recorte parcial de audio/);
});


test("ARR-01 agrupa clips, los mueve juntos y desagrupa con un único Undo", () => {
  const second = { ...clip, id: "arr-clip-two", startTick: 1920 };
  const document = { ...base, clips: [clip, second] };
  const grouped = applyCommand(document, groupArrangementClips(document,
    [clip.id, second.id], 2000, "group-a"));
  assert.deepEqual(grouped.document.clips.map((item) => item.groupId), ["group-a", "group-a"]);
  const moved = applyCommand(grouped.document,
    moveArrangementClipGroup(grouped.document, clip.id, 240, 3000));
  assert.deepEqual(moved.document.clips.map((item) => item.startTick), [240, 2160]);
  assert.deepEqual(applyCommand(moved.document, moved.inverse).document, grouped.document);
  const ungrouped = applyCommand(grouped.document,
    ungroupArrangementClip(grouped.document, second.id, 4000));
  assert.equal(ungrouped.document.clips.every((item) => item.groupId === undefined), true);
  assert.deepEqual(applyCommand(ungrouped.document, ungrouped.inverse).document, grouped.document);
});

test("duplicar un clip agrupado no incorpora silenciosamente la copia al grupo", () => {
  const second = { ...clip, id: "arr-clip-two", startTick: 1920 };
  const document = applyCommand({ ...base, clips: [clip, second] },
    groupArrangementClips({ ...base, clips: [clip, second] },
      [clip.id, second.id], 2000, "group-a")).document;
  const duplicated = applyCommand(document,
    duplicateArrangementClip(document, clip.id, 3000, "group-copy"));
  assert.equal(duplicated.document.clips.find((item) => item.id === clip.id).groupId, "group-a");
  assert.equal(duplicated.document.clips.find((item) => item.id === "group-copy").groupId, undefined);
  validateProjectDocument(duplicated.document);
});

test("grupo protege crossfade: no permite mover sólo uno de sus extremos", () => {
  const audioTrack = { id: "group-audio-track", name: "Voz", kind: "audio", mix };
  const asset = { id: "group-audio-asset", sha256: "a".repeat(64), byteLength: 4096,
    mimeType: "audio/wav", sourceKind: "recorded", license: "Propio",
    frameCount: 96000, sampleRate: 48000, channelCount: 1 };
  const audio = (id, startTick, sourceStartFrame, sourceEndFrame) => ({
    id, kind: "audio", trackId: audioTrack.id, sourceId: asset.id, startTick, lengthTicks: 960,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false,
    sourceStartFrame, sourceEndFrame, fadeInFrames: 0, fadeOutFrames: 0,
  });
  const first = audio("fade-a", 0, 0, 48000);
  const second = audio("fade-b", 720, 24000, 72000);
  const source = { ...base, tracks: [track, audioTrack], trackOrder: [track.id, audioTrack.id],
    clips: [clip, first, second], assets: [asset], audioCrossfades: [{
      id: "fade", outgoingClipId: first.id, incomingClipId: second.id, curve: "equalPower",
    }] };
  const grouped = applyCommand(source,
    groupArrangementClips(source, [clip.id, first.id], 2000, "mixed-group")).document;
  assert.throws(() => moveArrangementClipGroup(grouped, first.id, 120),
    /ambos clips del crossfade/);
});
