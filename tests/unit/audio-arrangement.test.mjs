import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { validateProjectDocument } from "../../app/src/project/validate.ts";
import { applyCommand } from "../../app/src/project/commands.ts";
import { addArrangementAudioCrossfade, audioClipBoundsUs, audioCrossfadeCandidates,
  duplicateArrangementAudioClip, editArrangementAudioClip, removeArrangementAudioClip,
  removeArrangementAudioCrossfade, shiftArrangementAudioClip,
  splitArrangementAudioClip } from "../../app/src/composition/audioArrangement.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
const track = { id: "audio-track", name: "Voz", kind: "audio", mix };
const asset = { id: "audio-asset", sha256: "a".repeat(64), byteLength: 96000,
  mimeType: "audio/wav", sourceKind: "recorded", license: "Propio", frameCount: 48000,
  sampleRate: 48000, channelCount: 1 };
const outgoing = { id: "out", kind: "audio", trackId: track.id, sourceId: asset.id,
  startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0,
  loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: -2, muted: false,
  sourceStartFrame: 0, sourceEndFrame: 48000, fadeInFrames: 0, fadeOutFrames: 0 };
const incoming = { ...outgoing, id: "in", startTick: 960, lengthTicks: 1920,
  timeMode: "absolute", absoluteStartUs: 499740, absoluteEndUs: 1499740,
  envelopeStartFrame: 0, envelopeEndFrame: 48000 };
const base = { ...createProjectDocument({ id: "audio-arrangement", at: 1000 }),
  tracks: [track], trackOrder: [track.id], assets: [asset], clips: [outgoing, incoming] };
validateProjectDocument(base);

test("modo absoluto y movimiento actualizan ticks proyectados en un comando reversible", () => {
  const edited = applyCommand(base, editArrangementAudioClip(base, incoming.id, {
    timeMode: "absolute", startTick: 960, lengthTicks: 1920,
    absoluteStartUs: 600000, absoluteEndUs: 1600000,
    sourceStartFrame: 0, sourceEndFrame: 48000, fadeInFrames: 0,
    fadeOutFrames: 0, gainDb: -2, muted: false, tailPolicy: "cut",
  }, 1001));
  const clip = edited.document.clips.find((item) => item.id === "in");
  assert.deepEqual([clip.startTick, clip.lengthTicks, clip.absoluteStartUs,
    clip.absoluteEndUs], [1152, 1920, 600000, 1600000]);
  assert.deepEqual(applyCommand(edited.document, edited.inverse).document.clips, base.clips);
  const shifted = applyCommand(base, shiftArrangementAudioClip(base, "in", 240, 1002));
  const shiftedClip = shifted.document.clips.find((item) => item.id === "in");
  assert.deepEqual([shiftedClip.absoluteStartUs, shiftedClip.absoluteEndUs,
    shiftedClip.startTick], [624740, 1624740, 1200]);
  assert.deepEqual(audioClipBoundsUs(shifted.document, shiftedClip),
    { startUs: 624740, endUs: 1624740 });
});

test("crossfade dual CAS, retiro, split de frames contiguos y undo", () => {
  assert.deepEqual(audioCrossfadeCandidates(base, "out").map((clip) => clip.id), ["in"]);
  const added = applyCommand(base,
    addArrangementAudioCrossfade(base, "out", "in", "equalPower", 1001, "fade-1"));
  assert.equal(added.document.audioCrossfades.length, 1);
  assert.deepEqual(audioCrossfadeCandidates(added.document, "out"), []);
  assert.throws(() => splitArrangementAudioClip(added.document, "in", 1920), /Retira el crossfade/);
  const removed = applyCommand(added.document,
    removeArrangementAudioCrossfade(added.document, "fade-1", 1002));
  const split = applyCommand(removed.document,
    splitArrangementAudioClip(removed.document, "in", 1920, 1003, "in-right"));
  const [left, right] = split.document.clips.filter((clip) => clip.id === "in" || clip.id === "in-right");
  assert.equal(left.sourceEndFrame, right.sourceStartFrame);
  assert.deepEqual([left.envelopeStartFrame, left.envelopeEndFrame,
    right.envelopeStartFrame, right.envelopeEndFrame], [0, 48000, 0, 48000]);
  assert.equal(left.absoluteEndUs, right.absoluteStartUs);
  assert.deepEqual(applyCommand(split.document, split.inverse).document.clips, removed.document.clips);
  assert.deepEqual(applyCommand(added.document, added.inverse).document.audioCrossfades,
    base.audioCrossfades);
});

test("duplicar absoluto desplaza anclas µs; borrar elimina su crossfade en un solo undo", () => {
  const copied = applyCommand(base, duplicateArrangementAudioClip(base, "in", 1001, "in-copy"));
  const copy = copied.document.clips.find((clip) => clip.id === "in-copy");
  assert.deepEqual([copy.absoluteStartUs, copy.absoluteEndUs,
    copy.startTick, copy.lengthTicks], [1499740, 2499740, 2880, 1920]);
  const withFade = applyCommand(base,
    addArrangementAudioCrossfade(base, "out", "in", "linear", 1002, "fade-1"));
  const deleted = applyCommand(withFade.document,
    removeArrangementAudioClip(withFade.document, "in", 1003));
  assert.equal(deleted.document.clips.some((clip) => clip.id === "in"), false);
  assert.deepEqual(deleted.document.audioCrossfades, []);
  const undone = applyCommand(deleted.document, deleted.inverse).document;
  assert.deepEqual(undone.clips, withFade.document.clips);
  assert.deepEqual(undone.audioCrossfades, withFade.document.audioCrossfades);
});

test("duplicar audio absoluto con curva conserva µs sub-tick y puntos locales", () => {
  const lane = { id: "audio-gain", target: { scope: "clip", ownerId: incoming.id,
    parameterId: "gainDb" }, writeMode: "read", points: [
    { id: "audio-point-a", tick: 120, value: -2, shape: "step" },
    { id: "audio-point-b", tick: 1200, value: -4, shape: "linear" },
  ] };
  const source = { ...base, automation: [lane] };
  const command = duplicateArrangementAudioClip(source, incoming.id, 1001, "in-copy");
  assert.equal(command.kind, "duplicateClipWithAutomation");
  assert.equal(command.absoluteStartUs, 1_499_740);
  const copied = applyCommand(source, command);
  const copy = copied.document.clips.find((item) => item.id === "in-copy");
  assert.deepEqual([copy.absoluteStartUs, copy.absoluteEndUs, copy.startTick],
    [1_499_740, 2_499_740, 2880]);
  assert.equal(copied.document.automation[1].target.ownerId, "in-copy");
  assert.deepEqual(copied.document.automation[1].points.map((point) => point.tick), [120, 1200]);
  assert.notEqual(copied.document.automation[1].points[0].id, lane.points[0].id);
  assert.deepEqual(applyCommand(copied.document, copied.inverse).document, source);
});
