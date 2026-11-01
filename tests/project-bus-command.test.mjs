import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";

const mix = () => ({ gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] });

test("existing track commands create and undo a bus without changing unrelated tracks", () => {
  const original = createProjectDocument({ id: "bus-command", at: 1 });
  const source = applyCommand(original, { kind: "createTrack", at: 2,
    track: { id: "audio-source", name: "Fuente", kind: "audio", mix: mix() } }).document;
  const created = applyCommand(source, { kind: "createTrack", at: 3,
    track: { id: "bus-main", name: "Bus principal", kind: "bus", mix: mix() } });
  assert.deepEqual(created.document.trackOrder, ["audio-source", "bus-main"]);
  assert.equal(created.inverse.kind, "removeTrack");
  const restored = applyCommand(created.document, created.inverse).document;
  assert.deepEqual(restored.trackOrder, source.trackOrder);
  assert.deepEqual(restored.tracks, source.tracks);
});

test("bus removal is blocked while routed sources depend on it, then succeeds reversibly", () => {
  let document = createProjectDocument({ id: "bus-route", at: 1 });
  document = applyCommand(document, { kind: "createTrack", at: 2,
    track: { id: "audio-source", name: "Fuente", kind: "audio", mix: mix() } }).document;
  document = applyCommand(document, { kind: "createTrack", at: 3,
    track: { id: "bus-main", name: "Bus principal", kind: "bus", mix: mix() } }).document;
  const source = document.tracks[0];
  document = applyCommand(document, { kind: "replaceTrackMix", trackId: source.id,
    expected: source.mix, mix: { ...source.mix, outputBusTrackId: "bus-main" }, at: 4 }).document;
  assert.throws(() => applyCommand(document, { kind: "removeTrack", trackId: "bus-main", at: 5 }),
    /bus destino inexistente/);
  const routed = document.tracks[0];
  document = applyCommand(document, { kind: "replaceTrackMix", trackId: routed.id,
    expected: routed.mix, mix: mix(), at: 5 }).document;
  const removed = applyCommand(document, { kind: "removeTrack", trackId: "bus-main", at: 6 });
  assert.deepEqual(removed.document.trackOrder, ["audio-source"]);
  assert.deepEqual(applyCommand(removed.document, removed.inverse).document.tracks, document.tracks);
});
