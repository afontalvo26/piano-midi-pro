import type { ProjectAutomationLane, ProjectAutomationPoint,
  ProjectDocumentV1 } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";
import { projectAutomationBaseValue, projectAutomationParameter } from "../project/automationParameters.ts";

export type BaseAutomationTarget =
  | { readonly scope: "track"; readonly ownerId: string; readonly parameterId: "gainDb" | "pan";
      readonly effectId?: undefined }
  | { readonly scope: "master"; readonly parameterId: "masterGainDb"; readonly effectId?: undefined }
  | { readonly scope: "clip"; readonly ownerId: string; readonly parameterId: "gainDb";
      readonly effectId?: undefined }
  | { readonly scope: "track"; readonly ownerId: string; readonly effectId: string;
      readonly parameterId: string }
  | { readonly scope: "master"; readonly effectId: string; readonly parameterId: string };

export function automationTargetKey(target: ProjectAutomationLane["target"]): string {
  return JSON.stringify([target.scope, target.ownerId ?? null, target.effectId ?? null,
    target.parameterId]);
}

export interface AutomationPointCopy {
  readonly offsetTick: number;
  readonly value: number;
  readonly shape: "step" | "linear" | "bezier";
  readonly curve?: number;
}

function laneById(document: ProjectDocumentV1, laneId: string): ProjectAutomationLane {
  const lane = document.automation.find((item) => item.id === laneId);
  if (!lane) throw new RangeError("Curva de automatización inexistente");
  return lane;
}

function command(document: ProjectDocumentV1, laneId: string,
  lane: ProjectAutomationLane | null, at: number): ProjectCommand {
  return { kind: "replaceAutomationLane", laneId,
    expected: document.automation.find((item) => item.id === laneId) ?? null,
    lane, at };
}

function assertBaseTarget(document: ProjectDocumentV1, target: BaseAutomationTarget): void {
  if (!projectAutomationParameter(document, target) || (target.scope === "track" &&
    !document.tracks.some((track) => track.id === target.ownerId)) ||
    (target.scope === "clip" && !document.clips.some((clip) => clip.id === target.ownerId))) {
    throw new RangeError("Parámetro de automatización no disponible");
  }
  if (document.automation.some((lane) => automationTargetKey(lane.target) === automationTargetKey(target))) {
    throw new RangeError("El parámetro ya tiene una curva");
  }
}

function assertPoint(document: ProjectDocumentV1, lane: ProjectAutomationLane,
  point: ProjectAutomationPoint): void {
  const descriptor = projectAutomationParameter(document, lane.target);
  if (!descriptor || !point.id || !Number.isSafeInteger(point.tick) || point.tick < 0 ||
      !Number.isFinite(point.value) || point.value < descriptor.min || point.value > descriptor.max ||
      (point.shape !== "step" && point.shape !== "linear" && point.shape !== "bezier") ||
      (point.curve !== undefined && (!Number.isFinite(point.curve) ||
        point.curve < -1 || point.curve > 1))) {
    throw new RangeError("Punto fuera de tiempo, valor o forma permitida");
  }
}

function replacePoints(document: ProjectDocumentV1, lane: ProjectAutomationLane,
  points: readonly ProjectAutomationPoint[], at: number): ProjectCommand {
  const ordered = [...points].sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id));
  if (ordered.some((point, index) => {
    assertPoint(document, lane, point);
    return index > 0 && ordered[index - 1]!.tick === point.tick;
  }) || new Set(ordered.map((point) => point.id)).size !== ordered.length) {
    throw new RangeError("Puntos duplicados en tick o identidad");
  }
  return command(document, lane.id, { ...lane, points: ordered }, at);
}

export function createBaseAutomationLane(document: ProjectDocumentV1,
  target: BaseAutomationTarget, at = Date.now(), laneId = crypto.randomUUID()): ProjectCommand {
  assertBaseTarget(document, target);
  return command(document, laneId, { id: laneId, target, writeMode: "read", points: [] }, at);
}

export function deleteAutomationLane(document: ProjectDocumentV1,
  laneId: string, at = Date.now()): ProjectCommand {
  laneById(document, laneId);
  return command(document, laneId, null, at);
}

export function setAutomationWriteMode(document: ProjectDocumentV1, laneId: string,
  writeMode: "read" | "touch", at = Date.now()): ProjectCommand {
  const lane = laneById(document, laneId);
  if (writeMode !== "read" && writeMode !== "touch") throw new RangeError("Modo de escritura inválido");
  return command(document, laneId, { ...lane, writeMode }, at);
}

export interface AutomationTouchSample {
  readonly tick: number;
  readonly value: number;
}

function baseLaneValue(document: ProjectDocumentV1, lane: ProjectAutomationLane): number {
  const value = projectAutomationBaseValue(document, lane.target);
  if (value === undefined) throw new RangeError("Valor base de automatización no disponible");
  return value;
}

function laneValueAt(document: ProjectDocumentV1, lane: ProjectAutomationLane, tick: number): number {
  let index = -1;
  for (let i = 0; i < lane.points.length && lane.points[i]!.tick <= tick; i++) index = i;
  if (index < 0) return baseLaneValue(document, lane);
  const point = lane.points[index]!;
  const next = lane.points[index + 1];
  if (!next || point.shape === "step") return point.value;
  const fraction = (tick - point.tick) / (next.tick - point.tick);
  return point.value + (next.value - point.value) * fraction;
}

/** One touch gesture becomes one reversible command. The release returns to the prior read curve. */
export function writeAutomationTouchGesture(document: ProjectDocumentV1, laneId: string,
  samples: readonly AutomationTouchSample[], at = Date.now(),
  nextId: () => string = () => crypto.randomUUID()): ProjectCommand {
  const lane = laneById(document, laneId);
  if (lane.writeMode !== "touch") throw new Error("Activa Touch antes de grabar automatización");
  const descriptor = projectAutomationParameter(document, lane.target);
  if (!descriptor) throw new Error("El parámetro no admite Touch");
  const byTick = new Map<number, number>();
  for (const sample of samples) {
    if (!Number.isSafeInteger(sample.tick) || sample.tick < 0 ||
        !Number.isFinite(sample.value) || sample.value < descriptor.min || sample.value > descriptor.max) {
      throw new RangeError("Muestra Touch fuera de rango");
    }
    byTick.set(sample.tick, sample.value);
  }
  const orderedSamples = [...byTick].sort((a, b) => a[0] - b[0]);
  if (!orderedSamples.length) throw new RangeError("El gesto Touch no contiene muestras");
  const startTick = orderedSamples[0]![0];
  const endTick = orderedSamples.at(-1)![0];
  // ~15 ms at 120 BPM; intentionally short and deterministic in tick space.
  const returnTick = Math.min(Number.MAX_SAFE_INTEGER, endTick + 30);
  const returnValue = laneValueAt(document, lane, returnTick);
  const preserved = lane.points.filter((point) => point.tick < startTick || point.tick > returnTick);
  const created: ProjectAutomationPoint[] = [];
  if (startTick > 0 && !preserved.some((point) => point.tick === startTick - 1)) {
    created.push({ id: nextId(), tick: startTick - 1,
      value: laneValueAt(document, lane, startTick - 1), shape: "linear" });
  }
  for (const [tick, value] of orderedSamples) {
    created.push({ id: nextId(), tick, value, shape: "linear" });
  }
  if (!created.some((point) => point.tick === returnTick)) {
    created.push({ id: nextId(), tick: returnTick, value: returnValue, shape: "linear" });
  }
  return replacePoints(document, lane, [...preserved, ...created], at);
}

export function addAutomationPoint(document: ProjectDocumentV1, laneId: string,
  point: ProjectAutomationPoint, at = Date.now()): ProjectCommand {
  const lane = laneById(document, laneId);
  return replacePoints(document, lane, [...lane.points, point], at);
}

export function moveAutomationPoint(document: ProjectDocumentV1, laneId: string,
  pointId: string, changes: Partial<Pick<ProjectAutomationPoint, "tick" | "value" | "shape" | "curve">>,
  at = Date.now()): ProjectCommand {
  const lane = laneById(document, laneId);
  if (!lane.points.some((point) => point.id === pointId)) throw new RangeError("Punto inexistente");
  return replacePoints(document, lane, lane.points.map((point) => point.id === pointId
    ? { ...point, ...changes } : point), at);
}

export function deleteAutomationPoint(document: ProjectDocumentV1,
  laneId: string, pointId: string, at = Date.now()): ProjectCommand {
  const lane = laneById(document, laneId);
  if (!lane.points.some((point) => point.id === pointId)) throw new RangeError("Punto inexistente");
  return replacePoints(document, lane, lane.points.filter((point) => point.id !== pointId), at);
}

export function copyAutomationPoints(document: ProjectDocumentV1, laneId: string,
  startTick: number, endTick: number): readonly AutomationPointCopy[] {
  const lane = laneById(document, laneId);
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) ||
      startTick < 0 || endTick <= startTick) throw new RangeError("Rango de copia inválido");
  return lane.points.filter((point) => point.tick >= startTick && point.tick < endTick)
    .map((point) => ({ offsetTick: point.tick - startTick, value: point.value,
      shape: point.shape, ...(point.curve === undefined ? {} : { curve: point.curve }) }));
}

export function copySelectedAutomationPoints(document: ProjectDocumentV1, laneId: string,
  pointIds: ReadonlySet<string>): readonly AutomationPointCopy[] {
  const points = laneById(document, laneId).points.filter((point) => pointIds.has(point.id));
  if (!points.length) return [];
  const firstTick = points[0]!.tick;
  return points.map((point) => ({ offsetTick: point.tick - firstTick,
    value: point.value, shape: point.shape,
    ...(point.curve === undefined ? {} : { curve: point.curve }) }));
}

export function moveSelectedAutomationPoints(document: ProjectDocumentV1, laneId: string,
  pointIds: ReadonlySet<string>, deltaTick: number, deltaValue: number,
  at = Date.now()): ProjectCommand {
  if (!Number.isSafeInteger(deltaTick) || !Number.isFinite(deltaValue) || !pointIds.size) {
    throw new RangeError("Movimiento de puntos inválido");
  }
  const lane = laneById(document, laneId);
  const found = lane.points.filter((point) => pointIds.has(point.id));
  if (found.length !== pointIds.size) throw new RangeError("La selección contiene puntos inexistentes");
  return replacePoints(document, lane, lane.points.map((point) => pointIds.has(point.id)
    ? { ...point, tick: point.tick + deltaTick,
      value: Math.round((point.value + deltaValue) * 1_000_000) / 1_000_000 } : point), at);
}

export function deleteSelectedAutomationPoints(document: ProjectDocumentV1,
  laneId: string, pointIds: ReadonlySet<string>, at = Date.now()): ProjectCommand {
  if (!pointIds.size) throw new RangeError("Selecciona puntos para borrar");
  const lane = laneById(document, laneId);
  const points = lane.points.filter((point) => !pointIds.has(point.id));
  if (lane.points.length - points.length !== pointIds.size) {
    throw new RangeError("La selección contiene puntos inexistentes");
  }
  return replacePoints(document, lane, points, at);
}

export function pasteAutomationPoints(document: ProjectDocumentV1, laneId: string,
  destinationTick: number, copied: readonly AutomationPointCopy[], at = Date.now(),
  nextId: () => string = () => crypto.randomUUID()): ProjectCommand {
  const lane = laneById(document, laneId);
  if (!Number.isSafeInteger(destinationTick) || destinationTick < 0 || !copied.length) {
    throw new RangeError("Destino o copia de automatización inválida");
  }
  const points = copied.map((point) => {
    const tick = destinationTick + point.offsetTick;
    if (!Number.isSafeInteger(point.offsetTick) || point.offsetTick < 0 ||
        !Number.isSafeInteger(tick)) throw new RangeError("Copia excede el rango de ticks");
    return { ...point, id: nextId(), tick };
  });
  return replacePoints(document, lane, [...lane.points, ...points], at);
}
