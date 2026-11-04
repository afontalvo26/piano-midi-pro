import type { ProjectAutomationPoint } from "../project/model.ts";

export const AUTOMATION_BEZIER_MAX_STEP_TICKS = 15;

export function automationBezierFraction(fraction: number, curve = 0): number {
  const t = Math.max(0, Math.min(1, fraction));
  const bend = Math.max(-1, Math.min(1, Number.isFinite(curve) ? curve : 0));
  // One persisted curvature value drives two symmetric vertical control points.
  // curve 0 is exactly linear; -1 eases in; +1 moves faster near the start.
  const c1 = (1 + bend) / 3;
  const c2 = (2 + bend) / 3;
  const one = 1 - t;
  return 3 * one * one * t * c1 + 3 * one * t * t * c2 + t * t * t;
}

export function automationInterpolatedValue(start: number, end: number,
  shape: ProjectAutomationPoint["shape"], curve: number | undefined,
  fraction: number): number {
  if (shape === "step") return start;
  const t = shape === "bezier" ? automationBezierFraction(fraction, curve) :
    Math.max(0, Math.min(1, fraction));
  return start + (end - start) * t;
}
