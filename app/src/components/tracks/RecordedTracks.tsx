import { useMemo, useState } from "react";
import type { RecordedTakeSummary } from "../../midi/recordingLibrary.ts";
import "./RecordedTracks.css";

export interface RecordedTracksProps {
  takes: readonly RecordedTakeSummary[];
  loading?: boolean;
  error?: string;
  onRename: (id: string, name: string) => void | Promise<void>;
  onExport: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onImportToProject?: (id: string) => void | Promise<void>;
}

function durationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function dateLabel(time: number): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción sobre la toma MIDI";
}

export function RecordedTracks({ takes, loading = false, error, onRename, onExport, onDelete,
  onImportToProject }: RecordedTracksProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest" | "name" | "longest">("newest");
  const visibleTakes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-CO");
    const filtered = takes.filter((take) => !normalized ||
      take.name.toLocaleLowerCase("es-CO").includes(normalized) ||
      take.tracks.some((track) => track.inputName.toLocaleLowerCase("es-CO").includes(normalized)));
    return filtered.sort((left, right) => order === "name"
      ? left.name.localeCompare(right.name, "es-CO") || left.id.localeCompare(right.id)
      : order === "longest" ? right.durationMs - left.durationMs || left.id.localeCompare(right.id)
        : order === "oldest" ? left.createdAt - right.createdAt || left.id.localeCompare(right.id)
          : right.createdAt - left.createdAt || left.id.localeCompare(right.id));
  }, [takes, query, order]);

  async function act(id: string, action: () => void | Promise<void>, after: () => void = () => {}) {
    setBusyId(id);
    setLocalError("");
    try {
      await action();
      after();
    } catch (cause) {
      setLocalError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="recorded-tracks" aria-labelledby="recorded-tracks-title">
      <header className="recorded-tracks__header">
        <h2 id="recorded-tracks-title">Pistas de tus grabaciones MIDI</h2>
        <p>Cada toma conserva sus eventos y sus pistas por puerto y canal. Graba una nueva toma desde Studio.</p>
      </header>
      {takes.length > 0 && <div className="recorded-tracks__filters">
        <label>Buscar tomas<input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o entrada MIDI" /></label>
        <label>Ordenar tomas<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
          <option value="newest">Más recientes</option><option value="oldest">Más antiguas</option>
          <option value="name">Nombre</option><option value="longest">Más largas</option>
        </select></label>
      </div>}
      {(error || localError) && <p className="recorded-tracks__error" role="alert">{localError || error}</p>}
      {loading ? <p className="recorded-tracks__empty">Cargando tomas…</p> : takes.length === 0 ? (
        <p className="recorded-tracks__empty">Aún no hay tomas guardadas. Inicia una grabación MIDI en Studio.</p>
      ) : visibleTakes.length === 0 ? <p className="recorded-tracks__empty">Ninguna toma coincide con la búsqueda.</p> : (
        <div className="recorded-tracks__list">
          {visibleTakes.map((take) => (
            <article className="recorded-tracks__take" key={take.id}>
              <div className="recorded-tracks__take-head">
                <div className="recorded-tracks__identity">
                  {editingId === take.id ? (
                    <form className="recorded-tracks__rename" onSubmit={(event) => {
                      event.preventDefault();
                      void act(take.id, () => onRename(take.id, draftName), () => setEditingId(null));
                    }}>
                      <input
                        aria-label="Nombre de la toma"
                        value={draftName}
                        maxLength={100}
                        onChange={(event) => setDraftName(event.target.value)}
                        disabled={busyId === take.id}
                        autoFocus
                      />
                      <button type="submit" disabled={busyId === take.id || !draftName.trim()}>Guardar</button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={busyId === take.id}>Cancelar</button>
                    </form>
                  ) : (
                    <h3>{take.name}</h3>
                  )}
                  <p>{dateLabel(take.createdAt)} · {durationLabel(take.durationMs)} · {Math.round(take.tempoBpm)} BPM</p>
                  <p>{take.eventCount} eventos · {take.tracks.length} {take.tracks.length === 1 ? "pista" : "pistas"}</p>
                </div>
                <div className="recorded-tracks__actions">
                  <button type="button" onClick={() => { setEditingId(take.id); setDraftName(take.name); setDeletingId(null); }} disabled={busyId !== null}>Renombrar</button>
                  <button type="button" onClick={() => { void act(take.id, () => onExport(take.id)); }} disabled={busyId !== null}>Exportar .mid</button>
                  {onImportToProject && <button type="button" onClick={() => {
                    void act(take.id, () => onImportToProject(take.id));
                  }} disabled={busyId !== null}>Añadir al proyecto</button>}
                  {deletingId === take.id ? (
                    <>
                      <button type="button" className="recorded-tracks__danger" onClick={() => {
                        void act(take.id, () => onDelete(take.id), () => setDeletingId(null));
                      }} disabled={busyId !== null}>Confirmar borrado</button>
                      <button type="button" onClick={() => setDeletingId(null)} disabled={busyId !== null}>Cancelar</button>
                    </>
                  ) : (
                    <button type="button" className="recorded-tracks__danger" onClick={() => { setDeletingId(take.id); setEditingId(null); }} disabled={busyId !== null}>Borrar</button>
                  )}
                </div>
              </div>
              <div className="recorded-tracks__tracks">
                {take.tracks.map((track) => (
                  <details className="recorded-tracks__track" key={`${track.inputId}\0${track.channel}`}>
                    <summary>
                      <span>{track.inputName} · Canal {track.channel + 1}</span>
                      <small>{track.noteCount} notas · {track.eventCount} eventos</small>
                    </summary>
                    <p>Canal de origen: {track.sourceChannels.map((channel) => channel + 1).join(", ")}</p>
                    {track.notes.length > 0 ? (
                      <ul className="recorded-tracks__notes" aria-label="Notas de la pista">
                        {track.notes.map(({ note, count }) => <li key={note}>Nota MIDI {note}: {count}</li>)}
                      </ul>
                    ) : <p>Esta pista contiene controles MIDI sin notas.</p>}
                  </details>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
