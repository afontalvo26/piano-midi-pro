import { useState, type FormEvent } from "react";
import type { ProjectClip, ProjectPattern } from "../../project/model.ts";
import type { EditableClipFields } from "../../composition/arrangementModel.ts";

export interface ClipInspectorProps {
  readonly clip: ProjectClip;
  readonly pattern?: ProjectPattern;
  readonly sharedCount: number;
  readonly busy: boolean;
  readonly onApply: (fields: EditableClipFields) => void;
  readonly onDuplicate: () => void;
  readonly onMakeUnique: () => void;
  readonly onDelete: () => void;
  readonly onSplit?: () => void;
  readonly onOpenPattern?: () => void;
}

export function ClipInspector({ clip, pattern, sharedCount, busy, onApply, onDuplicate, onMakeUnique,
  onDelete, onSplit, onOpenPattern }: ClipInspectorProps) {
  const [values, setValues] = useState({
    startTick: String(clip.startTick), lengthTicks: String(clip.lengthTicks),
    sourceOffsetTick: String(clip.sourceOffsetTick), transpose: String(clip.transpose),
    gainDb: String(clip.gainDb), muted: clip.muted, tailPolicy: clip.tailPolicy, loopMode: clip.loopMode,
    sourceStartFrame: clip.kind === "audio" ? String(clip.sourceStartFrame) : "",
    sourceEndFrame: clip.kind === "audio" ? String(clip.sourceEndFrame) : "",
    fadeInFrames: clip.kind === "audio" ? String(clip.fadeInFrames) : "",
    fadeOutFrames: clip.kind === "audio" ? String(clip.fadeOutFrames) : "",
  });
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const numbers = { startTick: Number(values.startTick), lengthTicks: Number(values.lengthTicks),
      sourceOffsetTick: Number(values.sourceOffsetTick), transpose: Number(values.transpose),
      gainDb: Number(values.gainDb) };
    if ([values.startTick, values.lengthTicks, values.sourceOffsetTick, values.transpose, values.gainDb]
      .some((value) => value.trim() === "") ||
      !Number.isSafeInteger(numbers.startTick) || numbers.startTick < 0 ||
      !Number.isSafeInteger(numbers.lengthTicks) || numbers.lengthTicks < 1 ||
      !Number.isSafeInteger(numbers.sourceOffsetTick) || numbers.sourceOffsetTick < 0 ||
      (pattern && numbers.sourceOffsetTick >= pattern.lengthTicks) ||
      !Number.isSafeInteger(numbers.transpose) || numbers.transpose < -127 || numbers.transpose > 127 ||
      !Number.isFinite(numbers.gainDb) || numbers.gainDb < -120 || numbers.gainDb > 24) {
      setError("Revisa ticks enteros, offset dentro del patrón, transposición −127…127 y ganancia −120…24 dB");
      return;
    }
    const audioNumbers = clip.kind === "audio" ? {
      sourceStartFrame: Number(values.sourceStartFrame), sourceEndFrame: Number(values.sourceEndFrame),
      fadeInFrames: Number(values.fadeInFrames), fadeOutFrames: Number(values.fadeOutFrames),
    } : null;
    if (audioNumbers && ([values.sourceStartFrame, values.sourceEndFrame,
      values.fadeInFrames, values.fadeOutFrames].some((value) => !value.trim()) ||
      !Number.isSafeInteger(audioNumbers.sourceStartFrame) || audioNumbers.sourceStartFrame < 0 ||
      !Number.isSafeInteger(audioNumbers.sourceEndFrame) ||
      audioNumbers.sourceEndFrame <= audioNumbers.sourceStartFrame ||
      !Number.isSafeInteger(audioNumbers.fadeInFrames) || audioNumbers.fadeInFrames < 0 ||
      !Number.isSafeInteger(audioNumbers.fadeOutFrames) || audioNumbers.fadeOutFrames < 0 ||
      audioNumbers.fadeInFrames + audioNumbers.fadeOutFrames >
        audioNumbers.sourceEndFrame - audioNumbers.sourceStartFrame)) {
      setError("El trim y los fades deben quedar dentro de los frames originales");
      return;
    }
    setError("");
    onApply({ ...numbers, ...audioNumbers, muted: values.muted,
      tailPolicy: values.tailPolicy, loopMode: values.loopMode });
  }

  return <form className="arrangement__clip-form" onSubmit={submit}>
    <div className="arrangement__clip-heading">
      <div><span className="arrangement__eyebrow">Clip seleccionado</span>
        <strong>{pattern?.name ?? (clip.kind === "audio" ? "Audio" : "Patrón faltante")}</strong>
        <small>{clip.kind === "pattern" ? `${sharedCount} ${sharedCount === 1 ? "instancia" : "instancias"} de esta fuente` : "Audio a velocidad original · sin ajuste automático al BPM"}</small></div>
      <span className="arrangement__clip-id">{clip.id.slice(0, 8)}</span>
    </div>
    <div className="arrangement__fields">
      {([ ["startTick", "Inicio · tick", "0"], ["lengthTicks", "Duración · ticks", "1"],
        ...(clip.kind === "pattern" ? [["sourceOffsetTick", "Offset fuente · tick", "0"],
          ["transpose", "Transposición", "-127"]] as const : []),
        ["gainDb", "Ganancia · dB", "-120"] ] as const).map(([key, label, min]) =>
        <label key={key}><span>{label}</span><input type="number" inputMode={key === "gainDb" ? "decimal" : "numeric"}
          step={key === "gainDb" ? "0.1" : "1"} min={min}
          value={values[key]} disabled={busy}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
      {clip.kind === "audio" && ([ ["sourceStartFrame", "Inicio fuente · frame", "0"],
        ["sourceEndFrame", "Fin fuente · frame", "1"],
        ["fadeInFrames", "Entrada · frames", "0"],
        ["fadeOutFrames", "Salida · frames", "0"] ] as const).map(([key, label, min]) =>
        <label key={key}><span>{label}</span><input type="number" inputMode="numeric" step={1}
          min={min} value={values[key]} disabled={busy}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
      <label><span>Cola al repetir</span><select value={values.tailPolicy} disabled={busy}
        onChange={(event) => setValues({ ...values, tailPolicy: event.target.value as "cut" | "continue" })}>
        <option value="cut">Cortar</option><option value="continue">Continuar</option></select></label>
      {clip.kind === "pattern" && <label><span>Repetir fuente</span><select value={values.loopMode} disabled={busy}
        onChange={(event) => setValues({ ...values, loopMode: event.target.value as "none" | "loop" })}>
        <option value="loop">Sí, loop</option><option value="none">No</option></select></label>}
      <label className="arrangement__check"><input type="checkbox" checked={values.muted} disabled={busy}
        onChange={(event) => setValues({ ...values, muted: event.target.checked })} /> Silenciar clip</label>
    </div>
    {error && <p className="arrangement__error" role="alert">{error}</p>}
    <div className="arrangement__clip-actions">
      <button type="submit" className="arrangement__primary" disabled={busy}>Aplicar cambios</button>
      {onOpenPattern && clip.kind === "pattern" && <button type="button" disabled={busy} onClick={onOpenPattern}>Editar patrón</button>}
      <button type="button" disabled={busy} onClick={onDuplicate}>Duplicar clip</button>
      {onSplit && <button type="button" disabled={busy} onClick={onSplit}>Cortar en cabezal</button>}
      {clip.kind === "pattern" && sharedCount > 1 && <button type="button" disabled={busy} onClick={onMakeUnique}>Hacer único</button>}
      <button type="button" className="arrangement__danger" disabled={busy} onClick={onDelete}>Borrar clip</button>
    </div>
  </form>;
}
