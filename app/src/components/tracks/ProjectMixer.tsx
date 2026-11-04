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
  masterPreMeter?: { peak: number; rms: number; clipped: boolean; clipEvents?: number };
  masterMeter?: { peak: number; rms: number; clipped: boolean; clipEvents?: number };
  sidechainStatus?: Readonly<Record<string, {
    sourceTrackId: string | null;
    reductionDb: number;
    peakReductionDb: number;
    error: string | null;
  }>>;
  effectComparisonStatus?: Readonly<Record<string, {
    mode: "off" | "original" | "processed";
    originalDb: number;
    processedDb: number;
  }>>;
  onTrackEffectComparison?: (trackId: string, mode: "off" | "original" | "processed") => void;
}

function meterPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/** Never offer a send that would feed a source back into itself. */
function reachesTrack(document: ProjectDocumentV1, fromId: string, targetId: string): boolean {
  const tracks = new Map(document.tracks.map((track) => [track.id, track]));
  const pending = [fromId];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const mix = tracks.get(id)?.mix;
    if (!mix) continue;
    if (mix.outputBusTrackId) pending.push(mix.outputBusTrackId);
    for (const send of mix.sends) pending.push(send.busTrackId);
  }
  return false;
}

export function ProjectMixer({ document, onTrackMix, onMasterMix, onTrackEffects, onMasterEffects,
  onCreateBus, onRemoveBus,
  onUndo, onRedo, canUndo, canRedo, meter, masterPreMeter, masterMeter, sidechainStatus,
  effectComparisonStatus, onTrackEffectComparison }: ProjectMixerProps) {
  const [gainDrafts, setGainDrafts] = useState<Record<string, string>>({});
  const [panDrafts, setPanDrafts] = useState<Record<string, string>>({});
  const [masterDraft, setMasterDraft] = useState<string | null>(null);
  const [busName, setBusName] = useState("");
  const [removeBusId, setRemoveBusId] = useState<string | null>(null);
  const [sendDrafts, setSendDrafts] = useState<Record<string, string>>({});
  const [sendLevelDrafts, setSendLevelDrafts] = useState<Record<string, string>>({});
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
        const availableSendBuses = buses.filter((bus) =>
          bus.id !== mix.outputBusTrackId &&
          !mix.sends.some((send) => send.busTrackId === bus.id) &&
          !reachesTrack(document, bus.id, track.id));
        const sendDestination = availableSendBuses.some((bus) => bus.id === sendDrafts[track.id])
          ? sendDrafts[track.id]! : availableSendBuses[0]?.id ?? "";
        const keySources = document.tracks.filter((candidate) =>
          candidate.id !== track.id && candidate.kind !== "bus");
        const defaultKey = keySources.find((candidate) => candidate.kind === "drum") ?? keySources[0];
        const sidechain = mix.sidechain;
        const reportedSidechain = sidechainStatus?.[track.id];
        const sidechainAudio = sidechain && reportedSidechain?.sourceTrackId === sidechain.sourceTrackId
          ? reportedSidechain : undefined;
        const comparison = effectComparisonStatus?.[track.id] ?? {
          mode: "off" as const, originalDb: 0, processedDb: 0,
        };
        const hasActiveEffects = mix.effects.some((effect) => effect.enabled);
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
              {buses.filter((bus) => bus.id !== track.id &&
                !reachesTrack(document, bus.id, track.id)).map((bus) =>
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
          {onTrackEffectComparison && <section className="project-mixer__comparison"
            aria-label={`Comparación A/B de ${track.name}`}>
            <div><h4>A/B de efectos · nivel compensado</h4>
              <small>Temporal: no modifica ni guarda la cadena.</small></div>
            <div className="project-mixer__comparison-buttons">
              <button type="button" disabled={!hasActiveEffects}
                aria-pressed={comparison.mode === "original"}
                onClick={() => onTrackEffectComparison(track.id, "original")}>A · Original</button>
              <button type="button" disabled={!hasActiveEffects}
                aria-pressed={comparison.mode === "processed"}
                onClick={() => onTrackEffectComparison(track.id, "processed")}>B · Procesada</button>
              <button type="button" disabled={comparison.mode === "off"}
                onClick={() => onTrackEffectComparison(track.id, "off")}>Salir A/B</button>
            </div>
            {comparison.mode !== "off" && <p>Compensación segura:
              A {comparison.originalDb.toFixed(1)} dB · B {comparison.processedDb.toFixed(1)} dB.
              Nunca se amplifica para igualar.</p>}
          </section>}
          {track.kind !== "bus" && <section className="project-mixer__sidechain"
            aria-label={`Sidechain de ${track.name}`}>
            <div className="project-mixer__sidechain-head"><div>
              <h4>Sidechain Kick → 808/Bass</h4>
              <p>Detector de audio real · post-insert/post-pan · lookahead retrasa sólo el target · también se aplica al WAV.</p>
            </div><button type="button" aria-pressed={!!sidechain}
              disabled={!sidechain && !defaultKey} onClick={() => {
                if (sidechain) {
                  const { sidechain: _sidechain, ...withoutSidechain } = mix;
                  void _sidechain;
                  onTrackMix(track.id, withoutSidechain);
                } else if (defaultKey) {
                  onTrackMix(track.id, { ...mix, sidechain: {
                    sourceTrackId: defaultKey.id, thresholdDb: -24, ratio: 4,
                    attackMs: 5, releaseMs: 120, lookaheadMs: 5, maxReductionDb: 12,
                  } });
                }
              }}>{sidechain ? "Activo" : "Activar"}</button></div>
            {sidechain && <><label>Fuente kick / key<select aria-label={`Fuente sidechain de ${track.name}`}
              value={sidechain.sourceTrackId}
              onChange={(event) => onTrackMix(track.id, { ...mix, sidechain: {
                ...sidechain, sourceTrackId: event.target.value } })}>
              {keySources.map((candidate) => <option value={candidate.id} key={candidate.id}>
                {candidate.name}</option>)}
            </select></label>
            <div className="project-mixer__sidechain-grid">
              <label>Umbral (dB)<input aria-label={`Umbral sidechain de ${track.name}`}
                type="number" min="-60" max="0" step="0.5"
                value={sidechain.thresholdDb} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= -60 && value <= 0) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, thresholdDb: value } });
                }} /></label>
              <label>Ratio<input aria-label={`Ratio sidechain de ${track.name}`}
                type="number" min="1" max="20" step="0.1"
                value={sidechain.ratio} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 1 && value <= 20) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, ratio: value } });
                }} /></label>
              <label>Ataque (ms)<input aria-label={`Ataque sidechain de ${track.name}`}
                type="number" min="0.1" max="250" step="0.1"
                value={sidechain.attackMs} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 0.1 && value <= 250) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, attackMs: value } });
                }} /></label>
              <label>Release (ms)<input aria-label={`Release sidechain de ${track.name}`}
                type="number" min="1" max="2000" step="1"
                value={sidechain.releaseMs} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 1 && value <= 2000) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, releaseMs: value } });
                }} /></label>
              <label>Lookahead (ms)<input aria-label={`Lookahead sidechain de ${track.name}`}
                type="number" min="0" max="50" step="0.5"
                value={sidechain.lookaheadMs ?? 0} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 0 && value <= 50) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, lookaheadMs: value } });
                }} /></label>
              <label>Reducción máx. (dB)<input aria-label={`Reducción máxima sidechain de ${track.name}`}
                type="number" min="0" max="36" step="0.5"
                value={sidechain.maxReductionDb} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value >= 0 && value <= 36) onTrackMix(track.id,
                    { ...mix, sidechain: { ...sidechain, maxReductionDb: value } });
                }} /></label>
            </div>
            <div className="project-mixer__sidechain-meter">
              <div><span>Reducción actual</span>
                <strong>{(sidechainAudio?.reductionDb ?? 0).toFixed(1)} dB</strong></div>
              <meter min="0" max={Math.max(1, sidechain.maxReductionDb)}
                value={sidechainAudio?.reductionDb ?? 0} />
              {sidechainAudio && <small>Pico de sesión: {sidechainAudio.peakReductionDb.toFixed(1)} dB</small>}
              {sidechainAudio?.error && <strong role="alert">{sidechainAudio.error}</strong>}
              {!sidechainAudio && <small>Reproduce o vuelve a preparar el audio para activar el detector.</small>}
            </div></>}
          </section>}
          {onTrackEffects && <ProjectEffectsPanel label={track.name} effects={mix.effects}
            onChange={(effects) => onTrackEffects(track.id, effects)} />}
          {buses.length > 0 && <div className="project-mixer__sends" aria-label={`Envíos de ${track.name}`}>
            <h4>Envíos post-fader</h4>
            {mix.sends.map((send) => <div className="project-mixer__send" key={send.id}>
              <label>Bus destino
                <input type="text" readOnly value={buses.find((bus) => bus.id === send.busTrackId)?.name ?? send.busTrackId} />
              </label>
              <label>Nivel (dB)
                <input type="number" inputMode="decimal" min="-120" max="24" step="0.1"
                  value={sendLevelDrafts[send.id] ?? String(send.gainDb)}
                  onChange={(event) => setSendLevelDrafts((current) => ({ ...current, [send.id]: event.target.value }))}
                  onBlur={() => {
                    const draft = sendLevelDrafts[send.id];
                    if (draft === undefined) return;
                    setSendLevelDrafts((current) => {
                      const next = { ...current }; delete next[send.id]; return next;
                    });
                    const value = Number(draft);
                    if (draft.trim() && Number.isFinite(value) && value >= -120 && value <= 24 &&
                        value !== send.gainDb) {
                      onTrackMix(track.id, { ...mix, sends: mix.sends.map((item) =>
                        item.id === send.id ? { ...item, gainDb: value } : item) });
                    }
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              </label>
              <button type="button" onClick={() => onTrackMix(track.id,
                { ...mix, sends: mix.sends.filter((item) => item.id !== send.id) })}>
                Quitar envío
              </button>
            </div>)}
            <div className="project-mixer__send-add">
              <label>Nuevo destino
                <select aria-label={`Nuevo envío de ${track.name}`} value={sendDestination}
                  disabled={!sendDestination} onChange={(event) => setSendDrafts((current) =>
                    ({ ...current, [track.id]: event.target.value }))}>
                  {availableSendBuses.length === 0 && <option value="">Sin buses disponibles</option>}
                  {availableSendBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}
                </select>
              </label>
              <button type="button" disabled={!sendDestination} onClick={() =>
                onTrackMix(track.id, { ...mix, sends: [...mix.sends, {
                  id: `send-${crypto.randomUUID()}`, busTrackId: sendDestination, gainDb: -12,
                }] })}>
                Añadir envío (−12 dB)
              </button>
            </div>
          </div>}
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
        <div className="project-mixer__master-meters">
          <div className="project-mixer__meter" aria-label="Nivel master antes de efectos"><div>
            <span>Pre FX · RMS {masterPreMeter ? meterPercent(masterPreMeter.rms) : 0}%</span>
            <span>Pico {masterPreMeter ? meterPercent(masterPreMeter.peak) : 0}%</span></div>
            <meter min="0" max="1" value={masterPreMeter?.peak ?? 0} />
            {masterPreMeter?.clipped && <strong role="alert">
              Entrada master excede 0 dBFS antes del limitador
            </strong>}
          </div>
          <div className="project-mixer__meter" aria-label="Nivel master después de efectos"><div>
            <span>Post FX · RMS {masterMeter ? meterPercent(masterMeter.rms) : 0}%</span>
            <span>Pico {masterMeter ? meterPercent(masterMeter.peak) : 0}%</span></div>
            <meter min="0" max="1" value={masterMeter?.peak ?? 0} />
            {masterMeter?.clipped && <strong role="alert">Clipping después de efectos</strong>}
          </div>
        </div>
        {onMasterEffects && <ProjectEffectsPanel label="master" effects={document.mix.masterEffects}
          onChange={onMasterEffects} />}
      </section>
    </div>
  </section>;
}
