import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { validateProjectAudioRecordingPlan } from "../app/src/project/audioRecordingPlan.ts";
import { prepareAudioTakePlacement } from "../app/src/project/audioTakePlacement.ts";
import { MusicalClock } from "../app/src/sequencer/musicalClock.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const asset = (id) => ({ id, sha256: "a".repeat(64), byteLength: 192_044,
  mimeType: "audio/wav", sourceKind: "recorded", license: "user-owned",
  frameCount: 96_000, sampleRate: 48_000, channelCount: 1 });
const capture = (startTick, startAudioTime, offset = 480) => ({
  startTick, startAudioTime, frameCount: 96_000, sampleRate: 48_000,
  channelCount: 1, latencyOffsetFrames: offset, incomplete: false,
});
const clip = (id, sourceId, sourceTakeId, startTick, absoluteStartUs) => ({
  id, kind: "audio", trackId: "audio", sourceId, sourceTakeId,
  startTick, lengthTicks: 3840, sourceOffsetTick: 0, loopMode: "none",
  tailPolicy: "continue", transpose: 0, gainDb: 0, muted: false,
  timeMode: "absolute", absoluteStartUs, absoluteEndUs: absoluteStartUs + 2_000_000,
  sourceStartFrame: 0, sourceEndFrame: 96_000, fadeInFrames: 0, fadeOutFrames: 0,
});
function fixture() {
  const base = createProjectDocument({ id: "capture-comp-project", at: 1 });
  return { ...base, trackOrder: ["audio"], tracks: [{ id: "audio",
    name: "Audio", kind: "audio", mix }],
  assets: [asset("asset-one"), asset("asset-two")],
  takes: [{ id: "take-one", kind: "audio", assetId: "asset-one", createdAt: 1,
    audioCapture: capture(1920, 1) },
  { id: "take-two", kind: "audio", assetId: "asset-two", createdAt: 1,
    audioCapture: { ...capture(4800, 2.5), punch: { startTick: 4800,
      endTick: 8640, startAudioTime: 2.5, endAudioTime: 4.5 } } }],
  clips: [clip("clip-one", "asset-one", "take-one", 1901, 990_000)] };
}

test("transient count-in/punch plan obeys 4 bars and AudioContext scheduling window", () => {
  const document = fixture();
  validateProjectAudioRecordingPlan(document, { startTick: 3840, countInBars: 4,
    punch: { startTick: 3840, endTick: 7680 } });
  assert.throws(() => validateProjectAudioRecordingPlan(document,
    { startTick: 0, countInBars: 5 }), /count-in/);
  assert.throws(() => validateProjectAudioRecordingPlan(document,
    { startTick: 3840, countInBars: 1,
      punch: { startTick: 0, endTick: 7680 } }), /Punch/);
  assert.throws(() => validateProjectAudioRecordingPlan(document,
    { startTick: 3840, countInBars: 4,
      punch: { startTick: 3840, endTick: 124_800 } }), /60 segundos/);
});

test("latency CAS moves linked absolute clips by exact frame delta and undo restores legacy metadata", () => {
  const before = fixture();
  validateProjectDocument(before);
  const changed = applyCommand(before, { kind: "setAudioTakeLatency", takeId: "take-one",
    expectedOffsetFrames: 480, offsetFrames: 960, at: 2 });
  const aligned = changed.document.clips[0];
  assert.deepEqual([aligned.absoluteStartUs, aligned.absoluteEndUs,
    aligned.startTick, aligned.lengthTicks], [980_000, 2_980_000, 1882, 3840]);
  assert.deepEqual([aligned.sourceStartFrame, aligned.sourceEndFrame], [0, 96_000]);
  assert.deepEqual(changed.document.takes[0].audioCapture.capturedLatencyOffsetFrames, 480);
  const restored = applyCommand(changed.document, changed.inverse).document;
  assert.deepEqual(restored.clips, before.clips);
  assert.deepEqual(restored.takes, before.takes);
  assert.throws(() => applyCommand(before, { kind: "setAudioTakeLatency",
    takeId: "take-one", expectedOffsetFrames: 0, offsetFrames: 960, at: 2 }), /desactualizado/);
  assert.throws(() => applyCommand(before, { kind: "setAudioTakeLatency",
    takeId: "take-one", expectedOffsetFrames: 480, offsetFrames: 96_001, at: 2 }), /±2/);
  const atZero = { ...before, clips: [{ ...before.clips[0], absoluteStartUs: 0,
    absoluteEndUs: 2_000_000, startTick: 0 }] };
  assert.throws(() => applyCommand(atZero, { kind: "setAudioTakeLatency",
    takeId: "take-one", expectedOffsetFrames: 480, offsetFrames: 960, at: 2 }), /pre-roll/);
});

test("new take placement compensates once, stores baseline, and refuses negative pre-roll", () => {
  const document = fixture();
  const prepared = prepareAudioTakePlacement(document, document.takes[0], document.assets[0],
    { clipId: "new-take-clip", trackId: "audio" });
  assert.deepEqual([prepared.clip.absoluteStartUs, prepared.clip.absoluteEndUs,
    prepared.clip.startTick, prepared.clip.lengthTicks,
    prepared.clip.sourceTakeId], [990_000, 2_990_000, 1901, 3840, "take-one"]);
  assert.equal(prepared.take.audioCapture.capturedLatencyOffsetFrames, 480);
  const placed = { ...document, takes: [prepared.take, document.takes[1]],
    clips: [prepared.clip] };
  validateProjectDocument(placed);
  const sameOffset = applyCommand(placed, { kind: "setAudioTakeLatency",
    takeId: "take-one", expectedOffsetFrames: 480, offsetFrames: 480, at: 2 });
  assert.equal(sameOffset.document.clips[0].absoluteStartUs, 990_000);
  assert.throws(() => prepareAudioTakePlacement(document,
    { ...document.takes[0], audioCapture: { ...document.takes[0].audioCapture,
      startTick: 0 } }, document.assets[0], { clipId: "bad", trackId: "audio" }), /pre-roll/);
});

test("confirmed sub-tick project microseconds survive placement without tick rounding", () => {
  const document = fixture();
  const take = { ...document.takes[0], audioCapture: {
    ...document.takes[0].audioCapture, startProjectUs: 1_000_250 } };
  const withTake = { ...document, takes: [take, document.takes[1]] };
  validateProjectDocument(withTake);
  const prepared = prepareAudioTakePlacement(withTake, take, document.assets[0],
    { clipId: "sub-tick-clip", trackId: "audio" });
  assert.deepEqual([prepared.clip.absoluteStartUs, prepared.clip.absoluteEndUs],
    [990_250, 2_990_250]);
  assert.equal(prepared.take.audioCapture.startProjectUs, 1_000_250);
  const placed = { ...withTake, takes: [prepared.take, document.takes[1]],
    clips: [prepared.clip] };
  validateProjectDocument(placed);
  const retimed = applyCommand(placed, { kind: "replaceTempoMap",
    tempoMap: [{ tick: 0, microsPerQuarter: 1_000_000 }], at: 2 }).document;
  assert.equal(retimed.takes[0].audioCapture.startTick, 1920);
  assert.equal(retimed.takes[0].audioCapture.startProjectUs, 1_000_250);
  assert.equal(retimed.clips[0].absoluteStartUs, 990_250);
  assert.notEqual(retimed.clips[0].startTick, prepared.clip.startTick);
  validateProjectDocument(retimed);
  assert.throws(() => validateProjectDocument({ ...withTake,
    takes: [{ ...take, audioCapture: { ...take.audioCapture,
      startProjectUs: Number.MAX_SAFE_INTEGER + 1 } }, document.takes[1]] }), /startProjectUs/);
});

test("comp references audible clip/take regions with one atomic inverse and explicit crossfade", () => {
  const before = fixture();
  const second = clip("clip-two", "asset-two", "take-two", 4781, 2_490_000);
  const fade = { id: "fade", outgoingClipId: "clip-one",
    incomingClipId: "clip-two", curve: "equalPower" };
  const comp = { id: "comp-one", name: "Mejor toma", trackId: "audio", segments: [
    { id: "segment-one", clipId: "clip-one", takeId: "take-one" },
    { id: "segment-two", clipId: "clip-two", takeId: "take-two" },
  ] };
  const applied = applyCommand(before, { kind: "replaceAudioComposition",
    expected: { clips: before.clips, audioCrossfades: undefined, audioComps: undefined },
    clips: [...before.clips, second], audioCrossfades: [fade], audioComps: [comp], at: 2 });
  assert.equal(applied.document.audioComps[0].segments.length, 2);
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document.clips, before.clips);
  assert.equal(applyCommand(applied.document, applied.inverse).document.audioComps, undefined);
  assert.throws(() => applyCommand(applied.document, { kind: "replaceAudioComps",
    expected: [comp], comps: [{ ...comp, segments: [{ ...comp.segments[0],
      takeId: "take-two" }, comp.segments[1]] }], at: 3 }), /incompatibles/);
  assert.throws(() => applyCommand(applied.document, { kind: "splitAudioClip",
    clipId: "clip-one", newClipId: "split", splitUs: 1_200_000, at: 3 }), /crossfade/);
  const singleComp = { ...comp, segments: [comp.segments[0]] };
  const onlyComp = applyCommand(before, { kind: "replaceAudioComps",
    expected: undefined, comps: [singleComp], at: 2 });
  assert.throws(() => applyCommand(onlyComp.document, { kind: "splitAudioClip",
    clipId: "clip-one", newClipId: "split", splitUs: 1_200_000, at: 3 }), /comp juntos/);
  assert.throws(() => applyCommand(before, { kind: "replaceAudioComps",
    expected: undefined, comps: [comp], at: 2 }), /incompatibles/);
});

test("full arrangement CAS clones audio fades, comp and clip lane with one reversible section edit", () => {
  const base = fixture();
  const second = clip("clip-two", "asset-two", "take-two", 4781, 2_490_000);
  const fade = { id: "fade", outgoingClipId: "clip-one",
    incomingClipId: "clip-two", curve: "equalPower" };
  const comp = { id: "comp", name: "Comp", trackId: "audio", segments: [
    { id: "seg-one", clipId: "clip-one", takeId: "take-one" },
    { id: "seg-two", clipId: "clip-two", takeId: "take-two" },
  ] };
  const lane = { id: "clip-lane", target: { scope: "clip", ownerId: "clip-one",
    parameterId: "gainDb" }, points: [{ id: "lane-point", tick: 0,
    value: -6, shape: "step" }] };
  const section = { id: "section-one", name: "Original", startTick: 0,
    lengthTicks: 9600 };
  const before = { ...base, clips: [base.clips[0], second],
    audioCrossfades: [fade], audioComps: [comp], automation: [lane],
    sections: [section] };
  validateProjectDocument(before);
  const clock = new MusicalClock(before.tempoMap, before.meterMap);
  const destination = 10_000;
  const deltaUs = Math.round(clock.tickToSeconds(destination) * 1_000_000);
  const copy = (source, id) => {
    const absoluteStartUs = source.absoluteStartUs + deltaUs;
    const absoluteEndUs = source.absoluteEndUs + deltaUs;
    const startTick = clock.secondsToTick(absoluteStartUs / 1_000_000);
    return { ...source, id, absoluteStartUs, absoluteEndUs,
      startTick, lengthTicks: clock.secondsToTick(absoluteEndUs / 1_000_000) - startTick };
  };
  const copiedClips = [copy(before.clips[0], "clip-one-copy"),
    copy(before.clips[1], "clip-two-copy")];
  const next = { clips: [...before.clips, ...copiedClips],
    sections: [...before.sections, { ...section, id: "section-copy",
      name: "Copia", startTick: destination }],
    automation: [...before.automation, { ...lane, id: "lane-copy",
      target: { ...lane.target, ownerId: "clip-one-copy" },
      points: [{ ...lane.points[0], id: "point-copy" }] }],
    audioCrossfades: [...before.audioCrossfades, { ...fade,
      id: "fade-copy", outgoingClipId: "clip-one-copy",
      incomingClipId: "clip-two-copy" }],
    audioComps: [...before.audioComps, { ...comp, id: "comp-copy", segments: [
      { id: "seg-one-copy", clipId: "clip-one-copy", takeId: "take-one" },
      { id: "seg-two-copy", clipId: "clip-two-copy", takeId: "take-two" },
    ] }],
  };
  const expected = { clips: before.clips, sections: before.sections,
    automation: before.automation, audioCrossfades: before.audioCrossfades,
    audioComps: before.audioComps };
  const applied = applyCommand(before, { kind: "replaceFullArrangement",
    expected, ...next, at: 2 });
  assert.deepEqual([applied.document.clips.length, applied.document.sections.length,
    applied.document.automation.length, applied.document.audioCrossfades.length,
    applied.document.audioComps.length], [4, 2, 2, 2, 2]);
  const undone = applyCommand(applied.document, applied.inverse).document;
  for (const key of Object.keys(expected)) assert.deepEqual(undone[key], before[key]);
  assert.throws(() => applyCommand(before, { kind: "replaceFullArrangement",
    expected: { ...expected, audioCrossfades: [] }, ...next, at: 2 }), /desactualizado/);
  assert.throws(() => applyCommand(before, { kind: "replaceFullArrangement",
    expected, ...next, audioCrossfades: before.audioCrossfades, at: 2 }), /crossfade|solap/);
});
