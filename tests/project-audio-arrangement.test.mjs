import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const asset = (id) => ({ id, sha256: "a".repeat(64), byteLength: 192_000,
  mimeType: "audio/wav", sourceKind: "recorded", license: "user-owned",
  frameCount: 192_000, sampleRate: 48_000, channelCount: 1 });
const clip = (id, sourceId, startTick = 0, lengthTicks = 3840) => ({
  id, kind: "audio", trackId: "audio", sourceId, startTick, lengthTicks,
  sourceOffsetTick: 0, loopMode: "none", tailPolicy: "continue", transpose: 0,
  gainDb: 0, muted: false, sourceStartFrame: 0, sourceEndFrame: 96_000,
  fadeInFrames: 1000, fadeOutFrames: 1000,
});
function fixture() {
  const base = createProjectDocument({ id: "audio-arrangement", at: 1 });
  return { ...base, trackOrder: ["audio"], tracks: [{ id: "audio", name: "Audio",
    kind: "audio", mix }], assets: [asset("first"), asset("second"), asset("third")],
    clips: [clip("left", "first")] };
}

test("old beat JSON validates; split keeps exact contiguous source frames and original fade anchors", () => {
  const before = fixture();
  validateProjectDocument(before);
  const command = { kind: "splitAudioClip", clipId: "left", newClipId: "right",
    splitTick: 1920, at: 2 };
  const applied = applyCommand(before, command);
  const [left, right] = applied.document.clips;
  assert.deepEqual([left.sourceStartFrame, left.sourceEndFrame,
    right.sourceStartFrame, right.sourceEndFrame], [0, 48_000, 48_000, 96_000]);
  assert.deepEqual([left.envelopeStartFrame, left.envelopeEndFrame,
    right.envelopeStartFrame, right.envelopeEndFrame], [0, 96_000, 0, 96_000]);
  const undone = applyCommand(applied.document, applied.inverse).document;
  assert.deepEqual(undone.clips, before.clips);
  assert.equal(Object.hasOwn(undone, "audioCrossfades"), false);
  assert.deepEqual(applyCommand(undone, command).document.clips, applied.document.clips);
});

test("absolute microseconds survive tempo changes and split at frame precision", () => {
  const first = { ...clip("left", "first"), timeMode: "absolute",
    absoluteStartUs: 0, absoluteEndUs: 2_000_000 };
  const before = { ...fixture(), clips: [first] };
  validateProjectDocument(before);
  const split = applyCommand(before, { kind: "splitAudioClip", clipId: "left",
    newClipId: "right", splitUs: 1_000_000, at: 2 });
  assert.deepEqual(split.document.clips.map((item) => [item.startTick, item.lengthTicks,
    item.sourceStartFrame, item.sourceEndFrame, item.absoluteStartUs, item.absoluteEndUs]),
  [[0, 1920, 0, 48_000, 0, 1_000_000],
    [1920, 1920, 48_000, 96_000, 1_000_000, 2_000_000]]);
  const slowed = applyCommand(split.document, { kind: "replaceTempoMap",
    tempoMap: [{ tick: 0, microsPerQuarter: 1_000_000 }], at: 3 });
  assert.deepEqual(slowed.document.clips.map((item) => [item.startTick,
    item.lengthTicks, item.absoluteStartUs, item.absoluteEndUs]),
  [[0, 960, 0, 1_000_000], [960, 960, 1_000_000, 2_000_000]]);
  assert.deepEqual(applyCommand(slowed.document, slowed.inverse).document.clips,
    split.document.clips);
});

test("atomic CAS crossfade validates two owned sources and rejects triple overlap", () => {
  const before = fixture();
  const incoming = clip("right", "second", 2880, 3840);
  const fade = { id: "fade-one", outgoingClipId: "left",
    incomingClipId: "right", curve: "equalPower" };
  const command = { kind: "replaceAudioArrangement", expected: {
    clips: before.clips, audioCrossfades: undefined },
    clips: [...before.clips, incoming], audioCrossfades: [fade], at: 2 };
  const applied = applyCommand(before, command);
  assert.deepEqual(applied.document.audioCrossfades, [fade]);
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document.clips, before.clips);
  assert.throws(() => applyCommand(applied.document, command), /desactualizado/);
  assert.throws(() => applyCommand(applied.document, { kind: "splitAudioClip",
    clipId: "left", newClipId: "split", splitTick: 100, at: 3 }), /crossfade/);
  const third = clip("third-clip", "third", 3000, 960);
  assert.throws(() => validateProjectDocument({ ...applied.document,
    clips: [...applied.document.clips, third] }), /tercer clip/);
  assert.throws(() => validateProjectDocument({ ...applied.document,
    audioCrossfades: [fade, { ...fade, id: "fade-two" }] }), /duplicado/);
});

test("absolute anchors reject stale tick projection and missing frame metadata", () => {
  const first = { ...clip("left", "first"), timeMode: "absolute",
    absoluteStartUs: 0, absoluteEndUs: 2_000_000 };
  const before = { ...fixture(), clips: [first] };
  assert.throws(() => validateProjectDocument({ ...before,
    clips: [{ ...first, startTick: 1 }] }), /no coinciden/);
  assert.throws(() => validateProjectDocument({ ...before,
    clips: [{ ...first, sourceEndFrame: 24_000 }] }), /sin time-stretch/);
  assert.throws(() => validateProjectDocument({ ...before,
    assets: [{ ...before.assets[0], sampleRate: undefined }, ...before.assets.slice(1)] }),
  /no serializable|sample rate/);
  assert.throws(() => applyCommand(before, { kind: "splitAudioClip", clipId: "left",
    newClipId: "right", splitTick: 1920, at: 2 }), /µs/);
});
