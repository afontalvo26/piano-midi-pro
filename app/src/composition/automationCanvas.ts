import type { MeterPoint, ProjectAutomationPoint } from "../project/model.ts";

export const AUTOMATION_CANVAS_HEIGHT = 248;
export const AUTOMATION_CANVAS_LEFT = 46;
export const AUTOMATION_CANVAS_TOP = 27;
export const AUTOMATION_CANVAS_BOTTOM = 18;

export interface AutomationCanvasViewport {
  readonly width: number;
  readonly scrollLeft: number;
  readonly pxPerTick: number;
  readonly min: number;
  readonly max: number;
}

export function automationPointX(tick: number, viewport: AutomationCanvasViewport): number {
  return AUTOMATION_CANVAS_LEFT + tick * viewport.pxPerTick - viewport.scrollLeft;
}

export function automationTickAtX(x: number, viewport: AutomationCanvasViewport): number {
  return Math.max(0, (x + viewport.scrollLeft - AUTOMATION_CANVAS_LEFT) / viewport.pxPerTick);
}

export function automationPointY(value: number, viewport: AutomationCanvasViewport): number {
  const height = AUTOMATION_CANVAS_HEIGHT - AUTOMATION_CANVAS_TOP - AUTOMATION_CANVAS_BOTTOM;
  return AUTOMATION_CANVAS_TOP + (viewport.max - value) / (viewport.max - viewport.min) * height;
}

export function automationValueAtY(y: number, viewport: AutomationCanvasViewport): number {
  const height = AUTOMATION_CANVAS_HEIGHT - AUTOMATION_CANVAS_TOP - AUTOMATION_CANVAS_BOTTOM;
  const unit = Math.max(0, Math.min(1, (y - AUTOMATION_CANVAS_TOP) / height));
  return viewport.max - unit * (viewport.max - viewport.min);
}

export function automationLowerBound(points: readonly ProjectAutomationPoint[], tick: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle]!.tick < tick) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function visibleAutomationPointRange(points: readonly ProjectAutomationPoint[],
  viewport: AutomationCanvasViewport, marginPx = 12): readonly [number, number] {
  const firstTick = automationTickAtX(-marginPx, viewport);
  const lastTick = automationTickAtX(viewport.width + marginPx, viewport);
  return [automationLowerBound(points, firstTick), automationLowerBound(points, lastTick + 1)];
}

export function hitAutomationPoint(points: readonly ProjectAutomationPoint[],
  viewport: AutomationCanvasViewport, x: number, y: number, radiusPx = 16): ProjectAutomationPoint | null {
  const first = automationLowerBound(points, automationTickAtX(x - radiusPx, viewport));
  const last = automationLowerBound(points, automationTickAtX(x + radiusPx, viewport) + 1);
  let closest: ProjectAutomationPoint | null = null;
  let distance = radiusPx * radiusPx;
  for (let index = first; index < last; index++) {
    const point = points[index]!;
    const dx = automationPointX(point.tick, viewport) - x;
    const dy = automationPointY(point.value, viewport) - y;
    const next = dx * dx + dy * dy;
    if (next <= distance) { closest = point; distance = next; }
  }
  return closest;
}

export function automationValueAtTick(points: readonly ProjectAutomationPoint[], tick: number,
  baseValue: number): number {
  const nextIndex = automationLowerBound(points, tick);
  const next = points[nextIndex];
  if (next?.tick === tick) return next.value;
  const previous = points[nextIndex - 1];
  if (!previous) return baseValue;
  if (!next || previous.shape !== "linear") return previous.value;
  const fraction = (tick - previous.tick) / (next.tick - previous.tick);
  return previous.value + (next.value - previous.value) * fraction;
}

export function drawAutomationLane(context: CanvasRenderingContext2D,
  viewport: AutomationCanvasViewport, points: readonly ProjectAutomationPoint[],
  meters: readonly MeterPoint[], baseValue: number, selectedIds: ReadonlySet<string>,
  unit: string, preview?: ReadonlyMap<string, { readonly tick: number; readonly value: number }>): void {
  const width = viewport.width;
  const height = AUTOMATION_CANVAS_HEIGHT;
  const startTick = automationTickAtX(0, viewport);
  const endTick = automationTickAtX(width, viewport);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#110e18";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#211a2b";
  context.fillRect(0, 0, width, AUTOMATION_CANVAS_TOP);
  context.strokeStyle = "#3a3145";
  context.lineWidth = 1;
  context.fillStyle = "#d3c1e0";
  context.font = "10px Outfit, sans-serif";
  context.textBaseline = "middle";
  for (const factor of [0, 0.5, 1]) {
    const value = viewport.max - (viewport.max - viewport.min) * factor;
    const y = automationPointY(value, viewport);
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    context.fillText(`${Number(value.toFixed(2))}${unit}`, 4, y - 7);
  }
  let lines = 0;
  for (let meterIndex = 0; meterIndex < meters.length && lines < 160; meterIndex++) {
    const meter = meters[meterIndex]!;
    const segmentEnd = meters[meterIndex + 1]?.tick ?? Number.MAX_SAFE_INTEGER;
    const barTicks = 3840 * meter.numerator / meter.denominator;
    const firstBar = Math.max(0, Math.floor((startTick - meter.tick) / barTicks));
    const lastBar = Math.ceil((Math.min(endTick, segmentEnd) - meter.tick) / barTicks);
    for (let bar = firstBar; bar <= lastBar && lines < 160; bar++) {
      const tick = meter.tick + bar * barTicks;
      if (tick >= segmentEnd || tick < startTick || tick > endTick) continue;
      const x = Math.round(automationPointX(tick, viewport)) + 0.5;
      context.strokeStyle = "#675074";
      context.beginPath(); context.moveTo(x, AUTOMATION_CANVAS_TOP);
      context.lineTo(x, height - AUTOMATION_CANVAS_BOTTOM); context.stroke();
      context.fillStyle = "#d8c6e8";
      context.fillText(String(tick), x + 4, 13);
      lines++;
    }
  }
  const [visibleStart, visibleEnd] = visibleAutomationPointRange(points, viewport);
  let currentValue = automationValueAtTick(points, startTick, baseValue);
  let prior = points[automationLowerBound(points, startTick) - 1];
  context.strokeStyle = "#c896ef";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, automationPointY(currentValue, viewport));
  for (let index = visibleStart; index < visibleEnd; index++) {
    const point = points[index]!;
    const x = automationPointX(point.tick, viewport);
    if (point.tick < startTick || x > width) continue;
    if (!prior || prior.shape === "step") {
      context.lineTo(x, automationPointY(currentValue, viewport));
    }
    context.lineTo(x, automationPointY(point.value, viewport));
    currentValue = point.value;
    prior = point;
  }
  const finalValue = automationValueAtTick(points, endTick, baseValue);
  if (prior?.shape === "step") context.lineTo(width, automationPointY(currentValue, viewport));
  else context.lineTo(width, automationPointY(finalValue, viewport));
  context.stroke();
  for (let index = visibleStart; index < visibleEnd; index++) {
    const point = points[index]!;
    const x = automationPointX(point.tick, viewport);
    const y = automationPointY(point.value, viewport);
    context.beginPath(); context.arc(x, y, selectedIds.has(point.id) ? 6 : 4, 0, Math.PI * 2);
    context.fillStyle = selectedIds.has(point.id) ? "#ffd082" : "#c896ef";
    context.fill();
  }
  if (preview?.size) {
    context.strokeStyle = "#ffe0a3";
    context.lineWidth = 2;
    for (const point of preview.values()) {
      const x = automationPointX(point.tick, viewport);
      if (x < -12 || x > width + 12) continue;
      context.beginPath(); context.arc(x, automationPointY(point.value, viewport), 7, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

export function drawAutomationPlayhead(context: CanvasRenderingContext2D,
  viewport: AutomationCanvasViewport, tick: number): void {
  context.clearRect(0, 0, viewport.width, AUTOMATION_CANVAS_HEIGHT);
  const x = automationPointX(tick, viewport);
  if (x < 0 || x > viewport.width) return;
  context.strokeStyle = "#efb371";
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(x, 0);
  context.lineTo(x, AUTOMATION_CANVAS_HEIGHT); context.stroke();
}
