import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { applyCommand } from "../../app/src/project/commands.ts";
import { addAutomationPoint, copyAutomationPoints, copySelectedAutomationPoints,
  createBaseAutomationLane, deleteAutomationLane, deleteAutomationPoint,
  deleteSelectedAutomationPoints, moveAutomationPoint, moveSelectedAutomationPoints,
  pasteAutomationPoints,
  setAutomationWriteMode } from "../../app/src/composition/automationEdit.ts";
import { automationLowerBound, automationValueAtTick, hitAutomationPoint,
  visibleAutomationPointRange } from "../../app/src/composition/automationCanvas.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
const track = { id: "piano", name: "Piano", kind: "instrument", mix };
const base = { ...createProjectDocument({ id: "aut-edit", at: 1000 }),
  tracks: [track], trackOrder: [track.id] };

test("lane de gain y puntos exactos usan CAS reversible y rechazan tick duplicado", () => {
  const created = applyCommand(base, createBaseAutomationLane(base,
    { scope: "track", ownerId: track.id, parameterId: "gainDb" }, 1001, "lane-gain"));
  assert.equal(created.document.automation[0].writeMode, "read");
  assert.throws(() => createBaseAutomationLane(created.document,
    { parameterId: "gainDb", ownerId: track.id, scope: "track" }, 1002, "other"), /ya tiene/);
  const first = applyCommand(created.document, addAutomationPoint(created.document, "lane-gain",
    { id: "p0", tick: 0, value: -6, shape: "linear" }, 1002));
  const second = applyCommand(first.document, addAutomationPoint(first.document, "lane-gain",
    { id: "p1", tick: 960, value: 0, shape: "step" }, 1003));
  assert.deepEqual(second.document.automation[0].points.map((point) => point.tick), [0, 960]);
  assert.throws(() => addAutomationPoint(second.document, "lane-gain",
    { id: "p2", tick: 960, value: -3, shape: "linear" }), /duplicados/);
  assert.throws(() => addAutomationPoint(second.document, "lane-gain",
    { id: "p2", tick: 1920, value: 25, shape: "linear" }), /fuera/);
  const moved = applyCommand(second.document,
    moveAutomationPoint(second.document, "lane-gain", "p1", { tick: 720, value: -1.5 }, 1004));
  assert.deepEqual(moved.document.automation[0].points.map((point) =>
    [point.tick, point.value]), [[0, -6], [720, -1.5]]);
  assert.deepEqual(applyCommand(moved.document, moved.inverse).document.automation,
    second.document.automation);
});

test("copiar/pegar puntos conserva valores, IDs nuevos y no sobrescribe colisiones", () => {
  const lane = { id: "lane-pan", target: { scope: "track", ownerId: track.id,
    parameterId: "pan" }, writeMode: "read", points: [
    { id: "p0", tick: 0, value: -1, shape: "step" },
    { id: "p1", tick: 480, value: 0.5, shape: "linear" },
  ] };
  const document = { ...base, automation: [lane] };
  const copied = copyAutomationPoints(document, lane.id, 0, 960);
  assert.deepEqual(copied.map((point) => point.offsetTick), [0, 480]);
  let id = 0;
  const pasted = applyCommand(document, pasteAutomationPoints(document, lane.id,
    1920, copied, 1001, () => `copy-${++id}`));
  assert.deepEqual(pasted.document.automation[0].points.map((point) =>
    [point.id, point.tick, point.value]), [
    ["p0", 0, -1], ["p1", 480, 0.5],
    ["copy-1", 1920, -1], ["copy-2", 2400, 0.5],
  ]);
  assert.throws(() => pasteAutomationPoints(pasted.document, lane.id,
    1920, copied, 1002, () => `other-${++id}`), /duplicados/);
  const deleted = applyCommand(pasted.document,
    deleteAutomationPoint(pasted.document, lane.id, "copy-1", 1002));
  assert.equal(deleted.document.automation[0].points.length, 3);
  assert.deepEqual(applyCommand(deleted.document, deleted.inverse).document.automation,
    pasted.document.automation);
});

test("master read/touch y borrado de lane son datos reversibles sin mezclar expresión MIDI", () => {
  const created = applyCommand(base, createBaseAutomationLane(base,
    { scope: "master", parameterId: "masterGainDb" }, 1001, "master"));
  const touched = applyCommand(created.document,
    setAutomationWriteMode(created.document, "master", "touch", 1002));
  assert.equal(touched.document.automation[0].writeMode, "touch");
  const removed = applyCommand(touched.document,
    deleteAutomationLane(touched.document, "master", 1003));
  assert.equal(removed.document.automation.length, 0);
  assert.deepEqual(applyCommand(removed.document, removed.inverse).document.automation,
    touched.document.automation);
});

test("selección múltiple mueve, copia y borra puntos con un solo comando reversible", () => {
  const lane = { id: "multi", target: { scope: "track", ownerId: track.id,
    parameterId: "gainDb" }, writeMode: "read", points: [
    { id: "a", tick: 0, value: -12, shape: "linear" },
    { id: "b", tick: 480, value: -6, shape: "step" },
    { id: "c", tick: 960, value: 0, shape: "linear" },
  ] };
  const document = { ...base, automation: [lane] };
  const selected = new Set(["a", "b"]);
  assert.deepEqual(copySelectedAutomationPoints(document, lane.id, selected)
    .map((point) => point.offsetTick), [0, 480]);
  const moved = applyCommand(document, moveSelectedAutomationPoints(document,
    lane.id, selected, 120, 1.5, 1001));
  assert.deepEqual(moved.document.automation[0].points.map((point) =>
    [point.id, point.tick, point.value]), [
    ["a", 120, -10.5], ["b", 600, -4.5], ["c", 960, 0],
  ]);
  assert.deepEqual(applyCommand(moved.document, moved.inverse).document, document);
  assert.throws(() => moveSelectedAutomationPoints(document, lane.id,
    new Set(["b"]), 480, 0), /duplicados/);
  const deleted = applyCommand(document, deleteSelectedAutomationPoints(document,
    lane.id, selected, 1002));
  assert.deepEqual(deleted.document.automation[0].points.map((point) => point.id), ["c"]);
  assert.deepEqual(applyCommand(deleted.document, deleted.inverse).document, document);
});

test("canvas indexa 10.000 puntos por rango visible y usa shape saliente", () => {
  const points = Array.from({ length: 10_000 }, (_, index) => ({ id: `p-${index}`,
    tick: index * 2, value: index % 100, shape: index % 2 ? "step" : "linear" }));
  const view = { width: 320, scrollLeft: 700, pxPerTick: 0.12, min: 0, max: 100 };
  assert.equal(automationLowerBound(points, 2000), 1000);
  const [first, end] = visibleAutomationPointRange(points, view);
  assert(first > 0 && end < 10_000 && end - first < 1500);
  const point = points[first + 4];
  const x = 46 + point.tick * view.pxPerTick - view.scrollLeft;
  const y = 27 + (100 - point.value) / 100 * (248 - 27 - 18);
  assert.equal(hitAutomationPoint(points, view, x, y)?.id, point.id);
  assert.equal(automationValueAtTick([
    { id: "a", tick: 100, value: -12, shape: "linear" },
    { id: "b", tick: 200, value: 0, shape: "step" },
    { id: "c", tick: 300, value: 6, shape: "linear" },
  ], 50, 3), 3);
  assert.equal(automationValueAtTick([
    { id: "a", tick: 100, value: -12, shape: "linear" },
    { id: "b", tick: 200, value: 0, shape: "step" },
    { id: "c", tick: 300, value: 6, shape: "linear" },
  ], 150, 3), -6);
  assert.equal(automationValueAtTick([
    { id: "a", tick: 100, value: -12, shape: "linear" },
    { id: "b", tick: 200, value: 0, shape: "step" },
    { id: "c", tick: 300, value: 6, shape: "linear" },
  ], 250, 3), 0);
});
