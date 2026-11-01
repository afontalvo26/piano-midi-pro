import { useState, type FormEvent } from "react";
import type { ProjectSection } from "../../project/model.ts";
import type { EditableSectionFields } from "../../composition/arrangementModel.ts";

export interface SectionInspectorProps {
  readonly section: ProjectSection;
  readonly busy: boolean;
  readonly onApply: (fields: EditableSectionFields) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

export function SectionInspector({ section, busy, onApply, onDuplicate, onDelete }: SectionInspectorProps) {
  const [name, setName] = useState(section.name);
  const [startTick, setStartTick] = useState(String(section.startTick));
  const [lengthTicks, setLengthTicks] = useState(String(section.lengthTicks));
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const start = Number(startTick);
    const length = Number(lengthTicks);
    if (!name.trim() || name.trim().length > 100 || !startTick.trim() || !lengthTicks.trim() ||
        !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1) {
      setError("Usa nombre y ticks enteros dentro del proyecto");
      return;
    }
    setError("");
    onApply({ name: name.trim(), startTick: start, lengthTicks: length });
  }

  return <form className="arrangement__section-inspector" onSubmit={submit}>
    <strong>Editar sección</strong>
    <div className="arrangement__fields">
      <label>Nombre<input aria-label="Nombre de sección seleccionada" maxLength={100} required value={name}
        disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label>Inicio · tick<input aria-label="Inicio de sección seleccionada" type="number" inputMode="numeric"
        min={0} value={startTick} disabled={busy} onChange={(event) => setStartTick(event.target.value)} /></label>
      <label>Duración · ticks<input aria-label="Duración de sección seleccionada" type="number" inputMode="numeric"
        min={1} value={lengthTicks} disabled={busy} onChange={(event) => setLengthTicks(event.target.value)} /></label>
    </div>
    {error && <p className="arrangement__error" role="alert">{error}</p>}
    <div className="arrangement__clip-actions">
      <button type="submit" className="arrangement__primary" disabled={busy}>Aplicar sección</button>
      <button type="button" disabled={busy} onClick={onDuplicate}>Duplicar sección y contenido</button>
      <button type="button" className="arrangement__danger" disabled={busy} onClick={onDelete}>Borrar sección</button>
    </div>
  </form>;
}
