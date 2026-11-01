import { useMemo, useState } from "react";
import type { ProjectListItem } from "../../project/repository";
import type { ProjectDraftSummary } from "../../project/drafts";
import type { ProjectBundlePreview } from "../../project/bundle";
import "./ProjectBrowser.css";

export interface ProjectBrowserProps {
  projects: readonly ProjectListItem[];
  loading: boolean;
  error?: string;
  activeProjectId?: string | null;
  onCreate: (name: string) => void | Promise<void>;
  onOpen: (id: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDuplicate: (id: string) => void | Promise<void>;
  onSetArchived: (id: string, archived: boolean) => void | Promise<void>;
  onExport?: (id: string) => void | Promise<void>;
  onPreview: (file: File) => Promise<ProjectBundlePreview>;
  onImport?: (file: File) => void | Promise<void>;
  onListDrafts?: (projectId: string) => Promise<readonly ProjectDraftSummary[]>;
  onRecoverDraft?: (projectId: string, sessionId: string) => void | Promise<void>;
  onDiscardDraft?: (projectId: string, sessionId: string) => void | Promise<void>;
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || Math.abs(timestamp) > 8.64e15) return "fecha desconocida";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function ProjectBrowser({ projects, loading, error, activeProjectId, onCreate, onOpen,
  onRename, onDuplicate, onSetArchived, onExport, onPreview, onImport,
  onListDrafts, onRecoverDraft, onDiscardDraft }: ProjectBrowserProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"updated" | "oldest" | "name">("updated");
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<readonly ProjectDraftSummary[]>([]);
  const [draftDiscardId, setDraftDiscardId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ProjectBundlePreview | null>(null);
  const archivedCount = useMemo(() => projects.filter((project) => project.archived).length, [projects]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-CO");
    return projects.filter((project) => (!project.archived || showArchived) &&
      (!normalized || project.name.toLocaleLowerCase("es-CO").includes(normalized)))
      .sort((left, right) => order === "name"
        ? left.name.localeCompare(right.name, "es-CO") || left.id.localeCompare(right.id)
        : order === "oldest" ? left.updatedAt - right.updatedAt || left.id.localeCompare(right.id)
          : right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
  }, [projects, showArchived, query, order]);

  async function act(action: () => void | Promise<void>, after?: () => void) {
    setBusy(true);
    setLocalError("");
    try {
      await action();
      after?.();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "No se pudo completar la acción sobre el proyecto");
    } finally {
      setBusy(false);
    }
  }

  async function showDrafts(projectId: string) {
    if (!onListDrafts) return;
    if (draftProjectId === projectId) { setDraftProjectId(null); return; }
    await act(async () => {
      const found = await onListDrafts(projectId);
      setDrafts(found);
      setDraftProjectId(projectId);
      setDraftDiscardId(null);
    });
  }

  async function discardDraft(projectId: string, sessionId: string) {
    if (!onDiscardDraft || !onListDrafts) return;
    await act(async () => {
      await onDiscardDraft(projectId, sessionId);
      setDrafts(await onListDrafts(projectId));
      setDraftDiscardId(null);
    });
  }

  return (
    <section className="project-browser" aria-labelledby="project-browser-title">
      <div className="project-browser__heading">
        <div><p className="project-browser__eyebrow">Proyectos propios</p><h2 id="project-browser-title">Tus proyectos</h2>
          <p>Beats editables guardados en este navegador.</p></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          void act(() => onCreate(name.trim() || "Proyecto sin título"), () => setName(""));
        }}>
          <label htmlFor="project-browser-name">Nombre del proyecto</label>
          <div><input id="project-browser-name" type="text" value={name} maxLength={100} autoComplete="off"
            placeholder="Mi beat" onChange={(event) => setName(event.target.value)} disabled={busy} />
            <button type="submit" disabled={busy}>Crear proyecto</button></div>
        </form>
      </div>
      {onImport && <label className="project-browser__import">Restaurar respaldo del proyecto
        <input aria-label="Restaurar respaldo del proyecto" type="file" accept=".pmp,.json,application/vnd.piano-midi-pro.project,application/vnd.piano-midi-pro.project+json"
          disabled={busy} onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file) void act(async () => {
              setImportFile(null);
              setImportPreview(null);
              try {
                const preview = await onPreview(file);
                setImportFile(file);
                setImportPreview(preview);
              }
              finally { input.value = ""; }
            });
          }} />
      </label>}
      {onImport && importFile && importPreview && <section className="project-browser__preview"
        aria-label="Previsualización del respaldo">
        <h3>Respaldo verificado</h3>
        <p><strong>{importPreview.name}</strong> · formato v{importPreview.formatVersion} · revisión {importPreview.sourceRevision}</p>
        <p>{importPreview.tracks} pistas · {importPreview.patterns} patrones · {importPreview.clips} clips · {importPreview.takes} tomas</p>
        <p>{importPreview.assets.length} activos propios verificados · {importPreview.officialPacks.length} bancos oficiales · {(importPreview.byteLength / 1024 / 1024).toFixed(2)} MiB</p>
        {importPreview.officialPacks.length > 0 && <ul>{importPreview.officialPacks.map((pack) =>
          <li key={`${pack.instrumentId}:${pack.packageVersion}:${pack.presetId}`}>
            {pack.instrumentId} v{pack.packageVersion} · {pack.creator} · {pack.license}
          </li>)}</ul>}
        {importPreview.requiresInstalledOfficialPacks && <p>Estos bancos deben estar instalados en esta versión de Studio para restaurar y reproducir el proyecto.</p>}
        <p>Se creará una copia nueva; el proyecto original y los existentes seguirán guardados.</p>
        <div className="project-browser__preview-actions">
          <button type="button" disabled={busy} onClick={() => { void act(() => onImport(importFile), () => {
            setImportFile(null); setImportPreview(null);
          }); }}>Restaurar como copia</button>
          <button type="button" disabled={busy} onClick={() => {
            setImportFile(null); setImportPreview(null);
          }}>Cancelar restauración</button>
        </div>
      </section>}
      {(error || localError) && <p role="alert" className="project-browser__error">{localError || error}</p>}
      {projects.length > 0 && <div className="project-browser__filters">
        <label>Buscar proyectos<input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre del proyecto" /></label>
        <label>Ordenar proyectos<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
          <option value="updated">Actualizados recientemente</option><option value="oldest">Menos recientes</option>
          <option value="name">Nombre</option>
        </select></label>
      </div>}
      {archivedCount > 0 && <button type="button" className="project-browser__archived-toggle"
        aria-pressed={showArchived} onClick={() => setShowArchived((current) => !current)}>
        {showArchived ? "Ocultar archivados" : `Mostrar archivados (${archivedCount})`}</button>}
      {loading ? <p className="project-browser__empty">Cargando proyectos…</p> : visible.length === 0 ? (
        <p className="project-browser__empty">{projects.length === 0 ?
          "Aún no hay proyectos. Crea uno para editar tu primer patrón." : "Ningún proyecto coincide con la búsqueda."}</p>
      ) : <div className="project-browser__list">
        {visible.map((project) => <article className="project-browser__item" key={project.id}>
          <div className="project-browser__identity">
            {editingId === project.id ? <form className="project-browser__rename" onSubmit={(event) => {
              event.preventDefault();
              void act(() => onRename(project.id, draftName.trim()), () => setEditingId(null));
            }}>
              <label>Nuevo nombre<input type="text" value={draftName} maxLength={100} autoFocus
                onChange={(event) => setDraftName(event.target.value)} disabled={busy} /></label>
              <button type="submit" disabled={busy || !draftName.trim()}>Guardar nombre</button>
              <button type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancelar</button>
            </form> : <h3>{project.name}</h3>}
            <p>Actualizado {formatDate(project.updatedAt)} · revisión {project.revision}{project.archived ? " · archivado" : ""}</p>
            {project.readOnly && <p className="project-browser__readonly">Versión futura: sólo lectura</p>}</div>
          <div className="project-browser__actions">
            {!project.archived && <button type="button" onClick={() => { void act(() => onOpen(project.id)); }} disabled={busy || project.readOnly}>
              {project.readOnly ? "Requiere versión compatible" : activeProjectId === project.id ? "Volver al proyecto" : "Abrir en Studio"}</button>}
            {!project.readOnly && <button type="button" onClick={() => { setEditingId(project.id); setDraftName(project.name); setArchiveId(null); }} disabled={busy}>Renombrar</button>}
            {!project.readOnly && !project.archived && <button type="button" onClick={() => { void act(() => onDuplicate(project.id)); }} disabled={busy}>Duplicar</button>}
            {onExport && <button type="button" onClick={() => { void act(() => onExport(project.id)); }} disabled={busy}>Exportar proyecto</button>}
            {onListDrafts && <button type="button" aria-expanded={draftProjectId === project.id}
              onClick={() => { void showDrafts(project.id); }} disabled={busy}>Borradores</button>}
            {!project.readOnly && (project.archived ? <button type="button" onClick={() => {
              void act(() => onSetArchived(project.id, false));
            }} disabled={busy}>Restaurar</button> : archiveId === project.id ? <>
              <button type="button" className="project-browser__danger" onClick={() => {
                void act(() => onSetArchived(project.id, true), () => setArchiveId(null));
              }} disabled={busy}>Confirmar archivo</button>
              <button type="button" onClick={() => setArchiveId(null)} disabled={busy}>Cancelar</button>
            </> : <button type="button" className="project-browser__danger" onClick={() => {
              setArchiveId(project.id); setEditingId(null);
            }} disabled={busy}>Archivar</button>)}
          </div>
          {draftProjectId === project.id && <div className="project-browser__drafts" aria-label={`Borradores de ${project.name}`}>
            <h4>Recuperación de cambios</h4>
            {drafts.length === 0 ? <p>No hay borradores pendientes.</p> : drafts.map((draft) =>
              <div className="project-browser__draft" key={draft.sessionId}>
                <p>{formatDate(draft.writtenAt)} · revisión base {draft.baseRevision} · {draft.status === "verified"
                  ? "hash verificado" : draft.status === "future-version" ? "versión futura" : "borrador dañado"}</p>
                {draft.status === "verified" && onRecoverDraft && <button type="button" disabled={busy}
                  onClick={() => { void act(() => onRecoverDraft(project.id, draft.sessionId)); }}>Recuperar como copia</button>}
                {onDiscardDraft && (draftDiscardId === draft.sessionId ? <>
                  <button type="button" className="project-browser__danger" disabled={busy}
                    onClick={() => { void discardDraft(project.id, draft.sessionId); }}>Confirmar descarte</button>
                  <button type="button" disabled={busy} onClick={() => setDraftDiscardId(null)}>Cancelar</button>
                </> : <button type="button" className="project-browser__danger" disabled={busy}
                  onClick={() => setDraftDiscardId(draft.sessionId)}>Descartar borrador</button>)}
              </div>)}
          </div>}
        </article>)}
      </div>}
    </section>
  );
}
