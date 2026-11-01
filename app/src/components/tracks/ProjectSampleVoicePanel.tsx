import { useState } from "react";
import type { ProjectInstrumentRef } from "../../project/model";
import "./ProjectSampleVoicePanel.css";

type SampleVoice = NonNullable<ProjectInstrumentRef["sampleVoice"]>;

const DEFAULT_VOICE: SampleVoice = {
  mode: "poly", retrigger: "always", glideMs: 0, attackMs: 0, releaseMs: 0,
};

export interface ProjectSampleVoicePanelProps {
  readonly value: ProjectInstrumentRef["sampleVoice"];
  readonly region: ProjectInstrumentRef["sampleRegion"];
  readonly busy: boolean;
  readonly onSave: (voice: ProjectInstrumentRef["sampleVoice"]) => void;
}

function parseBounded(value: string, max: number): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= max ? number : null;
}

export function ProjectSampleVoicePanel({ value, region, busy, onSave }: ProjectSampleVoicePanelProps) {
  const [draft, setDraft] = useState<SampleVoice>(value ?? DEFAULT_VOICE);
  const [attack, setAttack] = useState(String(value?.attackMs ?? 0));
  const [release, setRelease] = useState(String(value?.releaseMs ?? 0));
  const [glide, setGlide] = useState(String(value?.glideMs ?? 0));
  const [error, setError] = useState("");
  const canLegato = region?.playMode === "gate" && region.loopMode === "loop";

  return <section className="sample-voice" aria-label="Voz de la muestra">
    <header><h3>Voz de la muestra</h3><p>El modo mono limita esta pista a una voz. El glide cambia la afinación de esa voz sin volver a iniciar la muestra.</p></header>
    <form onSubmit={(event) => {
      event.preventDefault();
      const attackMs = parseBounded(attack, 5000);
      const releaseMs = parseBounded(release, 5000);
      const glideMs = draft.mode === "poly" ? 0 : parseBounded(glide, 2000);
      if (attackMs === null || releaseMs === null || glideMs === null) {
        setError("Ataque y release: 0–5000 ms; glide: 0–2000 ms.");
        return;
      }
      if (draft.retrigger === "legato" && !canLegato) {
        setError("Legato requiere una región Gate con loop.");
        return;
      }
      setError("");
      onSave({ ...draft, attackMs, releaseMs,
        glideMs: draft.mode === "poly" ? 0 : glideMs,
        retrigger: draft.mode === "poly" ? "always" : draft.retrigger });
    }}>
      <label>Polifonía
        <select aria-label="Polifonía de muestra" value={draft.mode} disabled={busy}
          onChange={(event) => setDraft({ ...draft,
            mode: event.target.value as SampleVoice["mode"],
            retrigger: "always", glideMs: event.target.value === "poly" ? 0 : draft.glideMs })}>
          <option value="poly">Polifónica</option><option value="mono">Monofónica</option>
        </select>
      </label>
      <label>Reataque
        <select aria-label="Reataque de muestra" value={draft.retrigger} disabled={busy || draft.mode !== "mono"}
          onChange={(event) => setDraft({ ...draft, retrigger: event.target.value as SampleVoice["retrigger"] })}>
          <option value="always">Reiniciar muestra</option>
          <option value="legato" disabled={!canLegato}>Legato (Gate + loop)</option>
        </select>
      </label>
      <label>Glide (ms)
        <input aria-label="Glide de muestra" type="number" inputMode="numeric" min="0" max="2000" step="1"
          value={glide} disabled={busy || draft.mode !== "mono"} onChange={(event) => setGlide(event.target.value)} />
      </label>
      <label>Ataque (ms)
        <input aria-label="Ataque de muestra" type="number" inputMode="numeric" min="0" max="5000" step="1"
          value={attack} disabled={busy} onChange={(event) => setAttack(event.target.value)} />
      </label>
      <label>Release (ms)
        <input aria-label="Release de muestra" type="number" inputMode="numeric" min="0" max="5000" step="1"
          value={release} disabled={busy} onChange={(event) => setRelease(event.target.value)} />
      </label>
      {error && <p role="alert" className="sample-voice__error">{error}</p>}
      <div className="sample-voice__actions">
        <button type="submit" disabled={busy}>Guardar voz</button>
        {value && <button type="button" disabled={busy} onClick={() => { setError(""); onSave(undefined); }}>
          Restablecer polifonía
        </button>}
      </div>
    </form>
  </section>;
}
