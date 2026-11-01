import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
function fixture() {
  const base = createProjectDocument({ id: "clip-automation", at: 1 });
  const track = { id: "instrument", name: "Piano", kind: "instrument",
    instrument: { instrumentId: "salamander", packageVersion: "1", presetId: "grand" }, mix };
  const pattern = { id: "pattern", name: "Patrón", version: 1, lengthTicks: 960,
    notes: [], expression: [] };
  const clip = { id: "source-clip", kind: "pattern", trackId: track.id,
    sourceId: pattern.id, sourceVersion: 1, startTick: 0, lengthTicks: 960,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
    gainDb: 0, muted: false };
  const lane = { id: "clip-lane", target: { scope: "clip", ownerId: clip.id,
    parameterId: "gainDb" }, points: [
    { id: "point-a", tick: 0, value: -12, shape: "step" },
    { id: "point-b", tick: 480, value: -3, shape: "linear" },
  ] };
  return { ...base, tracks: [track], trackOrder: [track.id],
    patterns: [pattern], clips: [clip], automation: [lane] };
}

test("clip duplicate clones local automation IDs atomically with one undo and redo", () => {
  const before = fixture();
  validateProjectDocument(before);
  const command = { kind: "duplicateClipWithAutomation", clipId: "source-clip",
    expectedClip: before.clips[0], expectedLanes: before.automation,
    newClipId: "copied-clip", startTick: 1920,
    newLaneIds: ["copied-lane"], newPointIds: [["copied-a", "copied-b"]], at: 2 };
  const applied = applyCommand(before, command);
  assert.deepEqual(applied.document.clips.map((clip) => clip.id),
    ["source-clip", "copied-clip"]);
  assert.deepEqual(applied.document.automation.map((lane) => [lane.id,
    lane.target.ownerId, lane.points.map((point) => [point.id, point.tick])]), [
    ["clip-lane", "source-clip", [["point-a", 0], ["point-b", 480]]],
    ["copied-lane", "copied-clip", [["copied-a", 0], ["copied-b", 480]]],
  ]);
  const undone = applyCommand(applied.document, applied.inverse);
  assert.deepEqual(undone.document.clips, before.clips);
  assert.deepEqual(undone.document.automation, before.automation);
  const redone = applyCommand(undone.document, undone.inverse);
  assert.deepEqual(redone.document.clips, applied.document.clips);
  assert.deepEqual(redone.document.automation, applied.document.automation);
});

test("legacy duplicate refuses to drop lanes and clip-local points cannot leave the clip", () => {
  const before = fixture();
  assert.throws(() => applyCommand(before, { kind: "duplicateClip",
    clipId: "source-clip", newClipId: "copy", startTick: 960, at: 2 }),
  /duplicateClipWithAutomation/);
  assert.throws(() => applyCommand(before, { kind: "duplicateClipWithAutomation",
    clipId: "source-clip", expectedClip: before.clips[0], expectedLanes: [],
    newClipId: "copy", startTick: 960, newLaneIds: [], newPointIds: [], at: 2 }),
  /cambiaron/);
  assert.throws(() => validateProjectDocument({ ...before,
    automation: [{ ...before.automation[0], points: [before.automation[0].points[0],
      { ...before.automation[0].points[1], tick: 960 }] }] }),
  /ticks locales/);
  validateProjectDocument({ ...before, automation: [{ id: "future-lane",
    target: { scope: "track", ownerId: "instrument", parameterId: "retiredParameter" },
    points: [{ id: "future-point", tick: 0, value: 0.5, shape: "step" }] }] });
});

test("absolute audio duplicate moves microsecond anchors without changing source frames", () => {
  const base = createProjectDocument({ id: "absolute-duplicate", at: 1 });
  const asset = { id: "recorded", sha256: "a".repeat(64), byteLength: 96_044,
    mimeType: "audio/wav", sourceKind: "recorded", license: "user-owned",
    frameCount: 48_000, sampleRate: 48_000, channelCount: 1 };
  const clip = { id: "audio-clip", kind: "audio", trackId: "audio",
    sourceId: asset.id, startTick: 0, lengthTicks: 1920,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "continue",
    transpose: 0, gainDb: 0, muted: false, timeMode: "absolute",
    absoluteStartUs: 250, absoluteEndUs: 1_000_250,
    sourceStartFrame: 0, sourceEndFrame: 48_000,
    fadeInFrames: 0, fadeOutFrames: 0 };
  const before = { ...base, tracks: [{ id: "audio", name: "Audio", kind: "audio", mix }],
    trackOrder: ["audio"], assets: [asset], clips: [clip] };
  const applied = applyCommand(before, { kind: "duplicateClip",
    clipId: clip.id, newClipId: "audio-copy", startTick: 3840, at: 2 });
  const copy = applied.document.clips[1];
  assert.deepEqual([copy.absoluteStartUs, copy.absoluteEndUs, copy.startTick,
    copy.lengthTicks, copy.sourceStartFrame, copy.sourceEndFrame],
  [2_000_000, 3_000_000, 3840, 1920, 0, 48_000]);
  const exact = applyCommand(before, { kind: "duplicateClip",
    clipId: clip.id, newClipId: "exact-copy", startTick: 1920,
    absoluteStartUs: clip.absoluteEndUs, at: 2 }).document.clips[1];
  assert.deepEqual([exact.absoluteStartUs, exact.absoluteEndUs, exact.startTick,
    exact.lengthTicks], [1_000_250, 2_000_250, 1920, 1920]);
  assert.throws(() => applyCommand(before, { kind: "duplicateClip",
    clipId: clip.id, newClipId: "wrong-copy", startTick: 1920,
    absoluteStartUs: 1_001_000, at: 2 }), /Ancla absoluta/);
});
