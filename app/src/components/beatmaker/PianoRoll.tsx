import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { PROJECT_PPQ, type ProjectExpressionEvent, type ProjectNote,
  type ProjectPattern } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import { BeatmakerUiStore } from "../../state/beatmakerUiStore.ts";
import { paintPianoRoll, pianoRollPitchLabel } from "../../composition/pianoRollCanvas.ts";
import { hitPianoRollLaneEvent, laneMatches, laneValue, laneValueFromY, paintPianoRollLane,
  type PianoRollLaneKind } from "../../composition/pianoRollLanes.ts";
import {
  PIANO_ROLL_KEY_WIDTH, PIANO_ROLL_ROW_HEIGHT, PIANO_ROLL_SNAPS, PianoRollNoteIndex,
  createPianoRollNote, deletePianoRollNotes, editPianoRollNote,
  editPianoRollNoteWithPerformance, movePianoRollNotes,
  createPianoRollExpression, editPianoRollExpression,
  noteRect, pianoRollReplaceCommand, snapTick, xToTick, yToPitch,
  type EditableNoteFields, type PianoRollViewport,
} from "../../composition/pianoRollModel.ts";
import { NoteInspector } from "./NoteInspector.tsx";
import { PianoRollOperations } from "./PianoRollOperations.tsx";
import { PianoRollExpression } from "./PianoRollExpression.tsx";
import "./PianoRoll.css";

export interface PianoRollProps {
  readonly pattern: ProjectPattern | null;
  readonly projectName?: string;
  readonly trackName?: string;
  readonly meter?: { readonly numerator: number; readonly denominator: number };
  readonly playheadTick?: number;
  /** High-frequency transport read; visual line updates without a React render. */
  readonly readPlayheadTick?: () => number;
  /** Other project patterns are drawn as read-only silhouettes. */
  readonly ghostPatterns?: readonly ProjectPattern[];
  readonly scale?: { readonly name: string; readonly pitchClasses: readonly number[] };
  readonly padNames?: Readonly<Record<number, string>>;
  /** Drum tracks accept only these exact trigger pitches/channels. */
  readonly allowedPadTriggers?: readonly { readonly pitch: number; readonly channel: number;
    readonly label: string }[];
  /** Open recording notes; never written to PRJ until the recorder confirms its take. */
  readonly captureOverlay?: readonly ProjectNote[];
  readonly saveState?: "clean" | "pending" | "saving" | "error" | "conflict";
  readonly loading?: boolean;
  readonly externalError?: string;
  /** Must resolve after the project snapshot has accepted the command. */
  readonly onCommand: (command: ProjectCommand) => void | Promise<void>;
  readonly onUndo?: () => void | Promise<void>;
  readonly onRedo?: () => void | Promise<void>;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  /** Preview owns its audio lifecycle outside this view; ownerId is unique per audition. */
  readonly onPreviewNote?: (note: ProjectNote, ownerId: string) => void;
}

type EditorProps = PianoRollProps & { readonly pattern: ProjectPattern };

interface Gesture {
  readonly pointerId: number;
  readonly kind: "draw" | "move" | "resize";
  readonly clientStartX: number;
  readonly clientStartY: number;
  readonly sourcePattern: ProjectPattern;
  readonly sourceNotes: readonly ProjectNote[];
  readonly bounds: { readonly firstTick: number; readonly lastStartTick: number; readonly lowPitch: number; readonly highPitch: number };
  readonly sourceTick: number;
  readonly sourcePitch: number;
  readonly selectedIds: ReadonlySet<string>;
  moved: boolean;
  preview: ProjectNote[];
}

type LaneGesture = {
  readonly pointerId: number;
  readonly clientStartX: number;
  readonly clientStartY: number;
  readonly sourcePattern: ProjectPattern;
  moved: boolean;
} & ({
  readonly kind: "note";
  readonly noteKind: "velocity" | "releaseVelocity";
  readonly sourceNote: ProjectNote;
  previewNote: ProjectNote;
} | {
  readonly kind: "expression";
  readonly sourceEvent: ProjectExpressionEvent | null;
  readonly laneKind: Exclude<PianoRollLaneKind, "velocity" | "releaseVelocity">;
  readonly channel: number;
  readonly controller: number;
  readonly pressurePitch: number;
  previewEvent: ProjectExpressionEvent;
});

const SAVE_LABELS = {
  clean: "Guardado",
  pending: "Pendiente de guardar",
  saving: "Guardando…",
  error: "Error al guardar",
  conflict: "Conflicto de guardado",
} as const;
const SCALE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

function editableFields(note: ProjectNote): EditableNoteFields {
  return {
    startTick: note.startTick,
    durationTick: note.durationTick,
    pitch: note.pitch,
    velocity: note.velocity,
    releaseVelocity: note.releaseVelocity,
    channel: note.channel,
  };
}

function localPoint(event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function PianoRoll(props: PianoRollProps) {
  if (!props.pattern) {
    return <section className="piano-roll piano-roll--empty" aria-label="Piano roll">
      <span className="piano-roll__eyebrow">Piano roll</span>
      <h2>{props.loading ? "Cargando patrón…" : "Elige un patrón de tu proyecto"}</h2>
      <p>{props.loading ? "Preparando las notas editables." : "Crea o selecciona un patrón propio para dibujar y editar notas."}</p>
      {props.externalError && <p className="piano-roll__error" role="alert">{props.externalError}</p>}
    </section>;
  }
  return <PianoRollEditor key={props.pattern.id} {...props} pattern={props.pattern} />;
}

function PianoRollEditor({ pattern, projectName, trackName, meter = { numerator: 4, denominator: 4 },
  playheadTick, readPlayheadTick, ghostPatterns, scale, padNames, allowedPadTriggers,
  captureOverlay, saveState, externalError,
  onCommand, onUndo, onRedo, canUndo, canRedo, onPreviewNote }: EditorProps) {
  const [uiStore] = useState(() => new BeatmakerUiStore());
  const ui = useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);
  const [optimisticPattern, setOptimisticPattern] = useState<ProjectPattern | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transformPreview, setTransformPreview] = useState<{
    readonly sourceVersion: number; readonly notes: readonly ProjectNote[] } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showGhosts, setShowGhosts] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [scaleMode, setScaleMode] = useState<"off" | "major" | "minor">("off");
  const [scaleRoot, setScaleRoot] = useState(0);
  const [laneKind, setLaneKind] = useState<PianoRollLaneKind>("velocity");
  const [laneChannel, setLaneChannel] = useState(allowedPadTriggers?.[0]?.channel ?? 0);
  const [laneController, setLaneController] = useState(11);
  const [laneDraftTick, setLaneDraftTick] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportElement = useRef<HTMLDivElement>(null);
  const canvasElement = useRef<HTMLCanvasElement>(null);
  const laneCanvasElement = useRef<HTMLCanvasElement>(null);
  const livePlayheadElement = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const laneGesture = useRef<LaneGesture | null>(null);
  const paintFrame = useRef(0);
  const paintNowRef = useRef<() => void>(() => {});
  const currentPattern = busy && optimisticPattern ? optimisticPattern : pattern;
  const paintedPlayheadTick = readPlayheadTick ? undefined : playheadTick;
  const noteIndex = useMemo(() => new PianoRollNoteIndex(currentPattern.notes), [currentPattern.notes]);
  const ghostIndex = useMemo(() => ghostPatterns?.length ? new PianoRollNoteIndex(
    ghostPatterns.flatMap((source) => source.notes)) : undefined, [ghostPatterns]);
  const padNameEntries = useMemo(() => Object.entries(padNames ?? {})
    .map(([pitch, name]) => ({ pitch: Number(pitch), name }))
    .filter(({ pitch, name }) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 && !!name.trim())
    .sort((left, right) => left.pitch - right.pitch), [padNames]);
  const scaleClasses = useMemo(() => scale ? new Set(scale.pitchClasses) : scaleMode === "off" ? undefined
    : new Set((scaleMode === "major" ? MAJOR_STEPS : MINOR_STEPS).map((step) => (step + scaleRoot) % 12)),
  [scale, scaleMode, scaleRoot]);
  const orderedNotes = useMemo(() => [...currentPattern.notes].sort((a, b) =>
    a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id)), [currentPattern.notes]);
  const contentEndTick = useMemo(() => Math.max(currentPattern.notes.reduce((end, note) =>
    Math.max(end, note.startTick + note.durationTick), currentPattern.lengthTicks),
  captureOverlay?.reduce((end, note) => Math.max(end, note.startTick + note.durationTick), 0) ?? 0),
  [currentPattern.notes, currentPattern.lengthTicks, captureOverlay]);
  const selectedIds = ui.selectedNoteIds;
  const selectedTailCount = useMemo(() => selectedIds.size === 0 ? 0 : currentPattern.notes.reduce(
    (count, note) => count + Number(selectedIds.has(note.id) &&
      note.startTick + note.durationTick > currentPattern.lengthTicks), 0),
  [currentPattern.notes, currentPattern.lengthTicks, selectedIds]);
  const selectedNote = useMemo(() => selectedIds.size === 1
    ? currentPattern.notes.find((note) => selectedIds.has(note.id)) ?? null : null,
  [currentPattern.notes, selectedIds]);
  const laneEvents = useMemo(() => currentPattern.expression.filter((event) =>
    laneMatches(event, laneKind, laneChannel, laneController)),
  [currentPattern.expression, laneKind, laneChannel, laneController]);
  const selectedEvent = laneEvents.find((event) => event.id === selectedEventId) ?? null;
  const padTriggersByPitch = useMemo(() => {
    if (!allowedPadTriggers) return null;
    const byPitch = new Map<number, { readonly pitch: number; readonly channel: number; readonly label: string }[]>();
    for (const trigger of allowedPadTriggers) {
      const group = byPitch.get(trigger.pitch) ?? [];
      group.push(trigger);
      byPitch.set(trigger.pitch, group);
    }
    return byPitch;
  }, [allowedPadTriggers]);
  const triggerForPitch = useCallback((pitch: number, preferredChannel?: number) => {
    const matches = padTriggersByPitch?.get(pitch);
    return matches?.find((trigger) => trigger.channel === preferredChannel) ?? matches?.[0];
  }, [padTriggersByPitch]);
  const padPitchDelta = useCallback((notes: readonly ProjectNote[], requested: number): number => {
    if (!padTriggersByPitch || !notes.length) return requested;
    const firstPitch = notes[0]!.pitch;
    const candidates = [...padTriggersByPitch.keys()].map((pitch) => pitch - firstPitch)
      .sort((left, right) => Math.abs(left - requested) - Math.abs(right - requested) ||
        (requested < 0 ? left - right : right - left));
    return candidates.find((delta) => notes.every((note) => padTriggersByPitch.has(note.pitch + delta))) ?? 0;
  }, [padTriggersByPitch]);
  const withPadChannels = useCallback((next: ProjectPattern, movedIds: ReadonlySet<string>): ProjectPattern => {
    if (!padTriggersByPitch) return next;
    const notes = next.notes.map((note) => {
      if (!movedIds.has(note.id)) return note;
      const trigger = triggerForPitch(note.pitch, note.channel);
      return trigger ? { ...note, channel: trigger.channel } : note;
    });
    return { ...next, notes };
  }, [padTriggersByPitch, triggerForPitch]);

  const viewport = useCallback((): PianoRollViewport => {
    const element = viewportElement.current;
    return {
      scrollLeft: element?.scrollLeft ?? 0,
      scrollTop: element?.scrollTop ?? 0,
      width: element?.clientWidth ?? size.width,
      height: element?.clientHeight ?? size.height,
      pixelsPerQuarter: ui.pixelsPerQuarter,
    };
  }, [size.height, size.width, ui.pixelsPerQuarter]);

  const paintNow = useCallback(() => {
    const canvas = canvasElement.current;
    if (!canvas) return;
    paintPianoRoll(canvas, {
      pattern: currentPattern, index: noteIndex, viewport: viewport(),
      selectedNoteIds: selectedIds, snapTicks: ui.snapTicks,
      meterNumerator: meter.numerator, meterDenominator: meter.denominator,
      playheadTick: paintedPlayheadTick,
      gesturePreview: gesture.current?.preview ??
        (transformPreview?.sourceVersion === currentPattern.version ? transformPreview.notes : undefined),
      ghostIndex: showGhosts ? ghostIndex : undefined,
      scalePitchClasses: showScale ? scaleClasses : undefined,
      captureOverlay, padNames,
    });
    const laneCanvas = laneCanvasElement.current;
    if (laneCanvas) paintPianoRollLane(laneCanvas, {
      pattern: currentPattern, noteIndex, viewport: viewport(), kind: laneKind,
      channel: laneChannel, controller: laneController, selectedEventId, selectedNoteIds: selectedIds,
      previewNote: laneGesture.current?.kind === "note" ? laneGesture.current.previewNote : undefined,
      previewEvent: laneGesture.current?.kind === "expression"
        ? laneGesture.current.previewEvent : undefined,
    });
  }, [currentPattern, noteIndex, viewport, selectedIds, ui.snapTicks, meter.numerator, meter.denominator,
    paintedPlayheadTick, transformPreview, ghostIndex, showGhosts, scaleClasses, showScale, captureOverlay, padNames,
    laneKind, laneChannel, laneController, selectedEventId]);
  const requestPaint = useCallback(() => {
    if (paintFrame.current) return;
    paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = 0;
      paintNowRef.current();
    });
  }, []);

  useLayoutEffect(() => {
    const element = viewportElement.current;
    if (!element) return;
    const initialPitch = orderedNotes[0]?.pitch ?? allowedPadTriggers?.[0]?.pitch ?? 72;
    element.scrollTop = Math.max(0, (127 - initialPitch) * PIANO_ROLL_ROW_HEIGHT - element.clientHeight / 3);
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      requestPaint();
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
    // The initial position belongs to the mounted pattern, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    paintNowRef.current = paintNow;
    requestPaint();
  }, [paintNow, requestPaint]);

  useLayoutEffect(() => () => {
    if (paintFrame.current) cancelAnimationFrame(paintFrame.current);
  }, []);

  useEffect(() => {
    if (!readPlayheadTick) return;
    const viewport = viewportElement.current;
    const line = livePlayheadElement.current;
    if (!viewport || !line) return;
    let visible = false;
    let frame = 0;
    const step = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      const tick = readPlayheadTick();
      const x = PIANO_ROLL_KEY_WIDTH + tick * ui.pixelsPerQuarter / PROJECT_PPQ - viewport.scrollLeft;
      line.style.display = Number.isFinite(x) && x >= PIANO_ROLL_KEY_WIDTH && x <= viewport.clientWidth ? "block" : "none";
      if (line.style.display === "block") line.style.transform = `translateX(${x}px)`;
      frame = requestAnimationFrame(step);
    };
    const refresh = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(step);
      if ((!visible || document.hidden) && frame) { cancelAnimationFrame(frame); frame = 0; line.style.display = "none"; }
    };
    const observer = new IntersectionObserver((entries) => { visible = !!entries[0]?.isIntersecting; refresh(); });
    observer.observe(viewport);
    document.addEventListener("visibilitychange", refresh);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", refresh);
      if (frame) cancelAnimationFrame(frame); };
  }, [readPlayheadTick, ui.pixelsPerQuarter]);

  const commitPattern = useCallback(async (next: ProjectPattern): Promise<boolean> => {
    if (next === currentPattern || busy) return false;
    if (padTriggersByPitch && next.notes.some((note) =>
      !padTriggersByPitch.get(note.pitch)?.some((trigger) => trigger.channel === note.channel))) {
      setError("La nota y el canal deben corresponder a uno de los 16 pads del rack");
      return false;
    }
    setBusy(true);
    setError("");
    setOptimisticPattern(next);
    try {
      await onCommand(pianoRollReplaceCommand(currentPattern, next));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar el patrón");
      return false;
    } finally {
      setOptimisticPattern(null);
      setBusy(false);
    }
  }, [busy, currentPattern, onCommand, padTriggersByPitch]);

  const runEdit = useCallback((edit: () => ProjectPattern): void => {
    try { void commitPattern(edit()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Edición inválida"); }
  }, [commitPattern]);

  const previewNote = useCallback((note: ProjectNote) => {
    if (!onPreviewNote) return;
    try { onPreviewNote(note, `${pattern.id}:preview:${crypto.randomUUID()}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo preescuchar la nota"); }
  }, [onPreviewNote, pattern.id]);

  function updateGesture(event: PointerEvent<HTMLCanvasElement>): Gesture | null {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return null;
    const point = localPoint(event);
    const view = viewport();
    const tick = xToTick(point.x, view);
    const pitch = yToPitch(point.y, view);
    active.moved = active.moved || Math.hypot(event.clientX - active.clientStartX, event.clientY - active.clientStartY) >= 3;
    if (!active.moved && active.kind !== "draw") return active;
    if (active.kind === "draw") {
      const source = active.sourceNotes[0]!;
      const endTick = snapTick(tick, ui.snapTicks);
      const durationTick = Math.min(active.sourcePattern.lengthTicks - source.startTick,
        Math.max(source.durationTick, endTick - source.startTick));
      active.preview = [{ ...source, durationTick }];
    } else if (active.kind === "resize") {
      const source = active.sourceNotes[0]!;
      const endTick = snapTick(tick, ui.snapTicks);
      const durationTick = Math.max(1, endTick - source.startTick);
      active.preview = [{ ...source, durationTick }];
    } else {
      const rawDelta = tick - active.sourceTick;
      const deltaTick = snapTick(Math.abs(rawDelta), ui.snapTicks) * Math.sign(rawDelta);
      const boundedTick = Math.max(-active.bounds.firstTick,
        Math.min(active.sourcePattern.lengthTicks - 1 - active.bounds.lastStartTick, deltaTick));
      const boundedPitch = Math.max(-active.bounds.lowPitch,
        Math.min(127 - active.bounds.highPitch, pitch - active.sourcePitch));
      const padDelta = padPitchDelta(active.sourceNotes, boundedPitch);
      active.preview = active.sourceNotes.map((note) => ({ ...note,
        startTick: note.startTick + boundedTick, pitch: note.pitch + padDelta,
        channel: triggerForPitch(note.pitch + padDelta, note.channel)?.channel ?? note.channel }));
    }
    requestPaint();
    return active;
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (busy || ui.tool === "pan" || event.button !== 0) return;
    const point = localPoint(event);
    if (point.x < PIANO_ROLL_KEY_WIDTH) {
      if (onPreviewNote) {
        const pitch = yToPitch(point.y, viewport());
        const trigger = triggerForPitch(pitch);
        if (padTriggersByPitch && !trigger) {
          setError("No hay pad asignado a esa tecla MIDI");
          return;
        }
        previewNote({ id: `audition-${crypto.randomUUID()}`,
          startTick: 0, durationTick: 240, pitch, velocity: 96, releaseVelocity: 64,
          channel: trigger?.channel ?? 0, origin: { kind: "drawn", playedPitch: pitch } });
      }
      return;
    }
    event.preventDefault();
    const view = viewport();
    const tick = xToTick(point.x, view);
    const pitch = yToPitch(point.y, view);
    if (ui.tool === "draw") {
      const trigger = triggerForPitch(pitch);
      if (padTriggersByPitch && !trigger) {
        setError("Elige la fila de un pad del rack para dibujar el golpe");
        return;
      }
      const startTick = Math.min(currentPattern.lengthTicks - 1, snapTick(tick, ui.snapTicks, "floor"));
      const durationTick = Math.min(currentPattern.lengthTicks - startTick, ui.snapTicks === 1 ? 240 : ui.snapTicks);
      const note: ProjectNote = {
        id: crypto.randomUUID(), startTick, durationTick, pitch,
        velocity: 96, releaseVelocity: 64, channel: trigger?.channel ?? 0,
        origin: { kind: "drawn", playedPitch: pitch },
      };
      gesture.current = { pointerId: event.pointerId, kind: "draw", clientStartX: event.clientX, clientStartY: event.clientY,
        sourcePattern: currentPattern, sourceNotes: [note], sourceTick: tick, sourcePitch: pitch,
        bounds: { firstTick: startTick, lastStartTick: startTick, lowPitch: pitch, highPitch: pitch },
        selectedIds: new Set(), moved: false, preview: [note] };
    } else {
      const hit = noteIndex.hit(Math.floor(tick), pitch);
      if (!hit) { uiStore.selectOnly(null); requestPaint(); return; }
      if (event.shiftKey) { uiStore.toggleSelection(hit.id); return; }
      if (!selectedIds.has(hit.id)) uiStore.selectOnly(hit.id);
      const ids = selectedIds.has(hit.id) ? new Set(selectedIds) : new Set([hit.id]);
      const rect = noteRect(hit, view);
      const resize = ids.size === 1 && rect.width >= 16 && rect.x + rect.width - point.x <= 12;
      const sourceNotes = currentPattern.notes.filter((note) => ids.has(note.id));
      const bounds = sourceNotes.reduce((value, note) => ({
        firstTick: Math.min(value.firstTick, note.startTick),
        lastStartTick: Math.max(value.lastStartTick, note.startTick),
        lowPitch: Math.min(value.lowPitch, note.pitch),
        highPitch: Math.max(value.highPitch, note.pitch),
      }), { firstTick: Number.MAX_SAFE_INTEGER, lastStartTick: 0, lowPitch: 127, highPitch: 0 });
      gesture.current = { pointerId: event.pointerId, kind: resize ? "resize" : "move",
        clientStartX: event.clientX, clientStartY: event.clientY,
        sourcePattern: currentPattern, sourceNotes, sourceTick: tick, sourcePitch: pitch,
        bounds, selectedIds: ids, moved: false, preview: [] };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    requestPaint();
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    const active = updateGesture(event);
    if (!active) return;
    gesture.current = null;
    requestPaint();
    if (active.kind === "draw") {
      const note = active.preview[0]!;
      try {
        const next = createPianoRollNote(active.sourcePattern, note);
        uiStore.selectOnly(note.id);
        void commitPattern(next);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear la nota"); }
    } else if (active.kind === "resize" && active.moved) {
      const source = active.sourceNotes[0]!;
      const changed = active.preview[0]!;
      runEdit(() => editPianoRollNote(active.sourcePattern, source.id, editableFields(changed)));
    } else if (active.moved && active.preview.length) {
      const deltaTick = active.preview[0]!.startTick - active.sourceNotes[0]!.startTick;
      const deltaPitch = active.preview[0]!.pitch - active.sourceNotes[0]!.pitch;
      runEdit(() => withPadChannels(movePianoRollNotes(active.sourcePattern, active.selectedIds,
        deltaTick, deltaPitch), active.selectedIds));
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLCanvasElement>): void {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current = null;
      requestPaint();
    }
  }

  function deleteSelection(): void {
    const ids = new Set(selectedIds);
    if (!ids.size) return;
    try {
      void commitPattern(deletePianoRollNotes(currentPattern, ids)).then((accepted) => {
        if (accepted) uiStore.selectOnly(null);
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron borrar las notas"); }
  }

  function selectAdjacent(direction: -1 | 1): void {
    if (!orderedNotes.length) return;
    const currentId = selectedIds.values().next().value;
    const currentIndex = orderedNotes.findIndex((note) => note.id === currentId);
    const index = currentIndex < 0 ? direction === 1 ? 0 : orderedNotes.length - 1
      : Math.max(0, Math.min(orderedNotes.length - 1, currentIndex + direction));
    const note = orderedNotes[index]!;
    uiStore.selectOnly(note.id);
    const element = viewportElement.current;
    if (element) {
      const x = PIANO_ROLL_KEY_WIDTH + note.startTick * ui.pixelsPerQuarter / PROJECT_PPQ;
      const y = (127 - note.pitch) * PIANO_ROLL_ROW_HEIGHT;
      if (x < element.scrollLeft + PIANO_ROLL_KEY_WIDTH || x > element.scrollLeft + element.clientWidth - 40) {
        element.scrollLeft = Math.max(0, x - element.clientWidth / 3);
      }
      if (y < element.scrollTop || y > element.scrollTop + element.clientHeight - PIANO_ROLL_ROW_HEIGHT) {
        element.scrollTop = Math.max(0, y - element.clientHeight / 3);
      }
    }
    requestPaint();
  }

  function onCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) { if (canRedo) void onRedo?.(); }
      else if (canUndo) void onUndo?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (canRedo) void onRedo?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      uiStore.setSelection(currentPattern.notes.map((note) => note.id));
      return;
    }
    if (event.key === "Escape") { uiStore.selectOnly(null); return; }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); deleteSelection(); return;
    }
    if (event.key === "Enter" && selectedNote) { event.preventDefault(); previewNote(selectedNote); return; }
    if (busy || selectedIds.size === 0) return;
    const tickStep = event.altKey ? 1 : ui.snapTicks;
    const deltaTick = event.key === "ArrowLeft" ? -tickStep : event.key === "ArrowRight" ? tickStep : 0;
    const deltaPitch = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (deltaTick || deltaPitch) {
      event.preventDefault();
      const sourceNotes = currentPattern.notes.filter((note) => selectedIds.has(note.id));
      const padDelta = padPitchDelta(sourceNotes, deltaPitch);
      runEdit(() => withPadChannels(movePianoRollNotes(currentPattern, selectedIds,
        deltaTick, padDelta), selectedIds));
    }
  }

  function updateLaneGesture(event: PointerEvent<HTMLCanvasElement>): LaneGesture | null {
    const active = laneGesture.current;
    if (!active || active.pointerId !== event.pointerId) return null;
    const point = localPoint(event);
    active.moved = active.moved || Math.hypot(event.clientX - active.clientStartX,
      event.clientY - active.clientStartY) >= 3;
    if (!active.moved) return active;
    if (active.kind === "note") {
      const value = laneValueFromY(active.noteKind, point.y);
      active.previewNote = { ...active.sourceNote,
        [active.noteKind]: active.noteKind === "velocity" ? Math.max(1, value) : value };
    } else {
      const tick = Math.max(0, Math.min(active.sourcePattern.lengthTicks - 1,
        snapTick(xToTick(point.x, viewport()), ui.snapTicks)));
      const value = laneValueFromY(active.laneKind, point.y);
      const preview = active.previewEvent;
      active.previewEvent = preview.kind === "cc" ? { ...preview, tick, value }
        : preview.kind === "pitchBend" ? { ...preview, tick, value14: value }
          : preview.kind === "channelPressure" || preview.kind === "polyPressure"
            ? { ...preview, tick, pressure: value } : preview;
    }
    requestPaint();
    return active;
  }

  function onLanePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (busy || event.button !== 0) return;
    const point = localPoint(event);
    if (point.x < PIANO_ROLL_KEY_WIDTH) return;
    event.preventDefault();
    const tick = xToTick(point.x, viewport());
    const common = { pointerId: event.pointerId, clientStartX: event.clientX,
      clientStartY: event.clientY, sourcePattern: currentPattern, moved: false };
    if (laneKind === "velocity" || laneKind === "releaseVelocity") {
      const tolerance = Math.max(1, Math.ceil(12 * PROJECT_PPQ / ui.pixelsPerQuarter));
      const notes = noteIndex.query(Math.max(0, Math.floor(tick - tolerance)),
        Math.ceil(tick + tolerance) + 1).filter((note) => note.channel === laneChannel &&
        Math.abs(note.startTick - tick) <= tolerance);
      const note = notes.sort((left, right) => Math.abs(left.startTick - tick) -
        Math.abs(right.startTick - tick) || left.id.localeCompare(right.id))[0];
      if (!note) return;
      uiStore.selectOnly(note.id);
      setInspectorOpen(true);
      laneGesture.current = { ...common, kind: "note", noteKind: laneKind,
        sourceNote: note, previewNote: note };
    } else {
      const toleranceTicks = Math.max(1, Math.ceil(12 * PROJECT_PPQ / ui.pixelsPerQuarter));
      const value = laneValueFromY(laneKind, point.y);
      const toleranceValue = Math.ceil((laneKind === "pitchBend" ? 16383 : 127) * 16 / 98);
      const hit = hitPianoRollLaneEvent(currentPattern, laneKind, laneChannel, laneController,
        tick, toleranceTicks, value, toleranceValue);
      const atTick = Math.max(0, Math.min(currentPattern.lengthTicks - 1,
        snapTick(tick, ui.snapTicks)));
      const sequence = currentPattern.expression.reduce((max, item) =>
        Math.max(max, item.sequence + 1), 0);
      const base = { id: crypto.randomUUID(), tick: atTick, channel: laneChannel, sequence };
      const pressurePitch = hit?.kind === "polyPressure" ? hit.pitch :
        selectedNote?.channel === laneChannel ? selectedNote.pitch : 60;
      const created: ProjectExpressionEvent = laneKind === "cc"
        ? { ...base, kind: "cc", controller: laneController, value }
        : laneKind === "pitchBend" ? { ...base, kind: "pitchBend", value14: value }
          : laneKind === "channelPressure" ? { ...base, kind: "channelPressure", pressure: value }
            : { ...base, kind: "polyPressure", pitch: pressurePitch, pressure: value };
      setSelectedEventId(hit?.id ?? null);
      if (!hit) setLaneDraftTick(atTick);
      laneGesture.current = { ...common, kind: "expression", sourceEvent: hit,
        laneKind, channel: laneChannel, controller: laneController, pressurePitch,
        previewEvent: hit ?? created };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    requestPaint();
  }

  function onLanePointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    const active = updateLaneGesture(event);
    if (!active) return;
    laneGesture.current = null;
    requestPaint();
    try {
      if (active.kind === "note") {
        if (!active.moved || active.previewNote[active.noteKind] ===
            active.sourceNote[active.noteKind]) return;
        const next = editPianoRollNote(active.sourcePattern, active.sourceNote.id,
          { ...editableFields(active.sourceNote), [active.noteKind]: active.previewNote[active.noteKind] });
        void commitPattern(next);
      } else {
        const changed = !active.sourceEvent || active.sourceEvent.tick !== active.previewEvent.tick ||
          laneValue(active.sourceEvent) !== laneValue(active.previewEvent);
        if (active.sourceEvent && (!active.moved || !changed)) return;
        const next = active.sourceEvent
          ? editPianoRollExpression(active.sourcePattern, active.previewEvent)
          : createPianoRollExpression(active.sourcePattern, active.previewEvent);
        void commitPattern(next).then((accepted) => {
          if (accepted) setSelectedEventId(active.previewEvent.id);
        });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gesto MIDI inválido"); }
  }

  function onLanePointerCancel(event: PointerEvent<HTMLCanvasElement>): void {
    if (laneGesture.current?.pointerId !== event.pointerId) return;
    laneGesture.current = null;
    requestPaint();
  }

  function selectAdjacentEvent(direction: -1 | 1): void {
    if (!laneEvents.length) return;
    const index = laneEvents.findIndex((event) => event.id === selectedEventId);
    const nextIndex = index < 0 ? direction === 1 ? 0 : laneEvents.length - 1
      : Math.max(0, Math.min(laneEvents.length - 1, index + direction));
    const event = laneEvents[nextIndex]!;
    setSelectedEventId(event.id);
    const element = viewportElement.current;
    if (element) {
      const x = PIANO_ROLL_KEY_WIDTH + event.tick * ui.pixelsPerQuarter / PROJECT_PPQ;
      if (x < element.scrollLeft + PIANO_ROLL_KEY_WIDTH || x > element.scrollLeft + element.clientWidth - 30) {
        element.scrollLeft = Math.max(0, x - element.clientWidth / 3);
      }
    }
    requestPaint();
  }

  const contentWidth = PIANO_ROLL_KEY_WIDTH + contentEndTick * ui.pixelsPerQuarter / PROJECT_PPQ + 80;
  const selectionLabel = selectedNote
    ? `${pianoRollPitchLabel(selectedNote.pitch)}, tick ${selectedNote.startTick}, duración ${selectedNote.durationTick}, velocidad ${selectedNote.velocity}`
    : `${selectedIds.size} notas seleccionadas`;

  return <section className="piano-roll" aria-label="Piano roll" onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}>
    <header className="piano-roll__header">
      <div className="piano-roll__identity">
        <span className="piano-roll__eyebrow">{projectName ?? "Proyecto"} / {trackName ?? "Pista MIDI"}</span>
        <h2>{currentPattern.name}</h2>
        <span className="piano-roll__facts">{currentPattern.notes.length.toLocaleString("es-CO")} notas · {currentPattern.lengthTicks.toLocaleString("es-CO")} ticks · PPQ {PROJECT_PPQ}{captureOverlay?.length ? ` · ${captureOverlay.length} en grabación` : ""}</span>
      </div>
      {saveState && <span className={`piano-roll__save piano-roll__save--${saveState}`} role="status">{SAVE_LABELS[saveState]}</span>}
    </header>
    <div className="piano-roll__toolbar" aria-label="Herramientas del piano roll">
      <div className="piano-roll__tool-set" role="group" aria-label="Herramienta">
        {([ ["select", "Elegir", "Seleccionar notas"], ["draw", "Dibujar", "Dibujar notas"],
          ["pan", "Mover", "Desplazar vista"] ] as const).map(([tool, label, accessibleLabel]) =>
          <button type="button" key={tool} aria-label={accessibleLabel} title={accessibleLabel}
            aria-pressed={ui.tool === tool} className={ui.tool === tool ? "is-active" : ""}
            onClick={() => uiStore.setTool(tool)}>{label}</button>)}
      </div>
      <label className="piano-roll__select-label">Rejilla
        <select value={ui.snapTicks} onChange={(event) => uiStore.setSnapTicks(Number(event.target.value))}>
          {PIANO_ROLL_SNAPS.map((option) => <option key={option.ticks} value={option.ticks}>{option.label}</option>)}
        </select>
      </label>
      <div className="piano-roll__zoom" role="group" aria-label="Zoom horizontal">
        <button type="button" aria-label="Alejar" onClick={() => uiStore.setPixelsPerQuarter(ui.pixelsPerQuarter / 1.5)}>−</button>
        <output>{Math.round(ui.pixelsPerQuarter / 96 * 100)} %</output>
        <button type="button" aria-label="Acercar" onClick={() => uiStore.setPixelsPerQuarter(ui.pixelsPerQuarter * 1.5)}>+</button>
      </div>
      {(onUndo || onRedo) && <div className="piano-roll__history" role="group" aria-label="Historial">
        {onUndo && <button type="button" disabled={!canUndo || busy} onClick={() => void onUndo()}>Deshacer</button>}
        {onRedo && <button type="button" disabled={!canRedo || busy} onClick={() => void onRedo()}>Rehacer</button>}
      </div>}
      {ghostIndex && <button type="button" aria-pressed={showGhosts}
        onClick={() => setShowGhosts((value) => !value)}>{showGhosts ? "Ocultar" : "Mostrar"} notas fantasma</button>}
      {scaleClasses && <button type="button" aria-pressed={showScale}
        onClick={() => setShowScale((value) => !value)}>{showScale ? "Ocultar" : "Resaltar"} escala {scale?.name}</button>}
      {!scale && <label className="piano-roll__select-label">Escala
        <select aria-label="Tipo de escala" value={scaleMode}
          onChange={(event) => setScaleMode(event.target.value as "off" | "major" | "minor")}> 
          <option value="off">Sin resaltar</option><option value="major">Mayor</option>
          <option value="minor">Menor natural</option>
        </select></label>}
      {!scale && scaleMode !== "off" && <label className="piano-roll__select-label">Tónica
        <select aria-label="Tónica de escala" value={scaleRoot}
          onChange={(event) => setScaleRoot(Number(event.target.value))}>
          {SCALE_NAMES.map((name, pitchClass) => <option key={pitchClass} value={pitchClass}>{name}</option>)}
        </select></label>}
    </div>
    <details className="piano-roll__help" id="piano-roll-help"><summary>Gestos y atajos</summary>
      <p>Dibujar crea notas. Elegir permite arrastrar o cambiar duración desde el borde derecho. Mover desplaza la vista con el dedo. Shift añade notas a la selección.</p>
      <p>Con foco en la rejilla: flechas mueven la selección, Alt + flecha usa un tick, Supr borra, Esc limpia la selección y Ctrl/Cmd + A selecciona todas. Ctrl/Cmd + Z deshace; Ctrl/Cmd + Mayús + Z o Ctrl/Cmd + Y rehace.{onPreviewNote ? " Intro escucha la nota seleccionada." : ""}</p>
    </details>
    {padNameEntries.length > 0 && <details className="piano-roll__pad-legend">
      <summary>Nombres de pads · {padNameEntries.length}</summary>
      <ul>{padNameEntries.map(({ pitch, name }) => <li key={pitch}>
        <span>MIDI {pitch}</span><strong>{name}</strong>
      </li>)}</ul>
    </details>}
    {(error || externalError) && <p className="piano-roll__error" role="alert">{error || externalError}</p>}
    <div className="piano-roll__viewport-shell">
      <div className="piano-roll__viewport" ref={viewportElement} onScroll={requestPaint}>
        <div className="piano-roll__world" style={{ width: Math.max(contentWidth, size.width), height: 128 * PIANO_ROLL_ROW_HEIGHT }}>
          <canvas ref={canvasElement} className="piano-roll__canvas" width={Math.max(1, size.width)} height={Math.max(1, size.height)}
            style={{ width: size.width, height: size.height, touchAction: ui.tool === "pan" ? "auto" : "none",
              pointerEvents: ui.tool === "pan" ? "none" : "auto" }}
            tabIndex={0} aria-label={`Rejilla de ${currentPattern.name}. ${currentPattern.notes.length} notas.`}
            aria-describedby="piano-roll-help" onPointerDown={onPointerDown} onPointerMove={updateGesture}
            onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel} onKeyDown={onCanvasKeyDown} />
        </div>
      </div>
      {readPlayheadTick && <span className="piano-roll__live-playhead" ref={livePlayheadElement} aria-hidden="true" />}
    </div>
    <section className="piano-roll__lane" aria-label="Carril MIDI">
      <div className="piano-roll__lane-toolbar">
        <label>Carril<select aria-label="Tipo de carril" value={laneKind}
          onChange={(event) => { setLaneKind(event.target.value as PianoRollLaneKind); setSelectedEventId(null); }}>
          <option value="velocity">Velocidad</option><option value="releaseVelocity">Velocidad de salida</option>
          <option value="cc">Control CC</option><option value="pitchBend">Pitch bend</option>
          <option value="channelPressure">Presión de canal</option><option value="polyPressure">Presión polifónica</option>
        </select></label>
        <label>Canal<select aria-label="Canal del carril" value={laneChannel}
          onChange={(event) => { setLaneChannel(Number(event.target.value)); setSelectedEventId(null); }}>
          {Array.from({ length: 16 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select></label>
        {laneKind === "cc" && <label>CC<input aria-label="Controlador CC" type="number" inputMode="numeric"
          min={0} max={127} value={laneController}
          onChange={(event) => { setLaneController(Math.max(0, Math.min(127, Number(event.target.value))));
            setSelectedEventId(null); }} /></label>}
      </div>
      <canvas className="piano-roll__lane-canvas" ref={laneCanvasElement} width={Math.max(1, size.width)} height={116}
        style={{ width: size.width, height: 116, touchAction: "none" }} tabIndex={0}
        aria-label={`${laneKind === "cc" ? `CC ${laneController}` : laneKind}, canal ${laneChannel + 1}`}
        onPointerDown={onLanePointerDown} onPointerMove={updateLaneGesture}
        onPointerUp={onLanePointerUp} onPointerCancel={onLanePointerCancel}
        onLostPointerCapture={onLanePointerCancel} onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); selectAdjacentEvent(event.key === "ArrowRight" ? 1 : -1);
          }
        }} />
      {laneKind === "velocity" || laneKind === "releaseVelocity"
        ? <p className="piano-roll__lane-note">Arrastra una barra vertical para ajustar {laneKind === "velocity"
          ? "la velocidad" : "la velocidad de salida"}; toca para seleccionar y usa el inspector para el valor exacto.</p>
        : <>
          <div className="piano-roll__lane-navigation" role="group" aria-label="Navegar eventos MIDI">
            <span>{laneEvents.length} eventos en canal {laneChannel + 1}{selectedEvent?.kind === "polyPressure"
              ? ` · pitch ${selectedEvent.pitch}` : ""}. Toca vacío para crear; arrastra un punto para moverlo.</span>
            <button type="button" disabled={!laneEvents.length} onClick={() => selectAdjacentEvent(-1)}>Evento anterior</button>
            <button type="button" disabled={!laneEvents.length} onClick={() => selectAdjacentEvent(1)}>Evento siguiente</button>
          </div>
          <PianoRollExpression key={`${laneKind}:${laneChannel}:${laneController}:${selectedEvent?.id ?? `new-${laneDraftTick}`}:${selectedEvent?.tick ?? ""}:${selectedEvent ? JSON.stringify(selectedEvent) : ""}`}
            pattern={currentPattern} kind={laneKind} channel={laneChannel} controller={laneController}
            draftTick={laneDraftTick} selectedEvent={selectedEvent} busy={busy}
            onCommit={commitPattern} onSelect={setSelectedEventId} />
        </>}
    </section>
    <div className="piano-roll__selection-row">
      <span role="status" aria-live="polite">{selectionLabel}</span>
      <div role="group" aria-label="Navegar entre notas">
        <button type="button" onClick={() => selectAdjacent(-1)} disabled={!orderedNotes.length}>Nota anterior</button>
        <button type="button" onClick={() => selectAdjacent(1)} disabled={!orderedNotes.length}>Nota siguiente</button>
      </div>
    </div>
    {selectedTailCount > 0 && <p className="piano-roll__lane-note" role="status">
      {selectedTailCount} {selectedTailCount === 1 ? "nota termina" : "notas terminan"} después del tick
      {" "}{currentPattern.lengthTicks}. Su cola depende de la política del clip; los cambios conservan la duración completa.
    </p>}
    <section className="piano-roll__inspector" aria-label="Inspector de notas">
      <button type="button" className="piano-roll__inspector-toggle" aria-expanded={inspectorOpen}
        onClick={() => setInspectorOpen((open) => !open)}>
        Inspector {selectedIds.size > 0 ? `· ${selectedIds.size} ${selectedIds.size === 1 ? "nota" : "notas"}` : "· sin selección"}
        <span aria-hidden="true">{inspectorOpen ? "▴" : "▾"}</span>
      </button>
      <div className={`piano-roll__inspector-content ${inspectorOpen ? "is-open" : ""}`}>
        {selectedNote ? <NoteInspector key={`${selectedNote.id}:${selectedNote.startTick}:${selectedNote.durationTick}:${selectedNote.pitch}:${selectedNote.velocity}:${selectedNote.releaseVelocity}:${selectedNote.channel}:${selectedNote.microOffsetTick}:${selectedNote.probability}:${selectedNote.ratchetCount}:${selectedNote.muted}`}
          note={selectedNote} busy={busy}
          onApply={(fields, performance) => runEdit(() => editPianoRollNoteWithPerformance(currentPattern,
            selectedNote.id, fields, performance))}
          onDelete={deleteSelection} onPreview={onPreviewNote ? () => previewNote(selectedNote) : undefined} />
          : selectedIds.size > 1 ? <div className="piano-roll__multi-selection"><p>{selectedIds.size} notas listas para mover con el puntero o las flechas.</p>
            <button type="button" className="piano-roll__danger" disabled={busy} onClick={deleteSelection}>Borrar selección</button></div>
            : <p className="piano-roll__no-selection">Selecciona una nota para editar cada valor exactamente.</p>}
      </div>
    </section>
    <PianoRollOperations pattern={currentPattern} selectedIds={selectedIds} snapTicks={ui.snapTicks}
      playheadTick={playheadTick} readPlayheadTick={readPlayheadTick} busy={busy} onCommit={commitPattern}
      onSelect={(ids) => uiStore.setSelection(ids)}
      onPreview={(notes) => setTransformPreview(notes ? { sourceVersion: currentPattern.version, notes } : null)} />
  </section>;
}
