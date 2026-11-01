import { useMemo, useState, type FormEvent } from "react";
import type { ProjectClip, ProjectDocumentV1 } from "../../project/model.ts";
import { audioClipBoundsUs, audioCrossfadeCandidates, audioCrossfadePredecessors,
  type EditableAudioClipFields } from "../../composition/audioArrangement.ts";
import { MusicalClock } from "../../sequencer/musicalClock.ts";

type AudioClip = Extract<ProjectClip, { kind: "audio" }>;

export interface AudioClipInspectorProps {
  readonly document: ProjectDocumentV1;
  readonly clip: AudioClip;
  readonly busy: boolean;
  readonly onApply: (fields: EditableAudioClipFields) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onSplit?: () => void;
  readonly onAddCrossfade: (outgoingClipId: string, incomingClipId: string,
    curve: "linear" | "equalPower") => void;
  readonly onRemoveCrossfade: (fadeId: string) => void;
  readonly onSelectClip: (clipId: string) => void;
}

function integer(value: string, minimum = 0): number | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

export function AudioClipInspector({ document, clip, busy, onApply, onDuplicate, onDelete,
  onSplit, onAddCrossfade, onRemoveCrossfade, onSelectClip }: AudioClipInspectorProps) {
  const clock = useMemo(() => new MusicalClock(document.tempoMap, document.meterMap),
    [document.tempoMap, document.meterMap]);
  const initialBounds = audioClipBoundsUs(document, clip);
  const [values, setValues] = useState({
    timeMode: clip.timeMode ?? "beat" as "beat" | "absolute",
    startTick: String(clip.startTick), lengthTicks: String(clip.lengthTicks),
    absoluteStartUs: String(initialBounds.startUs), absoluteEndUs: String(initialBounds.endUs),
    sourceStartFrame: String(clip.sourceStartFrame), sourceEndFrame: String(clip.sourceEndFrame),
    fadeInFrames: String(clip.fadeInFrames), fadeOutFrames: String(clip.fadeOutFrames),
    gainDb: String(clip.gainDb), muted: clip.muted, tailPolicy: clip.tailPolicy,
  });
  const [selectedPairId, setSelectedPairId] = useState("");
  const [curve, setCurve] = useState<"linear" | "equalPower">("equalPower");
  const [error, setError] = useState("");
  const candidates = useMemo(() => audioCrossfadeCandidates(document, clip.id), [document, clip.id]);
  const predecessors = useMemo(() => audioCrossfadePredecessors(document, clip.id), [document, clip.id]);
  const pairs = [...predecessors.map((item) => ({ outgoingId: item.id, incomingId: clip.id })),
    ...candidates.map((item) => ({ outgoingId: clip.id, incomingId: item.id }))];
  const pairKey = (pair: { outgoingId: string; incomingId: string }) =>
    JSON.stringify([pair.outgoingId, pair.incomingId]);
  const selectedPair = pairs.find((pair) => pairKey(pair) === selectedPairId)
    ?? pairs[0];
  const fades = document.audioCrossfades?.filter((fade) =>
    fade.outgoingClipId === clip.id || fade.incomingClipId === clip.id) ?? [];
  const asset = document.assets.find((item) => item.id === clip.sourceId);
  const absoluteStart = integer(values.absoluteStartUs);
  const absoluteEnd = integer(values.absoluteEndUs);
  const projected = absoluteStart !== null && absoluteEnd !== null && absoluteEnd > absoluteStart
    ? { start: clock.secondsToTick(absoluteStart / 1_000_000),
      end: clock.secondsToTick(absoluteEnd / 1_000_000) } : null;

  function switchMode(mode: "beat" | "absolute"): void {
    if (mode === values.timeMode) return;
    if (mode === "absolute") {
      const start = integer(values.startTick);
      const length = integer(values.lengthTicks, 1);
      setValues({ ...values, timeMode: mode,
        absoluteStartUs: String(start === null ? initialBounds.startUs :
          Math.round(clock.tickToSeconds(start) * 1_000_000)),
        absoluteEndUs: String(start === null || length === null ? initialBounds.endUs :
          Math.round(clock.tickToSeconds(start + length) * 1_000_000)) });
    } else {
      setValues({ ...values, timeMode: mode,
        startTick: String(projected?.start ?? clip.startTick),
        lengthTicks: String(projected ? Math.max(1, projected.end - projected.start) : clip.lengthTicks) });
    }
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const startTick = integer(values.startTick);
    const lengthTicks = integer(values.lengthTicks, 1);
    const sourceStartFrame = integer(values.sourceStartFrame);
    const sourceEndFrame = integer(values.sourceEndFrame, 1);
    const fadeInFrames = integer(values.fadeInFrames);
    const fadeOutFrames = integer(values.fadeOutFrames);
    const gainDb = Number(values.gainDb);
    const envelopeStart = clip.envelopeStartFrame ?? sourceStartFrame;
    const envelopeEnd = clip.envelopeEndFrame ?? sourceEndFrame;
    if (startTick === null || lengthTicks === null || sourceStartFrame === null ||
        sourceEndFrame === null || sourceEndFrame <= sourceStartFrame ||
        fadeInFrames === null || fadeOutFrames === null ||
        envelopeStart === null || envelopeEnd === null ||
        fadeInFrames + fadeOutFrames > envelopeEnd - envelopeStart ||
        !Number.isFinite(gainDb) || gainDb < -120 || gainDb > 24 ||
        (values.timeMode === "absolute" &&
          (absoluteStart === null || absoluteEnd === null || !projected ||
            projected.end <= projected.start))) {
      setError("Revisa tiempo exacto, frames, fades y ganancia antes de aplicar");
      return;
    }
    setError("");
    const fields: EditableAudioClipFields = { timeMode: values.timeMode, startTick,
      lengthTicks, ...(values.timeMode === "absolute" ? {
        absoluteStartUs: absoluteStart!, absoluteEndUs: absoluteEnd!,
      } : {}), sourceStartFrame, sourceEndFrame, fadeInFrames, fadeOutFrames,
      gainDb, muted: values.muted, tailPolicy: values.tailPolicy };
    onApply(fields);
  }

  return <div className="arrangement__audio-inspector">
    <form className="arrangement__clip-form" onSubmit={submit}>
      <div className="arrangement__clip-heading"><div>
        <span className="arrangement__eyebrow">Clip de audio</span><strong>{asset?.id ?? clip.sourceId}</strong>
        <small>Grabación original a velocidad real · sin time-stretch al cambiar BPM</small>
      </div><span className="arrangement__clip-id">{clip.id.slice(0, 8)}</span></div>
      <div className="arrangement__fields">
        <label><span>Modo temporal</span><select aria-label="Modo temporal del clip" value={values.timeMode}
          disabled={busy} onChange={(event) => switchMode(event.target.value as "beat" | "absolute")}>
          <option value="beat">Musical · ticks</option><option value="absolute">Absoluto · µs</option>
        </select></label>
        {values.timeMode === "beat" ? <>
          <label><span>Inicio · tick</span><input aria-label="Inicio musical del clip" type="number"
            min={0} step={1} inputMode="numeric" value={values.startTick} disabled={busy}
            onChange={(event) => setValues({ ...values, startTick: event.target.value })} /></label>
          <label><span>Duración · ticks</span><input aria-label="Duración musical del clip" type="number"
            min={1} step={1} inputMode="numeric" value={values.lengthTicks} disabled={busy}
            onChange={(event) => setValues({ ...values, lengthTicks: event.target.value })} /></label>
        </> : <>
          <label><span>Inicio absoluto · µs</span><input aria-label="Inicio absoluto del clip en microsegundos"
            type="number" min={0} step={1} inputMode="numeric" value={values.absoluteStartUs}
            disabled={busy} onChange={(event) => setValues({ ...values,
              absoluteStartUs: event.target.value })} /></label>
          <label><span>Fin absoluto · µs</span><input aria-label="Fin absoluto del clip en microsegundos"
            type="number" min={1} step={1} inputMode="numeric" value={values.absoluteEndUs}
            disabled={busy} onChange={(event) => setValues({ ...values,
              absoluteEndUs: event.target.value })} /></label>
          <output className="arrangement__audio-projection">{projected && projected.end > projected.start
            ? `Proyección actual: tick ${projected.start}–${projected.end}`
            : "El rango absoluto debe ocupar al menos un tick."}</output>
        </>}
        {([ ["sourceStartFrame", "Inicio fuente · frame", 0],
          ["sourceEndFrame", "Fin fuente · frame", 1],
          ["fadeInFrames", "Entrada · frames", 0],
          ["fadeOutFrames", "Salida · frames", 0] ] as const).map(([key, label, min]) =>
          <label key={key}><span>{label}</span><input aria-label={label} type="number"
            min={min} step={1} inputMode="numeric" value={values[key]} disabled={busy}
            onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
        <label><span>Ganancia · dB</span><input aria-label="Ganancia del clip de audio" type="number"
          min={-120} max={24} step={0.1} inputMode="decimal" value={values.gainDb} disabled={busy}
          onChange={(event) => setValues({ ...values, gainDb: event.target.value })} /></label>
        <label><span>Cola al repetir transporte</span><select value={values.tailPolicy} disabled={busy}
          onChange={(event) => setValues({ ...values,
            tailPolicy: event.target.value as "cut" | "continue" })}>
          <option value="cut">Cortar</option><option value="continue">Continuar</option>
        </select></label>
        <label className="arrangement__check"><input type="checkbox" checked={values.muted}
          disabled={busy} onChange={(event) => setValues({ ...values, muted: event.target.checked })} />
          Silenciar clip</label>
      </div>
      {clip.envelopeStartFrame !== undefined && <p className="arrangement__audio-note">
        Envolvente original: frames {clip.envelopeStartFrame}–{clip.envelopeEndFrame}; el corte conserva estos anclajes.</p>}
      <p className="arrangement__audio-note">Al cambiar clips o crossfades de audio, el transporte se detiene
        y vuelve al tick 0. Pulsa Reproducir para escuchar el nuevo arreglo.</p>
      {error && <p className="arrangement__error" role="alert">{error}</p>}
      <div className="arrangement__clip-actions">
        <button type="submit" className="arrangement__primary" disabled={busy}>Aplicar audio</button>
        <button type="button" disabled={busy} onClick={onDuplicate}>Duplicar clip</button>
        {onSplit && <button type="button" disabled={busy} onClick={onSplit}>Cortar audio en cabezal</button>}
        <button type="button" className="arrangement__danger" disabled={busy} onClick={onDelete}>Borrar clip</button>
      </div>
    </form>
    <div className="arrangement__audio-fades"><strong>Crossfades</strong>
      {fades.map((fade) => <div key={fade.id} className="arrangement__audio-fade">
        <span>{fade.outgoingClipId === clip.id ? "Salida" : "Entrada"} · {fade.curve} · {
          fade.outgoingClipId === clip.id ? fade.incomingClipId : fade.outgoingClipId}</span>
        <button type="button" disabled={busy} onClick={() => onSelectClip(
          fade.outgoingClipId === clip.id ? fade.incomingClipId : fade.outgoingClipId)}>
          Editar clip relacionado</button>
        <button type="button" disabled={busy} onClick={() => onRemoveCrossfade(fade.id)}>
          Quitar crossfade</button>
      </div>)}
      {!!pairs.length && <div className="arrangement__audio-fade-create">
        <label>Par de clips<select aria-label="Par de clips para crossfade"
          value={pairKey(selectedPair!)} disabled={busy}
          onChange={(event) => setSelectedPairId(event.target.value)}>
          {pairs.map((pair) => <option key={pairKey(pair)} value={pairKey(pair)}>
            {pair.outgoingId.slice(0, 12)} → {pair.incomingId.slice(0, 12)}</option>)}
        </select></label>
        <label>Curva<select aria-label="Curva de crossfade" value={curve} disabled={busy}
          onChange={(event) => setCurve(event.target.value as "linear" | "equalPower")}>
          <option value="equalPower">Equal power</option><option value="linear">Lineal</option>
        </select></label>
        <button type="button" disabled={busy} onClick={() => onAddCrossfade(
          selectedPair!.outgoingId, selectedPair!.incomingId, curve)}>
          Crear crossfade</button>
      </div>}
      {!fades.length && !pairs.length && <p>Se necesitan dos clips de audio solapados de la misma pista para crear un fundido.</p>}
    </div>
  </div>;
}
