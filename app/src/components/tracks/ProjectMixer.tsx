import { useState } from "react";
import type { ProjectDocumentV1, ProjectEffect, ProjectMixChannel, ProjectMixState } from "../../project/model";
import { ProjectEffectsPanel } from "./ProjectEffectsPanel";
import "./ProjectMixer.css";

export interface ProjectMixerProps {
  document: ProjectDocumentV1;
  onTrackMix: (trackId: string, mix: ProjectMixChannel) => void;
  onMasterMix: (mix: ProjectMixState) => void;
  onTrackEffects?: (trackId: string, effects: readonly ProjectEffect[]) => void;
  onMasterEffects?: (effects: readonly ProjectEffect[]) => void;
  onCreateBus?: (name: string) => void;
  onRemoveBus?: (trackId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  meter?: Readonly<Record<string, { peak: number; rms: number; clipped: boolean }>>;
  masterMeter?: { peak: number; rms: number; clipped: boolean };
}

function meterPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function ProjectMixer({ document, onTrackMix, onMasterMix, onTrackEffects, onMasterEffects,
  onCreateBus, onRemoveBus,
  onUndo, onRedo, canUndo, canRedo, meter, masterMeter }: ProjectMixerProps) {
  const [gainDrafts, setGainDrafts] = useState<Record<string, string>>({});
  const [panDrafts, setPanDrafts] = useState<Record<string, string>>({});
  const [masterDraft, setMasterDraft] = useState<string | null>(null);
  const [busName, setBusName] = useState("");
  const [removeBusId, setRemoveBusId] = useState<string | null>(null);
  const buses = document.tracks.filter((track) => track.kind === "bus");

  function commitGain(trackId: string, mix: ProjectMixChannel) {
    const draft = gainDrafts[trackId];
    if (draft === undefined) return;
    setGainDrafts((current) => { const next = { ...current }; delete next[trackId]; return next; });
    const value = Number(draft);
    if (Number.isFinite(value) && value >= -120 && value <= 24 && value !== mix.gainDb) {
      onTrackMix(trackId, { ...mix, gainDb: value });
    }
  }

  function commitPan(trackId: string, mix: ProjectMixChannel) {
    const draft = panDrafts[trackId];
    if (draft === undefined) return;
    setPanDrafts((current) => { const next = { ...current }; delete next[trackId]; return next; });
    const value = Number(draft);
    if (Number.isFinite(value) && value >= -1 && value <= 1 && value !== mix.pan) {
      onTrackMix(trackId, { ...mix, pan: value });
    }
  }

  function commitMaster() {
    if (masterDraft === null) return;
    const value = Number(masterDraft);
    setMasterDraft(null);
    if (Number.isFinite(value) && value >= -120 && value <= 24 && value !== document.mix.masterGainDb) {
      onMasterMix({ ...document.mix, masterGainDb: value });
    }
  }

  return <section className="project-mixer" aria-label="Mezclador del proyecto">
    <header><h2>Mezclador</h2><p>Niveles y rutas guardados con el proyecto. Los medidores muestran la salida actual.</p>
      {(onUndo || onRedo) && <div className="project-mixer__history">
        {onUndo && <button type="button" disabled={!canUndo} onClick={onUndo}>Deshacer</button>}
        {onRedo && <button type="button" disabled={!canRedo} onClick={onRedo}>Rehacer</button>}
      </div>}
    </header>
    {onCreateBus && <form className="project-mixer__bus-form" onSubmit={(event) => {
      event.preventDefault();
      if (!busName.trim()) return;
      onCreateBus(busName.trim());
      setBusName("");
    }}><label>Nombre del bus<input type="text" maxLength={80} value={busName}
      onChange={(event) => setBusName(event.target.value)} placeholder="Reverb, batería…" /></label>
      <button type="submit" disabled={!busName.trim()}>Crear bus</button></form>}
    <div className="project-mixer__tracks">
      {document.tracks.map((track) => {
        const mix = track.mix;
        const level = meter?.[track.id];
        return <section key={track.id} className="project-mixer__channel" aria-label={`Canal ${track.name}`}>
          <div className="project-mixer__channel-head"><h3>{track.name}</h3><span>{track.kind}</span></div>
          <div className="project-mixer__controls">
            <label>Ganancia (dB)<input type="number" inputMode="decimal" min="-120" max="24" step="0.1"
              value={gainDrafts[track.id] ?? String(mix.gainDb)}
              onChange={(event) => setGainDrafts((current) => ({ ...current, [track.id]: event.target.value }))}
              onBlur={() => commitGain(track.id, mix)} onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }} /></label>
            <label>Pan (−1 a 1)<input type="number" inputMode="decimal" min="-1" max="1" step="0.01"
              value={panDrafts[track.id] ?? String(mix.pan)}
              onChange={(event) => setPanDrafts((current) => ({ ...current, [track.id]: event.target.value }))}
              onBlur={() => commitPan(track.id, mix)} onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }} /></label>
            <label>Salida<select value={mix.outputBusTrackId ?? "master"} onChange={(event) => {
              const { outputBusTrackId: _previous, ...withoutRoute } = mix;
              void _previous;
              onTrackMix(track.id, event.target.value === "master" ? withoutRoute
                : { ...withoutRoute, outputBusTrackId: event.target.value });
            }}><option value="master">Master</option>
              {buses.filter((bus) => bus.id !== track.id).map((bus) =>
                <option value={bus.id} key={bus.id}>{bus.name}</option>)}</select></label>
          </div>
          <div className="project-mixer__toggles">
            <button type="button" aria-pressed={mix.mute} onClick={() => onTrackMix(track.id,
              { ...mix, mute: !mix.mute })}>Mute</button>
            <button type="button" aria-pressed={mix.solo} onClick={() => onTrackMix(track.id,
              { ...mix, solo: !mix.solo })}>Solo</button>
            {track.kind !== "bus" && <button type="button" aria-pressed={mix.armed}
              onClick={() => onTrackMix(track.id, { ...mix, armed: !mix.armed })}>Arm</button>}
          </div>
          <div className="project-mixer__meter" aria-label={`Nivel de ${track.name}`}>
            <div><span>RMS {level ? meterPercent(level.rms) : 0}%</span><span>Pico {level ? meterPercent(level.peak) : 0}%</span></div>
            <meter min="0" max="1" value={level?.peak ?? 0} />
            {level?.clipped && <strong role="alert">Clipping</strong>}
          </div>
          {onTrackEffects && <ProjectEffectsPanel label={track.name} effects={mix.effects}
            onChange={(effects) => onTrackEffects(track.id, effects)} />}
          {mix.sends.length > 0 && <p className="project-mixer__unsupported">
            {mix.sends.length} envíos aún no tienen motor de audio ni exportación.</p>}
          {track.kind === "bus" && onRemoveBus && (removeBusId === track.id ?
            <div className="project-mixer__remove"><button type="button" onClick={() => {
              onRemoveBus(track.id); setRemoveBusId(null);
            }}>Confirmar eliminación del bus</button>
              <button type="button" onClick={() => setRemoveBusId(null)}>Cancelar</button></div>
            : <button type="button" onClick={() => setRemoveBusId(track.id)}>Eliminar bus</button>)}
        </section>;
      })}
      <section className="project-mixer__channel project-mixer__master" aria-label="Canal master">
        <h3>Master</h3>
        <label>Ganancia master (dB)<input type="number" inputMode="decimal" min="-120" max="24" step="0.1"
          value={masterDraft ?? String(document.mix.masterGainDb)}
          onChange={(event) => setMasterDraft(event.target.value)} onBlur={commitMaster}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
        <div className="project-mixer__meter" aria-label="Nivel master"><div>
          <span>RMS {masterMeter ? meterPercent(masterMeter.rms) : 0}%</span>
          <span>Pico {masterMeter ? meterPercent(masterMeter.peak) : 0}%</span></div>
          <meter min="0" max="1" value={masterMeter?.peak ?? 0} />
          {masterMeter?.clipped && <strong role="alert">Clipping</strong>}
        </div>
        {onMasterEffects && <ProjectEffectsPanel label="master" effects={document.mix.masterEffects}
          onChange={onMasterEffects} />}
      </section>
    </div>
  </section>;
}
