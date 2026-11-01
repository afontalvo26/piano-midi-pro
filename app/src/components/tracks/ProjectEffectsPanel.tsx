import { useState } from "react";
import type { ProjectEffect } from "../../project/model";
import { projectEffectParameters, type ProjectEffectKind } from "../../project/effectParameters";
import "./ProjectEffectsPanel.css";

const EFFECT_KINDS: readonly { kind: ProjectEffectKind; label: string }[] = [
  { kind: "eq3", label: "EQ de 3 bandas" },
  { kind: "filter", label: "Filtro" },
  { kind: "compressor", label: "Compresor" },
  { kind: "saturation", label: "Saturación" },
  { kind: "reverb", label: "Reverb" },
  { kind: "delay", label: "Delay" },
  { kind: "limiter", label: "Limitador" },
];

const DEFAULT_PARAMETERS: Record<ProjectEffectKind, ProjectEffect["parameters"]> = {
  eq3: { lowDb: 0, midDb: 0, highDb: 0, lowHz: 400, highHz: 2500 },
  filter: { type: "lowpass", cutoffHz: 16000, q: 0.7 },
  compressor: { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6 },
  saturation: { drive: 0.2, wet: 0.2 },
  reverb: { roomSize: 0.4, dampeningHz: 3000, wet: 0.2 },
  delay: { timeMs: 250, feedback: 0.25, wet: 0.2 },
  limiter: { thresholdDb: -1 },
};

const PARAMETER_LABELS: Readonly<Record<string, string>> = {
  lowDb: "Graves", midDb: "Medios", highDb: "Agudos", lowHz: "Cruce grave",
  highHz: "Cruce agudo", type: "Tipo", cutoffHz: "Frecuencia de corte", q: "Resonancia",
  thresholdDb: "Umbral", ratio: "Relación", attackMs: "Ataque", releaseMs: "Recuperación",
  kneeDb: "Transición", drive: "Intensidad", wet: "Mezcla", roomSize: "Tamaño de sala",
  dampeningHz: "Amortiguación", timeMs: "Tiempo", feedback: "Realimentación",
};

export interface ProjectEffectsPanelProps {
  readonly label: string;
  readonly effects: readonly ProjectEffect[];
  readonly onChange: (effects: readonly ProjectEffect[]) => void;
}

function effectLabel(kind: string): string {
  return EFFECT_KINDS.find((entry) => entry.kind === kind)?.label ?? `No disponible: ${kind}`;
}

export function ProjectEffectsPanel({ label, effects, onChange }: ProjectEffectsPanelProps) {
  const [newKind, setNewKind] = useState<ProjectEffectKind>("eq3");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function changeEffect(index: number, next: ProjectEffect): void {
    onChange(effects.map((effect, offset) => offset === index ? next : effect));
    setError("");
  }

  function commitNumber(index: number, parameterId: string, min: number, max: number): void {
    const effect = effects[index];
    if (!effect) return;
    const key = `${effect.id}:${parameterId}`;
    const draft = drafts[key];
    if (draft === undefined) return;
    setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    const value = Number(draft);
    if (!draft.trim() || !Number.isFinite(value) || value < min || value > max) {
      setError(`${effectLabel(effect.kind)}: ${PARAMETER_LABELS[parameterId] ?? parameterId} debe estar entre ${min} y ${max}.`);
      return;
    }
    const parameters = { ...effect.parameters, [parameterId]: value };
    if (effect.kind === "eq3" && Number(parameters.lowHz) >= Number(parameters.highHz)) {
      setError("EQ: la frecuencia baja debe ser menor que la alta.");
      return;
    }
    if (effect.parameters[parameterId] !== value) changeEffect(index, { ...effect, parameters });
  }

  return <section className="project-effects" aria-label={`Efectos de ${label}`}>
    <header><h4>Efectos</h4><p>Orden de arriba abajo. Bypass y parámetros se guardan en el proyecto; al cambiar la cadena, reproduce de nuevo para escucharla.</p></header>
    <ol className="project-effects__chain">{effects.map((effect, index) => {
      const descriptors = projectEffectParameters(effect.kind);
      return <li key={effect.id} className="project-effects__effect">
        <div className="project-effects__head"><strong>{index + 1}. {effectLabel(effect.kind)}</strong>
          <div className="project-effects__buttons">
            <button type="button" disabled={!descriptors && !effect.enabled} aria-pressed={effect.enabled}
              onClick={() => changeEffect(index, { ...effect, enabled: !effect.enabled })}>
              {effect.enabled ? "Activo" : "Bypass"}</button>
            <button type="button" aria-label={`Subir ${effectLabel(effect.kind)}`} disabled={index === 0}
              onClick={() => { const next = [...effects]; [next[index - 1], next[index]] =
                [next[index]!, next[index - 1]!]; onChange(next); }}>↑</button>
            <button type="button" aria-label={`Bajar ${effectLabel(effect.kind)}`}
              disabled={index === effects.length - 1}
              onClick={() => { const next = [...effects]; [next[index], next[index + 1]] =
                [next[index + 1]!, next[index]!]; onChange(next); }}>↓</button>
            <button type="button" aria-label={`Quitar ${effectLabel(effect.kind)}`}
              onClick={() => onChange(effects.filter((item) => item.id !== effect.id))}>Quitar</button>
          </div>
        </div>
        {!descriptors && <p className="project-effects__warning">Este efecto no tiene motor disponible. Déjalo en bypass o quítalo.</p>}
        {descriptors && <div className="project-effects__parameters">
          {descriptors.map((descriptor) => {
            const value = effect.parameters[descriptor.parameterId];
            const key = `${effect.id}:${descriptor.parameterId}`;
            const displayLabel = PARAMETER_LABELS[descriptor.parameterId] ?? descriptor.parameterId;
            const fieldLabel = `${effectLabel(effect.kind)} ${displayLabel}`;
            return <label key={descriptor.parameterId}>{displayLabel}
              {descriptor.valueType === "choice" ? <select aria-label={fieldLabel}
                value={String(value)} onChange={(event) => changeEffect(index, { ...effect,
                  parameters: { ...effect.parameters, [descriptor.parameterId]: event.target.value } })}>
                {descriptor.values.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select> : <span className="project-effects__number"><input aria-label={fieldLabel}
                type="number" inputMode="decimal" min={descriptor.min} max={descriptor.max}
                step="any" value={drafts[key] ?? String(value)}
                onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                onBlur={() => commitNumber(index, descriptor.parameterId, descriptor.min, descriptor.max)}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                <span>{descriptor.unit}</span></span>}
            </label>;
          })}
        </div>}
        {descriptors && <button type="button" className="project-effects__reset"
          onClick={() => changeEffect(index, { ...effect,
            parameters: { ...DEFAULT_PARAMETERS[effect.kind as ProjectEffectKind] } })}>Restaurar parámetros</button>}
      </li>;
    })}</ol>
    <div className="project-effects__add"><label>Nuevo efecto<select value={newKind}
      onChange={(event) => setNewKind(event.target.value as ProjectEffectKind)}>
      {EFFECT_KINDS.map((entry) => <option key={entry.kind} value={entry.kind}>{entry.label}</option>)}
    </select></label><button type="button" disabled={effects.length >= 128} onClick={() => onChange([
      ...effects, { id: crypto.randomUUID(), kind: newKind, enabled: true,
        parameters: { ...DEFAULT_PARAMETERS[newKind] } },
    ])}>Añadir efecto</button></div>
    {error && <p className="project-effects__warning" role="alert">{error}</p>}
  </section>;
}
