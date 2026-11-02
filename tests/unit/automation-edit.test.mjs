import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { applyCommand } from "../../app/src/project/commands.ts";
import { addAutomationPoint, copyAutomationPoints, copySelectedAutomationPoints,
  createBaseAutomationLane, deleteAutomationLane, deleteAutomationPoint,
  deleteSelectedAutomationPoints, moveAutomationPoint, moveSelectedAutomationPoints,
  pasteAutomationPoints,
  setAutomationWriteMode, writeAutomationTouchGesture } from "../../app/src/composition/automationEdit.ts";
import { automationLowerBound, automationValueAtTick, hitAutomationPoint,
  visibleAutomationPointRange } from "../../app/src/composition/automationCanvas.ts";
import { automationBezierFraction } from "../../app/src/composition/automationCurve.ts";

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


test("Touch reemplaza sólo el tramo tocado, vuelve a read curve y deshace como un gesto", () => {
  const lane = { id: "touch", target: { scope: "track", ownerId: track.id,
    parameterId: "gainDb" }, writeMode: "touch", points: [
    { id: "before", tick: 0, value: -12, shape: "linear" },
    { id: "after", tick: 960, value: 0, shape: "linear" },
    { id: "tail", tick: 1920, value: -3, shape: "step" },
  ] };
  const document = { ...base, automation: [lane] };
  let id = 0;
  const command = writeAutomationTouchGesture(document, lane.id, [
    { tick: 480, value: -18 },
    { tick: 500, value: -15 },
    { tick: 500, value: -14 },
    { tick: 540, value: -9 },
  ], 2000, () => `touch-${++id}`);
  const written = applyCommand(document, command);
  const points = written.document.automation[0].points;
  assert(points.some((point) => point.tick === 479));
  assert.deepEqual(points.filter((point) => point.tick >= 480 && point.tick <= 540)
    .map((point) => [point.tick, point.value]), [[480, -18], [500, -14], [540, -9]]);
  const returnPoint = points.find((point) => point.tick === 570);
  assert(returnPoint);
  assert(Math.abs(returnPoint.value - (-4.875)) < 1e-9);
  assert(points.some((point) => point.id === "tail" && point.tick === 1920));
  assert.deepEqual(applyCommand(written.document, written.inverse).document, document);
  assert.throws(() => writeAutomationTouchGesture({ ...document,
    automation: [{ ...lane, writeMode: "read" }] }, lane.id,
    [{ tick: 480, value: -6 }]), /Activa Touch/);
});


test("AUT effect lane usa el rango real, Touch y CAS sin reconstruir el efecto", () => {
  const filter = { id: "filter-a", kind: "filter", enabled: true,
    parameters: { type: "lowpass", cutoffHz: 12000, q: 0.7 } };
  const document = { ...base, tracks: [{ ...track, mix: { ...track.mix,
    effects: [filter] } }] };
  const target = { scope: "track", ownerId: track.id, effectId: filter.id,
    parameterId: "cutoffHz" };
  const created = applyCommand(document,
    createBaseAutomationLane(document, target, 3000, "lane-filter"));
  const touchMode = applyCommand(created.document,
    setAutomationWriteMode(created.document, "lane-filter", "touch", 3001));
  const first = applyCommand(touchMode.document,
    addAutomationPoint(touchMode.document, "lane-filter",
      { id: "f0", tick: 0, value: 12000, shape: "linear" }, 3002));
  const second = applyCommand(first.document,
    addAutomationPoint(first.document, "lane-filter",
      { id: "f1", tick: 960, value: 400, shape: "step" }, 3003));
  let id = 0;
  const touched = applyCommand(second.document,
    writeAutomationTouchGesture(second.document, "lane-filter",
      [{ tick: 240, value: 8000 }, { tick: 360, value: 6000 }],
      3004, () => `fx-touch-${++id}`));
  assert(touched.document.automation[0].points.some((point) =>
    point.tick === 360 && point.value === 6000));
  assert.throws(() => addAutomationPoint(touched.document, "lane-filter",
    { id: "bad", tick: 1920, value: 20001, shape: "linear" }), /fuera/);
  assert.deepEqual(applyCommand(touched.document, touched.inverse).document, second.document);

  const saturation = { id: "sat-a", kind: "saturation", enabled: true,
    parameters: { drive: 0.2, wet: 0.3 } };
  const withSat = { ...document, tracks: [{ ...track, mix: { ...track.mix,
    effects: [saturation] } }] };
  assert.throws(() => createBaseAutomationLane(withSat,
    { scope: "track", ownerId: track.id, effectId: saturation.id,
      parameterId: "drive" }, 3010, "lane-drive"), /no disponible/);
});


test("Bézier comparte una curva monotónica y curve=0 equivale a lineal", () => {
  assert.equal(automationBezierFraction(0, 1), 0);
  assert.equal(automationBezierFraction(1, -1), 1);
  assert.equal(automationBezierFraction(0.5, 0), 0.5);
  const slow = automationBezierFraction(0.5, -1);
  const fast = automationBezierFraction(0.5, 1);
  assert(slow < 0.5);
  assert(fast > 0.5);
  const points = [
    { id: "b0", tick: 0, value: 0, shape: "bezier", curve: 1 },
    { id: "b1", tick: 960, value: 1, shape: "step" },
  ];
  const middle = automationValueAtTick(points, 480, 0);
  assert(middle > 0.5 && middle < 1);
});
