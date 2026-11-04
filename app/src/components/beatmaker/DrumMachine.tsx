import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ProjectDocumentV1, ProjectDrumPad, ProjectPattern, ProjectTrack } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import { addDrumStep, drumBarTicks, projectDrumBar, removeDrumStep, resizeDrumPattern,
  type DrumPadDefinition } from "../../composition/drumPattern.ts";
import { editPianoRollNoteWithPerformance, pianoRollReplaceCommand, quantizePianoRollNotes,
  type EditableNoteFields, type EditablePerformanceFields } from "../../composition/pianoRollModel.ts";
import { NoteInspector } from "./NoteInspector.tsx";
import { DrumRackEditor, type DrumRackPadStatus, type DrumRackSourceOption } from "./DrumRackEditor.tsx";
import "./DrumMachine.css";

export type { DrumRackPadStatus, DrumRackSourceOption } from "./DrumRackEditor.tsx";

export interface DrumMachineProps {
  readonly pattern: ProjectPattern | null;
  /** Required with track.drumRack for atomic cycle and trigger edits across shared patterns. */
  readonly document?: ProjectDocumentV1;
  readonly track?: ProjectTrack | null;
  readonly padStatuses?: readonly DrumRackPadStatus[];
  readonly sourceOptions?: readonly DrumRackSourceOption[];
  /** Sources come from the real kit/engine. Missing entries become silent, disabled slots. */
  readonly pads: readonly DrumPadDefinition[];
  readonly projectName?: string;
  readonly trackName?: string;
  readonly meter?: { readonly numerator: number; readonly denominator: number };
  readonly saveState?: "clean" | "pending" | "saving" | "error" | "conflict";
  readonly loading?: boolean;
  readonly externalError?: string;
  /** Must resolve after the project snapshot has accepted the command. */
  readonly onCommand: (command: ProjectCommand) => void | Promise<void>;
  readonly onUndo?: () => void | Promise<void>;
  readonly onRedo?: () => void | Promise<void>;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  /** An audio owner is generated per pad audition; the engine owns its lifecycle. */
  readonly onPreviewPad?: (pad: DrumPadDefinition, ownerId: string) => void;
  readonly onPreviewRackPad?: (pad: ProjectDrumPad, ownerId: string) => void;
  readonly midiLearnAction?: string | null;
  readonly onMidiLearnPad?: (padId: string) => void;
  readonly onCancelMidiLearn?: () => void;
}

type EditorProps = DrumMachineProps & { readonly pattern: ProjectPattern };

const SLOTS_PER_BANK = 16;
const DIVISIONS = [
  { label: "1/16", ticks: 240 },
  { label: "1/32", ticks: 120 },
] as const;

export function DrumMachine(props: DrumMachineProps) {
  if (!props.pattern) return <section className="drum-machine drum-machine--empty" aria-label="Batería por pasos">
    <span className="drum-machine__eyebrow">Pads y pasos</span>
    <h2>{props.loading ? "Cargando patrón…" : "Elige un patrón de batería"}</h2>
    <p>{props.loading ? "Preparando golpes editables." : "Selecciona un patrón propio y un kit disponible para programar pasos."}</p>
    {props.externalError && <p className="drum-machine__error" role="alert">{props.externalError}</p>}
  </section>;
  if (props.track?.drumRack) {
    if (!props.document) return <section className="drum-machine drum-machine--empty" role="alert">
      El proyecto no está listo para editar el rack de batería.</section>;
    return <DrumRackEditor key={`${props.pattern.id}:${props.track.id}`}
      document={props.document} track={props.track as ProjectTrack & {
        readonly drumRack: NonNullable<ProjectTrack["drumRack"]> }}
      pattern={props.pattern} padStatuses={props.padStatuses} sourceOptions={props.sourceOptions}
      saveState={props.saveState} externalError={props.externalError}
      onCommand={props.onCommand} onUndo={props.onUndo} onRedo={props.onRedo}
      canUndo={props.canUndo} canRedo={props.canRedo}
      onPreviewRackPad={props.onPreviewRackPad}
      midiLearnAction={props.midiLearnAction} onMidiLearnPad={props.onMidiLearnPad}
      onCancelMidiLearn={props.onCancelMidiLearn} />;
  }
  return <DrumMachineEditor key={props.pattern.id} {...props} pattern={props.pattern} />;
}

function DrumMachineEditor({ pattern, pads, projectName, trackName, meter = { numerator: 4, denominator: 4 },
  saveState, externalError, onCommand, onUndo, onRedo, canUndo, canRedo, onPreviewPad }: EditorProps) {
  const [optimisticPattern, setOptimisticPattern] = useState<ProjectPattern | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bank, setBank] = useState(0);
  const [bar, setBar] = useState(0);
  const [stepTicks, setStepTicks] = useState(240);
  const [swingPercent, setSwingPercent] = useState("25");
  const [swingPreview, setSwingPreview] = useState<{
    readonly sourceVersion: number; readonly pattern: ProjectPattern } | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const currentPattern = busy && optimisticPattern ? optimisticPattern : pattern;
  const previewPattern = swingPreview?.sourceVersion === currentPattern.version ? swingPreview.pattern : null;
  const displayPattern = previewPattern ?? currentPattern;
  const ticksPerBar = drumBarTicks(meter.numerator, meter.denominator);
  const barCount = Math.ceil(currentPattern.lengthTicks / ticksPerBar);
  const visibleBar = Math.min(bar, barCount - 1);
  const bankCount = Math.max(1, Math.ceil(pads.length / SLOTS_PER_BANK));
  const visiblePads = useMemo(() => Array.from({ length: SLOTS_PER_BANK }, (_, index) =>
    pads[bank * SLOTS_PER_BANK + index] ?? null), [pads, bank]);
  const barStartTick = visibleBar * ticksPerBar;
  const stepCount = Math.ceil(ticksPerBar / stepTicks);
  const cells = useMemo(() => projectDrumBar(displayPattern, visiblePads, barStartTick,
    ticksPerBar, stepTicks), [displayPattern, visiblePads, barStartTick, ticksPerBar, stepTicks]);
  const selectedNote = selectedNoteId ? currentPattern.notes.find((note) => note.id === selectedNoteId) ?? null : null;
  const selectedPad = selectedNote ? pads.find((pad) => pad.midiNote === selectedNote.pitch && pad.channel === selectedNote.channel) : null;
  const readyCount = pads.filter((pad) => pad.midiNote !== null && pad.sourceStatus === "ready").length;

  async function commit(next: ProjectPattern): Promise<boolean> {
    if (next === currentPattern || busy) return false;
    setBusy(true);
    setError("");
    setSwingPreview(null);
    setOptimisticPattern(next);
    try {
      await onCommand(pianoRollReplaceCommand(currentPattern, next));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar la batería");
      return false;
    } finally { setOptimisticPattern(null); setBusy(false); }
  }

  function selectOrAdd(pad: DrumPadDefinition, stepIndex: number): void {
    const cell = cells.get(pad.id)?.[stepIndex];
    if (!cell) return;
    const existing = cell.exactNotes[0] ?? cell.offsetNotes[0];
    if (existing) {
      setSelectedNoteId(existing.id);
      setInspectorOpen(true);
      return;
    }
    if (pad.sourceStatus !== "ready") {
      setError(`${pad.label} no tiene muestra decodificada; no se agregó un paso silencioso`);
      return;
    }
    try {
      const next = addDrumStep(currentPattern, pad, cell.startTick, stepTicks);
      const created = next.notes.at(-1)!;
      setSelectedNoteId(created.id);
      setInspectorOpen(true);
      void commit(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Paso inválido"); }
  }

  function editSelected(fields: EditableNoteFields, performance: EditablePerformanceFields): void {
    if (!selectedNote) return;
    try { void commit(editPianoRollNoteWithPerformance(currentPattern, selectedNote.id, fields, performance)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Golpe inválido"); }
  }

  function deleteSelected(): void {
    if (!selectedNote) return;
    try { void commit(removeDrumStep(currentPattern, selectedNote.id)).then((accepted) => {
      if (accepted) setSelectedNoteId(null);
    }); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo borrar el golpe"); }
  }

  function previewPad(pad: DrumPadDefinition): void {
    if (!onPreviewPad || pad.sourceStatus !== "ready") return;
    try { onPreviewPad(pad, `${pattern.id}:preview:pad:${crypto.randomUUID()}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo escuchar el pad"); }
  }

  function isolateKeys(event: KeyboardEvent<HTMLElement>): void { event.stopPropagation(); }

  function changeLength(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const steps = Number(form.get("stepCount"));
    try { void commit(resizeDrumPattern(currentPattern, stepTicks, steps)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Longitud inválida"); }
  }

  function previewSwing(): void {
    const value = Number(swingPercent);
    if (!swingPercent.trim() || !Number.isFinite(value) || value < 0 || value > 100) {
      setError("Swing debe estar entre 0 y 100 %");
      return;
    }
    try {
      const next = quantizePianoRollNotes(currentPattern,
        new Set(currentPattern.notes.map((note) => note.id)),
        { gridTicks: stepTicks, strength: 1, swing: value / 100 });
      if (next === currentPattern) { setError("Los golpes ya coinciden con ese swing"); return; }
      setError("");
      setSwingPreview({ sourceVersion: currentPattern.version, pattern: next });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Swing inválido"); }
  }

  return <section className="drum-machine" aria-label="Batería por pasos" onKeyDown={isolateKeys} onKeyUp={isolateKeys}>
    <header className="drum-machine__header">
      <div><span className="drum-machine__eyebrow">{projectName ?? "Proyecto"} / {trackName ?? "Batería"}</span>
        <h2>{currentPattern.name}</h2>
        <p>{currentPattern.notes.length.toLocaleString("es-CO")} golpes · {readyCount} fuentes listas para tocar · audición física pendiente</p></div>
      {saveState && <span className="drum-machine__save" role="status">{
        saveState === "clean" ? "Guardado" : saveState === "saving" ? "Guardando…" :
          saveState === "pending" ? "Pendiente" : saveState === "conflict" ? "Conflicto" : "Error al guardar"
      }</span>}
    </header>
    <div className="drum-machine__toolbar">
      {bankCount > 1 && <div className="drum-machine__paging" role="group" aria-label="Banco de pads">
        <button type="button" disabled={bank === 0} onClick={() => setBank(bank - 1)}>Banco anterior</button>
        <span>Banco {bank + 1}/{bankCount}</span>
        <button type="button" disabled={bank >= bankCount - 1} onClick={() => setBank(bank + 1)}>Banco siguiente</button>
      </div>}
      <div className="drum-machine__paging" role="group" aria-label="Compás">
        <button type="button" disabled={visibleBar === 0} onClick={() => setBar(visibleBar - 1)}>◀ <span className="drum-machine__long">Anterior</span></button>
        <span>Compás {visibleBar + 1}/{barCount}</span>
        <button type="button" disabled={visibleBar >= barCount - 1} onClick={() => setBar(visibleBar + 1)}><span className="drum-machine__long">Siguiente</span> ▶</button>
      </div>
      <label className="drum-machine__division">División
        <select value={stepTicks} onChange={(event) => { setStepTicks(Number(event.target.value)); setSwingPreview(null); }}>
          {DIVISIONS.map((division) => <option key={division.ticks} value={division.ticks}>{division.label}</option>)}
        </select>
      </label>
      {(onUndo || onRedo) && <div className="drum-machine__history" role="group" aria-label="Historial">
        {onUndo && <button type="button" disabled={!canUndo || busy} onClick={() => void onUndo()}>Deshacer</button>}
        {onRedo && <button type="button" disabled={!canRedo || busy} onClick={() => void onRedo()}>Rehacer</button>}
      </div>}
    </div>
    <div className="drum-machine__pattern-tools">
      <form onSubmit={changeLength}>
        <label>Longitud · pasos<input key={`${currentPattern.lengthTicks}:${stepTicks}`} name="stepCount"
          aria-label="Longitud del patrón en pasos" type="number" inputMode="numeric" min={1} max={4096}
          defaultValue={Math.ceil(currentPattern.lengthTicks / stepTicks)} disabled={busy} /></label>
        <button type="submit" disabled={busy || !!previewPattern}>Aplicar longitud</button>
      </form>
      <div className="drum-machine__swing-controls">
        <label>Swing · %<input aria-label="Swing de batería" type="number" inputMode="decimal"
          min={0} max={100} step={1} value={swingPercent} disabled={busy || !!previewPattern}
          onChange={(event) => setSwingPercent(event.target.value)} /></label>
        {previewPattern ? <><button type="button" className="drum-machine__primary" disabled={busy}
          onClick={() => void commit(previewPattern)}>Aplicar swing</button>
          <button type="button" disabled={busy} onClick={() => setSwingPreview(null)}>Descartar</button></>
          : <button type="button" disabled={busy || currentPattern.notes.length === 0}
            onClick={previewSwing}>Prever swing</button>}
      </div>
    </div>
    {previewPattern && <p className="drum-machine__hint" role="status">Vista previa de swing: los golpes desplazados se marcan ◇. Aplicar crea un solo paso reversible.</p>}
    {(error || externalError) && <p className="drum-machine__error" role="alert">{error || externalError}</p>}
    <p className="drum-machine__hint">Toca un paso vacío para crear un golpe. Toca uno activo para editarlo; el inspector permite borrarlo. Los golpes fuera de rejilla se conservan.</p>
    <div className="drum-machine__scroll" role="region" aria-label="Rejilla de 16 pads por pasos">
      <div className="drum-machine__grid" style={{ gridTemplateColumns: `112px repeat(${stepCount}, 44px)` }}>
        <div className="drum-machine__corner">PAD / PASO</div>
        {Array.from({ length: stepCount }, (_, stepIndex) => <div className={`drum-machine__step-head ${stepIndex % 4 === 0 ? "is-beat" : ""}`} key={stepIndex}>
          {stepIndex + 1}</div>)}
        {visiblePads.map((pad, slot) => <div className="drum-machine__row" key={pad?.id ?? `empty-${slot}`}>
          <div className="drum-machine__pad">
            {pad ? <><strong>{pad.label}</strong><small>{pad.midiNote === null ? "Sin fuente" :
              pad.sourceStatus === "ready" ? `MIDI ${pad.midiNote} · listo` :
                pad.sourceStatus === "loading" ? "Cargando…" : "Muestra faltante"}</small>
              {onPreviewPad && pad.sourceStatus === "ready" && pad.midiNote !== null &&
                <button type="button" aria-label={`Escuchar ${pad.label}`} title={`Escuchar ${pad.label}`}
                  onClick={() => previewPad(pad)}>▶</button>}</>
              : <><strong>Pad {bank * SLOTS_PER_BANK + slot + 1}</strong><small>Sin fuente</small></>}
          </div>
          {Array.from({ length: stepCount }, (_, stepIndex) => {
            const cell = pad ? cells.get(pad.id)?.[stepIndex] : null;
            const active = (cell?.exactNotes.length ?? 0) > 0;
            const offset = (cell?.offsetNotes.length ?? 0) > 0;
            const disabled = busy || !!previewPattern || !pad || pad.midiNote === null ||
              (!active && !offset && pad.sourceStatus !== "ready") ||
              !cell || cell.startTick >= currentPattern.lengthTicks;
            const label = pad ? `${pad.label}, compás ${visibleBar + 1}, paso ${stepIndex + 1}, ${
              active ? `${cell?.exactNotes.length} golpe(s)` : offset ? "golpe fuera de rejilla" :
                pad.sourceStatus !== "ready" ? "fuente no disponible" : "vacío"}` :
              `Pad ${bank * SLOTS_PER_BANK + slot + 1} sin fuente`;
            return <button type="button" className={`drum-machine__step ${active ? "is-active" : ""} ${offset ? "has-offset" : ""} ${
              cell?.exactNotes.some((note) => note.id === selectedNoteId) ||
              cell?.offsetNotes.some((note) => note.id === selectedNoteId) ? "is-selected" : ""}`}
              key={stepIndex} aria-label={label} aria-pressed={active} disabled={disabled}
              title={label} onClick={() => { if (pad) selectOrAdd(pad, stepIndex); }}>
              {active ? cell!.exactNotes.length > 1 ? cell!.exactNotes.length : "●" : offset ? "◇" : ""}
            </button>;
          })}
        </div>)}
      </div>
    </div>
    <section className="drum-machine__inspector" aria-label="Inspector de golpe">
      <button type="button" className="drum-machine__inspector-toggle" aria-expanded={inspectorOpen}
        onClick={() => setInspectorOpen((open) => !open)}>Golpe seleccionado <span aria-hidden="true">{inspectorOpen ? "▴" : "▾"}</span></button>
      <div className={`drum-machine__inspector-content ${inspectorOpen ? "is-open" : ""}`}>
        {selectedNote ? <><p className="drum-machine__selected-pad">{selectedPad?.label ?? "Nota MIDI"} · tick {selectedNote.startTick}</p>
          <NoteInspector key={`${selectedNote.id}:${selectedNote.startTick}:${selectedNote.velocity}:${selectedNote.durationTick}:${selectedNote.microOffsetTick}:${selectedNote.probability}:${selectedNote.ratchetCount}:${selectedNote.muted}`}
            note={selectedNote} busy={busy} onApply={editSelected} onDelete={deleteSelected}
            onPreview={selectedPad && onPreviewPad && selectedPad.sourceStatus === "ready"
              ? () => previewPad(selectedPad) : undefined} /></>
          : <p className="drum-machine__no-selection">Selecciona un golpe para editar velocity, tiempo y duración con números exactos.</p>}
      </div>
    </section>
  </section>;
}
