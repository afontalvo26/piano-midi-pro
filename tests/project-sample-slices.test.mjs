import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";

const pad = (index) => ({ id: `pad-${index}`, name: `Pad ${index}`,
  color: "#123456", midiNote: 36 + index, channel: 9, source: null,
  gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0,
  attackMs: 0, decayMs: 0, playMode: "oneShot", mute: false, solo: false,
  stepTicks: 240, stepCount: 16 });
const asset = { id: "break-asset", sha256: "a".repeat(64), byteLength: 96_044,
  mimeType: "audio/wav", sourceKind: "user", license: "user-owned",
  frameCount: 48_000, sampleRate: 48_000, channelCount: 1 };

function fixture() {
  const base = createProjectDocument({ id: "slice-project", at: 1 });
  const track = { id: "drum", name: "Batería", kind: "drum",
    drumRack: { pads: Array.from({ length: 16 }, (_, index) => pad(index)) },
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] } };
  return { ...base, tracks: [track], trackOrder: [track.id] };
}

test("one reversible slice command installs one immutable asset in two exact pad regions", () => {
  const before = fixture();
  validateProjectDocument(before);
  const command = { kind: "installSampleSlices", trackId: "drum",
    expectedRack: before.tracks[0].drumRack, asset,
    slices: [{ padId: "pad-0", startFrame: 0, endFrame: 12_345 },
      { padId: "pad-1", startFrame: 12_345, endFrame: 48_000 }], at: 2 };
  const applied = applyCommand(before, command);
  assert.deepEqual(applied.document.assets, [asset]);
  assert.deepEqual(applied.document.tracks[0].drumRack.pads.slice(0, 2).map((item) =>
    [item.source.assetId, item.source.sha256, item.startFrame, item.endFrame]), [
    [asset.id, asset.sha256, 0, 12_345],
    [asset.id, asset.sha256, 12_345, 48_000],
  ]);
  assert.deepEqual(applied.document.tracks[0].drumRack.pads.slice(2),
    before.tracks[0].drumRack.pads.slice(2));
  const undone = applyCommand(applied.document, applied.inverse);
  assert.deepEqual(undone.document.assets, before.assets);
  assert.deepEqual(undone.document.tracks, before.tracks);
  const redone = applyCommand(undone.document, undone.inverse);
  assert.deepEqual(redone.document.assets, [asset]);
  assert.deepEqual(redone.document.tracks[0].drumRack,
    applied.document.tracks[0].drumRack);
});

test("slicing rejects stale rack, duplicate pads, invalid frames and changed asset identity", () => {
  const before = fixture();
  const command = { kind: "installSampleSlices", trackId: "drum",
    expectedRack: before.tracks[0].drumRack, asset,
    slices: [{ padId: "pad-0", startFrame: 0, endFrame: 12_345 }], at: 2 };
  const applied = applyCommand(before, command).document;
  assert.throws(() => applyCommand(applied, { ...command, at: 3 }), /desactualizado/);
  assert.throws(() => applyCommand(before, { ...command,
    slices: [command.slices[0], command.slices[0]] }), /duplicado/);
  assert.throws(() => applyCommand(before, { ...command,
    slices: [{ padId: "pad-0", startFrame: 12_000, endFrame: 48_001 }] }), /fuera de frames/);
  assert.throws(() => applyCommand(before, { ...command,
    slices: [{ padId: "pad-absent", startFrame: 0, endFrame: 1 }] }), /inexistente/);
  assert.throws(() => applyCommand(before, { ...command,
    asset: { ...asset, mimeType: "audio/midi" } }), /audio propio/);
  assert.throws(() => applyCommand(applied, { ...command,
    expectedRack: applied.tracks[0].drumRack,
    asset: { ...asset, sha256: "b".repeat(64) }, at: 3 }), /metadatos diferentes/);
  assert.deepEqual(before.assets, []);
});

test("reassigning slices from an already-owned asset keeps its reference on undo", () => {
  const base = fixture();
  const before = { ...base, assets: [asset] };
  const command = { kind: "installSampleSlices", trackId: "drum",
    expectedRack: before.tracks[0].drumRack, asset,
    slices: [{ padId: "pad-5", startFrame: 100, endFrame: 200 }], at: 2 };
  const applied = applyCommand(before, command);
  assert.equal(applied.document.assets.length, 1);
  assert.equal(applied.document.tracks[0].drumRack.pads[5].endFrame, 200);
  const undone = applyCommand(applied.document, applied.inverse);
  assert.deepEqual(undone.document.assets, [asset]);
  assert.deepEqual(undone.document.tracks, before.tracks);
});
