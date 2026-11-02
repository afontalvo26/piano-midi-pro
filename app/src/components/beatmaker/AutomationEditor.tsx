import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, PointerEvent } from "react";
import type { ProjectAutomationLane, ProjectDocumentV1 } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import type { AutomationValueSnapshot } from "../../sequencer/automationResolver.ts";
import { projectAutomationBaseValue, projectAutomationParameter } from "../../project/automationParameters.ts";
import { addAutomationPoint, automationTargetKey, copySelectedAutomationPoints, createBaseAutomationLane,
  deleteAutomationLane, deleteSelectedAutomationPoints, moveAutomationPoint,
  moveSelectedAutomationPoints, pasteAutomationPoints, setAutomationWriteMode,
  writeAutomationTouchGesture } from "../../composition/automationEdit.ts";
import type { AutomationPointCopy, AutomationTouchSample,
  BaseAutomationTarget } from "../../composition/automationEdit.ts";
import { parseAutomationMidiAction,
  type AutomationMidiTakeover } from "../../midi/automationMidi.ts";
import { AUTOMATION_CANVAS_HEIGHT, AUTOMATION_CANVAS_TOP, AUTOMATION_CANVAS_BOTTOM,
  automationTickAtX, automationValueAtY, drawAutomationLane,
  drawAutomationPlayhead, hitAutomationPoint } from "../../composition/automationCanvas.ts";
import type { AutomationCanvasViewport } from "../../composition/automationCanvas.ts";
import "./AutomationEditor.css";

export interface AutomationEditorProps {
  readonly document: ProjectDocumentV1 | null;
  /** Set true only after live and WAV playback of the offered targets passes QA. */
  readonly readPlaybackReady: boolean;
  /** Exact targets proven by the audio runtime; unsupported lanes remain visible but read-only. */
  readonly availableTargets: readonly BaseAutomationTarget[];
  readonly playheadTick?: number;
  readonly readPlayheadTick?: () => number;
  readonly effectiveValues?: readonly AutomationValueSnapshot[];
  /** Immediate audio preview while a Touch gesture owns the control. */
  readonly onTouchPreview?: (laneId: string, target: ProjectAutomationLane["target"], value: number) => void;
  /** Releases temporary physical ownership after the gesture commits or is cancelled. */
  readonly onTouchRelease?: (laneId: string) => void;
  readonly midiLearnAction?: string | null;
  readonly onMidiLearn?: (laneId: string, takeover: AutomationMidiTakeover) => void;
  readonly onCancelMidiLearn?: () => void;
  readonly onCommand: (command: ProjectCommand) => void | Promise<void>;
  readonly onUndo?: () => void | Promise<void>;
  readonly onRedo?: () => void | Promise<void>;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly saveState?: "clean" | "pending" | "saving" | "error" | "conflict";
}

type Tool = "navigate" | "edit";
type PointPosition = { readonly tick: number; readonly value: number };
interface DragGesture {
  readonly pointerId: number;
  readonly kind: "move" | "create";
  readonly startX: number;
  readonly startY: number;
  readonly pointIds: ReadonlySet<string>;
  readonly source: ReadonlyMap<string, PointPosition>;
  deltaTick: number;
  deltaValue: number;
  preview: ReadonlyMap<string, PointPosition>;
}

const ZOOMS = [0.06, 0.12, 0.24, 0.48] as const;
const SNAPS = [1, 60, 120, 240, 480, 960] as const;

function targetName(document: ProjectDocumentV1, target: ProjectAutomationLane["target"]): string {
  const scope = target.scope === "master" ? "Master"
    : target.scope === "track" ? document.tracks.find((track) => track.id === target.ownerId)?.name ?? "Pista eliminada"
      : `Clip ${target.ownerId ?? "?"}`;
  const parameter = target.parameterId === "gainDb" || target.parameterId === "masterGainDb"
    ? "volumen" : target.parameterId === "pan" ? "panorama" : target.parameterId;
  return `${scope} · ${parameter}${target.effectId ? ` · efecto ${target.effectId}` : ""}`;
}

function baseValue(document: ProjectDocumentV1, lane: ProjectAutomationLane): number {
  return projectAutomationBaseValue(document, lane.target) ?? 0;
}

function preciseValue(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function configureCanvas(canvas: HTMLCanvasElement, width: number): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.round(AUTOMATION_CANVAS_HEIGHT * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${AUTOMATION_CANVAS_HEIGHT}px`;
  }
  const context = canvas.getContext("2d");
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

export function AutomationEditor(props: AutomationEditorProps) {
  if (!props.document || !props.readPlaybackReady || !props.availableTargets.length) return null;
  return <AutomationEditorReady {...props} document={props.document} />;
}

function AutomationEditorReady({ document, availableTargets, playheadTick = 0,
  readPlayheadTick, effectiveValues, onTouchPreview, onTouchRelease, midiLearnAction, onMidiLearn,
  onCancelMidiLearn, onCommand, onUndo, onRedo, canUndo, canRedo,
  saveState }: AutomationEditorProps & { readonly document: ProjectDocumentV1 }) {
  const [selectedLaneId, setSelectedLaneId] = useState(document.automation[0]?.id ?? "");
  const [targetChoice, setTargetChoice] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [clipboard, setClipboard] = useState<readonly AutomationPointCopy[]>([]);
  const [tool, setTool] = useState<Tool>("navigate");
  const [multiSelect, setMultiSelect] = useState(false);
  const [midiTakeover, setMidiTakeover] = useState<AutomationMidiTakeover>("pickup");
  const [zoomIndex, setZoomIndex] = useState(1);
  const [snapTicks, setSnapTicks] = useState<number>(120);
  const [pasteTick, setPasteTick] = useState("0");
  const [rangeStart, setRangeStart] = useState("0");
  const [rangeEnd, setRangeEnd] = useState("960");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<DragGesture | null>(null);
  const touchSamplesRef = useRef<AutomationTouchSample[] | null>(null);
  const [touchValue, setTouchValue] = useState(0);
  const targetKeys = useMemo(() => new Set(availableTargets.map(automationTargetKey)), [availableTargets]);
  const lane = document.automation.find((item) => item.id === selectedLaneId) ?? document.automation[0] ?? null;
  const laneClip = lane?.target.scope === "clip"
    ? document.clips.find((clip) => clip.id === lane.target.ownerId) : undefined;
  const laneTick = (globalTick: number): number => laneClip
    ? Math.max(0, Math.min(Math.max(0, laneClip.lengthTicks - 1), globalTick - laneClip.startTick))
    : Math.max(0, globalTick);
  const descriptor = lane ? projectAutomationParameter(document, lane.target) : undefined;
  const editable = !!lane && !!descriptor && targetKeys.has(automationTargetKey(lane.target));
  const selectedPoints = useMemo(() => lane?.points.filter((point) => selectedIds.has(point.id)) ?? [],
    [lane, selectedIds]);
  const selectedPoint = selectedPoints.length === 1 ? selectedPoints[0] : null;
  const effectiveValue = effectiveValues?.find((item) => item.laneId === lane?.id);
  const learnedPending = parseAutomationMidiAction(midiLearnAction ?? "");
  const learningThisLane = learnedPending?.laneId === lane?.id;
  useEffect(() => {
    if (!lane || !descriptor || touchSamplesRef.current) return;
    const value = effectiveValue?.value ?? baseValue(document, lane);
    setTouchValue(Math.max(descriptor.min, Math.min(descriptor.max,
      preciseValue(value, descriptor.unit === "pan" ? 0.01 : 0.1))));
  }, [lane, descriptor, effectiveValue?.value, document]);
  const missingTargets = availableTargets.filter((target) => !document.automation.some((item) =>
    automationTargetKey(item.target) === automationTargetKey(target)));
  const chosenTarget = missingTargets.find((target) => automationTargetKey(target) === targetChoice) ??
    missingTargets[0];
  const maxTick = laneClip ? laneClip.lengthTicks : Math.max(3840 * 8, playheadTick + 3840,
    document.clips.reduce((end, clip) => Math.max(end, clip.startTick + clip.lengthTicks), 0),
    document.sections.reduce((end, section) => Math.max(end, section.startTick + section.lengthTicks), 0),
    lane?.points.at(-1)?.tick ? lane.points.at(-1)!.tick + 3840 : 0);
  const pxPerTick = ZOOMS[zoomIndex]!;
  const worldWidth = 46 + maxTick * pxPerTick + 150;
  const valueStep = descriptor?.unit === "pan" ? 0.01 : 0.1;
  const viewport = useCallback((): AutomationCanvasViewport | null => {
    const timeline = timelineRef.current;
    if (!timeline || !descriptor) return null;
    return { width: timeline.clientWidth, scrollLeft: timeline.scrollLeft,
      pxPerTick, min: descriptor.min, max: descriptor.max };
  }, [descriptor, pxPerTick]);
  const drawBase = useCallback(() => {
    if (!lane || !descriptor || !canvasRef.current) return;
    const view = viewport();
    if (!view) return;
    const context = configureCanvas(canvasRef.current, view.width);
    if (!context) return;
    drawAutomationLane(context, view, lane.points, document.meterMap, baseValue(document, lane),
      selectedIds, descriptor.unit === "dB" ? " dB" : "", gestureRef.current?.preview);
  }, [lane, descriptor, viewport, document, selectedIds]);
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const observer = new ResizeObserver(drawBase);
    observer.observe(timeline);
    drawBase();
    return () => observer.disconnect();
  }, [drawBase]);
  useEffect(() => {
    const canvas = playheadCanvasRef.current;
    const timeline = timelineRef.current;
    if (!canvas || !timeline || !lane) return;
    let visible = true;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => { visible = !!entries[0]?.isIntersecting; });
    observer.observe(timeline);
    const paint = () => {
      if (visible) {
        const view = viewport();
        if (view) {
          const context = configureCanvas(canvas, view.width);
          if (context) drawAutomationPlayhead(context, view,
            laneTick(readPlayheadTick?.() ?? playheadTick));
        }
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [lane, laneClip, viewport, readPlayheadTick, playheadTick]);

  async function commit(factory: () => ProjectCommand): Promise<void> {
    if (busy) return;
    try {
      const command = factory();
      setBusy(true);
      setError("");
      await onCommand(command);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function sampleTouch(value: number): void {
    if (!lane || !descriptor || !touchSamplesRef.current) return;
    const nextValue = Math.max(descriptor.min, Math.min(descriptor.max,
      preciseValue(value, valueStep)));
    const tick = Math.round(laneTick(readPlayheadTick?.() ?? playheadTick));
    const samples = touchSamplesRef.current;
    const last = samples.at(-1);
    if (last?.tick === tick) samples[samples.length - 1] = { tick, value: nextValue };
    else samples.push({ tick, value: nextValue });
    setTouchValue(nextValue);
    onTouchPreview?.(lane.id, lane.target, nextValue);
  }

  async function finishTouch(): Promise<void> {
    if (!lane) return;
    const activeLaneId = lane.id;
    const samples = touchSamplesRef.current;
    touchSamplesRef.current = null;
    if (samples?.length) await commit(() =>
      writeAutomationTouchGesture(document, activeLaneId, samples));
    onTouchRelease?.(activeLaneId);
  }

  function pointerPosition(event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (!lane || !editable || busy) return;
    const view = viewport();
    if (!view) return;
    const { x, y } = pointerPosition(event);
    const hit = hitAutomationPoint(lane.points, view, x, y);
    if (hit) {
      if (event.shiftKey || multiSelect) {
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
          return next;
        });
        return;
      }
      const ids = selectedIds.has(hit.id) ? selectedIds : new Set([hit.id]);
      setSelectedIds(ids);
      if (tool !== "edit") return;
      const source = new Map(lane.points.filter((point) => ids.has(point.id)).map((point) =>
        [point.id, { tick: point.tick, value: point.value }] as const));
      gestureRef.current = { pointerId: event.pointerId, kind: "move", startX: x, startY: y,
        pointIds: ids, source, deltaTick: 0, deltaValue: 0, preview: source };
    } else if (tool === "edit" && y >= AUTOMATION_CANVAS_TOP &&
        y <= AUTOMATION_CANVAS_HEIGHT - AUTOMATION_CANVAS_BOTTOM) {
      setSelectedIds(new Set());
      const tick = Math.max(0, Math.round(automationTickAtX(x, view) / snapTicks) * snapTicks);
      const value = preciseValue(automationValueAtY(y, view), valueStep);
      const source = new Map([["new", { tick, value }]]);
      gestureRef.current = { pointerId: event.pointerId, kind: "create", startX: x, startY: y,
        pointIds: new Set(), source, deltaTick: 0, deltaValue: 0, preview: source };
    } else if (!event.shiftKey) setSelectedIds(new Set());
    if (gestureRef.current) event.currentTarget.setPointerCapture(event.pointerId);
    drawBase();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !descriptor) return;
    const view = viewport();
    if (!view) return;
    const { x, y } = pointerPosition(event);
    if (gesture.kind === "create") {
      const tick = Math.max(0, Math.round(automationTickAtX(x, view) / snapTicks) * snapTicks);
      const value = preciseValue(automationValueAtY(y, view), valueStep);
      gesture.preview = new Map([["new", { tick, value }]]);
    } else {
      gesture.deltaTick = Math.round((x - gesture.startX) / view.pxPerTick / snapTicks) * snapTicks;
      gesture.deltaValue = preciseValue((gesture.startY - y) /
        (AUTOMATION_CANVAS_HEIGHT - AUTOMATION_CANVAS_TOP - AUTOMATION_CANVAS_BOTTOM) *
        (descriptor.max - descriptor.min), valueStep);
      gesture.preview = new Map([...gesture.source].map(([id, point]) => [id,
        { tick: Math.max(0, point.tick + gesture.deltaTick),
          value: Math.max(descriptor.min, Math.min(descriptor.max,
            preciseValue(point.value + gesture.deltaValue, valueStep))) }]));
    }
    drawBase();
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !lane) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (gesture.kind === "create") {
      const point = gesture.preview.get("new");
      if (point) void commit(() => addAutomationPoint(document, lane.id,
        { id: crypto.randomUUID(), ...point, shape: "linear" }));
    } else if (gesture.deltaTick || gesture.deltaValue) {
      void commit(() => moveSelectedAutomationPoints(document, lane.id, gesture.pointIds,
        gesture.deltaTick, gesture.deltaValue));
    }
    drawBase();
  }

  function onPointerCancel(): void { gestureRef.current = null; drawBase(); }

  function createPoint(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!lane || !editable) return;
    const form = new FormData(event.currentTarget);
    const tick = Number(form.get("tick"));
    const value = Number(form.get("value"));
    const shapeValue = form.get("shape");
    const shape = shapeValue === "step" ? "step" : shapeValue === "bezier" ? "bezier" : "linear";
    const curve = shape === "bezier" ? Number(form.get("curve")) : undefined;
    void commit(() => addAutomationPoint(document, lane.id,
      { id: crypto.randomUUID(), tick, value, shape, ...(curve === undefined ? {} : { curve }) }));
  }

  function savePoint(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!lane || !selectedPoint || !editable) return;
    const form = new FormData(event.currentTarget);
    const shapeValue = form.get("shape");
    const shape = shapeValue === "step" ? "step" : shapeValue === "bezier" ? "bezier" : "linear";
    void commit(() => moveAutomationPoint(document, lane.id, selectedPoint.id,
      { tick: Number(form.get("tick")), value: Number(form.get("value")), shape,
        curve: shape === "bezier" ? Number(form.get("curve")) : undefined }));
  }

  function copySelection(): void {
    if (!lane || !editable || !selectedPoints.length) return;
    const copied = copySelectedAutomationPoints(document, lane.id, selectedIds);
    setClipboard(copied);
    setPasteTick(String(Math.min(...selectedPoints.map((point) => point.tick)) + snapTicks));
  }

  function pasteSelection(): void {
    if (!lane || !editable || !clipboard.length) return;
    void commit(() => pasteAutomationPoints(document, lane.id, Number(pasteTick), clipboard));
  }

  function keyboard(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (!lane || !editable || busy) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === "a") {
      event.preventDefault(); setSelectedIds(new Set(lane.points.map((point) => point.id))); return;
    }
    if (ctrl && event.key.toLowerCase() === "c") { event.preventDefault(); copySelection(); return; }
    if (ctrl && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelection(); return; }
    if (event.key === "Escape") { event.preventDefault(); setSelectedIds(new Set()); return; }
    if (!selectedPoints.length) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); void commit(() => deleteSelectedAutomationPoints(document, lane.id, selectedIds));
      setSelectedIds(new Set()); return;
    }
    const tickStep = event.altKey ? 1 : snapTicks;
    const deltaTick = event.key === "ArrowLeft" ? -tickStep : event.key === "ArrowRight" ? tickStep : 0;
    const deltaValue = event.key === "ArrowUp" ? valueStep : event.key === "ArrowDown" ? -valueStep : 0;
    if (deltaTick || deltaValue) {
      event.preventDefault();
      void commit(() => moveSelectedAutomationPoints(document, lane.id, selectedIds,
        deltaTick, deltaValue));
    }
  }

  function selectRange(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!lane) return;
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
      setError("El tramo necesita inicio y fin enteros crecientes"); return;
    }
    setSelectedIds(new Set(lane.points.filter((point) => point.tick >= start && point.tick < end)
      .map((point) => point.id)));
    setError("");
  }

  return <section className="automation-editor" aria-label="Automatización"
    onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
    <header className="automation-editor__header">
      <div><span className="automation-editor__eyebrow">Studio · AUT</span><h2>Automatización</h2>
        <p>Curvas de mezcla por tick. La expresión MIDI permanece en cada patrón.</p></div>
      {saveState && <small className={`automation-editor__save automation-editor__save--${saveState}`}>
        {saveState === "clean" ? "Guardado" : saveState === "pending" ? "Pendiente"
          : saveState === "saving" ? "Guardando" : saveState === "conflict" ? "Conflicto" : "Error"}</small>}
    </header>
    {error && <p className="automation-editor__error" role="alert">{error}</p>}
    <div className="automation-editor__selectors">
      <label>Curva<select aria-label="Curva de automatización" value={lane?.id ?? ""}
        onChange={(event) => { setSelectedLaneId(event.target.value); setSelectedIds(new Set()); setError(""); }}>
        {!lane && <option value="">Sin curvas</option>}
        {document.automation.map((item) => <option key={item.id} value={item.id}>
          {targetName(document, item.target)}{targetKeys.has(automationTargetKey(item.target))
            ? "" : " · no disponible"}</option>)}
      </select></label>
      {missingTargets.length > 0 && <div className="automation-editor__new-lane">
        <label>Nuevo parámetro<select aria-label="Nuevo parámetro automatizable"
          value={chosenTarget ? automationTargetKey(chosenTarget) : ""}
          onChange={(event) => setTargetChoice(event.target.value)}>
          {missingTargets.map((target) => <option key={automationTargetKey(target)}
            value={automationTargetKey(target)}>{targetName(document, target)}</option>)}
        </select></label>
        <button type="button" disabled={busy || !chosenTarget}
          onClick={() => { if (chosenTarget) void commit(() => createBaseAutomationLane(document,
            chosenTarget)); }}>Crear curva</button>
      </div>}
    </div>
    {lane && <>
      <div className="automation-editor__write">
        <div role="group" aria-label="Modo de escritura de automatización">
          <button type="button" aria-pressed={(lane.writeMode ?? "read") === "read"}
            disabled={busy} onClick={() => void commit(() =>
              setAutomationWriteMode(document, lane.id, "read"))}>Read</button>
          <button type="button" aria-pressed={lane.writeMode === "touch"}
            disabled={busy || !editable} onClick={() => void commit(() =>
              setAutomationWriteMode(document, lane.id, "touch"))}>Touch</button>
        </div>
        <label>Fader Touch · {descriptor?.unit}
          <input type="range" aria-label="Fader Touch de automatización"
            min={descriptor?.min} max={descriptor?.max} step={valueStep} value={touchValue}
            disabled={!editable || lane.writeMode !== "touch" || busy}
            onPointerDown={(event) => {
              touchSamplesRef.current = [];
              event.currentTarget.setPointerCapture(event.pointerId);
              sampleTouch(Number(event.currentTarget.value));
            }}
            onChange={(event) => sampleTouch(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
                "PageUp", "PageDown"].includes(event.key) || touchSamplesRef.current) return;
              touchSamplesRef.current = [];
              sampleTouch(Number(event.currentTarget.value));
            }}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
                "PageUp", "PageDown"].includes(event.key)) void finishTouch();
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              void finishTouch();
            }}
            onPointerCancel={() => {
              touchSamplesRef.current = null;
              const restore = effectiveValue?.value ?? baseValue(document, lane);
              setTouchValue(restore);
              onTouchRelease?.(lane.id);
            }} />
        </label>
        <output aria-live="polite">{touchValue.toFixed(descriptor?.unit === "pan" ? 2 : 1)}
          {descriptor?.unit === "dB" ? " dB" : ""}</output>
        <small>Touch escribe un solo gesto reversible y vuelve suavemente a la curva al soltar.</small>
      </div>
      {onMidiLearn && <div className="automation-editor__midi-learn">
        <label>Takeover MIDI<select aria-label="Takeover MIDI Learn" value={midiTakeover}
          disabled={learningThisLane}
          onChange={(event) => setMidiTakeover(event.target.value as AutomationMidiTakeover)}>
          <option value="pickup">Pickup · sin salto</option>
          <option value="absolute">Absoluto 0–127</option>
          <option value="relative-twos-complement">Relativo · complemento a 2</option>
          <option value="relative-binary-offset">Relativo · offset 64</option>
        </select></label>
        {!learningThisLane ? <button type="button" disabled={!editable || busy}
          onClick={() => { if (lane) onMidiLearn(lane.id, midiTakeover); }}>
          MIDI Learn</button> :
          <button type="button" onClick={onCancelMidiLearn}>Cancelar Learn</button>}
        <p>{learningThisLane
          ? "Mueve ahora el fader/knob físico. Solo se aprenderá el mensaje observado, con puerto, canal y banco actuales."
          : "Pickup espera a que el control físico alcance el valor software; los modos relativos no saltan a una posición absoluta."}</p>
      </div>}
      <div className="automation-editor__toolbar">
        <div role="group" aria-label="Herramienta de automatización">
          <button type="button" aria-pressed={tool === "navigate"} onClick={() => setTool("navigate")}>Desplazar</button>
          {editable && <button type="button" aria-pressed={tool === "edit"}
            onClick={() => setTool("edit")}>Dibujar / mover</button>}
        </div>
        <label>Snap<select aria-label="Snap de automatización" value={snapTicks}
          onChange={(event) => setSnapTicks(Number(event.target.value))}>
          {SNAPS.map((step) => <option key={step} value={step}>{step === 1 ? "Libre · 1 tick" : `${step} ticks`}</option>)}
        </select></label>
        <div role="group" aria-label="Zoom de automatización">
          <button type="button" aria-label="Alejar automatización" disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}>−</button>
          <output>{Math.round(pxPerTick * 3840)} px/compás</output>
          <button type="button" aria-label="Acercar automatización" disabled={zoomIndex === ZOOMS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOMS.length - 1, index + 1))}>+</button>
        </div>
        {(onUndo || onRedo) && <div role="group" aria-label="Historial de automatización">
          {onUndo && <button type="button" disabled={busy || !canUndo} onClick={() => void onUndo()}>Deshacer</button>}
          {onRedo && <button type="button" disabled={busy || !canRedo} onClick={() => void onRedo()}>Rehacer</button>}
        </div>}
      </div>
      <p className="automation-editor__hint" id="automation-editor-help">
        Desplazar permite recorrer la línea. Dibujar / mover crea puntos al tocar y mueve una selección al arrastrar.
        Shift o Selección múltiple añade puntos; flechas mueven, Alt + flecha ajusta un tick, Supr borra.
      </p>
      <div className="automation-editor__timeline" ref={timelineRef} onScroll={drawBase}>
        <div className="automation-editor__world" style={{ width: worldWidth }}>
          <canvas ref={canvasRef} width={320} height={AUTOMATION_CANVAS_HEIGHT}
            className={`automation-editor__canvas automation-editor__canvas--${tool}`}
            aria-label={`Curva ${targetName(document, lane.target)}; ${lane.points.length} puntos`}
            aria-describedby="automation-editor-help" tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
            onKeyDown={keyboard} />
          <canvas ref={playheadCanvasRef} width={320} height={AUTOMATION_CANVAS_HEIGHT}
            className="automation-editor__playhead" aria-hidden="true" />
        </div>
      </div>
      <p className="automation-editor__selection" aria-live="polite">
        {selectedPoints.length} {selectedPoints.length === 1 ? "punto seleccionado" : "puntos seleccionados"}
        {effectiveValue &&
          <> · Valor efectivo {effectiveValue.value} · dueño {effectiveValue.owner} · tick {effectiveValue.tick}</>}
      </p>
      {!editable ? <p className="automation-editor__unknown">
        Esta curva se conserva sin cambios: el parámetro no está disponible o usa una forma aún sin reproducción verificada.
      </p> : <>
        <div className="automation-editor__actions">
          <button type="button" aria-pressed={multiSelect} onClick={() => setMultiSelect((value) => !value)}>
            Selección múltiple</button>
          <button type="button" disabled={!lane.points.length}
            onClick={() => setSelectedIds(new Set(lane.points.map((point) => point.id)))}>Seleccionar todos</button>
          <button type="button" disabled={!selectedPoints.length} onClick={copySelection}>Copiar puntos</button>
          <button type="button" disabled={!selectedPoints.length || busy} onClick={() => {
            void commit(() => deleteSelectedAutomationPoints(document, lane.id, selectedIds));
            setSelectedIds(new Set());
          }}>Borrar puntos</button>
          <button type="button" className="automation-editor__danger" disabled={busy}
            onClick={() => { void commit(() => deleteAutomationLane(document, lane.id));
              setSelectedIds(new Set()); }}>Borrar curva</button>
        </div>
        <form className="automation-editor__form" onSubmit={selectRange}>
          <strong>Seleccionar tramo [inicio, fin)</strong>
          <label>Inicio · tick<input type="number" inputMode="numeric" min={0} required value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)} /></label>
          <label>Fin · tick<input type="number" inputMode="numeric" min={1} required value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)} /></label>
          <button type="submit">Seleccionar tramo</button>
        </form>
        <form className="automation-editor__form" onSubmit={createPoint}>
          <strong>Añadir punto exacto</strong>
          <label>Tick<input name="tick" type="number" inputMode="numeric" min={0} step={1}
            defaultValue={Math.round(laneTick(playheadTick))}
            max={laneClip ? Math.max(0, laneClip.lengthTicks - 1) : undefined} required /></label>
          <label>Valor · {descriptor?.unit}<input name="value" type="number" inputMode="decimal"
            min={descriptor?.min} max={descriptor?.max} step="any" defaultValue={baseValue(document, lane)} required /></label>
          <label>Tramo saliente<select name="shape" defaultValue="linear">
            <option value="linear">Lineal</option><option value="step">Escalón</option>
            <option value="bezier">Bézier suavizada</option>
          </select></label>
          <label>Curvatura Bézier<input name="curve" type="number" inputMode="decimal"
            min="-1" max="1" step="0.05" defaultValue="0" />
            <small>−1 = entrada lenta · 0 = lineal · +1 = entrada rápida</small></label>
          <button type="submit" disabled={busy}>Añadir punto</button>
        </form>
        {selectedPoint && <form key={`${selectedPoint.id}:${selectedPoint.tick}:${selectedPoint.value}:${selectedPoint.shape}:${selectedPoint.curve ?? 0}`}
          className="automation-editor__form" onSubmit={savePoint}>
          <strong>Punto seleccionado · {selectedPoint.id}</strong>
          <label>Tick exacto<input name="tick" type="number" inputMode="numeric" min={0} step={1}
            defaultValue={selectedPoint.tick} required /></label>
          <label>Valor exacto · {descriptor?.unit}<input name="value" type="number" inputMode="decimal"
            min={descriptor?.min} max={descriptor?.max} step="any" defaultValue={selectedPoint.value} required /></label>
          <label>Tramo saliente<select name="shape" defaultValue={selectedPoint.shape}>
            <option value="linear">Lineal</option><option value="step">Escalón</option>
            <option value="bezier">Bézier suavizada</option>
          </select></label>
          <label>Curvatura Bézier<input name="curve" type="number" inputMode="decimal"
            min="-1" max="1" step="0.05" defaultValue={selectedPoint.curve ?? 0} />
            <small>−1 = entrada lenta · 0 = lineal · +1 = entrada rápida</small></label>
          <button type="submit" disabled={busy}>Aplicar punto</button>
        </form>}
        {clipboard.length > 0 && <div className="automation-editor__paste">
          <label>Pegar desde tick<input aria-label="Tick para pegar automatización" type="number"
            inputMode="numeric" min={0} step={1} value={pasteTick}
            onChange={(event) => setPasteTick(event.target.value)} /></label>
          <button type="button" disabled={busy} onClick={pasteSelection}>
            Pegar {clipboard.length} {clipboard.length === 1 ? "punto" : "puntos"}</button>
        </div>}
      </>}
    </>}
  </section>;
}
