import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { baseAutomationParameter } from "../app/src/project/automationParameters.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const gainLane = { id: "gain-lane", target: { scope: "track", ownerId: "track",
  parameterId: "gainDb" }, points: [
  { id: "gain-start", tick: 0, value: -12, shape: "linear" },
  { id: "gain-end", tick: 960, value: -3, shape: "step" },
] };
const eq = { id: "effect-eq", kind: "eq3", enabled: true,
  parameters: { lowDb: 0, midDb: 0, highDb: 0, lowHz: 500, highHz: 8000 } };
const filter = { id: "effect-filter", kind: "filter", enabled: false,
  parameters: { type: "lowpass", cutoffHz: 4000, q: 1 } };
function fixture() {
  const base = createProjectDocument({ id: "automation-cas", at: 1 });
  return { ...base, trackOrder: ["track"], tracks: [{ id: "track",
    name: "Pista", kind: "audio", mix }] };
}

test("automation lane CAS creates, edits, deletes and undoes without changing other lanes", () => {
  const before = fixture();
  assert.deepEqual([baseAutomationParameter(gainLane.target).min,
    baseAutomationParameter(gainLane.target).max,
    baseAutomationParameter(gainLane.target).smoothingMs], [-120, 24, 15]);
  const created = applyCommand(before, { kind: "replaceAutomationLane", laneId: gainLane.id,
    expected: null, lane: gainLane, at: 2 });
  assert.deepEqual(created.document.automation, [gainLane]);
  const editedLane = { ...gainLane, points: gainLane.points.map((point, index) => index === 1
    ? { ...point, value: -6 } : point) };
  const edited = applyCommand(created.document, { kind: "replaceAutomationLane",
    laneId: gainLane.id, expected: gainLane, lane: editedLane, at: 3 });
  assert.equal(edited.document.automation[0].points[1].value, -6);
  assert.deepEqual(applyCommand(edited.document, edited.inverse).document.automation,
    created.document.automation);
  const removed = applyCommand(created.document, { kind: "replaceAutomationLane",
    laneId: gainLane.id, expected: gainLane, lane: null, at: 4 });
  assert.deepEqual(removed.document.automation, []);
  assert.deepEqual(applyCommand(removed.document, removed.inverse).document.automation, [gainLane]);
  assert.throws(() => applyCommand(created.document, { kind: "replaceAutomationLane",
    laneId: gainLane.id, expected: null, lane: editedLane, at: 5 }), /desactualizado/);
  assert.throws(() => validateProjectDocument({ ...created.document,
    automation: [{ ...gainLane, points: [{ ...gainLane.points[0], value: 25 }] }] }),
  /fuera de -120\.\.24/);
  assert.throws(() => validateProjectDocument({ ...created.document,
    automation: [{ ...gainLane, writeMode: "latch" }] }), /writeMode/);
  assert.deepEqual(applyCommand(created.document, created.inverse).document.automation,
    before.automation);
});

test("effect chain CAS preserves fader and order; referenced effects cannot disappear", () => {
  const before = fixture();
  const inserted = applyCommand(before, { kind: "replaceTrackEffects", trackId: "track",
    expected: [], effects: [eq, filter], at: 2 });
  assert.deepEqual(inserted.document.tracks[0].mix.effects, [eq, filter]);
  assert.equal(inserted.document.tracks[0].mix.gainDb, 0);
  const lane = { id: "eq-lane", target: { scope: "track", ownerId: "track",
    effectId: eq.id, parameterId: "lowHz" },
  points: [{ id: "eq-point", tick: 0, value: 600, shape: "linear" }] };
  const automated = applyCommand(inserted.document, { kind: "replaceAutomationLane",
    laneId: lane.id, expected: null, lane, at: 3 }).document;
  const reordered = applyCommand(automated, { kind: "replaceTrackEffects", trackId: "track",
    expected: [eq, filter], effects: [filter, eq], at: 4 });
  assert.deepEqual(reordered.document.tracks[0].mix.effects, [filter, eq]);
  assert.throws(() => applyCommand(reordered.document, { kind: "replaceTrackEffects",
    trackId: "track", expected: [filter, eq], effects: [filter], at: 5 }),
  /efecto automatizado inexistente/);
  assert.deepEqual(applyCommand(reordered.document, reordered.inverse).document.tracks[0].mix.effects,
    [eq, filter]);
  assert.throws(() => applyCommand(automated, { kind: "replaceTrackEffects",
    trackId: "track", expected: [], effects: [eq], at: 4 }), /desactualizado/);
});

test("master effects have independent reversible CAS", () => {
  const before = fixture();
  const inserted = applyCommand(before, { kind: "replaceMasterEffects",
    expected: [], effects: [filter], at: 2 });
  assert.deepEqual(inserted.document.mix.masterEffects, [filter]);
  assert.equal(inserted.document.mix.masterGainDb, before.mix.masterGainDb);
  assert.deepEqual(applyCommand(inserted.document, inserted.inverse).document.mix,
    before.mix);
});
