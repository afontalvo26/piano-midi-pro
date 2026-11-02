import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ProjectDocumentV1, ProjectDrumPad, ProjectDrumPadSource,
  ProjectPattern, ProjectTrack } from "../../project/model.ts";
import type { ProjectCommand } from "../../project/commands.ts";
import { addDrumRackStep, drumPadCycleTicks, editDrumRackPadInProject,
  projectDrumPadCycle, swingDrumRackPattern } from "../../composition/drumRackModel.ts";
import { removeDrumStep } from "../../composition/drumPattern.ts";
import { editPianoRollNoteWithPerformance, pianoRollReplaceCommand,
  type EditableNoteFields, type EditablePerformanceFields } from "../../composition/pianoRollModel.ts";
import { NoteInspector } from "./NoteInspector.tsx";
import { parseDrumPadMidiAction } from "../../midi/drumPadMidi.ts";
import "./DrumRackEditor.css";

export interface DrumRackPadStatus {
  readonly padId: string;
  readonly note: number;
  readonly channel: number;
  readonly label: string;
  readonly assetStatus: "ready" | "loading" | "error";
  readonly sourceLabel: string;
  readonly error: string | null;
  readonly muted: boolean;
}

export interface DrumRackSourceOption {
  readonly id: string;
  readonly label: string;
  readonly source: ProjectDrumPadSource;
}

export interface DrumRackEditorProps {
  readonly document: ProjectDocumentV1;
  readonly track: ProjectTrack & { readonly drumRack: NonNullable<ProjectTrack["drumRack"]> };
  readonly pattern: ProjectPattern;
  readonly padStatuses?: readonly DrumRackPadStatus[];
  readonly sourceOptions?: readonly DrumRackSourceOption[];
  readonly saveState?: "clean" | "pending" | "saving" | "error" | "conflict";
  readonly externalError?: string;
  readonly onCommand: (command: ProjectCommand) => void | Promise<void>;
  readonly onUndo?: () => void | Promise<void>;
  readonly onRedo?: () => void | Promise<void>;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly onPreviewRackPad?: (pad: ProjectDrumPad, ownerId: string) => void;
  readonly midiLearnAction?: string | null;
  readonly onMidiLearnPad?: (padId: string) => void;
  readonly onCancelMidiLearn?: () => void;
}

const PAGE_SIZE = 16;

function numberField(form: FormData, name: string, min: number, max: number,
  integer = false): number {
  const raw = String(form.get(name) ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < min || value > max ||
      (integer && !Number.isSafeInteger(value))) throw new RangeError(`${name}: valor fuera de rango`);
  return value;
}

function sourceId(source: ProjectDrumPadSource | null,
  options: readonly DrumRackSourceOption[]): string {
  if (!source) return "none";
  return options.find((option) => JSON.stringify(option.source) === JSON.stringify(source))?.id ?? "current";
}

export function DrumRackEditor(props: DrumRackEditorProps) {
  const { document, track, pattern, padStatuses = [], sourceOptions = [], saveState,
    externalError, onCommand, onUndo, onRedo, canUndo, canRedo, onPreviewRackPad,
    midiLearnAction, onMidiLearnPad, onCancelMidiLearn } = props;
  const [page, setPage] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null);
  const [padInspectorOpen, setPadInspectorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [swingPercent, setSwingPercent] = useState("25");
  const [swingPreview, setSwingPreview] = useState<{
    readonly sourceVersion: number; readonly pattern: ProjectPattern } | null>(null);
  const [optimisticPattern, setOptimisticPattern] = useState<ProjectPattern | null>(null);
  const currentPattern = busy && optimisticPattern ? optimisticPattern : pattern;
  const previewPattern = swingPreview?.sourceVersion === currentPattern.version ? swingPreview.pattern : null;
  const displayPattern = previewPattern ?? currentPattern;
  const pads = track.drumRack.pads;
  const maxPage = Math.ceil(Math.max(...pads.map((pad) => pad.stepCount)) / PAGE_SIZE) - 1;
  const visiblePage = Math.min(page, maxPage);
  const statuses = new Map(padStatuses.map((status) => [status.padId, status]));
  const cells = useMemo(() => new Map(pads.map((pad) =>
    [pad.id, projectDrumPadCycle(displayPattern, pad)])), [pads, displayPattern]);
  const selectedNote = selectedNoteId
    ? currentPattern.notes.find((note) => note.id === selectedNoteId) ?? null : null;
  const selectedNotePad = selectedNote ? pads.find((pad) =>
    pad.midiNote === selectedNote.pitch && pad.channel === selectedNote.channel) : undefined;
  const selectedPad = selectedPadId ? pads.find((pad) => pad.id === selectedPadId) : undefined;
  const pendingPadLearn = parseDrumPadMidiAction(midiLearnAction ?? "");
  const learningSelectedPad = !!selectedPad && pendingPadLearn?.padId === selectedPad.id;
  const readyCount = pads.filter((pad) => statuses.get(pad.id)?.assetStatus === "ready").length;

  async function commit(command: ProjectCommand, nextPattern?: ProjectPattern): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    setSwingPreview(null);
    setOptimisticPattern(nextPattern ?? null);
    try { await onCommand(command); return true; }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el rack");
      return false;
    } finally { setOptimisticPattern(null); setBusy(false); }
  }

  function commitPattern(next: ProjectPattern): void {
    if (next !== currentPattern) void commit(pianoRollReplaceCommand(currentPattern, next), next);
  }

  function selectStep(pad: ProjectDrumPad, stepIndex: number): void {
    if (previewPattern) return;
    const cell = cells.get(pad.id)?.[stepIndex];
    if (!cell) return;
    const existing = cell.exactNotes[0] ?? cell.offsetNotes[0];
    if (existing) { setSelectedNoteId(existing.id); setInspectorOpen(true); return; }
    const status = statuses.get(pad.id);
    if (!pad.source || status?.assetStatus !== "ready") {
      setError(status?.error ?? `${pad.name}: muestra todavía no decodificada`);
      return;
    }
    try {
      const next = addDrumRackStep(currentPattern, pad, stepIndex);
      setSelectedNoteId(next.notes.at(-1)!.id);
      setInspectorOpen(true);
      commitPattern(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Paso inválido"); }
  }

  function editNote(fields: EditableNoteFields, performance: EditablePerformanceFields): void {
    if (!selectedNote) return;
    try { commitPattern(editPianoRollNoteWithPerformance(currentPattern, selectedNote.id,
      fields, performance)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Golpe inválido"); }
  }

  function deleteNote(): void {
    if (!selectedNote) return;
    try {
      const next = removeDrumStep(currentPattern, selectedNote.id);
      void commit(pianoRollReplaceCommand(currentPattern, next), next).then((accepted) => {
        if (accepted) setSelectedNoteId(null);
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Golpe inválido"); }
  }

  function preview(pad: ProjectDrumPad): void {
    const status = statuses.get(pad.id);
    if (!onPreviewRackPad || status?.assetStatus !== "ready" || status.muted) return;
    try { onPreviewRackPad(pad, `${pattern.id}:preview:pad:${crypto.randomUUID()}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo escuchar el pad"); }
  }

  function savePad(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedPad) return;
    const form = new FormData(event.currentTarget);
    try {
      const sourceChoice = String(form.get("source"));
      const source = sourceChoice === "none" ? null : sourceChoice === "current"
        ? selectedPad.source : sourceOptions.find((option) => option.id === sourceChoice)?.source;
      if (source === undefined) throw new RangeError("Fuente de pad inexistente");
      const endFrameRaw = String(form.get("endFrame") ?? "").trim();
      const endFrame = endFrameRaw ? numberField(form, "endFrame", 1, Number.MAX_SAFE_INTEGER, true) : undefined;
      const chokeGroup = String(form.get("chokeGroup") ?? "").trim();
      const nextPad: ProjectDrumPad = { id: selectedPad.id,
        name: String(form.get("name") ?? "").trim(), color: String(form.get("color") ?? ""),
        midiNote: numberField(form, "midiNote", 0, 127, true),
        channel: numberField(form, "channel", 1, 16, true) - 1,
        source, gainDb: numberField(form, "gainDb", -120, 24),
        pan: numberField(form, "pan", -1, 1),
        velocitySensitivity: numberField(form, "velocitySensitivity", 0, 2),
        pitchSemitones: numberField(form, "pitchSemitones", -24, 24),
        startFrame: numberField(form, "startFrame", 0, Number.MAX_SAFE_INTEGER, true),
        ...(endFrame === undefined ? {} : { endFrame }), attackMs: numberField(form, "attackMs", 0, 10000),
        decayMs: numberField(form, "decayMs", 0, 10000),
        playMode: form.get("playMode") === "gate" ? "gate" : "oneShot",
        mute: form.get("mute") === "on", solo: form.get("solo") === "on",
        ...(chokeGroup ? { chokeGroup } : {}),
        stepTicks: numberField(form, "stepTicks", 1, 15360, true),
        stepCount: numberField(form, "stepCount", 1, 128, true),
      };
      if (!nextPad.name || !/^#[0-9a-fA-F]{6}$/.test(nextPad.color)) {
        throw new RangeError("Nombre o color de pad inválido");
      }
      void commit(editDrumRackPadInProject(document, track.id, nextPad)).then((accepted) => {
        if (accepted) setPadInspectorOpen(false);
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Parámetros del pad inválidos"); }
  }

  function previewSwing(): void {
    const amount = Number(swingPercent);
    if (!swingPercent.trim() || !Number.isFinite(amount) || amount < 0 || amount > 100) {
      setError("Swing debe estar entre 0 y 100 %");
      return;
    }
    try {
      const next = swingDrumRackPattern(currentPattern, track.drumRack, amount / 100);
      if (next === currentPattern) { setError("No hay golpes impares que mover con ese swing"); return; }
      setError("");
      setSwingPreview({ sourceVersion: currentPattern.version, pattern: next });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Swing inválido"); }
  }

  function isolateKeys(event: KeyboardEvent<HTMLElement>): void { event.stopPropagation(); }

  return <section className="drum-rack" aria-label="Rack de batería de 16 pads"
    onKeyDown={isolateKeys} onKeyUp={isolateKeys}>
    <header className="drum-rack__header"><div><span>RACK / 16 PADS</span><h2>{currentPattern.name}</h2>
      <p>{currentPattern.notes.length.toLocaleString("es-CO")} golpes · {readyCount}/16 fuentes decodificadas · ciclo común {currentPattern.lengthTicks} ticks · audición física pendiente</p></div>
      {saveState && <small role="status">{saveState === "clean" ? "Guardado" :
        saveState === "saving" ? "Guardando…" : saveState === "pending" ? "Pendiente" :
          saveState === "conflict" ? "Conflicto" : "Error al guardar"}</small>}</header>
    <div className="drum-rack__toolbar">
      <div role="group" aria-label="Páginas de pasos">
        <button type="button" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>◀ Anterior</button>
        <span>Pasos {visiblePage * PAGE_SIZE + 1}–{Math.min((visiblePage + 1) * PAGE_SIZE,
          Math.max(...pads.map((pad) => pad.stepCount)))}</span>
        <button type="button" disabled={visiblePage >= maxPage} onClick={() => setPage(visiblePage + 1)}>Siguiente ▶</button>
      </div>
      {(onUndo || onRedo) && <div role="group" aria-label="Historial">
        {onUndo && <button type="button" disabled={!canUndo || busy || !!previewPattern} onClick={() => void onUndo()}>Deshacer</button>}
        {onRedo && <button type="button" disabled={!canRedo || busy || !!previewPattern} onClick={() => void onRedo()}>Rehacer</button>}
      </div>}
    </div>
    <div className="drum-rack__swing">
      <label>Swing por pad · %<input aria-label="Swing del rack" type="number" inputMode="numeric"
        min={0} max={100} step={1} value={swingPercent} disabled={busy || !!previewPattern}
        onChange={(event) => setSwingPercent(event.target.value)} /></label>
      {previewPattern ? <><button type="button" disabled={busy}
        onClick={() => commitPattern(previewPattern)}>Aplicar swing</button>
        <button type="button" disabled={busy} onClick={() => setSwingPreview(null)}>Descartar</button></>
        : <button type="button" disabled={busy || !currentPattern.notes.length}
          onClick={previewSwing}>Prever swing</button>}
    </div>
    {previewPattern && <p className="drum-rack__hint" role="status">Vista previa: ◇ indica golpes desplazados. Aplicar crea un cambio reversible.</p>}
    {(error || externalError) && <p className="drum-rack__error" role="alert">{error || externalError}</p>}
    <p className="drum-rack__hint">Cada fila muestra una vuelta propia. El proyecto repite cada pad hasta el ciclo común. Los pads sin muestra decodificada conservan sus golpes, pero no agregan golpes silenciosos.</p>
    <div className="drum-rack__scroll" role="region" aria-label="Pasos de los 16 pads" tabIndex={0}>
      <div className="drum-rack__grid">
        <div className="drum-rack__corner">PAD / PASO</div>
        {Array.from({ length: PAGE_SIZE }, (_, index) => <div className="drum-rack__head"
          key={index}>{visiblePage * PAGE_SIZE + index + 1}</div>)}
        {pads.map((pad) => {
          const status = statuses.get(pad.id);
          const padCells = cells.get(pad.id)!;
          return <div className="drum-rack__row" key={pad.id}>
            <div className="drum-rack__pad" title={status?.error ?? status?.sourceLabel ??
              (pad.source ? "Audio pendiente de preparar" : "Pad sin muestra asignada")}>
              <strong style={{ borderLeftColor: pad.color }}>{pad.name}</strong>
              <small>{status?.assetStatus === "ready" ? status.muted ? "Silenciado" : "Lista" :
                status?.assetStatus === "loading" ? "Cargando…" :
                  pad.source ? status ? "Error de muestra" : "Preparar audio" : "Sin fuente"} · {pad.stepCount}×{pad.stepTicks}</small>
              <div><button type="button" aria-label={`Configurar ${pad.name}`} disabled={!!previewPattern}
                onClick={() => { setSelectedPadId(pad.id); setPadInspectorOpen(true); }}>⚙</button>
                {onPreviewRackPad && status?.assetStatus === "ready" && !status.muted &&
                  <button type="button" aria-label={`Escuchar ${pad.name}`} disabled={!!previewPattern}
                    onClick={() => preview(pad)}>▶</button>}</div>
            </div>
            {Array.from({ length: PAGE_SIZE }, (_, index) => {
              const stepIndex = visiblePage * PAGE_SIZE + index;
              const cell = padCells[stepIndex];
              const active = (cell?.exactNotes.length ?? 0) > 0;
              const offset = (cell?.offsetNotes.length ?? 0) > 0;
              const label = `${pad.name}, paso ${stepIndex + 1}, ${active
                ? `${cell?.exactNotes.length} golpe(s)` : offset ? "golpe fuera de rejilla" :
                  status?.assetStatus === "ready" ? status.muted ? "vacío, pad silenciado" : "vacío" :
                    status?.error ?? (pad.source ? "audio pendiente de preparar" : "sin muestra asignada")}`;
              return <button className={`drum-rack__step ${active ? "is-active" : ""} ${
                offset ? "has-offset" : ""}`} type="button" key={stepIndex}
                aria-label={label} aria-pressed={active} title={label}
                disabled={busy || !!previewPattern || !cell ||
                  (!active && !offset && status?.assetStatus !== "ready")}
                onClick={() => selectStep(pad, stepIndex)}>{active
                  ? cell!.exactNotes.length > 1 ? cell!.exactNotes.length : "●" : offset ? "◇" : ""}</button>;
            })}
          </div>;
        })}
      </div>
    </div>
    <section className="drum-rack__inspector" aria-label="Inspector de golpe">
      <button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>
        Golpe seleccionado {inspectorOpen ? "▴" : "▾"}</button>
      {inspectorOpen && (selectedNote ? <NoteInspector
        key={`${selectedNote.id}:${selectedNote.startTick}:${selectedNote.velocity}:${selectedNote.durationTick}:${selectedNote.microOffsetTick}:${selectedNote.probability}:${selectedNote.ratchetCount}:${selectedNote.muted}`}
        note={selectedNote} busy={busy || !!previewPattern} onApply={editNote} onDelete={deleteNote}
        onPreview={selectedNotePad && onPreviewRackPad &&
          statuses.get(selectedNotePad.id)?.assetStatus === "ready" &&
          !statuses.get(selectedNotePad.id)?.muted ? () => preview(selectedNotePad) : undefined} />
        : <p>Selecciona un golpe para editar velocity, tiempo, duración y expresión por paso.</p>)}
    </section>
    {padInspectorOpen && selectedPad && <section className="drum-rack__pad-inspector" aria-label="Configuración de pad">
      <header><h3>{selectedPad.name} · nota {selectedPad.midiNote}</h3>
        <button type="button" onClick={() => setPadInspectorOpen(false)}>Cerrar</button></header>
      <p>{statuses.get(selectedPad.id)?.sourceLabel ?? "Fuente no preparada"} · {
        statuses.get(selectedPad.id)?.error ?? "Estado de decodificación disponible"}</p>
      <form key={JSON.stringify(selectedPad)} onSubmit={savePad}>
        <label>Nombre<input name="name" defaultValue={selectedPad.name} required maxLength={80} /></label>
        <label>Color<input name="color" type="color" defaultValue={selectedPad.color} /></label>
        <label>Nota MIDI<input name="midiNote" type="number" inputMode="numeric" min={0} max={127}
          defaultValue={selectedPad.midiNote} required /></label>
        <label>Canal MIDI<input name="channel" type="number" inputMode="numeric" min={1} max={16}
          defaultValue={selectedPad.channel + 1} required /></label>
        <label>Fuente<select name="source" defaultValue={sourceId(selectedPad.source, sourceOptions)}>
          <option value="none">Sin fuente · silencio explícito</option>
          {selectedPad.source && sourceId(selectedPad.source, sourceOptions) === "current" &&
            <option value="current">Fuente actual · {statuses.get(selectedPad.id)?.sourceLabel ?? "grabada"}</option>}
          {sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <label>Ganancia dB<input name="gainDb" type="number" inputMode="decimal" min={-120} max={24}
          step="any" defaultValue={selectedPad.gainDb} required /></label>
        <label>Pan −1 a 1<input name="pan" type="number" inputMode="decimal" min={-1} max={1}
          step="any" defaultValue={selectedPad.pan} required /></label>
        <label>Sensibilidad velocity<input name="velocitySensitivity" aria-label="Sensibilidad velocity del pad"
          type="number" inputMode="decimal" min={0} max={2} step={0.05}
          defaultValue={selectedPad.velocitySensitivity ?? 1} required />
          <small>0 = casi fija · 1 = normal · 2 = más dinámica</small></label>
        <label>Tono semitonos<input name="pitchSemitones" type="number" inputMode="decimal"
          min={-24} max={24} step="any" defaultValue={selectedPad.pitchSemitones} required /></label>
        <label>Inicio frame<input name="startFrame" type="number" inputMode="numeric" min={0}
          defaultValue={selectedPad.startFrame} required /></label>
        <label>Fin frame (opcional)<input name="endFrame" type="number" inputMode="numeric" min={1}
          defaultValue={selectedPad.endFrame ?? ""} /></label>
        <label>Ataque ms<input name="attackMs" type="number" inputMode="decimal" min={0} max={10000}
          step="any" defaultValue={selectedPad.attackMs} required /></label>
        <label>Decaimiento ms<input name="decayMs" type="number" inputMode="decimal" min={0} max={10000}
          step="any" defaultValue={selectedPad.decayMs} required /></label>
        <label>Modo<select name="playMode" defaultValue={selectedPad.playMode}>
          <option value="oneShot">Disparo completo</option><option value="gate">Sostener hasta soltar</option>
        </select></label>
        <label>Grupo choke<input name="chokeGroup" defaultValue={selectedPad.chokeGroup ?? ""}
          placeholder="Vacío: sin choke" /></label>
        <label>Ticks por paso<input name="stepTicks" type="number" inputMode="numeric" min={1} max={15360}
          defaultValue={selectedPad.stepTicks} required /></label>
        <label>Pasos por vuelta<input name="stepCount" type="number" inputMode="numeric" min={1} max={128}
          defaultValue={selectedPad.stepCount} required /></label>
        <label className="drum-rack__check"><input name="mute" type="checkbox" defaultChecked={selectedPad.mute} />Silenciar</label>
        <label className="drum-rack__check"><input name="solo" type="checkbox" defaultChecked={selectedPad.solo} />Solo</label>
        {onMidiLearnPad && <div className="drum-rack__midi-learn">
          {!learningSelectedPad ? <button type="button" disabled={busy || !!previewPattern}
            onClick={() => onMidiLearnPad(selectedPad.id)}>MIDI Learn de este pad</button>
            : <button type="button" onClick={onCancelMidiLearn}>Cancelar MIDI Learn</button>}
          <small>{learningSelectedPad
            ? "Golpea ahora el pad/tecla física que debe disparar este pad. Se guardarán puerto, canal, nota y banco observados."
            : "No se presupone ningún mapa del controlador; Learn usa el mensaje físico real."}</small>
        </div>}
        <div className="drum-rack__actions"><button type="submit" disabled={busy || !!previewPattern}>Guardar pad</button>
          <span>Ciclo: {drumPadCycleTicks(selectedPad)} ticks</span></div>
      </form>
    </section>}
  </section>;
}
