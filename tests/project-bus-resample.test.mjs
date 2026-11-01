import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { prepareBusResampleInstall } from "../app/src/project/busResampleInstall.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const filter = { id: "source-filter", kind: "filter", enabled: true,
  parameters: { type: "lowpass", cutoffHz: 1200, q: 1 } };
const source = { id: "source-track", name: "Fuente", kind: "audio",
  mix: { ...mix, outputBusTrackId: "source-bus", effects: [filter] } };
const bus = { id: "source-bus", name: "Bus", kind: "bus", mix };
const destination = { id: "destination-track", name: "Render", kind: "audio", mix };
const asset = { id: "resample-wav", sha256: "a".repeat(64), byteLength: 288_044,
  mimeType: "audio/wav", sourceKind: "recorded", license: "user-owned",
  frameCount: 72_000, sampleRate: 48_000, channelCount: 2 };
const provenance = { sourceBusTrackId: bus.id, destinationTrackId: destination.id,
  sourceRevision: 1, sourceHash: "b".repeat(64), startTick: 1920, endTick: 3840,
  tap: "post-bus-pre-master", sourceTrackIds: [source.id],
  includedEffectIds: [filter.id], seed: "resample-seed", sampleRate: 48_000,
  channelCount: 2, frameCount: 72_000, tailFrames: 24_000,
  rendererVersion: "bus-resample-v1" };

function fixture() {
  const base = createProjectDocument({ id: "resample-project", at: 1 });
  return { ...base, tracks: [source, bus, destination],
    trackOrder: [source.id, bus.id, destination.id] };
}

function command(document, settings = provenance) {
  const { take, clip } = prepareBusResampleInstall(document, asset, settings,
    { takeId: "resample-take", clipId: "resample-clip", at: 2 });
  return { kind: "installBusResample", asset, take, clip,
    expectedSourceBus: bus, expectedDestinationTrack: destination, at: 2 };
}

test("bus resample installs one full WAV with tail, then Undo restores source document", () => {
  const before = fixture();
  validateProjectDocument(before);
  const prepared = command(before);
  assert.deepEqual([prepared.clip.absoluteStartUs, prepared.clip.absoluteEndUs,
    prepared.clip.startTick, prepared.clip.lengthTicks,
    prepared.clip.sourceStartFrame, prepared.clip.sourceEndFrame],
  [1_000_000, 2_500_000, 1920, 2880, 0, 72_000]);
  const applied = applyCommand(before, prepared);
  assert.equal(applied.document.takes[0].audioCapture, undefined);
  assert.deepEqual(applied.document.takes[0].audioResample, provenance);
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document, before);
  const historical = { ...applied.document,
    tracks: [{ ...source, mix: { ...mix, effects: [filter] } }, destination],
    trackOrder: [source.id, destination.id] };
  validateProjectDocument(historical); // A later deleted source bus cannot corrupt the immutable take.
});

test("bus resample rejects stale routing, self feedback, forged FX and mixed mic provenance", () => {
  const before = fixture();
  assert.throws(() => applyCommand(before, { ...command(before),
    expectedSourceBus: { ...bus, name: "Viejo" } }), /desactualizado/);
  const self = { ...provenance, sourceTrackIds: [destination.id] };
  assert.throws(() => applyCommand(before, command(before, self)), /destino|Fuente/);
  const forged = { ...provenance, includedEffectIds: ["master-fx"] };
  assert.throws(() => applyCommand(before, command(before, forged)), /efectos fuera/);
  const valid = applyCommand(before, command(before)).document;
  assert.throws(() => validateProjectDocument({ ...valid, takes: [{ ...valid.takes[0],
    audioCapture: {} }] }), /excluyentes/);
  assert.throws(() => validateProjectDocument({ ...valid, takes: [{ ...valid.takes[0],
    audioResample: { ...provenance, tailFrames: 72_001 } }] }), /tailFrames/);
});
