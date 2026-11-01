import { useState } from "react";
import type { ProjectDocumentV1 } from "../../project/model";
import "./AudioTakeLatencyPanel.css";

export interface AudioTakeLatencyPanelProps {
  document: ProjectDocumentV1;
  busy: boolean;
  canUndo: boolean;
  onSetOffset: (takeId: string, expectedOffsetFrames: number, offsetFrames: number) => Promise<void>;
  onUndo: () => void;
}

interface OffsetDraft {
  readonly takeId: string;
  readonly sourceOffsetFrames: number;
  readonly value: string;
}

export function AudioTakeLatencyPanel({ document, busy, canUndo, onSetOffset,
  onUndo }: AudioTakeLatencyPanelProps) {
  const takes = document.takes.filter((take) => take.kind === "audio" && take.audioCapture);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<OffsetDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = takes.find((take) => take.id === selectedId) ?? takes.at(-1);
  const capture = selected?.audioCapture;
  const linkedClips = selected ? document.clips.filter((clip) => clip.kind === "audio" &&
    clip.sourceTakeId === selected.id && clip.timeMode === "absolute") : [];
  const baseline = capture?.capturedLatencyOffsetFrames ?? capture?.latencyOffsetFrames ?? 0;
  const offsetText = selected && capture && draft?.takeId === selected.id &&
    draft.sourceOffsetFrames === capture.latencyOffsetFrames
    ? draft.value : String(capture?.latencyOffsetFrames ?? 0);
  const offsetFrames = /^-?(0|[1-9]\d*)$/.test(offsetText) ? Number(offsetText) : NaN;
  const valid = Number.isSafeInteger(offsetFrames) && !!capture &&
    Math.abs(offsetFrames) <= 2 * capture.sampleRate;

  async function saveOffset(value: number): Promise<void> {
    if (!selected || !capture || !linkedClips.length || saving || busy ||
        !Number.isSafeInteger(value) || Math.abs(value) > 2 * capture.sampleRate ||
        value === capture.latencyOffsetFrames) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await onSetOffset(selected.id, capture.latencyOffsetFrames, value);
      setDraft(null);
      setMessage("Corrección guardada. La toma WAV original y sus frames no cambiaron.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo ajustar la latencia");
    } finally { setSaving(false); }
  }

  return <section className="audio-latency" aria-label="Corrección de latencia de tomas de audio">
    <header><h2>Latencia de la toma</h2><p>Corrige el inicio en frames sin mover los bytes grabados. Un valor positivo adelanta el clip; uno negativo lo retrasa. La medición física sigue pendiente.</p></header>
    {!takes.length ? <p>Graba una toma para ajustar su posición.</p> : <>
      <div className="audio-latency__controls">
        <label>Toma de audio<select aria-label="Toma para corregir latencia"
          value={selected?.id ?? ""} disabled={saving || busy} onChange={(event) => {
            setSelectedId(event.target.value); setDraft(null); setError(""); setMessage("");
          }}>
          {takes.map((take, index) => <option key={take.id} value={take.id}>
            Toma {index + 1} · {take.audioCapture!.frameCount} frames · {take.id.slice(0, 8)}
          </option>)}
        </select></label>
        <label>Corrección en frames<input aria-label="Corrección de latencia en frames"
          type="number" inputMode="numeric" step="1"
          min={capture ? -2 * capture.sampleRate : undefined}
          max={capture ? 2 * capture.sampleRate : undefined}
          value={offsetText} disabled={saving || busy || !linkedClips.length}
          onChange={(event) => {
            if (!selected || !capture) return;
            setDraft({ takeId: selected.id, sourceOffsetFrames: capture.latencyOffsetFrames,
              value: event.target.value }); setError(""); setMessage("");
          }} /></label>
      </div>
      {capture && <p className="audio-latency__facts">
        {capture.sampleRate.toLocaleString("es-CO")} Hz · {linkedClips.length} {linkedClips.length === 1 ? "clip vinculado" : "clips vinculados"} ·
        valor capturado {baseline} frames · ancla {capture.startProjectUs === undefined ? "legada por tick" : `${capture.startProjectUs} µs`}
      </p>}
      {!linkedClips.length && <p className="audio-latency__warning">Esta toma no tiene un clip absoluto vinculado; ajusta su posición desde el arreglo.</p>}
      {!valid && <p className="audio-latency__warning">Escribe un entero entre ±2 segundos de frames para esta entrada.</p>}
      <div className="audio-latency__actions">
        <button type="button" disabled={!valid || !linkedClips.length || saving || busy ||
          offsetFrames === capture?.latencyOffsetFrames}
          onClick={() => void saveOffset(offsetFrames)}>{saving ? "Guardando…" : "Aplicar corrección"}</button>
        <button type="button" disabled={!linkedClips.length || saving || busy ||
          baseline === capture?.latencyOffsetFrames}
          onClick={() => void saveOffset(baseline)}>Restaurar valor capturado</button>
        <button type="button" disabled={!canUndo || saving || busy} onClick={onUndo}>Deshacer</button>
      </div>
      {message && <p className="audio-latency__success" role="status">{message}</p>}
      {error && <p className="audio-latency__warning" role="alert">{error}</p>}
    </>}
  </section>;
}
