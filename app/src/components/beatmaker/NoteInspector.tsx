import { useState, type FormEvent } from "react";
import type { ProjectNote } from "../../project/model.ts";
import { pianoRollPitchLabel } from "../../composition/pianoRollCanvas.ts";
import type { EditableNoteFields, EditablePerformanceFields } from "../../composition/pianoRollModel.ts";

export interface NoteInspectorProps {
  readonly note: ProjectNote;
  readonly busy: boolean;
  readonly onApply: (fields: EditableNoteFields, performance: EditablePerformanceFields) => void;
  readonly onDelete: () => void;
  readonly onPreview?: () => void;
}

const FIELDS: readonly { key: keyof EditableNoteFields; label: string; min: number; max: number }[] = [
  { key: "startTick", label: "Inicio · tick", min: 0, max: Number.MAX_SAFE_INTEGER },
  { key: "durationTick", label: "Duración · ticks", min: 1, max: Number.MAX_SAFE_INTEGER },
  { key: "pitch", label: "Nota MIDI", min: 0, max: 127 },
  { key: "velocity", label: "Velocidad", min: 1, max: 127 },
  { key: "releaseVelocity", label: "Velocidad de salida", min: 0, max: 127 },
  { key: "channel", label: "Canal MIDI · 1–16", min: 1, max: 16 },
];

export function NoteInspector({ note, busy, onApply, onDelete, onPreview }: NoteInspectorProps) {
  const [values, setValues] = useState<Record<keyof EditableNoteFields, string>>({
    startTick: String(note.startTick),
    durationTick: String(note.durationTick),
    pitch: String(note.pitch),
    velocity: String(note.velocity),
    releaseVelocity: String(note.releaseVelocity),
    channel: String(note.channel + 1),
  });
  const [validationError, setValidationError] = useState("");
  const [microOffset, setMicroOffset] = useState(String(note.microOffsetTick ?? 0));
  const [probability, setProbability] = useState(String((note.probability ?? 1) * 100));
  const [ratchet, setRatchet] = useState(String(note.ratchetCount ?? 1));
  const [muted, setMuted] = useState(!!note.muted);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key])]));
    for (const field of FIELDS) {
      const value = parsed[field.key];
      if (values[field.key].trim() === "" || !Number.isSafeInteger(value) || value < field.min || value > field.max) {
        setValidationError(`${field.label}: usa un entero entre ${field.min} y ${field.max}`);
        return;
      }
    }
    const microOffsetTick = Number(microOffset);
    const probabilityPercent = Number(probability);
    const ratchetCount = Number(ratchet);
    if (!microOffset.trim() || !Number.isSafeInteger(microOffsetTick) ||
        !probability.trim() || !Number.isFinite(probabilityPercent) ||
        probabilityPercent < 0 || probabilityPercent > 100 ||
        !ratchet.trim() || !Number.isSafeInteger(ratchetCount) || ratchetCount < 1 || ratchetCount > 64) {
      setValidationError("Microtiming entero, probabilidad 0…100 % y ratchet 1…64");
      return;
    }
    setValidationError("");
    onApply({
      startTick: parsed.startTick,
      durationTick: parsed.durationTick,
      pitch: parsed.pitch,
      velocity: parsed.velocity,
      releaseVelocity: parsed.releaseVelocity,
      channel: parsed.channel - 1,
    }, { microOffsetTick, probability: probabilityPercent / 100, ratchetCount, muted });
  }

  return <form className="piano-roll__inspector-form" onSubmit={submit}>
    <div className="piano-roll__inspector-heading">
      <div><span className="piano-roll__eyebrow">Nota seleccionada</span>
        <strong>{pianoRollPitchLabel(note.pitch)} <small>· ID {note.id.slice(0, 8)}</small></strong></div>
      <span className="piano-roll__note-origin">{note.origin.kind === "drawn" ? "Dibujada" : note.origin.kind === "captured" ? "Grabada" : "Importada"}</span>
    </div>
    <div className="piano-roll__fields">
      {FIELDS.map(({ key, label, min, max }) => <label key={key}>
        <span>{label}</span>
        <input type="number" inputMode="numeric" step="1" min={min} max={max}
          value={values[key]} disabled={busy}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
      </label>)}
    </div>
    <details className="piano-roll__performance-fields"><summary>Microtiming, probabilidad y ratchet</summary>
      <div className="piano-roll__fields">
        <label><span>Microdesplazamiento · ticks</span><input type="number" inputMode="numeric" step={1}
          value={microOffset} disabled={busy} onChange={(event) => setMicroOffset(event.target.value)} /></label>
        <label><span>Probabilidad · %</span><input type="number" inputMode="decimal" step="0.1" min={0} max={100}
          value={probability} disabled={busy} onChange={(event) => setProbability(event.target.value)} /></label>
        <label><span>Ratchet · golpes</span><input type="number" inputMode="numeric" step={1} min={1} max={64}
          value={ratchet} disabled={busy} onChange={(event) => setRatchet(event.target.value)} /></label>
        <label className="piano-roll__performance-mute"><input type="checkbox" checked={muted} disabled={busy}
          onChange={(event) => setMuted(event.target.checked)} /> Silenciar nota</label>
      </div>
    </details>
    {validationError && <p className="piano-roll__error" role="alert">{validationError}</p>}
    <div className="piano-roll__inspector-actions">
      <button type="submit" className="piano-roll__primary" disabled={busy}>Aplicar valores</button>
      {onPreview && <button type="button" onClick={onPreview} disabled={busy}>Escuchar nota</button>}
      <button type="button" className="piano-roll__danger" onClick={onDelete} disabled={busy}>Borrar nota</button>
    </div>
  </form>;
}
