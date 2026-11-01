import type { ProjectExpressionEvent, ProjectNote, ProjectPattern } from "../project/model.ts";
import { PIANO_ROLL_KEY_WIDTH, PianoRollNoteIndex, tickToX, visibleTickRange,
  type PianoRollViewport } from "./pianoRollModel.ts";

export type PianoRollLaneKind = "velocity" | "releaseVelocity" | "cc" | "pitchBend" |
  "channelPressure" | "polyPressure";

export function laneMatches(event: ProjectExpressionEvent, kind: PianoRollLaneKind,
  channel: number, controller: number): boolean {
  return event.channel === channel && event.kind === kind &&
    (event.kind !== "cc" || event.controller === controller);
}

export function laneValue(event: ProjectExpressionEvent): number {
  switch (event.kind) {
    case "cc": return event.value;
    case "pitchBend": return event.value14;
    case "channelPressure":
    case "polyPressure": return event.pressure;
    case "programChange": return event.program;
  }
}

export function laneValueFromY(kind: PianoRollLaneKind, y: number, height = 116): number {
  const maximum = kind === "pitchBend" ? 16383 : 127;
  return Math.max(0, Math.min(maximum,
    Math.round((height - 7 - y) / (height - 18) * maximum)));
}

function laneValueY(kind: PianoRollLaneKind, value: number, height: number): number {
  const maximum = kind === "pitchBend" ? 16383 : 127;
  return height - 7 - value / maximum * (height - 18);
}

export interface PianoRollLanePaintOptions {
  readonly pattern: ProjectPattern;
  readonly noteIndex: PianoRollNoteIndex;
  readonly viewport: PianoRollViewport;
  readonly kind: PianoRollLaneKind;
  readonly channel: number;
  readonly controller: number;
  readonly selectedEventId: string | null;
  readonly selectedNoteIds: ReadonlySet<string>;
  readonly previewNote?: ProjectNote;
  readonly previewEvent?: ProjectExpressionEvent;
}

export function paintPianoRollLane(canvas: HTMLCanvasElement, options: PianoRollLanePaintOptions): void {
  const { pattern, viewport, kind, channel, controller } = options;
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, viewport.width);
  const height = 116;
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = "#18131f";
  context.fillRect(0, 0, width, height);
  const [fromTick, toTick] = visibleTickRange(viewport);
  const barTicks = 3840;
  for (let tick = Math.floor(fromTick / barTicks) * barTicks; tick <= toTick; tick += barTicks) {
    const x = tickToX(tick, viewport);
    context.strokeStyle = "#51405f";
    context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height); context.stroke();
  }
  const maximum = kind === "pitchBend" ? 16383 : 127;
  const display = kind === "velocity" ? "VEL" : kind === "releaseVelocity" ? "REL" :
    kind === "cc" ? `CC${controller}` : kind === "pitchBend" ? "BEND" :
      kind === "channelPressure" ? "PRES" : "POLY";
  if (kind === "velocity" || kind === "releaseVelocity") {
    const notes = options.noteIndex.query(fromTick, toTick);
    for (const note of notes) {
      if (note.channel !== channel) continue;
      const x = tickToX(note.startTick, viewport);
      const value = kind === "velocity" ? note.velocity : note.releaseVelocity;
      const top = laneValueY(kind, value, height);
      context.fillStyle = options.selectedNoteIds.has(note.id) ? "#efd1ff" : "#9c73d5";
      context.fillRect(Math.max(PIANO_ROLL_KEY_WIDTH, x), top, Math.max(3,
        Math.min(9, note.durationTick * viewport.pixelsPerQuarter / 960)), height - top - 6);
    }
  } else {
    for (const event of pattern.expression) {
      if (!laneMatches(event, kind, channel, controller) || event.tick < fromTick || event.tick >= toTick) continue;
      const x = tickToX(event.tick, viewport);
      const top = laneValueY(kind, laneValue(event), height);
      context.fillStyle = options.selectedEventId === event.id ? "#efd1ff" : "#a9a0ef";
      context.fillRect(Math.max(PIANO_ROLL_KEY_WIDTH, x - 2), top, 5, height - top - 6);
      context.beginPath(); context.arc(x, top, options.selectedEventId === event.id ? 5 : 3, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (options.previewNote && (kind === "velocity" || kind === "releaseVelocity")) {
    const note = options.previewNote;
    const value = kind === "velocity" ? note.velocity : note.releaseVelocity;
    const x = tickToX(note.startTick, viewport);
    const top = laneValueY(kind, value, height);
    context.fillStyle = "#ffe0aa";
    context.fillRect(Math.max(PIANO_ROLL_KEY_WIDTH, x - 2), top, 8, height - top - 6);
  }
  if (options.previewEvent && laneMatches(options.previewEvent, kind, channel, controller)) {
    const x = tickToX(options.previewEvent.tick, viewport);
    const top = laneValueY(kind, laneValue(options.previewEvent), height);
    context.fillStyle = "#ffe0aa";
    context.fillRect(Math.max(PIANO_ROLL_KEY_WIDTH, x - 2), top, 5, height - top - 6);
    context.beginPath(); context.arc(x, top, 6, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = "#2b2033";
  context.fillRect(0, 0, PIANO_ROLL_KEY_WIDTH, height);
  context.fillStyle = "#e7d6f5";
  context.font = "700 10px Outfit, sans-serif";
  context.fillText(display, 5, 16, PIANO_ROLL_KEY_WIDTH - 8);
  context.fillStyle = "#bbaac8";
  context.font = "600 9px Outfit, sans-serif";
  context.fillText(String(maximum), 5, 33);
  context.fillText("0", 5, height - 8);
}

export function hitPianoRollLaneEvent(pattern: ProjectPattern, kind: PianoRollLaneKind,
  channel: number, controller: number, tick: number, toleranceTicks: number,
  value?: number, toleranceValue?: number): ProjectExpressionEvent | null {
  let nearest: ProjectExpressionEvent | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const event of pattern.expression) {
    if (!laneMatches(event, kind, channel, controller)) continue;
    const tickDistance = Math.abs(event.tick - tick);
    const valueDistance = value === undefined ? 0 : Math.abs(laneValue(event) - value);
    if (tickDistance > toleranceTicks ||
        (toleranceValue !== undefined && valueDistance > toleranceValue)) continue;
    const score = tickDistance / Math.max(1, toleranceTicks) +
      valueDistance / Math.max(1, toleranceValue ?? 1);
    if (score < distance) { nearest = event; distance = score; }
  }
  return nearest;
}
