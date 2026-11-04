import { useState } from "react";
import type { ProjectWavOptions, ProjectWavProgress } from "../../export/projectWav";
import "./ProjectExportPanel.css";

export interface ProjectExportPanelProps {
  busy: boolean;
  progress: ProjectWavProgress | null;
  notice: string;
  onExport: (options: ProjectWavOptions) => void;
  onCancel: () => void;
}

export function ProjectExportPanel({ busy, progress, notice, onExport,
  onCancel }: ProjectExportPanelProps) {
  const [sampleRate, setSampleRate] = useState<44_100 | 48_000>(48_000);
  const [format, setFormat] = useState<ProjectWavOptions["format"]>("pcm24");
  const [stems, setStems] = useState<ProjectWavOptions["stems"]>("none");
  const [tailSeconds, setTailSeconds] = useState(2);
  const [normalize, setNormalize] = useState(false);
  const [dither, setDither] = useState(true);
  return <section className="project-export" aria-label="Exportar audio del proyecto">
    <div className="project-export__intro"><h2>Exportar audio</h2>
      <p>Renderiza el arreglo guardado en WAV estéreo. Master y stems comparten la misma línea de tiempo; sólo el master atraviesa la cadena master/limitador.</p></div>
    <div className="project-export__fields">
      <label>Frecuencia
        <select aria-label="Frecuencia WAV" disabled={busy} value={sampleRate}
          onChange={(event) => setSampleRate(Number(event.target.value) as 44_100 | 48_000)}>
          <option value={44100}>44,1 kHz</option><option value={48000}>48 kHz</option>
        </select></label>
      <label>Profundidad
        <select aria-label="Profundidad WAV" disabled={busy} value={format}
          onChange={(event) => setFormat(event.target.value as ProjectWavOptions["format"])}>
          <option value="pcm16">PCM 16 bits</option><option value="pcm24">PCM 24 bits</option>
        </select></label>
      <label>Entrega
        <select aria-label="Stems WAV" disabled={busy} value={stems}
          onChange={(event) => { setStems(event.target.value as ProjectWavOptions["stems"]);
            setNormalize(false); }}>
          <option value="none">Master</option><option value="tracks">Master y pistas</option>
          <option value="buses">Master y buses</option>
        </select></label>
      <label>Cola (segundos)
        <input aria-label="Cola WAV en segundos" type="number" inputMode="decimal"
          disabled={busy} min="0" max="5" step="0.1" value={tailSeconds}
          onChange={(event) => setTailSeconds(Number(event.target.value))} /></label>
    </div>
    <div className="project-export__checks">
      <label><input type="checkbox" checked={normalize} disabled={busy || stems !== "none"}
        onChange={(event) => setNormalize(event.target.checked)} /> Normalizar master a −1 dBFS</label>
      <label><input type="checkbox" checked={dither} disabled={busy || format !== "pcm16"}
        onChange={(event) => setDither(event.target.checked)} /> Dither al cuantizar a 16 bits</label>
    </div>
    <p className="project-export__detail">Los stems comparten el mismo origen temporal e incluyen la ruta soportada de mezcla, inserts, sends, automatización de pista/master, gain de clip, parámetros continuos de efectos, curvas lineales/step/Bézier y sidechain. Por rutas paralelas y procesadores no lineales no siempre suman exactamente el master. Un target o DSP sin soporte bloquea el preflight en vez de desaparecer del WAV.</p>
    <div className="project-export__actions">
      <button type="button" className="project-export__start" disabled={busy || !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 5}
        onClick={() => onExport({ sampleRate, format, stems, tailSeconds,
          ...(normalize && stems === "none" ? { normalizePeakDbfs: -1 } : {}),
          dither: format === "pcm16" && dither })}>{busy ? "Renderizando…" : "Crear WAV"}</button>
      {busy && <button type="button" onClick={onCancel}>Cancelar</button>}
    </div>
    {progress && <p className="project-export__progress" role="status">{progress.phase === "done" ? "Terminado" : progress.phase === "render" ? "Renderizando" : "Codificando"} · {progress.fileIndex + (progress.phase === "done" ? 0 : 1)}/{progress.fileCount} · {progress.stemId}</p>}
    {notice && <p className="project-export__notice" role="status">{notice}</p>}
  </section>;
}
