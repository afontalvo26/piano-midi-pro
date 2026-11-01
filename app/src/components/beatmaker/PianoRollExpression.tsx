import { useState, type FormEvent } from "react";
import type { ProjectExpressionEvent, ProjectPattern } from "../../project/model.ts";
import { createPianoRollExpression, deletePianoRollExpression,
  editPianoRollExpression } from "../../composition/pianoRollModel.ts";
import { laneValue, type PianoRollLaneKind } from "../../composition/pianoRollLanes.ts";

export interface PianoRollExpressionProps {
  readonly pattern: ProjectPattern;
  readonly kind: PianoRollLaneKind;
  readonly channel: number;
  readonly controller: number;
  readonly draftTick: number;
  readonly selectedEvent: ProjectExpressionEvent | null;
  readonly busy: boolean;
  readonly onCommit: (next: ProjectPattern) => Promise<boolean>;
  readonly onSelect: (eventId: string | null) => void;
}

export function PianoRollExpression({ pattern, kind, channel, controller, draftTick,
  selectedEvent, busy, onCommit, onSelect }: PianoRollExpressionProps) {
  const [tick, setTick] = useState(String(selectedEvent?.tick ?? draftTick));
  const [value, setValue] = useState(String(selectedEvent ? laneValue(selectedEvent) :
    kind === "pitchBend" ? 8192 : 64));
  const [pitch, setPitch] = useState(String(selectedEvent?.kind === "polyPressure" ? selectedEvent.pitch : 60));
  const [error, setError] = useState("");
  const maximum = kind === "pitchBend" ? 16383 : 127;
  const label = kind === "cc" ? `CC${controller}` : kind === "pitchBend" ? "Pitch bend" :
    kind === "channelPressure" ? "Presión de canal" : "Presión polifónica";

  function eventFor(id: string, atTick: number, amount: number): ProjectExpressionEvent {
    const common = { id, tick: atTick, channel,
      sequence: selectedEvent?.sequence ?? pattern.expression.reduce((sequence, item) =>
        Math.max(sequence, item.sequence + 1), 0) };
    if (kind === "cc") return { ...common, kind: "cc", controller, value: amount };
    if (kind === "pitchBend") return { ...common, kind: "pitchBend", value14: amount };
    if (kind === "channelPressure") return { ...common, kind: "channelPressure", pressure: amount };
    return { ...common, kind: "polyPressure", pitch: Number(pitch), pressure: amount };
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const atTick = Number(tick);
    const amount = Number(value);
    if (!tick.trim() || !Number.isSafeInteger(atTick) || atTick < 0 || atTick >= pattern.lengthTicks ||
        !value.trim() || !Number.isSafeInteger(amount) || amount < 0 || amount > maximum ||
        (kind === "polyPressure" && (!pitch.trim() || !Number.isSafeInteger(Number(pitch)) ||
          Number(pitch) < 0 || Number(pitch) > 127))) {
      setError(`Usa tick 0…${pattern.lengthTicks - 1}, valor 0…${maximum} y pitch MIDI válido`);
      return;
    }
    setError("");
    const id = selectedEvent?.id ?? crypto.randomUUID();
    try {
      const midiEvent = eventFor(id, atTick, amount);
      const next = selectedEvent ? editPianoRollExpression(pattern, midiEvent)
        : createPianoRollExpression(pattern, midiEvent);
      void onCommit(next).then((accepted) => { if (accepted) onSelect(id); });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evento MIDI inválido"); }
  }

  function remove(): void {
    if (!selectedEvent) return;
    try { void onCommit(deletePianoRollExpression(pattern, selectedEvent.id)).then((accepted) => {
      if (accepted) onSelect(null);
    }); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo borrar el evento"); }
  }

  return <form className="piano-roll__expression-form" onSubmit={submit}>
    <div className="piano-roll__expression-heading"><strong>{selectedEvent ? `Editar ${label}` : `Crear ${label}`}</strong>
      <small>Canal {channel + 1} · {kind === "pitchBend" ? "bend compartido por canal MIDI 1.0" :
        kind === "polyPressure" ? "pitch y canal definidos" : "control del canal"}</small></div>
    <div className="piano-roll__expression-fields">
      <label>Tick<input aria-label="Tick de evento MIDI" type="number" inputMode="numeric" step={1} min={0}
        max={pattern.lengthTicks - 1} value={tick} disabled={busy} onChange={(event) => setTick(event.target.value)} /></label>
      <label>Valor<input aria-label="Valor de evento MIDI" type="number" inputMode="numeric" step={1} min={0}
        max={maximum} value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} /></label>
      {kind === "polyPressure" && <label>Pitch MIDI<input aria-label="Pitch de presión" type="number" inputMode="numeric"
        step={1} min={0} max={127} value={pitch} disabled={busy} onChange={(event) => setPitch(event.target.value)} /></label>}
    </div>
    <div className="piano-roll__expression-actions">
      <button type="submit" className="piano-roll__primary" disabled={busy}>{selectedEvent ? "Aplicar evento" : "Añadir evento"}</button>
      {selectedEvent && <button type="button" className="piano-roll__danger" disabled={busy} onClick={remove}>Borrar evento</button>}
      {selectedEvent && <button type="button" disabled={busy} onClick={() => onSelect(null)}>Nuevo evento</button>}
    </div>
    {error && <p className="piano-roll__error" role="alert">{error}</p>}
  </form>;
}
