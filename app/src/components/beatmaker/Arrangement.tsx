import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent,
  type PointerEvent } from "react";
import type { ProjectClip, ProjectDocumentV1, ProjectPattern, ProjectScene } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import { addArrangementSection, captureArrangementPerformance, captureArrangementScene, createArrangementClip,
  duplicateArrangementClip, duplicateArrangementSection, editArrangementClip,
  editArrangementScene, editArrangementSection, groupArrangementClips, moveArrangementClipGroup,
  removeArrangementScene, removeArrangementSection, splitArrangementClip, ungroupArrangementClip,
  uniqueArrangementClip,
  type EditableClipFields, type PerformedSceneSegment } from "../../composition/arrangementModel.ts";
import { quantizeSceneLaunchTick } from "../../composition/resolveProjectTimeline.ts";
import { addArrangementAudioCrossfade, duplicateArrangementAudioClip,
  editArrangementAudioClip, removeArrangementAudioClip, removeArrangementAudioCrossfade,
  splitArrangementAudioClip } from "../../composition/audioArrangement.ts";
import { AudioClipInspector } from "./AudioClipInspector.tsx";
import { ClipInspector } from "./ClipInspector.tsx";
import { SceneInspector } from "./SceneInspector.tsx";
import { SectionInspector } from "./SectionInspector.tsx";
import "./Arrangement.css";

export interface ArrangementProps {
  readonly document: ProjectDocumentV1 | null;
  readonly playheadTick?: number;
  /** High-frequency transport read for a smooth line without React renders. */
  readonly readPlayheadTick?: () => number;
  readonly saveState?: "clean" | "pending" | "saving" | "error" | "conflict";
  readonly loading?: boolean;
  readonly externalError?: string;
  /** Resolves after the project snapshot accepted the command. */
  readonly onCommand: (command: ProjectCommand) => void | Promise<void>;
  readonly onUndo?: () => void | Promise<void>;
  readonly onRedo?: () => void | Promise<void>;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly onOpenPattern?: (patternId: string, trackId: string) => void;
  /** Called with the already quantized launch tick; transport owns the authority switch. */
  readonly onLaunchScene?: (sceneId: string, launchTick: number) => void | Promise<void>;
  readonly onStopScene?: () => void | Promise<void>;
  readonly activeSceneId?: string | null;
  readonly queuedSceneId?: string | null;
  readonly queuedStartTick?: number | null;
  /** Finished launcher intervals supplied by transport; never guessed from UI frame timing. */
  readonly performedSceneSegments?: readonly PerformedSceneSegment[];
  readonly performanceRevision?: number;
  /** Acknowledge only after the reversible project command has been accepted. */
  readonly onPerformanceCaptured?: (segments: readonly PerformedSceneSegment[]) => void;
}

const LABEL_WIDTH = 110;
const ROW_HEIGHT = 64;
const RULER_HEIGHT = 34;
const SECTION_HEIGHT = 43;
const BASE_BAR_TICKS = 3840;
const BAR_WIDTHS = [120, 192, 288, 384] as const;
const SNAP = [
  { label: "1/16", ticks: 240 },
  { label: "1/4", ticks: 960 },
  { label: "Libre", ticks: 1 },
] as const;

interface DragGesture {
  readonly clip: ProjectClip;
  readonly mode: "move" | "resize";
  readonly pointerId: number;
  readonly startX: number;
  readonly element: HTMLElement;
  deltaTick: number;
}

function fieldsOf(clip: ProjectClip): EditableClipFields {
  return { startTick: clip.startTick, lengthTicks: clip.lengthTicks,
    sourceOffsetTick: clip.sourceOffsetTick, loopMode: clip.loopMode,
    tailPolicy: clip.tailPolicy, transpose: clip.transpose, gainDb: clip.gainDb, muted: clip.muted,
    ...(clip.kind === "audio" ? { sourceStartFrame: clip.sourceStartFrame,
      sourceEndFrame: clip.sourceEndFrame, fadeInFrames: clip.fadeInFrames,
      fadeOutFrames: clip.fadeOutFrames } : {}) };
}

function snapTick(value: number, quantum: number): number {
  return Math.round(value / quantum) * quantum;
}

function meterBars(document: ProjectDocumentV1, startTick: number, endTick: number):
  { tick: number; label: string; meter: string }[] {
  const bars: { tick: number; label: string; meter: string }[] = [];
  let number = 1;
  for (let index = 0; index < document.meterMap.length; index++) {
    const point = document.meterMap[index]!;
    const segmentEnd = document.meterMap[index + 1]?.tick ?? endTick + BASE_BAR_TICKS;
    const ticksPerBar = 3840 * point.numerator / point.denominator;
    const count = Math.ceil((segmentEnd - point.tick) / ticksPerBar);
    const first = Math.max(0, Math.floor((startTick - point.tick) / ticksPerBar));
    const last = Math.min(count - 1, Math.ceil((endTick - point.tick) / ticksPerBar));
    for (let bar = first; bar <= last && bars.length < 200; bar++) {
      const tick = point.tick + bar * ticksPerBar;
      if (tick >= startTick && tick <= endTick && tick < segmentEnd) {
        bars.push({ tick, label: String(number + bar), meter: `${point.numerator}/${point.denominator}` });
      }
    }
    number += count;
    if (segmentEnd > endTick) break;
  }
  return bars;
}

function sourceName(clip: ProjectClip, patterns: Map<string, ProjectPattern>): string {
  return clip.kind === "pattern" ? patterns.get(clip.sourceId)?.name ?? "Patrón faltante" : "Audio";
}

export function Arrangement(props: ArrangementProps) {
  if (!props.document) return <section className="arrangement arrangement--empty" aria-label="Arreglo">
    <span className="arrangement__eyebrow">Línea de tiempo</span>
    <h2>{props.loading ? "Cargando arreglo…" : "Abre un proyecto"}</h2>
    <p>{props.loading ? "Preparando pistas y clips." : "Crea o abre un proyecto para montar tu beat."}</p>
    {props.externalError && <p className="arrangement__error" role="alert">{props.externalError}</p>}
  </section>;
  return <ArrangementEditor key={props.document.id} {...props} document={props.document} />;
}

function ArrangementEditor({ document, playheadTick = 0, readPlayheadTick, saveState, externalError, onCommand, onUndo,
  onRedo, canUndo, canRedo, onOpenPattern, onLaunchScene, onStopScene,
  activeSceneId, queuedSceneId, queuedStartTick, performedSceneSegments, performanceRevision,
  onPerformanceCaptured }: ArrangementProps & {
    readonly document: ProjectDocumentV1 }) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [groupSelection, setGroupSelection] = useState<readonly string[]>([]);
  const [flushedPerformanceKey, setFlushedPerformanceKey] = useState("");
  const [trackChoice, setTrackChoice] = useState("");
  const [patternChoice, setPatternChoice] = useState("");
  const [sceneName, setSceneName] = useState("");
  const sceneNameRevision = useRef(0);
  const [sceneQuantum, setSceneQuantum] = useState(BASE_BAR_TICKS);
  const [sectionName, setSectionName] = useState("");
  const sectionNameRevision = useRef(0);
  const [sectionStart, setSectionStart] = useState("");
  const [sectionLength, setSectionLength] = useState(String(BASE_BAR_TICKS));
  const [barWidthIndex, setBarWidthIndex] = useState(1);
  const [snap, setSnap] = useState(240);
  const [view, setView] = useState({ scrollLeft: 0, width: 340 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLSpanElement | null>(null);
  const dragRef = useRef<DragGesture | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const timelineTracks = useMemo(() => {
    const byId = new Map(document.tracks.map((track) => [track.id, track]));
    return document.trackOrder.flatMap((id) => {
      const track = byId.get(id);
      return track && track.kind !== "bus" ? [track] : [];
    });
  }, [document.trackOrder, document.tracks]);
  const midiTracks = useMemo(() => timelineTracks.filter((track) => track.kind !== "audio"), [timelineTracks]);
  const selectedTrackId = midiTracks.some((track) => track.id === trackChoice)
    ? trackChoice : midiTracks[0]?.id ?? "";
  const selectedPatternId = document.patterns.some((pattern) => pattern.id === patternChoice)
    ? patternChoice : document.patterns[0]?.id ?? "";
  const selectedClip = useMemo(() => document.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [document.clips, selectedClipId]);
  const selectedSection = document.sections.find((section) => section.id === selectedSectionId) ?? null;
  const selectedScene = document.scenes.find((scene) => scene.id === selectedSceneId) ?? null;
  const patterns = useMemo(() => new Map(document.patterns.map((pattern) => [pattern.id, pattern])), [document.patterns]);
  const pxPerTick = BAR_WIDTHS[barWidthIndex]! / BASE_BAR_TICKS;
  const projectEnd = useMemo(() => Math.max(document.clips.reduce((end, clip) =>
    Math.max(end, clip.startTick + clip.lengthTicks + BASE_BAR_TICKS), 8 * BASE_BAR_TICKS),
  document.sections.reduce((end, section) =>
    Math.max(end, section.startTick + section.lengthTicks + BASE_BAR_TICKS), 0)),
  [document.clips, document.sections]);
  const contentEnd = Math.max(projectEnd, playheadTick + 2 * BASE_BAR_TICKS);
  const worldWidth = Math.min(2_000_000, LABEL_WIDTH + Math.ceil(contentEnd * pxPerTick));
  const truncated = LABEL_WIDTH + contentEnd * pxPerTick > worldWidth;
  const visibleStart = Math.max(0, Math.floor((view.scrollLeft - LABEL_WIDTH) / pxPerTick) - BASE_BAR_TICKS);
  const visibleEnd = Math.ceil((view.scrollLeft + view.width - LABEL_WIDTH) / pxPerTick) + BASE_BAR_TICKS;
  const bars = useMemo(() => meterBars(document, visibleStart, visibleEnd), [document, visibleStart, visibleEnd]);
  const visibleClipsByTrack = useMemo(() => {
    const byTrack = new Map<string, ProjectClip[]>();
    for (const clip of document.clips) {
      if (clip.startTick >= visibleEnd || clip.startTick + clip.lengthTicks <= visibleStart) continue;
      const items = byTrack.get(clip.trackId) ?? [];
      items.push(clip);
      byTrack.set(clip.trackId, items);
    }
    return byTrack;
  }, [document.clips, visibleStart, visibleEnd]);
  const visibleSections = document.sections.filter((section) =>
    section.startTick < visibleEnd && section.startTick + section.lengthTicks > visibleStart);
  const playheadLeft = LABEL_WIDTH + playheadTick * pxPerTick;
  const activeScene = document.scenes.find((scene) => scene.id === activeSceneId);
  const activeSlots = useMemo(() => new Map(activeScene?.slots.map((slot) => [slot.trackId, slot]) ?? []),
    [activeScene]);
  const queuedScene = document.scenes.find((scene) => scene.id === queuedSceneId);
  const returnQueued = !!activeScene && !queuedSceneId && queuedStartTick != null;
  const performanceKey = useMemo(() => `${performanceRevision ?? 0}:` +
    (performedSceneSegments?.map((segment) =>
      `${segment.sceneId}:${segment.startTick}:${segment.endTick}`).join("|") ?? ""),
  [performedSceneSegments, performanceRevision]);
  const sharedCount = useMemo(() => selectedClip?.kind === "pattern" ? document.clips.filter((clip) =>
    clip.kind === "pattern" && clip.sourceId === selectedClip.sourceId).length : 0,
  [document.clips, selectedClip]);
  const canCapture = !activeSceneId && document.clips.some((clip) => clip.kind === "pattern" && !clip.muted &&
    clip.startTick <= playheadTick && playheadTick < clip.startTick + clip.lengthTicks);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const update = () => setView({ scrollLeft: viewport.scrollLeft, width: viewport.clientWidth });
    const resize = new ResizeObserver(update);
    resize.observe(viewport);
    update();
    return () => { resize.disconnect(); if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current); };
  }, []);

  useEffect(() => {
    if (!readPlayheadTick) return;
    const viewport = scrollRef.current;
    const line = playheadRef.current;
    if (!viewport || !line) return;
    let visible = false;
    let frame = 0;
    const step = () => {
      frame = 0;
      if (!visible || globalThis.document.hidden) return;
      const tick = readPlayheadTick();
      const left = LABEL_WIDTH + tick * pxPerTick;
      line.style.display = Number.isFinite(left) && left >= 0 && left <= worldWidth ? "block" : "none";
      if (line.style.display === "block") line.style.left = `${left}px`;
      frame = requestAnimationFrame(step);
    };
    const refresh = () => {
      if (visible && !globalThis.document.hidden && !frame) frame = requestAnimationFrame(step);
      if ((!visible || globalThis.document.hidden) && frame) { cancelAnimationFrame(frame); frame = 0; line.style.display = "none"; }
    };
    const observer = new IntersectionObserver((entries) => { visible = !!entries[0]?.isIntersecting; refresh(); });
    observer.observe(viewport);
    globalThis.document.addEventListener("visibilitychange", refresh);
    return () => { observer.disconnect(); globalThis.document.removeEventListener("visibilitychange", refresh);
      if (frame) cancelAnimationFrame(frame); };
  }, [readPlayheadTick, pxPerTick, worldWidth]);

  function actionTick(): number {
    const tick = readPlayheadTick?.() ?? playheadTick;
    if (!Number.isFinite(tick) || tick < 0) throw new RangeError("Cabezal fuera del arreglo");
    return Math.round(tick);
  }

  function onScroll(): void {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const viewport = scrollRef.current;
      if (viewport) setView({ scrollLeft: viewport.scrollLeft, width: viewport.clientWidth });
    });
  }

  async function dispatch(command: ProjectCommand, after?: () => void): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onCommand(command); after?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo editar el arreglo"); }
    finally { setBusy(false); }
  }

  async function history(action: () => void | Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo recuperar la edición"); }
    finally { setBusy(false); }
  }

  function perform(makeCommand: () => ProjectCommand, after?: () => void): void {
    try { void dispatch(makeCommand(), after); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Valores inválidos"); }
  }

  function beginDrag(event: PointerEvent<HTMLElement>, clip: ProjectClip, mode: "move" | "resize"): void {
    if (busy || groupMode || event.button !== 0) return;
    event.stopPropagation();
    setSelectedClipId(clip.id);
    setSelectedSectionId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { clip, mode, pointerId: event.pointerId, startX: event.clientX,
      element: mode === "resize" ? event.currentTarget.parentElement! : event.currentTarget, deltaTick: 0 };
  }

  function moveDrag(event: PointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const raw = (event.clientX - drag.startX) / pxPerTick;
    const minimum = drag.mode === "move" ? -drag.clip.startTick : 1 - drag.clip.lengthTicks;
    drag.deltaTick = Math.max(minimum, snapTick(raw, snap));
    if (drag.mode === "move") {
      const groupId = drag.clip.groupId;
      const members = groupId ? document.clips.filter((clip) => clip.groupId === groupId) : [drag.clip];
      for (const member of members) {
        const element = globalThis.document.querySelector<HTMLElement>(`[data-arrangement-clip-id="${CSS.escape(member.id)}"]`);
        if (element) element.style.transform = `translateX(${drag.deltaTick * pxPerTick}px)`;
      }
    } else drag.element.style.width = `${Math.max(26, (drag.clip.lengthTicks + drag.deltaTick) * pxPerTick)}px`;
  }

  function endDrag(event: PointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const groupId = drag.clip.groupId;
    for (const member of groupId ? document.clips.filter((clip) => clip.groupId === groupId) : [drag.clip]) {
      const element = globalThis.document.querySelector<HTMLElement>(`[data-arrangement-clip-id="${CSS.escape(member.id)}"]`);
      if (element) element.style.transform = "";
    }
    drag.element.style.width = "";
    if (event.type === "pointercancel") return;
    if (drag.deltaTick === 0) return;
    if (drag.mode === "move") {
      perform(() => moveArrangementClipGroup(document, drag.clip.id, drag.deltaTick));
      return;
    }
    const fields = fieldsOf(drag.clip);
    perform(() => editArrangementClip(document, drag.clip.id, {
      ...fields, lengthTicks: drag.clip.lengthTicks + drag.deltaTick,
    }));
  }

  function createClip(): void {
    perform(() => createArrangementClip(document, selectedTrackId, selectedPatternId,
      Math.max(0, snapTick(actionTick(), snap))), () => {
      const viewport = scrollRef.current;
      if (viewport) viewport.scrollLeft = Math.max(0, LABEL_WIDTH + actionTick() * pxPerTick - 36);
    });
  }

  function addSection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const tick = sectionStart.trim() ? Number(sectionStart) : Math.max(0, snapTick(actionTick(), snap));
    const length = Number(sectionLength);
    const submittedRevision = sectionNameRevision.current;
    perform(() => addArrangementSection(document, sectionName, tick, length), () => {
      if (sectionNameRevision.current === submittedRevision) setSectionName("");
    });
  }

  function captureScene(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const submittedRevision = sceneNameRevision.current;
    perform(() => captureArrangementScene(document, actionTick(),
      sceneName.trim() || `Escena ${document.scenes.length + 1}`, sceneQuantum), () => {
      if (sceneNameRevision.current === submittedRevision) setSceneName("");
    });
  }

  async function launch(scene: ProjectScene): Promise<void> {
    if (!onLaunchScene || busy) return;
    setBusy(true);
    setError("");
    try { await onLaunchScene(scene.id, quantizeSceneLaunchTick(scene, actionTick())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo lanzar la escena"); }
    finally { setBusy(false); }
  }

  function isolateKeys(event: KeyboardEvent<HTMLElement>): void { event.stopPropagation(); }

  return <section className="arrangement" aria-label="Arreglo" onKeyDown={isolateKeys} onKeyUp={isolateKeys}>
    <header className="arrangement__header">
      <div><span className="arrangement__eyebrow">{document.name} / composición</span>
        <h2>Arreglo</h2>
        <p>{document.clips.length.toLocaleString("es-CO")} clips · {timelineTracks.length} pistas · {document.scenes.length} escenas</p></div>
      {saveState && <span className={`arrangement__save arrangement__save--${saveState}`} role="status">{
        saveState === "clean" ? "Guardado" : saveState === "pending" ? "Pendiente" :
          saveState === "saving" ? "Guardando…" : saveState === "conflict" ? "Conflicto" : "Error al guardar"
      }</span>}
    </header>

    <div className="arrangement__toolbar">
      <label>Patrón<select aria-label="Patrón para nuevo clip" value={selectedPatternId}
        onChange={(event) => setPatternChoice(event.target.value)} disabled={!document.patterns.length || busy}>
        {document.patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
      </select></label>
      <label>Pista<select aria-label="Pista para nuevo clip" value={selectedTrackId}
        onChange={(event) => setTrackChoice(event.target.value)} disabled={!midiTracks.length || busy}>
        {midiTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
      </select></label>
      <button className="arrangement__primary" type="button" onClick={createClip}
        disabled={busy || !midiTracks.length || !document.patterns.length}>+ Añadir clip al cabezal</button>
      <label>Imán<select aria-label="Imán del arreglo" value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
        {SNAP.map((item) => <option key={item.ticks} value={item.ticks}>{item.label}</option>)}
      </select></label>
      <div className="arrangement__zoom" role="group" aria-label="Zoom del arreglo">
        <button type="button" aria-label="Alejar arreglo" disabled={barWidthIndex === 0}
          onClick={() => setBarWidthIndex(barWidthIndex - 1)}>−</button>
        <output>{BAR_WIDTHS[barWidthIndex]} px/compás 4/4</output>
        <button type="button" aria-label="Acercar arreglo" disabled={barWidthIndex === BAR_WIDTHS.length - 1}
          onClick={() => setBarWidthIndex(barWidthIndex + 1)}>+</button>
      </div>
      {(onUndo || onRedo) && <div className="arrangement__history" role="group" aria-label="Historial del arreglo">
        {onUndo && <button type="button" disabled={!canUndo || busy} onClick={() => void history(onUndo)}>Deshacer</button>}
        {onRedo && <button type="button" disabled={!canRedo || busy} onClick={() => void history(onRedo)}>Rehacer</button>}
      </div>}
      <div className="arrangement__group-tools" role="group" aria-label="Agrupación de clips">
        {!groupMode ? <button type="button" disabled={busy}
          onClick={() => { setGroupMode(true); setGroupSelection([]); }}>Agrupar clips</button> :
          <>
            <button type="button" disabled={busy || groupSelection.length < 2}
              onClick={() => perform(() => groupArrangementClips(document, groupSelection),
                () => { setGroupMode(false); setGroupSelection([]); })}>
              Crear grupo · {groupSelection.length}</button>
            <button type="button" disabled={busy}
              onClick={() => { setGroupMode(false); setGroupSelection([]); }}>Cancelar</button>
          </>}
        {selectedClip?.groupId && <button type="button" disabled={busy}
          onClick={() => perform(() => ungroupArrangementClip(document, selectedClip.id))}>
          Desagrupar seleccionado</button>}
      </div>
    </div>
    <p className="arrangement__hint">Arrastra un clip para moverlo; arrastra su borde derecho para recortarlo. Toca un clip para editar ticks exactos.</p>
    {!midiTracks.length && <p className="arrangement__hint">Agrega una pista de instrumento o batería para colocar patrones.</p>}
    {(error || externalError || truncated) && <p className="arrangement__error" role="alert">{
      error || externalError || "El proyecto excede la ventana visual; usa edición numérica de ticks para clips distantes."
    }</p>}
    <div className="arrangement__viewport" ref={scrollRef} onScroll={onScroll} tabIndex={0}
      aria-label="Línea de tiempo desplazable">
      <div className="arrangement__world" style={{ width: worldWidth,
        height: RULER_HEIGHT + SECTION_HEIGHT + timelineTracks.length * ROW_HEIGHT }}>
        <div className="arrangement__ruler" style={{ height: RULER_HEIGHT }}>
          <span className="arrangement__corner">Compás</span>
          {bars.map((bar) => <span key={bar.tick} className="arrangement__bar-label"
            style={{ left: LABEL_WIDTH + bar.tick * pxPerTick }} title={`Tick ${bar.tick} · ${bar.meter}`}>
            {bar.label}<small>{bar.meter}</small></span>)}
        </div>
        <div className="arrangement__sections" style={{ top: RULER_HEIGHT, height: SECTION_HEIGHT }}>
          <span className="arrangement__row-label">Secciones</span>
          {visibleSections.map((section) => <button key={section.id} type="button"
            className={`arrangement__section ${selectedSectionId === section.id ? "is-selected" : ""}`}
            style={{ left: LABEL_WIDTH + section.startTick * pxPerTick,
              width: Math.max(28, section.lengthTicks * pxPerTick) }}
            title={`${section.name}: ticks ${section.startTick}–${section.startTick + section.lengthTicks}`}
            onClick={() => { setSelectedSectionId(section.id); setSelectedClipId(null); }}>{section.name}</button>)}
        </div>
        {timelineTracks.map((track, rowIndex) => <div key={track.id} className="arrangement__track-row"
          style={{ top: RULER_HEIGHT + SECTION_HEIGHT + rowIndex * ROW_HEIGHT, height: ROW_HEIGHT }}>
          <span className="arrangement__row-label" title={activeSlots.has(track.id)
            ? `${track.name}: escena ${activeScene?.name}, patrón ${patterns.get(activeSlots.get(track.id)!.patternId)?.name ?? activeSlots.get(track.id)!.patternId}`
            : `${track.name}: autoridad del arreglo`}>
            <strong>{track.name}</strong><small>{track.kind === "drum" ? "Batería" :
              track.kind === "audio" ? "Audio" : "Instrumento"}</small>
            <small className={activeSlots.has(track.id) ? "arrangement__authority is-scene" : "arrangement__authority"}>
              {activeSlots.has(track.id) ? `Escena · ${patterns.get(activeSlots.get(track.id)!.patternId)?.name ?? "patrón"}`
                : "Arreglo"}
            </small></span>
          {(visibleClipsByTrack.get(track.id) ?? []).map((clip) => <div key={clip.id} role="button" tabIndex={0}
            data-arrangement-clip-id={clip.id}
            aria-label={`${sourceName(clip, patterns)}, tick ${clip.startTick}, duración ${clip.lengthTicks}${clip.groupId ? ", agrupado" : ""}`}
            aria-pressed={groupMode ? groupSelection.includes(clip.id) : selectedClipId === clip.id}
            className={`arrangement__clip arrangement__clip--${clip.kind} ${clip.muted ? "is-muted" : ""} ${clip.groupId ? "is-grouped" : ""} ${groupSelection.includes(clip.id) ? "is-group-selected" : ""} ${selectedClipId === clip.id ? "is-selected" : ""}`}
            style={{ left: LABEL_WIDTH + clip.startTick * pxPerTick,
              width: Math.max(26, clip.lengthTicks * pxPerTick) }}
            onPointerDown={(event) => beginDrag(event, clip, "move")}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            onClick={() => {
              if (groupMode) {
                setGroupSelection((current) => current.includes(clip.id)
                  ? current.filter((id) => id !== clip.id) : [...current, clip.id]);
              } else { setSelectedClipId(clip.id); setSelectedSectionId(null); }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (groupMode) setGroupSelection((current) => current.includes(clip.id)
                  ? current.filter((id) => id !== clip.id) : [...current, clip.id]);
                else { setSelectedClipId(clip.id); setSelectedSectionId(null); }
              } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? snap : -snap;
                const group = clip.groupId
                  ? document.clips.filter((item) => item.groupId === clip.groupId) : [clip];
                const allowedDelta = Math.max(-Math.min(...group.map((item) => item.startTick)), delta);
                if (allowedDelta !== 0) perform(() =>
                  moveArrangementClipGroup(document, clip.id, allowedDelta));
              }
            }}>
            <span className="arrangement__clip-title">{sourceName(clip, patterns)}</span>
            <span className="arrangement__clip-detail">{clip.kind === "pattern" ? `v${clip.sourceVersion}` :
              `audio ${clip.timeMode === "absolute" ? "absoluto" : "musical"}`}{clip.muted ? " · mute" : ""}
              {clip.groupId ? " · grupo" : ""}</span>
            {clip.kind === "pattern" && <span className="arrangement__trim" title="Arrastrar para recortar"
              onPointerDown={(event) => beginDrag(event, clip, "resize")}
              onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />}
          </div>)}
        </div>)}
        {bars.map((bar) => <span key={`line-${bar.tick}`} className="arrangement__bar-line"
          style={{ left: LABEL_WIDTH + bar.tick * pxPerTick }} />)}
        {(readPlayheadTick || playheadLeft <= worldWidth) && <span className="arrangement__playhead"
          ref={playheadRef} style={readPlayheadTick ? { display: "none" } : { left: playheadLeft }} aria-hidden="true" />}
      </div>
    </div>

    <div className="arrangement__panels">
      <div className="arrangement__panel">
        {selectedClip?.kind === "audio" ?
          <AudioClipInspector key={`${JSON.stringify(selectedClip)}:${JSON.stringify(document.tempoMap)}`}
            document={document} clip={selectedClip} busy={busy}
            onApply={(fields) => perform(() => editArrangementAudioClip(document, selectedClip.id, fields))}
            onDuplicate={() => perform(() => duplicateArrangementAudioClip(document, selectedClip.id))}
            onDelete={() => perform(() => removeArrangementAudioClip(document, selectedClip.id),
              () => setSelectedClipId(null))}
            onSplit={playheadTick > selectedClip.startTick &&
              playheadTick < selectedClip.startTick + selectedClip.lengthTicks &&
              !document.audioCrossfades?.some((fade) => fade.outgoingClipId === selectedClip.id ||
                fade.incomingClipId === selectedClip.id)
              ? () => perform(() => splitArrangementAudioClip(document, selectedClip.id, actionTick()))
              : undefined}
            onAddCrossfade={(outgoingId, incomingId, curve) => perform(() =>
              addArrangementAudioCrossfade(document, outgoingId, incomingId, curve))}
            onRemoveCrossfade={(fadeId) => perform(() =>
              removeArrangementAudioCrossfade(document, fadeId))}
            onSelectClip={(clipId) => setSelectedClipId(clipId)} />
          : selectedClip ? <ClipInspector key={`${selectedClip.id}:${JSON.stringify(fieldsOf(selectedClip))}`}
          clip={selectedClip} pattern={selectedClip.kind === "pattern" ? patterns.get(selectedClip.sourceId) : undefined}
          sharedCount={sharedCount}
          busy={busy} onApply={(fields) => perform(() => editArrangementClip(document, selectedClip.id, fields))}
          onDuplicate={() => perform(() => duplicateArrangementClip(document, selectedClip.id))}
          onMakeUnique={() => perform(() => uniqueArrangementClip(document, selectedClip.id))}
          onDelete={() => perform(() => ({ kind: "removeClip", clipId: selectedClip.id, at: Date.now() }),
            () => setSelectedClipId(null))}
          onSplit={selectedClip.kind === "pattern" && playheadTick > selectedClip.startTick &&
            playheadTick < selectedClip.startTick + selectedClip.lengthTicks
            ? () => perform(() => splitArrangementClip(document, selectedClip.id, actionTick())) : undefined}
          onOpenPattern={onOpenPattern && selectedClip.kind === "pattern"
            ? () => onOpenPattern(selectedClip.sourceId, selectedClip.trackId) : undefined} />
          : <div className="arrangement__panel-empty"><span className="arrangement__eyebrow">Inspector</span>
            <p>Selecciona un clip. Los cambios de fuente compartida se reflejan en todas sus instancias.</p></div>}
      </div>
      <div className="arrangement__panel">
        <div className="arrangement__panel-heading"><span className="arrangement__eyebrow">Marcadores</span><strong>Secciones</strong></div>
        <form className="arrangement__compact-form" onSubmit={addSection}>
          <label>Nombre<input aria-label="Nombre de sección" maxLength={100} required value={sectionName}
            onChange={(event) => { sectionNameRevision.current++; setSectionName(event.target.value); }} placeholder="Intro, verso, hook…" /></label>
          <label>Inicio · tick<input aria-label="Inicio de sección" type="number" inputMode="numeric" min={0}
            value={sectionStart} onChange={(event) => setSectionStart(event.target.value)}
            placeholder={`Cabezal ${playheadTick}`} /></label>
          <label>Duración · ticks<input aria-label="Duración de sección" type="number" inputMode="numeric" min={1}
            required value={sectionLength} onChange={(event) => setSectionLength(event.target.value)} /></label>
          <button type="submit" disabled={busy}>+ Crear sección</button>
        </form>
        {selectedSection && <SectionInspector key={`${selectedSection.id}:${selectedSection.name}:${selectedSection.startTick}:${selectedSection.lengthTicks}`}
          section={selectedSection} busy={busy}
          onApply={(fields) => perform(() => editArrangementSection(document, selectedSection.id, fields))}
          onDuplicate={() => perform(() => duplicateArrangementSection(document, selectedSection.id))}
          onDelete={() => perform(() => removeArrangementSection(document, selectedSection.id),
            () => setSelectedSectionId(null))} />}
      </div>
      <div className="arrangement__panel">
        <div className="arrangement__panel-heading"><span className="arrangement__eyebrow">Lanzador</span>
          <strong>Escenas</strong><small aria-live="polite">Autoridad: {activeScene
            ? `${activeScene.name} en ${activeScene.slots.length} ${activeScene.slots.length === 1 ? "pista" : "pistas"}; las demás usan arreglo`
            : "arreglo"}</small>
          {queuedScene && <small aria-live="polite">En cola: {queuedScene.name} · tick {queuedStartTick ?? "pendiente"}</small>}
          {returnQueued && <small aria-live="polite">En cola: arreglo · tick {queuedStartTick}</small>}</div>
        <form className="arrangement__scene-form" onSubmit={captureScene}>
          <label>Nombre<input aria-label="Nombre de escena" maxLength={100} value={sceneName}
            onChange={(event) => { sceneNameRevision.current++; setSceneName(event.target.value); }} placeholder={`Escena ${document.scenes.length + 1}`} /></label>
          <label>Cuantización<select aria-label="Cuantización de escena" value={sceneQuantum}
            onChange={(event) => setSceneQuantum(Number(event.target.value))}>
            <option value={0}>Inmediata</option><option value={960}>1/4</option>
            <option value={BASE_BAR_TICKS}>Compás 4/4</option></select></label>
          <button type="submit" disabled={busy || !canCapture}>Capturar clips del cabezal</button>
        </form>
        {!canCapture && <p className="arrangement__panel-note">{activeSceneId
          ? "Vuelve al arreglo para capturar los clips del cabezal; la escena en curso tiene otra autoridad."
          : "Sitúa el cabezal sobre un clip MIDI activo para capturar una escena."}</p>}
        <div className="arrangement__scene-list">
          {document.scenes.map((scene) => <div key={scene.id} className={`arrangement__scene ${activeSceneId === scene.id ? "is-active" : ""}`}>
            <div><strong>{scene.name}</strong><small>{scene.slots.length} pistas · {scene.launchQuantizationTicks === 0
              ? "inmediata" : `${scene.launchQuantizationTicks} ticks`}</small></div>
            <div className="arrangement__scene-actions">
              <button type="button" disabled={busy} onClick={() => setSelectedSceneId(scene.id)}>Editar</button>
              {onLaunchScene && <button type="button" disabled={busy || activeSceneId === scene.id || queuedSceneId === scene.id}
                onClick={() => void launch(scene)}>{queuedSceneId === scene.id ? "En cola" : "Lanzar"}</button>}
              <button type="button" className="arrangement__danger"
                disabled={busy || activeSceneId === scene.id || queuedSceneId === scene.id}
                onClick={() => perform(() => removeArrangementScene(document, scene.id),
                  () => { if (selectedSceneId === scene.id) setSelectedSceneId(null); })}>Borrar</button>
            </div>
          </div>)}
          {!document.scenes.length && <p className="arrangement__panel-note">Todavía no hay escenas capturadas.</p>}
        </div>
        {selectedScene && <SceneInspector key={`${selectedScene.id}:${JSON.stringify(selectedScene)}`}
          scene={selectedScene} tracks={midiTracks} patterns={document.patterns} busy={busy}
          onApply={(fields) => perform(() => editArrangementScene(document, selectedScene.id, fields))}
          onClose={() => setSelectedSceneId(null)} />}
        {!!performedSceneSegments?.length && performanceKey !== flushedPerformanceKey &&
          <button type="button" className="arrangement__stop-scene"
          disabled={busy} onClick={() => perform(() => captureArrangementPerformance(document,
            performedSceneSegments), () => { setFlushedPerformanceKey(performanceKey);
            onPerformanceCaptured?.(performedSceneSegments); })}>
            Volcar actuación al arreglo · {performedSceneSegments.length} segmentos</button>}
        {activeScene && onStopScene && <button type="button" className="arrangement__stop-scene"
          disabled={busy || returnQueued} onClick={() => void history(onStopScene)}>
          {returnQueued ? "Retorno en cola" : "Volver al arreglo"}</button>}
      </div>
    </div>
  </section>;
}
