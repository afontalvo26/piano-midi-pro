import { useState, type FormEvent } from "react";
import type { ProjectPattern, ProjectScene, ProjectTrack } from "../../project/model.ts";
import type { EditableSceneFields } from "../../composition/arrangementModel.ts";

export interface SceneInspectorProps {
  readonly scene: ProjectScene;
  readonly tracks: readonly ProjectTrack[];
  readonly patterns: readonly ProjectPattern[];
  readonly busy: boolean;
  readonly onApply: (fields: EditableSceneFields) => void;
  readonly onClose: () => void;
}

export function SceneInspector({ scene, tracks, patterns, busy, onApply, onClose }: SceneInspectorProps) {
  const [name, setName] = useState(scene.name);
  const [quantum, setQuantum] = useState(String(scene.launchQuantizationTicks));
  const [assignment, setAssignment] = useState<Record<string, string>>(() => Object.fromEntries(
    scene.slots.map((slot) => [slot.trackId, slot.patternId])));
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const launchQuantizationTicks = Number(quantum);
    const slots = tracks.flatMap((track) => assignment[track.id]
      ? [{ trackId: track.id, patternId: assignment[track.id]! }] : []);
    if (!name.trim() || name.trim().length > 100 || !quantum.trim() ||
        !Number.isSafeInteger(launchQuantizationTicks) || launchQuantizationTicks < 0 || !slots.length) {
      setError("Define nombre, cuantización en ticks y al menos una pista");
      return;
    }
    setError("");
    onApply({ name: name.trim(), launchQuantizationTicks, slots });
  }

  return <form className="arrangement__scene-inspector" onSubmit={submit}>
    <strong>Editar {scene.name}</strong>
    <p>Una pista recibe un patrón por escena. El lanzamiento toma autoridad sólo en esas pistas.</p>
    <div className="arrangement__fields">
      <label>Nombre<input aria-label="Nombre de escena seleccionada" maxLength={100} required
        value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label>Cuantización · ticks<input aria-label="Cuantización de escena seleccionada" type="number"
        inputMode="numeric" min={0} value={quantum} disabled={busy}
        onChange={(event) => setQuantum(event.target.value)} /></label>
      {tracks.map((track) => <label key={track.id}>{track.name}<select aria-label={`Patrón de ${track.name}`}
        value={assignment[track.id] ?? ""} disabled={busy}
        onChange={(event) => setAssignment({ ...assignment, [track.id]: event.target.value })}>
        <option value="">Sin patrón</option>
        {patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
      </select></label>)}
    </div>
    {error && <p className="arrangement__error" role="alert">{error}</p>}
    <div className="arrangement__clip-actions">
      <button type="submit" className="arrangement__primary" disabled={busy}>Aplicar escena</button>
      <button type="button" disabled={busy} onClick={onClose}>Cerrar editor</button>
    </div>
  </form>;
}
