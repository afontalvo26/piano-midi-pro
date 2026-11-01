import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { projectEffectParameters, numericProjectEffectParameter } from
  "../app/src/project/effectParameters.ts";

const effects = [
  { id: "eq", kind: "eq3", enabled: true,
    parameters: { lowDb: 0, midDb: -2, highDb: 1, lowHz: 200, highHz: 4000 } },
  { id: "filter", kind: "filter", enabled: true,
    parameters: { type: "lowpass", cutoffHz: 8000, q: 1 } },
  { id: "comp", kind: "compressor", enabled: true,
    parameters: { thresholdDb: -18, ratio: 4, attackMs: 15, releaseMs: 200, kneeDb: 6 } },
  { id: "sat", kind: "saturation", enabled: true,
    parameters: { drive: 0.25, wet: 0.5 } },
  { id: "verb", kind: "reverb", enabled: true,
    parameters: { roomSize: 0.5, dampeningHz: 4000, wet: 0.2 } },
  { id: "echo", kind: "delay", enabled: true,
    parameters: { timeMs: 250, feedback: 0.3, wet: 0.1 } },
  { id: "limit", kind: "limiter", enabled: true,
    parameters: { thresholdDb: -2 } },
];

function fixture() {
  const base = createProjectDocument({ id: "effect-catalog", at: 1 });
  const track = { id: "bus", name: "Bus", kind: "bus",
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] } };
  return { ...base, tracks: [track], trackOrder: [track.id] };
}

test("MIX-02 catalogue requires every exact parameter and range on all seven effects", () => {
  const before = fixture();
  const applied = applyCommand(before, { kind: "replaceTrackEffects", trackId: "bus",
    expected: [], effects, at: 2 });
  assert.equal(applied.document.tracks[0].mix.effects.length, 7);
  for (const effect of effects) assert.ok(projectEffectParameters(effect.kind)?.length);
  assert.deepEqual([numericProjectEffectParameter("filter", "cutoffHz")?.min,
    numericProjectEffectParameter("filter", "cutoffHz")?.max], [20, 20_000]);
  assert.equal(numericProjectEffectParameter("filter", "type"), undefined);
  assert.deepEqual(applyCommand(applied.document, applied.inverse).document.tracks,
    before.tracks);
  const wrong = (replacement) => ({ ...before, tracks: [{ ...before.tracks[0],
    mix: { ...before.tracks[0].mix, effects: [replacement] } }] });
  assert.throws(() => validateProjectDocument(wrong({ ...effects[0],
    parameters: { ...effects[0].parameters, lowDb: 19 } })), /lowDb/);
  assert.throws(() => validateProjectDocument(wrong({ ...effects[1],
    parameters: { ...effects[1].parameters, type: "bandpass" } })), /type/);
  assert.throws(() => validateProjectDocument(wrong({ ...effects[2],
    parameters: { thresholdDb: -18, ratio: 4, attackMs: 15, releaseMs: 200 } })), /catálogo/);
  assert.throws(() => validateProjectDocument(wrong({ ...effects[3],
    parameters: { ...effects[3].parameters, extra: 1 } })), /catálogo/);
  validateProjectDocument(wrong({ id: "future", kind: "third-party", enabled: true,
    parameters: { amount: 0.5 } }));
});

test("effect automation is bounded by its exact parameter and rejects dangling deletes", () => {
  const before = fixture();
  const withFx = applyCommand(before, { kind: "replaceMasterEffects", expected: [],
    effects: [{ ...effects[6], id: "master-limit" }], at: 2 }).document;
  const lane = { id: "limit-curve", target: { scope: "master", effectId: "master-limit",
    parameterId: "thresholdDb" }, points: [{ id: "point", tick: 0, value: -6,
    shape: "linear" }] };
  const withLane = applyCommand(withFx, { kind: "replaceAutomationLane", laneId: lane.id,
    expected: null, lane, at: 3 }).document;
  assert.throws(() => applyCommand(withLane, { kind: "replaceMasterEffects",
    expected: withLane.mix.masterEffects, effects: [], at: 4 }), /inexistente/);
  assert.throws(() => applyCommand(withFx, { kind: "replaceAutomationLane",
    laneId: lane.id, expected: null, lane: { ...lane,
      points: [{ ...lane.points[0], value: -25 }] }, at: 3 }), /thresholdDb|point/);
  assert.throws(() => applyCommand(withFx, { kind: "replaceAutomationLane",
    laneId: lane.id, expected: null, lane: { ...lane,
      target: { ...lane.target, parameterId: "missing" } }, at: 3 }), /numérico/);
});
