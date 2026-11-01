import { PROJECT_PPQ, type ProjectNote, type ProjectPattern } from "../project/model.ts";
import {
  PIANO_ROLL_KEY_WIDTH, PIANO_ROLL_ROW_HEIGHT, PianoRollNoteIndex,
  noteRect, pitchToY, tickToX, visibleTickRange, type PianoRollViewport,
} from "./pianoRollModel.ts";

const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

export function pianoRollPitchLabel(pitch: number): string {
  return `${PITCH_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export interface PianoRollPaintOptions {
  readonly pattern: ProjectPattern;
  readonly index: PianoRollNoteIndex;
  readonly viewport: PianoRollViewport;
  readonly selectedNoteIds: ReadonlySet<string>;
  readonly snapTicks: number;
  readonly meterNumerator: number;
  readonly meterDenominator: number;
  readonly playheadTick?: number;
  readonly gesturePreview?: readonly ProjectNote[];
  readonly ghostIndex?: PianoRollNoteIndex;
  readonly captureOverlay?: readonly ProjectNote[];
  readonly scalePitchClasses?: ReadonlySet<number>;
  readonly padNames?: Readonly<Record<number, string>>;
}

/** Paint only the visible musical window; neither React nor DOM owns a node per note. */
export function paintPianoRoll(canvas: HTMLCanvasElement, options: PianoRollPaintOptions): void {
  const { pattern, index, viewport, selectedNoteIds, snapTicks } = options;
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const targetWidth = Math.max(1, Math.round(viewport.width * scale));
  const targetHeight = Math.max(1, Math.round(viewport.height * scale));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const width = viewport.width;
  const height = viewport.height;
  context.fillStyle = "#100f17";
  context.fillRect(0, 0, width, height);

  const firstPitch = Math.min(127, 127 - Math.floor(viewport.scrollTop / PIANO_ROLL_ROW_HEIGHT));
  const lastPitch = Math.max(0, 127 - Math.floor((viewport.scrollTop + height) / PIANO_ROLL_ROW_HEIGHT));
  for (let pitch = firstPitch; pitch >= lastPitch; pitch -= 1) {
    const y = pitchToY(pitch, viewport);
    const inScale = !options.scalePitchClasses || options.scalePitchClasses.has(pitch % 12);
    context.fillStyle = !inScale ? "#16131d" : BLACK.has(pitch % 12) ? "#191722" : "#23202a";
    context.fillRect(PIANO_ROLL_KEY_WIDTH, y, width - PIANO_ROLL_KEY_WIDTH, PIANO_ROLL_ROW_HEIGHT);
    context.strokeStyle = pitch % 12 === 0 ? "#51465c" : "#302b39";
    context.beginPath();
    context.moveTo(PIANO_ROLL_KEY_WIDTH, Math.round(y) + 0.5);
    context.lineTo(width, Math.round(y) + 0.5);
    context.stroke();
  }

  const [fromTick, toTick] = visibleTickRange(viewport);
  const pixelsPerTick = viewport.pixelsPerQuarter / PROJECT_PPQ;
  const barTicks = PROJECT_PPQ * options.meterNumerator * 4 / options.meterDenominator;
  const minorTicks = snapTicks * pixelsPerTick >= 12 ? snapTicks : PROJECT_PPQ;
  const gridStart = Math.floor(fromTick / minorTicks) * minorTicks;
  for (let tick = gridStart; tick <= toTick; tick += minorTicks) {
    const x = Math.round(tickToX(tick, viewport)) + 0.5;
    const bar = tick % barTicks === 0;
    const beat = tick % PROJECT_PPQ === 0;
    context.strokeStyle = bar ? "#8768a9" : beat ? "#5a4a6a" : "#393142";
    context.lineWidth = bar ? 1.5 : 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    if (bar) {
      context.fillStyle = "#dfd0f2";
      context.font = "600 11px Outfit, sans-serif";
      context.fillText(String(Math.floor(tick / barTicks) + 1), x + 4, 13);
    }
  }
  context.lineWidth = 1;

  for (const note of options.ghostIndex?.query(fromTick, toTick, lastPitch, firstPitch) ?? []) {
    const rect = noteRect(note, viewport);
    if (rect.x + rect.width <= PIANO_ROLL_KEY_WIDTH || rect.x >= width) continue;
    context.fillStyle = "#d5c2e028";
    context.fillRect(Math.max(rect.x, PIANO_ROLL_KEY_WIDTH), rect.y + 3, rect.width - 1, rect.height - 5);
    context.strokeStyle = "#d5c2e067";
    context.strokeRect(Math.max(rect.x, PIANO_ROLL_KEY_WIDTH) + 0.5, rect.y + 3.5,
      Math.max(0, rect.width - 2), rect.height - 6);
  }

  const patternEndX = tickToX(pattern.lengthTicks, viewport);
  if (patternEndX < width) {
    context.fillStyle = "#0a0810aa";
    context.fillRect(Math.max(PIANO_ROLL_KEY_WIDTH, patternEndX), 0, width, height);
  }
  if (patternEndX >= PIANO_ROLL_KEY_WIDTH && patternEndX < width) {
    context.strokeStyle = "#e5ae76";
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(patternEndX + 0.5, 0);
    context.lineTo(patternEndX + 0.5, height);
    context.stroke();
    context.setLineDash([]);
  }

  const visible = index.query(fromTick, toTick, lastPitch, firstPitch);
  for (const note of visible) {
    const rect = noteRect(note, viewport);
    if (rect.x + rect.width <= PIANO_ROLL_KEY_WIDTH || rect.x >= width) continue;
    const selected = selectedNoteIds.has(note.id);
    context.fillStyle = note.muted ? "#665c71" : selected ? "#d4b5ff" : "#9c73d5";
    context.fillRect(Math.max(rect.x, PIANO_ROLL_KEY_WIDTH), rect.y + 2, rect.width - 1, rect.height - 3);
    context.strokeStyle = selected ? "#ffffff" : note.muted ? "#a99ab6" : "#bd99ec";
    context.lineWidth = selected ? 2 : 1;
    context.strokeRect(Math.max(rect.x, PIANO_ROLL_KEY_WIDTH) + 0.5, rect.y + 2.5,
      Math.max(0, rect.width - 2), rect.height - 4);
    if (rect.width >= 38 && rect.x >= PIANO_ROLL_KEY_WIDTH) {
      context.fillStyle = selected ? "#1d102c" : "#1c102e";
      context.font = "600 11px Outfit, sans-serif";
      context.fillText(pianoRollPitchLabel(note.pitch), rect.x + 5, rect.y + 15, rect.width - 8);
    }
  }

  for (const note of options.gesturePreview ?? []) {
    if (note.startTick >= toTick || note.startTick + note.durationTick <= fromTick ||
        note.pitch < lastPitch || note.pitch > firstPitch) continue;
    const rect = noteRect(note, viewport);
    context.fillStyle = "#f6d08088";
    context.fillRect(rect.x, rect.y + 2, rect.width, rect.height - 3);
    context.strokeStyle = "#ffdf91";
    context.setLineDash([4, 3]);
    context.strokeRect(rect.x + 0.5, rect.y + 2.5, Math.max(0, rect.width - 1), rect.height - 4);
    context.setLineDash([]);
  }

  for (const note of options.captureOverlay ?? []) {
    if (note.startTick >= toTick || note.startTick + note.durationTick <= fromTick ||
        note.pitch < lastPitch || note.pitch > firstPitch) continue;
    const rect = noteRect(note, viewport);
    context.fillStyle = "#73d8dd77";
    context.fillRect(rect.x, rect.y + 2, rect.width, rect.height - 3);
    context.strokeStyle = "#a9f5f1";
    context.setLineDash([3, 2]);
    context.strokeRect(rect.x + 0.5, rect.y + 2.5, Math.max(0, rect.width - 1), rect.height - 4);
    context.setLineDash([]);
  }

  if (options.playheadTick !== undefined) {
    const x = tickToX(options.playheadTick, viewport);
    if (x >= PIANO_ROLL_KEY_WIDTH && x <= width) {
      context.strokeStyle = "#ffc36a";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
      context.stroke();
    }
  }

  context.fillStyle = "#14121b";
  context.fillRect(0, 0, PIANO_ROLL_KEY_WIDTH, height);
  for (let pitch = firstPitch; pitch >= lastPitch; pitch -= 1) {
    const y = pitchToY(pitch, viewport);
    context.fillStyle = BLACK.has(pitch % 12) ? "#302c37" : "#e8e2ea";
    context.fillRect(0, y, PIANO_ROLL_KEY_WIDTH - 1, PIANO_ROLL_ROW_HEIGHT - 1);
    const padName = options.padNames?.[pitch];
    if (padName || pitch % 12 === 0) {
      context.fillStyle = BLACK.has(pitch % 12) ? "#fff" : "#3c3047";
      context.font = padName ? "700 9px Outfit, sans-serif" : "600 11px Outfit, sans-serif";
      context.fillText(padName ?? pianoRollPitchLabel(pitch), 6, y + 15,
        PIANO_ROLL_KEY_WIDTH - 10);
    }
  }
  context.strokeStyle = "#6f5b81";
  context.beginPath();
  context.moveTo(PIANO_ROLL_KEY_WIDTH - 0.5, 0);
  context.lineTo(PIANO_ROLL_KEY_WIDTH - 0.5, height);
  context.stroke();
  context.lineWidth = 1;
}
