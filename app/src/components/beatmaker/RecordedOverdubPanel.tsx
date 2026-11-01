import { useRef, useState } from "react";
import type { RecordedTakeSummary } from "../../midi/recordingLibrary.ts";
import type { ProjectDocumentV1 } from "../../project/model.ts";
import type { ConvertedRecordedTake } from "../../project/smfImport.ts";
import type { PortableRecordedOverdubRequest } from "../../project/portableOverdub.ts";
import { preparePatternOverdub, recordedOverdubTakeRef,
  type PreparedPatternOverdub } from "../../composition/recordedOverdub.ts";
import "./RecordedOverdubPanel.css";

export interface RecordedOverdubPanelProps {
  readonly document: ProjectDocumentV1;
  readonly trackId: string;
  readonly patternId: string;
  /** Initial absolute project tick, not a live controlled playhead value. */
  readonly projectStartTick: number;
  /** Supplies a saved recording start, or the current playhead, when the take changes. */
  readonly startTickForTake?: (recordingId: string) => number;
  readonly activeSceneId?: string | null;
  readonly recording?: boolean;
  readonly takes: readonly RecordedTakeSummary[];
  /** Loads verified bytes already saved in Pistas; never removes or rewrites them. */
  readonly onLoadTake: (recordingId: string) => Promise<ConvertedRecordedTake>;
  /** Must stage exact SMF bytes, dispatch one reversible command and save before resolving. */
  readonly onCommit: (request: PortableRecordedOverdubRequest) => Promise<void>;
}

interface Preview {
  readonly document: ProjectDocumentV1;
  readonly trackId: string;
  readonly patternId: string;
  readonly projectStartTick: number;
  readonly recordingId: string;
  readonly prepared: PreparedPatternOverdub;
  readonly request: PortableRecordedOverdubRequest;
}

function durationLabel(durationMs: number): string {
  const seconds = Math.round(durationMs / 100) / 10;
  return `${seconds.toLocaleString("es-CO")} s`;
}

export function RecordedOverdubPanel({ document, trackId, patternId, projectStartTick,
  startTickForTake, activeSceneId, recording = false, takes, onLoadTake,
  onCommit }: RecordedOverdubPanelProps) {
  const [selectedId, setSelectedId] = useState("");
  const [startTickInput, setStartTickInput] = useState({ takeId: takes[0]?.id ?? "",
    value: String(projectStartTick) });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestNumber = useRef(0);
  const selectedTake = takes.find((take) => take.id === selectedId) ?? takes[0];
  const startTickText = startTickInput.takeId === selectedTake?.id
    ? startTickInput.value
    : String(selectedTake ? startTickForTake?.(selectedTake.id) ?? projectStartTick : projectStartTick);
  const parsedStartTick = /^(0|[1-9]\d*)$/.test(startTickText)
    ? Number(startTickText) : NaN;
  const selectedStartTick = Number.isSafeInteger(parsedStartTick) ? parsedStartTick : null;
  const current = preview?.document === document && preview.trackId === trackId &&
    preview.patternId === patternId && preview.projectStartTick === selectedStartTick &&
    preview.recordingId === selectedTake?.id && !activeSceneId && !recording ? preview : null;
  const track = document.tracks.find((entry) => entry.id === trackId);
  const pattern = document.patterns.find((entry) => entry.id === patternId);

  async function prepare(): Promise<void> {
    if (!selectedTake || busy || recording || selectedStartTick === null) return;
    setStartTickInput({ takeId: selectedTake.id, value: startTickText });
    const token = ++requestNumber.current;
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const converted = await onLoadTake(selectedTake.id);
      if (token !== requestNumber.current) return;
      const at = Date.now();
      const existing = document.takes.find((take) => take.kind === "midi" &&
        take.recordingId === selectedTake.id);
      const sourceTakeId = existing?.id ?? crypto.randomUUID();
      const prepared = preparePatternOverdub(document, converted, {
        trackId, patternId, projectStartTick: selectedStartTick, sourceTakeId,
        launcherActive: !!activeSceneId,
      });
      const take = recordedOverdubTakeRef(converted, {
        takeId: selectedTake.id, referenceId: sourceTakeId, at: existing?.createdAt ?? at,
      });
      setPreview({ document, trackId, patternId, projectStartTick: selectedStartTick,
        recordingId: selectedTake.id, prepared,
        request: { expectedVersion: prepared.pattern.version - 1, pattern: prepared.pattern, take, at } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la toma MIDI");
    } finally { if (token === requestNumber.current) setBusy(false); }
  }

  async function confirm(): Promise<void> {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCommit(current.request);
      setPreview(null);
      setNotice(`Toma añadida: ${current.prepared.addedNotes} notas y ${current.prepared.addedExpression} controles. Puedes deshacerla desde el piano roll.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el overdub");
    } finally { setBusy(false); }
  }

  return <section className="recorded-overdub" aria-label="Agregar toma al patrón">
    <header><div><span className="recorded-overdub__eyebrow">Toma propia / 960 PPQ</span>
      <h3>Agregar toma al patrón</h3>
      <p>Elige una toma guardada en Pistas. Se añadirán sus eventos al clip activo; la toma original permanece byte a byte y el proyecto guarda una copia portable.</p></div>
      <span className="recorded-overdub__count">{takes.length} {takes.length === 1 ? "toma" : "tomas"}</span></header>
    {takes.length ? <div className="recorded-overdub__controls">
      <label>Toma MIDI<select aria-label="Toma MIDI para agregar" value={selectedTake?.id ?? ""}
        disabled={busy || recording} onChange={(event) => {
          ++requestNumber.current; setSelectedId(event.target.value); setPreview(null); setError("");
          setStartTickInput({ takeId: event.target.value,
            value: String(startTickForTake?.(event.target.value) ?? projectStartTick) });
        }}>
        {takes.map((take) => <option key={take.id} value={take.id}>
          {take.name} · {durationLabel(take.durationMs)} · {take.tempoBpm} BPM
        </option>)}
      </select></label>
      <label>Inicio del overdub · tick<input aria-label="Inicio del overdub · tick"
        type="number" min="0" step="1" inputMode="numeric" value={startTickText}
        disabled={busy || recording} onChange={(event) => {
          ++requestNumber.current;
          setStartTickInput({ takeId: selectedTake?.id ?? "", value: event.target.value });
          setPreview(null); setError("");
        }} /></label>
      <button type="button" disabled={busy || recording || !track || !pattern ||
        selectedStartTick === null || !!activeSceneId}
        onClick={() => void prepare()}>{busy ? "Verificando toma…" : "Previsualizar destino"}</button>
    </div> : <p className="recorded-overdub__empty">Graba y guarda primero una toma MIDI propia en Pistas.</p>}
    {selectedStartTick === null && takes.length > 0 && <p className="recorded-overdub__hint">
      Escribe un tick absoluto entero entre 0 y {Number.MAX_SAFE_INTEGER}.</p>}
    {activeSceneId && <p className="recorded-overdub__hint">Vuelve al arreglo para confirmar la instancia de destino.</p>}
    {recording && <p className="recorded-overdub__hint">Detén y guarda la toma antes de agregarla al patrón.</p>}
    {current && <div className="recorded-overdub__preview" role="status">
      <strong>Destino confirmado antes de escribir</strong>
      <dl><div><dt>Pista / patrón</dt><dd>{track?.name} / {pattern?.name}</dd></div>
        <div><dt>Clip activo</dt><dd>{current.prepared.destinationClipId}</dd></div>
        <div><dt>Inicio absoluto</dt><dd>Tick {current.projectStartTick}</dd></div>
        <div><dt>Inicio local</dt><dd>Tick {current.prepared.patternInsertTick}</dd></div>
        <div><dt>Eventos nuevos</dt><dd>{current.prepared.addedNotes} notas · {current.prepared.addedExpression} controles</dd></div>
        <div><dt>Conversión</dt><dd>PPQ {current.prepared.sourcePpq} → 960 · {
          current.prepared.sourceRoundedPositions + current.prepared.retimedPositions} posiciones redondeadas</dd></div>
      </dl>
      {current.prepared.sharedClipCount > 1 && <p>Este patrón tiene {current.prepared.sharedClipCount} clips compartidos. La toma aparecerá en todos. Usa “Hacer único” antes de confirmar si quieres aislar uno.</p>}
      {(current.prepared.tailsBeyondPattern > 0 || current.prepared.tailsBeyondClip > 0) &&
        <p>{current.prepared.tailsBeyondPattern} colas cruzan el patrón y {current.prepared.tailsBeyondClip} el clip. Su audición depende de la política de cola del clip; no se recortan los datos MIDI.</p>}
      <p>Confirmar puede detener el transporte para cargar la nueva revisión. La acción se deshace en un solo paso y nunca borra Pistas.</p>
      <div className="recorded-overdub__actions">
        <button type="button" disabled={busy} onClick={() => void confirm()}>Confirmar toma en patrón</button>
        <button type="button" disabled={busy} onClick={() => setPreview(null)}>Descartar vista previa</button>
      </div>
    </div>}
    {error && <p className="recorded-overdub__error" role="alert">{error} La toma guardada sigue disponible en Pistas; también puedes importarla como pista nueva.</p>}
    {notice && <p className="recorded-overdub__success" role="status">{notice}</p>}
  </section>;
}
