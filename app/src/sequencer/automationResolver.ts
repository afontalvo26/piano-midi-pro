import type { ProjectAutomationLane, ProjectDocumentV1 } from "../project/model.ts";
import { projectAutomationBaseValue, projectAutomationParameter } from "../project/automationParameters.ts";
import type { AutomationResolver, TimelineAutomation } from "./timelineEvents.ts";
import { MusicalClock } from "./musicalClock.ts";
import { AUTOMATION_BEZIER_MAX_STEP_TICKS, automationInterpolatedValue } from "../composition/automationCurve.ts";

type BaseTarget = TimelineAutomation["target"];

interface ResolvedLane {
  readonly id: string;
  readonly target: BaseTarget;
  readonly base: number;
  readonly points: ProjectAutomationLane["points"];
  readonly sequence: number;
}

export interface AutomationValueSnapshot {
  readonly laneId: string;
  readonly target: BaseTarget;
  readonly value: number;
  readonly owner: "base" | "read" | "physical";
  readonly tick: number;
}

function indexAt(points: ProjectAutomationLane["points"], tick: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle]!.tick <= tick) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function valueAt(lane: ResolvedLane, tick: number): number {
  const index = indexAt(lane.points, tick);
  if (index < 0) return lane.base;
  const point = lane.points[index]!;
  const next = lane.points[index + 1];
  if (!next || point.shape === "step") return point.value;
  const fraction = (tick - point.tick) / (next.tick - point.tick);
  return automationInterpolatedValue(point.value, next.value,
    point.shape, point.curve, fraction);
}

function resolveLane(document: ProjectDocumentV1, lane: ProjectAutomationLane,
  sequence: number): ResolvedLane | null {
  const descriptor = projectAutomationParameter(document, lane.target);
  if (!descriptor) {
    if (lane.target.effectId) {
      const effect = lane.target.scope === "master"
        ? document.mix.masterEffects.find((item) => item.id === lane.target.effectId)
        : lane.target.scope === "track"
          ? document.tracks.find((track) => track.id === lane.target.ownerId)?.mix.effects
            .find((item) => item.id === lane.target.effectId)
          : undefined;
      // Bypassed effects preserve their lanes but contribute no audible automation.
      if (effect && !effect.enabled) return null;
    }
    if (lane.points.length === 0) return null;
    throw new Error(`Automatización ${lane.id}: parámetro sin reproducción live/WAV`);
  }
  if (lane.target.scope === "clip") {
    throw new Error(`Automatización ${lane.id}: clip gain aún no usa el scheduler de mixer`);
  }
  const base = projectAutomationBaseValue(document, lane.target);
  if (base === undefined) throw new Error(`Automatización ${lane.id}: valor base ausente`);
  if (lane.target.scope === "track") {
    const track = document.tracks.find((item) => item.id === lane.target.ownerId);
    if (!track) throw new Error(`Automatización ${lane.id}: pista ausente`);
    const target: BaseTarget = lane.target.effectId
      ? { scope: "track", ownerId: track.id, effectId: lane.target.effectId,
        parameterId: lane.target.parameterId }
      : { scope: "track", ownerId: track.id,
        parameterId: lane.target.parameterId as "gainDb" | "pan" };
    return { id: lane.id, target, base, points: lane.points, sequence };
  }
  const target: BaseTarget = lane.target.effectId
    ? { scope: "master", effectId: lane.target.effectId, parameterId: lane.target.parameterId }
    : { scope: "master", parameterId: "masterGainDb" };
  return { id: lane.id, target, base, points: lane.points, sequence };
}

/** Pure tick-domain planner; tempo boundaries split linear segments for exact ramps. */
export function createBaseAutomationResolver(document: ProjectDocumentV1,
  clock: MusicalClock): AutomationResolver & {
    readonly snapshot: (tick: number) => readonly AutomationValueSnapshot[];
  } {
  const lanes = document.automation.map((lane, index) => resolveLane(document, lane, index))
    .filter((lane): lane is ResolvedLane => lane !== null);
  const tempoTicks = clock.tempoMap.map((point) => point.tick);
  const resolve: AutomationResolver = (startTick, endTick, _iteration) => {
    if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) ||
        startTick < 0 || endTick <= startTick) throw new RangeError("Ventana de automatización inválida");
    const events: TimelineAutomation[] = [];
    for (const lane of lanes) {
      if (lane.points.length === 0) continue;
      let cursor = Math.max(startTick, lane.points[0]!.tick);
      while (cursor < endTick) {
        const index = indexAt(lane.points, cursor);
        const point = lane.points[index]!;
        const nextPoint = lane.points[index + 1]?.tick ?? endTick;
        const nextTempo = tempoTicks.find((tick) => tick > cursor) ?? endTick;
        let curveBoundary = nextPoint;
        if (point.shape === "bezier" && index + 1 < lane.points.length) {
          const elapsed = Math.max(0, cursor - point.tick);
          const stepIndex = Math.floor(elapsed / AUTOMATION_BEZIER_MAX_STEP_TICKS) + 1;
          curveBoundary = Math.min(nextPoint,
            point.tick + stepIndex * AUTOMATION_BEZIER_MAX_STEP_TICKS);
        }
        const boundary = Math.min(endTick, nextPoint, nextTempo, curveBoundary);
        if (boundary <= cursor) throw new Error("Automatización sin avance temporal");
        const startValue = valueAt(lane, cursor);
        const shape = (point.shape === "linear" || point.shape === "bezier") &&
          index + 1 < lane.points.length ? "linear" : "step";
        const endValue = shape === "linear" ? valueAt(lane, boundary) : startValue;
        events.push({ laneId: lane.id, target: lane.target, tick: cursor,
          endTick: boundary, startValue, endValue, shape, sequence: lane.sequence });
        if (events.length > 4096) throw new RangeError("Automatización excede 4096 segmentos por ventana");
        cursor = boundary;
      }
    }
    return events.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence ||
      a.laneId.localeCompare(b.laneId));
  };
  return Object.assign(resolve, { snapshot: (tick: number): readonly AutomationValueSnapshot[] => {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Tick inválido");
    return lanes.map((lane) => ({ laneId: lane.id, target: lane.target,
      value: valueAt(lane, tick), owner: lane.points.length === 0 ||
        tick < lane.points[0]!.tick ? "base" : "read", tick }));
  } });
}
