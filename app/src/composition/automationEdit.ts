import type { ProjectAutomationLane, ProjectAutomationPoint,
  ProjectDocumentV1 } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";
import { baseAutomationParameter } from "../project/automationParameters.ts";

export type BaseAutomationTarget =
  | { readonly scope: "track"; readonly ownerId: string; readonly parameterId: "gainDb" | "pan" }
  | { readonly scope: "master"; readonly parameterId: "masterGainDb" };

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
  if (!baseAutomationParameter(target) || (target.scope === "track" &&
    !document.tracks.some((track) => track.id === target.ownerId))) {
    throw new RangeError("Parámetro de automatización no disponible");
  }
  if (document.automation.some((lane) =>
    lane.target.scope === target.scope && lane.target.parameterId === target.parameterId &&
    lane.target.ownerId === (target.scope === "track" ? target.ownerId : undefined) &&
    lane.target.effectId === undefined)) {
    throw new RangeError("El parámetro ya tiene una curva");
  }
}

function assertPoint(lane: ProjectAutomationLane, point: ProjectAutomationPoint): void {
  const descriptor = baseAutomationParameter(lane.target);
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
    assertPoint(lane, point);
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
