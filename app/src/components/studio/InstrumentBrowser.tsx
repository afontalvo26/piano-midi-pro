import { useMemo, useState } from "react";
import {
  DEFAULT_INSTRUMENT_ID,
  INSTRUMENTS,
  getInstrument,
  type InstrumentDefinition,
  type InstrumentEngineId,
} from "../../instruments/catalog";
import "./InstrumentBrowser.css";

export interface InstrumentBrowserProps {
  activeId: string;
  initialOpen?: boolean;
  loadingId: string | null;
  loadingProgress: { loaded: number; total: number; decodedPcmBytes: number } | null;
  onCancel: () => void;
  failedId: string | null;
  error: string;
  notice: string;
  onSelect: (id: string) => void;
}

const ENGINE_LABELS: Record<InstrumentEngineId, string> = {
  salamander: "Salamander",
  webaudiofont: "WebAudioFont",
};

function engineLabel(id: InstrumentEngineId): string {
  return ENGINE_LABELS[id] ?? id;
}

function sourceLabel(instrument: InstrumentDefinition): string {
  if (instrument.source.kind === "salamander" && instrument.source.voicing === "layered") {
    return "4 capas grabadas · carga al seleccionar";
  }
  return instrument.requiresNetwork ? "Necesita internet" : "Núcleo local";
}

export function InstrumentBrowser({
  activeId, initialOpen = false, loadingId, loadingProgress, onCancel, failedId, error, notice, onSelect,
}: InstrumentBrowserProps) {
  const [open, setOpen] = useState(initialOpen);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [engineFilter, setEngineFilter] = useState<InstrumentEngineId | "all">("all");
  const active = getInstrument(activeId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
  const loading = loadingId ? getInstrument(loadingId) : undefined;
  const categories = useMemo(() => [...new Set(INSTRUMENTS.map((item) => item.category))], []);
  const engines = useMemo(() => [...new Set(INSTRUMENTS.map((item) => item.engineId))], []);
  const filtered = useMemo(() => INSTRUMENTS.filter((item) =>
    (categoryFilter === "all" || item.category === categoryFilter) &&
    (engineFilter === "all" || item.engineId === engineFilter)), [categoryFilter, engineFilter]);

  return <div className="instrument-browser">
    <div className="instrument-browser__current">
      <div className="instrument-browser__current-copy">
        <span className="instrument-browser__eyebrow">Sonido activo</span>
        <strong>{active.label}</strong>
        <span>{active.category} · Motor {engineLabel(active.engineId)} · {sourceLabel(active)}</span>
      </div>
      <button type="button" className="instrument-browser__toggle" aria-expanded={open}
        aria-controls="instrument-browser-list" onClick={() => setOpen((value) => !value)}>
        {open ? "Cerrar instrumentos" : "Cambiar instrumento"}
      </button>
    </div>
    <div className="instrument-browser__attribution">
      <span>{active.sourceCredit}</span>
      <a href={active.licenseUrl} target="_blank" rel="noreferrer">Fuente y licencia</a>
    </div>
    {loading && <div className="instrument-browser__loading" role="status" aria-live="polite">
      <span>Cargando {loading.label}
        {loadingProgress ? ` · ${loadingProgress.loaded}/${loadingProgress.total} muestras` : "…"}.
        Sigue sonando {active.label}.</span>
      <button type="button" onClick={onCancel}>Cancelar carga</button>
    </div>}
    {error && <div className="instrument-browser__error" role="alert">
      <span>{error}</span>
      {failedId && <button type="button" onClick={() => onSelect(failedId)}>Reintentar</button>}
    </div>}
    {notice && !loading && !error && <p className="instrument-browser__notice" role="status" aria-live="polite">{notice}</p>}
    {open && <div id="instrument-browser-list" className="instrument-browser__catalog">
      <div className="instrument-browser__filters">
        <label>Familia de instrumentos
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">Todas las familias</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>Motor de sonido
          <select value={engineFilter} onChange={(event) => setEngineFilter(event.target.value as InstrumentEngineId | "all")}>
            <option value="all">Todos los motores</option>
            {engines.map((engineId) => <option key={engineId} value={engineId}>{engineLabel(engineId)}</option>)}
          </select>
        </label>
      </div>
      <p className="instrument-browser__count">{filtered.length} instrumento{filtered.length === 1 ? "" : "s"} disponible{filtered.length === 1 ? "" : "s"}; las muestras se cargan al elegir uno.</p>
      {filtered.length === 0 && <p className="instrument-browser__empty">No hay instrumentos para esta combinación.</p>}
      {categories.filter((category) => filtered.some((item) => item.category === category)).map((category) =>
        <section className="instrument-browser__category" key={category} aria-label={category}>
          <h3>{category}</h3>
          {engines.filter((engineId) => filtered.some((item) => item.category === category && item.engineId === engineId)).map((engineId) =>
            <div className="instrument-browser__engine" key={engineId}>
              <h4>Motor {engineLabel(engineId)}</h4>
              <ul className="instrument-browser__presets">
                {filtered.filter((item) => item.category === category && item.engineId === engineId).map((item) =>
                  <li key={item.id} className={activeId === item.id ? "is-active" : ""}>
                    <button type="button" aria-pressed={activeId === item.id}
                      onClick={(event) => { if (event.detail > 0) event.currentTarget.blur(); onSelect(item.id); }}>
                      <strong>{item.label}</strong>
                      <span>{sourceLabel(item)} · {item.sourceCredit}</span>
                      {loadingId === item.id && <small>Cargando…</small>}
                      {activeId === item.id && <small>Activo</small>}
                    </button>
                    <a href={item.licenseUrl} target="_blank" rel="noreferrer" aria-label={`Fuente y licencia de ${item.label}`}>Fuente</a>
                  </li>)}
              </ul>
            </div>)}
        </section>)}
    </div>}
    <p className="instrument-browser__pads">Pads: percusión muestreada independiente (FreePats, VSCO y WebAudioFont según la pieza y la red).</p>
  </div>;
}
