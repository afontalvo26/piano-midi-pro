import { useState } from "react";
import type { AudioInputSnapshot } from "../../audio/audioInputSession";
import "./AudioRecorderPanel.css";

export interface AudioCaptureSettings {
  countInBars: 0 | 1 | 2 | 3 | 4;
  punchBars: number | null;
}

export interface AudioRecorderPanelProps {
  snapshot: AudioInputSnapshot | null;
  busy: boolean;
  notice: string;
  onArm: (channels: 1 | 2) => void;
  onStart: (settings: AudioCaptureSettings) => void;
  onStop: () => void;
  onDisarm: () => void;
  onMonitor: (enabled: boolean, acknowledged: boolean) => void;
}

export function AudioRecorderPanel({ snapshot, busy, notice, onArm, onStart, onStop,
  onDisarm, onMonitor }: AudioRecorderPanelProps) {
  const [channels, setChannels] = useState<1 | 2>(1);
  const [countInBars, setCountInBars] = useState<AudioCaptureSettings["countInBars"]>(0);
  const [punchEnabled, setPunchEnabled] = useState(false);
  const [punchBars, setPunchBars] = useState(1);
  const [feedbackAcknowledged, setFeedbackAcknowledged] = useState(false);
  const state = snapshot?.state ?? "idle";
  const armed = state === "armed";
  const recording = state === "recording" || state === "starting" || state === "stopping";
  const usable = armed || recording;
  const peak = Math.max(0, Math.min(1, snapshot?.peak ?? 0));
  const rms = Math.max(0, Math.min(1, snapshot?.rms ?? 0));
  return <section className="audio-recorder" aria-label="Grabación de audio del proyecto">
    <div><h2>Grabar audio</h2><p>Captura tu voz o instrumento externo en WAV. El monitor comienza apagado y la toma original se conserva.</p></div>
    <div className="audio-recorder__controls">
      <label>Canales de entrada<select value={channels} disabled={usable || busy}
        onChange={(event) => setChannels(Number(event.target.value) === 2 ? 2 : 1)}>
        <option value="1">Mono</option><option value="2">Estéreo</option>
      </select></label>
      {!usable && <button type="button" disabled={busy || state === "requesting"}
        onClick={() => onArm(channels)}>{state === "requesting" ? "Solicitando entrada…" : "Armar entrada"}</button>}
      {armed && <>
        <label>Cuenta de entrada<select value={countInBars} disabled={busy}
          onChange={(event) => setCountInBars(Number(event.target.value) as AudioCaptureSettings["countInBars"])}>
          {[0, 1, 2, 3, 4].map((bars) => <option key={bars} value={bars}>
            {bars === 0 ? "Sin cuenta" : `${bars} ${bars === 1 ? "compás" : "compases"}`}
          </option>)}
        </select></label>
        <label className="audio-recorder__check"><input type="checkbox" checked={punchEnabled}
          disabled={busy} onChange={(event) => setPunchEnabled(event.target.checked)} /> Salida automática</label>
        {punchEnabled && <label>Duración de punch (compases)<input type="number" min="1" max="8" step="1"
          value={punchBars} disabled={busy} onChange={(event) => setPunchBars(Number(event.target.value))} /></label>}
        <button type="button" className="audio-recorder__record" disabled={busy ||
          (punchEnabled && (!Number.isInteger(punchBars) || punchBars < 1 || punchBars > 8))}
          onClick={() => onStart({ countInBars, punchBars: punchEnabled ? punchBars : null })}>Iniciar toma</button>
      </>}
      {recording && <button type="button" className="audio-recorder__record" disabled={busy}
        onClick={onStop}>{state === "starting" ? "Cancelar cuenta" : "Detener y guardar"}</button>}
      {usable && !recording && <button type="button" disabled={busy} onClick={onDisarm}>Desarmar</button>}
    </div>
    <div className="audio-recorder__status" role="status">
      <span>Estado: {state}</span><span>Permiso: {snapshot?.permission ?? "sin solicitar"}</span>
      <span>Entrada: {snapshot?.deviceLabel || "sin dispositivo"}</span>
      {recording && <span>Frames: {snapshot?.recordedFrames ?? 0}</span>}
      {state === "stopping" && <span>Salida programada; puedes detener antes.</span>}
    </div>
    {usable && <div className="audio-recorder__monitor">
      <label><input type="checkbox" checked={feedbackAcknowledged}
        onChange={(event) => {
          const checked = event.target.checked;
          setFeedbackAcknowledged(checked);
          if (!checked && snapshot?.monitorEnabled) onMonitor(false, false);
        }} /> Entiendo que altavoces y micrófono pueden producir realimentación.</label>
      <button type="button" disabled={busy || !feedbackAcknowledged}
        aria-pressed={snapshot?.monitorEnabled ?? false}
        onClick={() => onMonitor(!snapshot?.monitorEnabled, feedbackAcknowledged)}>
        {snapshot?.monitorEnabled ? "Apagar monitor" : "Activar monitor"}
      </button>
    </div>}
    <div className="audio-recorder__meter" aria-label="Nivel de entrada">
      <span>RMS {Math.round(rms * 100)}%</span><meter min="0" max="1" value={peak} />
      <span>Pico {Math.round(peak * 100)}%</span>
      {(snapshot?.clippedSamples ?? 0) > 0 && <strong role="alert">Clipping: {snapshot?.clippedSamples} muestras</strong>}
    </div>
    {(notice || snapshot?.error) && <p className="audio-recorder__notice" role="status">{snapshot?.error || notice}</p>}
  </section>;
}
