import { useState } from "react";
import type { AnalyzedUserSample } from "../../audio/userSampleAsset";
import type { ProjectDrumRack } from "../../project/model";
import { detectTransientBoundaries, equalSliceBoundaries } from "./sampleSliceDraft";
import "./ProjectSampleSlicePanel.css";

export interface ProjectSampleSlicePanelProps {
  readonly fileName: string;
  readonly analysis: AnalyzedUserSample;
  readonly rack: ProjectDrumRack | null;
  readonly busy: boolean;
  readonly onInstall: (slices: readonly { padId: string; startFrame: number; endFrame: number }[]) => Promise<void>;
}

interface SliceDraft { readonly padId: string; readonly startFrame: number; readonly endFrame: number }

function draftsFor(boundaries: readonly number[], rack: ProjectDrumRack | null): SliceDraft[] {
  return boundaries.slice(0, -1).map((startFrame, index) => ({
    padId: rack?.pads[index]?.id ?? "", startFrame, endFrame: boundaries[index + 1]!,
  }));
}

export function ProjectSampleSlicePanel({ fileName, analysis, rack, busy,
  onInstall }: ProjectSampleSlicePanelProps) {
  const frameCount = analysis.buffer.length;
  const sampleRate = analysis.buffer.sampleRate;
  const maxCount = Math.min(16, frameCount);
  const [count, setCount] = useState(Math.min(8, maxCount));
  const [sensitivity, setSensitivity] = useState(0.5);
  const [drafts, setDrafts] = useState<SliceDraft[]>(() => draftsFor(
    equalSliceBoundaries(frameCount, Math.min(8, maxCount)), rack));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const padIds = new Set(rack?.pads.map((pad) => pad.id) ?? []);
  const uniquePads = new Set(drafts.map((draft) => draft.padId)).size === drafts.length;
  const valid = !!rack && drafts.length > 0 && uniquePads && drafts.every((draft) =>
    padIds.has(draft.padId) && Number.isSafeInteger(draft.startFrame) &&
    Number.isSafeInteger(draft.endFrame) && draft.startFrame >= 0 &&
    draft.endFrame <= frameCount && draft.endFrame > draft.startFrame);

  function applyBoundaries(boundaries: number[], label: string): void {
    setDrafts(draftsFor(boundaries, rack));
    setCount(boundaries.length - 1);
    setNotice(label);
    setError("");
  }

  function update(index: number, patch: Partial<SliceDraft>): void {
    setDrafts((current) => current.map((draft, offset) => offset === index
      ? { ...draft, ...patch } : draft));
    setNotice("");
    setError("");
  }

  function addCut(): void {
    if (!rack || drafts.length >= maxCount) return;
    const unused = rack.pads.find((pad) => !drafts.some((draft) => draft.padId === pad.id));
    const largest = drafts.reduce((best, draft, index) =>
      draft.endFrame - draft.startFrame > drafts[best]!.endFrame - drafts[best]!.startFrame ? index : best, 0);
    const original = drafts[largest]!;
    const middle = Math.floor((original.startFrame + original.endFrame) / 2);
    if (!unused || middle <= original.startFrame || middle >= original.endFrame) return;
    setDrafts((current) => [...current.slice(0, largest), { ...original, endFrame: middle },
      { padId: unused.id, startFrame: middle, endFrame: original.endFrame },
      ...current.slice(largest + 1)]);
    setCount(drafts.length + 1);
    setNotice("Corte añadido; ajusta sus límites antes de guardar.");
  }

  return <section className="sample-slices" aria-label="Cortes de muestra para pads">
    <header><h3>Slicing para pads</h3>
      <p>{fileName} · {frameCount.toLocaleString("es-CO")} frames · {sampleRate.toLocaleString("es-CO")} Hz. Los cortes son regiones del archivo original; se guardan sin reescribir audio.</p></header>
    {!rack && <p className="sample-slices__warning">Abre una pista de batería con rack de 16 pads para asignar cortes.</p>}
    {rack && <>
      <div className="sample-slices__tools">
        <label>Número de cortes<input type="number" inputMode="numeric" min="1" max={maxCount}
          value={count} disabled={busy || saving} onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isSafeInteger(next) && next >= 1 && next <= maxCount) setCount(next);
          }} /></label>
        <button type="button" disabled={busy || saving} onClick={() =>
          applyBoundaries(equalSliceBoundaries(frameCount, count), "Cortes iguales sugeridos; confirma cada inicio y fin.")}>Dividir en partes iguales</button>
        <label>Sensibilidad de transientes <output>{Math.round(sensitivity * 100)} %</output>
          <input type="range" min="0" max="100" step="1" value={Math.round(sensitivity * 100)}
            disabled={busy || saving} onChange={(event) => setSensitivity(Number(event.target.value) / 100)} /></label>
        <button type="button" disabled={busy || saving} onClick={() => {
          const boundaries = detectTransientBoundaries(analysis.buffer, sensitivity, maxCount);
          applyBoundaries(boundaries, boundaries.length > 2
            ? `${boundaries.length - 1} cortes sugeridos; ajusta falsos positivos o transientes omitidos.`
            : "No se detectaron transientes fiables; ajusta sensibilidad o define los límites manualmente.");
        }}>Detectar transientes</button>
        <button type="button" disabled={busy || saving || drafts.length >= maxCount}
          onClick={addCut}>Añadir corte manual</button>
      </div>
      <div className="sample-slices__list">
        {drafts.map((draft, index) => <div className="sample-slices__row" key={`${index}:${draft.padId}`}>
          <strong>Corte {index + 1}</strong>
          <label>Inicio (frame)<input type="number" inputMode="numeric" min="0" max={frameCount - 1}
            step="1" value={draft.startFrame} disabled={busy || saving}
            onChange={(event) => update(index, { startFrame: Number(event.target.value) })} /></label>
          <label>Fin exclusivo (frame)<input type="number" inputMode="numeric" min="1" max={frameCount}
            step="1" value={draft.endFrame} disabled={busy || saving}
            onChange={(event) => update(index, { endFrame: Number(event.target.value) })} /></label>
          <label>Pad<select value={draft.padId} disabled={busy || saving}
            onChange={(event) => update(index, { padId: event.target.value })}>
            {rack.pads.map((pad) => <option key={pad.id} value={pad.id}>
              {pad.name}{pad.source ? " · reemplazar fuente" : ""}</option>)}
          </select></label>
          <button type="button" disabled={busy || saving || drafts.length === 1}
            onClick={() => { setDrafts((current) => current.filter((_, offset) => offset !== index));
              setCount(drafts.length - 1); setNotice(""); }}>Quitar corte {index + 1}</button>
        </div>)}
      </div>
      {!valid && <p className="sample-slices__warning" role="alert">Cada corte necesita un pad distinto y frames enteros entre 0 y {frameCount}, con fin mayor que inicio.</p>}
      {notice && <p className="sample-slices__notice" role="status">{notice}</p>}
      {error && <p className="sample-slices__warning" role="alert">{error}</p>}
      <div className="sample-slices__actions">
        <button type="button" disabled={!valid || busy || saving} onClick={() => {
          setSaving(true); setError("");
          void onInstall(drafts).then(() => { setNotice("Cortes instalados en el rack."); },
            (cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudieron guardar los cortes"))
            .finally(() => setSaving(false));
        }}>{saving ? "Guardando cortes…" : "Guardar cortes en pads"}</button>
      </div>
    </>}
  </section>;
}
