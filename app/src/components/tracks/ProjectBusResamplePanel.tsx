import { useState } from "react";
import type { ProjectDocumentV1 } from "../../project/model";
import type { RenderProgress } from "../../audio/renderProjectPcm";
import { findBusResampleRoutes } from "../../project/busResampleRouting";
import "./ProjectBusResamplePanel.css";

export interface ProjectBusResampleRequest {
  readonly sourceBusTrackId: string;
  readonly destinationTrackId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly sampleRate: 44_100 | 48_000;
  readonly tailSeconds: number;
}

export interface ProjectBusResamplePanelProps {
  readonly document: ProjectDocumentV1;
  readonly busy: boolean;
  readonly progress: RenderProgress | null;
  readonly notice: string;
  readonly onCreateDestination: () => void;
  readonly onRender: (request: ProjectBusResampleRequest) => void;
  readonly onCancel: () => void;
}

function defaultEndTick(document: ProjectDocumentV1): number {
  return Math.max(3_840, ...document.clips.map((clip) => clip.startTick + clip.lengthTicks),
    ...document.sections.map((section) => section.startTick + section.lengthTicks));
}

export function ProjectBusResamplePanel({ document, busy, progress, notice,
  onCreateDestination, onRender, onCancel }: ProjectBusResamplePanelProps) {
  const buses = document.tracks.filter((track) => track.kind === "bus");
  const destinations = document.tracks.filter((track) => track.kind === "audio");
  const [busId, setBusId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [startTick, setStartTick] = useState("0");
  const [endTick, setEndTick] = useState(() => String(defaultEndTick(document)));
  const [sampleRate, setSampleRate] = useState<44_100 | 48_000>(48_000);
  const [tailSeconds, setTailSeconds] = useState("0.5");
  const selectedBusId = buses.some((bus) => bus.id === busId) ? busId : buses[0]?.id ?? "";
  const selectedDestinationId = destinations.some((track) => track.id === destinationId)
    ? destinationId : destinations[0]?.id ?? "";
  const parsedStart = Number(startTick);
  const parsedEnd = Number(endTick);
  const parsedTail = Number(tailSeconds);
  const valid = !!selectedBusId && !!selectedDestinationId &&
    Number.isSafeInteger(parsedStart) && parsedStart >= 0 &&
    Number.isSafeInteger(parsedEnd) && parsedEnd > parsedStart &&
    Number.isFinite(parsedTail) && parsedTail >= 0 && parsedTail <= 5;
  const routes = findBusResampleRoutes(document, selectedBusId, selectedDestinationId);
  const routedSourceCount = routes.sourceTrackIds.length;

  return <section className="bus-resample" aria-label="Resampling de bus">
    <header><h2>Resamplear bus</h2>
      <p>Crea un WAV inmutable después del bus y antes del master. La pista destino y sus clips nunca entran al render.</p></header>
    {!buses.length ? <p className="bus-resample__warning">Crea un bus en el Mezclador y enruta al menos una pista hacia él.</p> : <>
      <div className="bus-resample__grid">
        <label>Bus fuente<select aria-label="Bus fuente para resampling" value={selectedBusId}
          disabled={busy} onChange={(event) => setBusId(event.target.value)}>
          {buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
        </select></label>
        <label>Pista de audio destino<select aria-label="Pista destino del resampling"
          value={selectedDestinationId} disabled={busy || !destinations.length}
          onChange={(event) => setDestinationId(event.target.value)}>
          {destinations.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
        </select></label>
        <label>Tick inicial<input aria-label="Tick inicial del resampling" type="number"
          inputMode="numeric" min="0" step="1" value={startTick} disabled={busy}
          onChange={(event) => setStartTick(event.target.value)} /></label>
        <label>Tick final<input aria-label="Tick final del resampling" type="number"
          inputMode="numeric" min="1" step="1" value={endTick} disabled={busy}
          onChange={(event) => setEndTick(event.target.value)} /></label>
        <label>Frecuencia<select aria-label="Frecuencia del resampling" value={sampleRate}
          disabled={busy} onChange={(event) => setSampleRate(Number(event.target.value) as 44_100 | 48_000)}>
          <option value={48_000}>48.000 Hz</option><option value={44_100}>44.100 Hz</option>
        </select></label>
        <label>Cola (segundos)<input aria-label="Cola del resampling" type="number"
          inputMode="decimal" min="0" max="5" step="0.1" value={tailSeconds} disabled={busy}
          onChange={(event) => setTailSeconds(event.target.value)} /></label>
      </div>
      {!destinations.length && <div className="bus-resample__empty"><p>Falta una pista de audio destino vacía.</p>
        <button type="button" disabled={busy} onClick={onCreateDestination}>Crear pista destino</button></div>}
      {!!destinations.length && <p className={routedSourceCount ? "bus-resample__facts" : "bus-resample__warning"}>
        {routedSourceCount
          ? `${routedSourceCount} ${routedSourceCount === 1 ? "pista fuente" : "pistas fuente"} hacia este bus; ${routes.includedSendIds.length} ${routes.includedSendIds.length === 1 ? "envío incluido" : "envíos incluidos"}, también por sub-buses.`
          : "No hay pistas fuente que lleguen a este bus. Enruta una pista antes de renderizar."}</p>}
      <div className="bus-resample__actions">
        <button type="button" className="bus-resample__primary" disabled={busy || !valid || !routedSourceCount}
          onClick={() => onRender({ sourceBusTrackId: selectedBusId,
            destinationTrackId: selectedDestinationId, startTick: parsedStart,
            endTick: parsedEnd, sampleRate, tailSeconds: parsedTail })}>
          {busy ? "Renderizando…" : "Renderizar e instalar WAV"}</button>
        {busy && <button type="button" onClick={onCancel}>Cancelar</button>}
      </div>
      {progress && <p className="bus-resample__progress" role="status">
        {progress.phase === "assets" ? "Leyendo activos" : progress.phase === "preparing"
          ? "Preparando motor aislado" : progress.phase === "rendering" ? "Renderizando PCM" : "Completado"}
        {` · ${progress.completed}/${progress.total}`}</p>}
      {notice && <p className="bus-resample__notice" role="status">{notice}</p>}
    </>}
  </section>;
}
