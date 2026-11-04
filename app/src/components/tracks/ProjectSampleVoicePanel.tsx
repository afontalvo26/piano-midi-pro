import { useState } from "react";
import type { ProjectInstrumentRef } from "../../project/model";
import "./ProjectSampleVoicePanel.css";

type SampleVoice = NonNullable<ProjectInstrumentRef["sampleVoice"]>;

const DEFAULT_VOICE: SampleVoice = {
  mode: "poly", retrigger: "always", glideMs: 0, attackMs: 0, releaseMs: 0,
};

function parseRange(value: string, min: number, max: number): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export interface ProjectSampleVoicePanelProps {
  readonly value: ProjectInstrumentRef["sampleVoice"];
  readonly region: ProjectInstrumentRef["sampleRegion"];
  readonly busy: boolean;
  readonly onSave: (voice: ProjectInstrumentRef["sampleVoice"]) => void;
}

function parseBounded(value: string, max: number): number | null {
  return parseRange(value, 0, max);
}

export function ProjectSampleVoicePanel({ value, region, busy, onSave }: ProjectSampleVoicePanelProps) {
  const [draft, setDraft] = useState<SampleVoice>(value ?? DEFAULT_VOICE);
  const [attack, setAttack] = useState(String(value?.attackMs ?? 0));
  const [release, setRelease] = useState(String(value?.releaseMs ?? 0));
  const [glide, setGlide] = useState(String(value?.glideMs ?? 0));
  const [saturation, setSaturation] = useState(String(value?.saturation ?? 0));
  const [subEnabled, setSubEnabled] = useState(value?.subGainDb !== undefined);
  const [subGain, setSubGain] = useState(String(value?.subGainDb ?? -18));
  const [error, setError] = useState("");
  const canLegato = region?.playMode === "gate" && region.loopMode === "loop";

  return <section className="sample-voice" aria-label="Voz de la muestra">
    <header><h3>Voz de la muestra</h3><p>El modo mono limita esta pista a una voz. El glide cambia la afinación de esa voz sin volver a iniciar la muestra.</p></header>
    <form onSubmit={(event) => {
      event.preventDefault();
      const attackMs = parseBounded(attack, 5000);
      const releaseMs = parseBounded(release, 5000);
      const glideMs = draft.mode === "poly" ? 0 : parseBounded(glide, 2000);
      const saturationAmount = draft.mode === "poly" ? 0 : parseRange(saturation, 0, 1);
      const subGainDb = draft.mode === "poly" || !subEnabled ? null : parseRange(subGain, -36, 0);
      if (attackMs === null || releaseMs === null || glideMs === null ||
          saturationAmount === null ||
          (draft.mode === "mono" && subEnabled && subGainDb === null)) {
        setError("Ataque/release: 0–5000 ms; glide: 0–2000 ms; saturación: 0–1; subgrave: −36–0 dB.");
        return;
      }
      if (draft.retrigger === "legato" && !canLegato) {
        setError("Legato requiere una región Gate con loop.");
        return;
      }
      setError("");
      const { saturation: _oldSaturation, subGainDb: _oldSubGainDb, ...voiceBase } = draft;
      void _oldSaturation; void _oldSubGainDb;
      onSave({ ...voiceBase, attackMs, releaseMs,
        glideMs: draft.mode === "poly" ? 0 : glideMs,
        retrigger: draft.mode === "poly" ? "always" : draft.retrigger,
        ...(draft.mode === "mono" && saturationAmount > 0 ? { saturation: saturationAmount } : {}),
        ...(draft.mode === "mono" && subEnabled && subGainDb !== null ? { subGainDb } : {}) });
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
      <label>Saturación mono
        <input aria-label="Saturación de muestra" type="range" min="0" max="1" step="0.01"
          value={saturation} disabled={busy || draft.mode !== "mono"}
          onChange={(event) => setSaturation(event.target.value)} />
        <span>{Number(saturation).toFixed(2)} · 0 = apagada</span>
      </label>
      <label className="sample-voice__check">
        <input aria-label="Activar subgrave de muestra" type="checkbox" checked={subEnabled}
          disabled={busy || draft.mode !== "mono"} onChange={(event) => setSubEnabled(event.target.checked)} />
        Subgrave desde el mismo sample
      </label>
      <label>Subgrave (dB)
        <input aria-label="Nivel de subgrave de muestra" type="number" inputMode="decimal"
          min="-36" max="0" step="0.5" value={subGain}
          disabled={busy || draft.mode !== "mono" || !subEnabled}
          onChange={(event) => setSubGain(event.target.value)} />
      </label>
      <p className="sample-voice__hint">El subgrave es una copia low-pass del audio grabado, no un oscilador añadido. Saturación y subgrave usan el mismo grafo en reproducción y exportación.</p>
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
