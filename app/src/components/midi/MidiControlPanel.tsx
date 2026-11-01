import { memo, useMemo } from "react";
import { MIDI_PROFILES, findBindingConflicts, type MidiBinding, type MidiProfileId, type MidiValueMode } from "../../midi/profile.ts";
import type { MidiObservation } from "../../midi/diagnostics.ts";
import "./MidiControlPanel.css";

export interface MidiControlPanelProps {
  profileId: MidiProfileId;
  profileOverride: "auto" | MidiProfileId;
  onProfileOverride: (value: "auto" | MidiProfileId) => void;
  inputs: readonly { id: string; name: string }[];
  selectedInputId: string;
  observations: readonly MidiObservation[];
  bindings: readonly MidiBinding[];
  bank: number;
  onBankChange: (bank: number) => void;
  learnAction: string | null;
  onStartLearn: (action: string) => void;
  onCancelLearn: () => void;
  onRemoveBinding: (id: string) => void;
  onToggleBinding: (id: string, enabled: boolean) => void;
  onValueModeChange: (id: string, mode: MidiValueMode) => void;
  onClearObservations: () => void;
  recording: boolean;
  recordedEvents: number;
  hasRecording: boolean;
  unsavedRecording: boolean;
  savingRecording: boolean;
  onRetryRecording: () => void;
  onDiscardRecording: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onExportRecording: () => void;
}

const LEARN_ACTIONS = [
  { id: "recording.toggle", label: "Grabar en la app" },
  { id: "metronome.toggle", label: "Metrónomo" },
  { id: "drum.pad", label: "Pad de batería" },
  { id: "bank.prev", label: "Banco anterior" },
  { id: "bank.next", label: "Banco siguiente" },
  { id: "piano.modulation", label: "Modulación" },
  { id: "piano.release", label: "Liberación del piano" },
  { id: "piano.transpose", label: "Transposición del piano" },
  { id: "volume.master", label: "Fader maestro" },
  { id: "effect.reverbDecay", label: "Decaimiento de reverb" },
  { id: "effect.chorusDepth", label: "Profundidad de chorus" },
] as const;

const VALUE_MODES: readonly { id: MidiValueMode; label: string }[] = [
  { id: "absolute", label: "Absoluto (0–127)" },
  { id: "relative-twos-complement", label: "Relativo: complemento a dos" },
  { id: "relative-binary-offset", label: "Relativo: centro en 64" },
  { id: "trigger", label: "Disparador" },
];

const PHYSICAL_LABELS: Readonly<Record<string, string>> = {
  keys: "37 teclas", pitch: "Rueda Pitch", mod: "Rueda MOD", sustainPedal: "Pedal sustain",
  knobBank: "Knob Bank", faderBank: "Fader Bank", padBank: "Pad Bank (combinación)",
  octaveDown: "OCTAVE −", octaveUp: "OCTAVE +", left: "Flecha izquierda", right: "Flecha derecha",
  play: "Play", arp: "ARP", noteRepeat: "Note Repeat", scale: "Scale", chord: "Chord",
  globe: "GLOBE", bt: "BT", patch: "PATCH", para: "PARA", fx: "FX", seq: "SEQ",
  seqPlay: "SEQ PLAY", seqRec: "SEQ REC",
};

const INTERNAL_CONTROLS = new Set([
  "knobBank", "faderBank", "padBank", "octaveDown", "octaveUp", "left", "right",
  "arp", "noteRepeat", "scale", "chord", "globe", "bt", "patch", "para", "fx",
  "seq", "seqPlay", "seqRec",
]);

const OBSERVED_CONTROL_KINDS = new Set<MidiObservation["kind"]>([
  "cc", "pitchBend", "polyPressure", "channelPressure", "programChange",
]);

function physicalControlLabel(id: string): string {
  if (id.startsWith("Pad")) return `Pad ${id.slice(3)}`;
  if (/^K\d+$/.test(id)) return `Encoder ${id}`;
  if (/^F\d+$/.test(id)) return `Fader ${id.slice(1)}`;
  return PHYSICAL_LABELS[id] ?? id;
}

function physicalBank(id: string): string {
  const index = Number(id.replace(/\D/g, ""));
  if (id.startsWith("K")) return index <= 8 ? "Knob 1" : "Knob 2";
  if (/^F\d+$/.test(id)) return index <= 4 ? "Fader 1" : "Fader 2";
  if (id.startsWith("Pad")) return index <= 16 ? "Pad 1" : "Pad 2";
  return "—";
}

function physicalStatus(id: string): string {
  if (INTERNAL_CONTROLS.has(id)) return "Interno; emisión MIDI sin comprobar";
  if (id === "keys" || id === "pitch" || id === "mod" || id === "sustainPedal") {
    return "Comprobar mensaje en monitor";
  }
  return "Aprendible si emite MIDI";
}

const PhysicalControlMatrix = memo(function PhysicalControlMatrix({ profileId }: { profileId: MidiProfileId }) {
  return (
    <div className="midi-panel__table-scroll midi-panel__matrix-scroll">
      <table className="midi-panel__table">
        <caption>Inventario físico. El estado sólo se verifica al pulsar el control y observar sus bytes.</caption>
        <thead><tr><th scope="col">Control</th><th scope="col">Banco</th><th scope="col">Estado de captura</th></tr></thead>
        <tbody>
          {MIDI_PROFILES[profileId].controls.map((id) => (
            <tr key={id}>
              <th scope="row">{physicalControlLabel(id)}</th>
              <td>{physicalBank(id)}</td>
              <td>{physicalStatus(id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function bindingMessage(binding: MidiBinding): string {
  const { matcher } = binding;
  const pieces: string[] = [matcher.kind];
  if (matcher.number !== undefined) pieces.push(`#${matcher.number}`);
  if (matcher.channel !== undefined) pieces.push(`canal ${matcher.channel + 1}`);
  if (matcher.bank !== undefined) pieces.push(`banco ${matcher.bank}`);
  return pieces.join(" · ");
}

function actionLabel(actionId: string): string {
  return LEARN_ACTIONS.find((action) => action.id === actionId)?.label ?? actionId;
}

function observedPortActivity(inputId: string, observations: readonly MidiObservation[]): string {
  let notes = false;
  let controls = false;
  let other = false;
  for (const observation of observations) {
    if (observation.inputId !== inputId) continue;
    if (observation.kind === "noteOn" || observation.kind === "noteOff") notes = true;
    else if (OBSERVED_CONTROL_KINDS.has(observation.kind)) controls = true;
    else other = true;
  }
  if (notes && controls) return "Notas y controles observados";
  if (notes) return "Notas observadas";
  if (controls) return "Controles observados";
  return other ? "Otros mensajes observados" : "Sin mensajes observados";
}

/** UI only. The owner in App handles permission, MIDI routing and recording. */
export function MidiControlPanel({
  profileId, profileOverride, onProfileOverride, inputs, selectedInputId,
  observations, bindings, bank, onBankChange, learnAction, onStartLearn, onCancelLearn,
  onRemoveBinding, onToggleBinding, onValueModeChange, onClearObservations,
  recording, recordedEvents, hasRecording, unsavedRecording, savingRecording, onRetryRecording,
  onDiscardRecording,
  onStartRecording, onStopRecording, onExportRecording,
}: MidiControlPanelProps) {
  const recent = observations.slice(-24).reverse();
  const conflicts = useMemo(() => findBindingConflicts(bindings), [bindings]);
  const conflictingIds = new Set(conflicts.flatMap(({ first, second }) => [first.id, second.id]));
  const selectedName = inputs.find((input) => input.id === selectedInputId)?.name;

  return (
    <div className="midi-panel">
      <section className="midi-panel__card" aria-labelledby="midi-panel-device-heading">
        <div className="midi-panel__heading">
          <div><h3 id="midi-panel-device-heading">Dispositivo y puertos</h3><p>El perfil sugerido por el nombre se puede corregir manualmente.</p></div>
          <span className="midi-panel__badge">{MIDI_PROFILES[profileId].label}</span>
        </div>
        <label className="midi-panel__field">
          <span>Perfil</span>
          <select value={profileOverride} onChange={(e) => onProfileOverride(e.target.value as "auto" | MidiProfileId)}>
            <option value="auto">Automático ({MIDI_PROFILES[profileId].label})</option>
            <option value="smk37-elite">SMK-37 Elite</option>
            <option value="smk37-pro">SMK-37 Pro</option>
            <option value="generic">MIDI genérico</option>
          </select>
        </label>
        <p className="midi-panel__current">Puerto activo: <strong>{selectedInputId === "__all__" ? "Todos los puertos" : selectedName ?? "Ninguno"}</strong></p>
        {selectedInputId === "__all__" && inputs.length > 1 && (
          <p className="midi-panel__notice">Varios puertos pueden enviar bytes iguales casi al mismo tiempo. El monitor señala coincidencias posibles, pero sólo una captura física confirma si son espejos. Selecciona un puerto si quieres aislar su función.</p>
        )}
        <ul className="midi-panel__ports">
          {inputs.length === 0 ? <li>Sin entradas MIDI detectadas.</li> : inputs.map((input) => (
            <li key={input.id} className={input.id === selectedInputId ? "midi-panel__port--selected" : ""}>
              <span>{input.name}<small>{observedPortActivity(input.id, observations)}</small></span><code title={input.id}>{input.id}</code>
            </li>
          ))}
        </ul>
        <p className="midi-panel__hint">El puerto se cambia en «Conectividad MIDI». El nombre no revela firmware ni plantilla MidiSuite.</p>
      </section>

      <section className="midi-panel__card" aria-labelledby="midi-panel-monitor-heading">
        <div className="midi-panel__heading">
          <div><h3 id="midi-panel-monitor-heading">Monitor MIDI local</h3><p>Últimos 24 eventos; reloj del navegador en milisegundos.</p></div>
          <button className="midi-panel__button" type="button" onClick={onClearObservations} disabled={observations.length === 0}>Limpiar</button>
        </div>
        <div className="midi-panel__table-scroll midi-panel__events-scroll" aria-live="off">
          <table className="midi-panel__table">
            <thead><tr><th scope="col">Tiempo</th><th scope="col">Puerto</th><th scope="col">Bytes</th><th scope="col">Tipo</th><th scope="col">Canal</th><th scope="col">Número / valor</th></tr></thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={6}>Aún no se han recibido mensajes. Pulsa un control físico para inspeccionarlo.</td></tr>
              ) : recent.map((item, index) => (
                <tr key={`${item.inputId}-${item.timeStamp}-${index}`}>
                  <td>{item.timeStamp.toFixed(1)}</td>
                  <td><span title={item.inputId}>{inputs.find((input) => input.id === item.inputId)?.name ?? item.inputId}</span>{item.possibleMirrorOf && <small className="midi-panel__mirror">Posible espejo de {item.possibleMirrorOf}; coincidencia temporal sin confirmar</small>}</td>
                  <td><code>{item.rawHex}</code></td>
                  <td>{item.kind}</td>
                  <td>{item.channel === undefined ? "—" : item.channel + 1}</td>
                  <td>{item.number === undefined ? "—" : `#${item.number}`}{item.value === undefined ? "" : ` · ${item.value}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="midi-panel__card" aria-labelledby="midi-panel-matrix-heading">
        <div className="midi-panel__heading"><div><h3 id="midi-panel-matrix-heading">Matriz de controles físicos</h3><p>Inventario del {MIDI_PROFILES[profileId].label}; ningún número CC se presupone.</p></div></div>
        <PhysicalControlMatrix profileId={profileId} />
        {profileId !== "generic" && <p className="midi-panel__hint">ARP, Repeat, Scale, Chord y SEQ pueden funcionar dentro del dispositivo. Un cambio de modo no se muestra como activo sin mensaje MIDI observable.</p>}
      </section>

      <section className="midi-panel__card" aria-labelledby="midi-panel-learn-heading">
        <div className="midi-panel__heading"><div><h3 id="midi-panel-learn-heading">MIDI Learn</h3><p>Elige una acción y mueve el control que quieres asignar.</p></div></div>
        <div className="midi-panel__bank-picker" role="group" aria-label="Banco virtual de la app">
          <span>Banco virtual de la app: <strong>{bank}</strong></span>
          {[1, 2].map((number) => (
            <button key={number} className={`midi-panel__button ${bank === number ? "midi-panel__button--selected" : ""}`}
              type="button" aria-pressed={bank === number} onClick={() => onBankChange(number)}>
              Banco {number}
            </button>
          ))}
        </div>
        <p className="midi-panel__hint midi-panel__bank-hint">El banco virtual distingue CC reutilizados entre asignaciones de la app. El banco físico interno del SMK sólo se conoce si emite un mensaje MIDI observable.</p>
        {learnAction !== null && <div className="midi-panel__learning" role="status">Esperando mensaje para <strong>{actionLabel(learnAction)}</strong><button className="midi-panel__button" type="button" onClick={onCancelLearn}>Cancelar</button></div>}
        <div className="midi-panel__actions">
          {LEARN_ACTIONS.map((action) => (
            <div key={action.id} className="midi-panel__action">
              <span>{action.label}</span>
              <button className="midi-panel__button" type="button" onClick={() => onStartLearn(action.id)} disabled={learnAction !== null} aria-label={`Aprender control para ${action.label}`}>Aprender</button>
            </div>
          ))}
        </div>
        <p className="midi-panel__hint">Un Note On aprendido se consume para que la misma pulsación no active también el piano. Los encoders infinitos pueden emitir valores relativos: gira en ambos sentidos y elige el modo que corresponda a los bytes observados.</p>
        {conflicts.length > 0 && <div className="midi-panel__notice" role="alert">
          Hay {conflicts.length} conflicto(s) entre asignaciones activas. Desactiva o elimina una antes de usar esos controles.
          <ul className="midi-panel__conflicts">{conflicts.map(({ first, second }) => (
            <li key={`${first.id}:${second.id}`}>{actionLabel(first.action)} ({first.id}) y {actionLabel(second.action)} ({second.id}) comparten {bindingMessage(first)}.</li>
          ))}</ul>
        </div>}
        <div className="midi-panel__table-scroll">
          <table className="midi-panel__table">
            <caption>Asignaciones guardadas del perfil y puerto seleccionados.</caption>
            <thead><tr><th scope="col">Acción</th><th scope="col">Mensaje observado</th><th scope="col">Puerto</th><th scope="col">Modo de valor</th><th scope="col">Estado</th><th scope="col">Opciones</th></tr></thead>
            <tbody>
              {bindings.length === 0 ? <tr><td colSpan={6}>Sin asignaciones aprendidas.</td></tr> : bindings.map((binding) => (
                <tr key={binding.id} className={conflictingIds.has(binding.id) ? "midi-panel__row--conflict" : ""}>
                  <th scope="row">{actionLabel(binding.action)}</th>
                  <td>{bindingMessage(binding)}{binding.consumeNote && <small>Consume nota musical</small>}</td>
                  <td title={binding.matcher.inputId}>{binding.matcher.inputId ?? "Cualquiera"}</td>
                  <td><select className="midi-panel__value-mode" value={binding.valueMode}
                    aria-label={`Modo de valor de ${actionLabel(binding.action)} (${binding.id})`}
                    onChange={(event) => onValueModeChange(binding.id, event.target.value as MidiValueMode)}>
                    {VALUE_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                  </select></td>
                  <td>{conflictingIds.has(binding.id) ? "Conflicto" : binding.enabled ? "Activa" : "Inactiva"}</td>
                  <td className="midi-panel__binding-actions">
                    <label><input type="checkbox" checked={binding.enabled} onChange={(e) => onToggleBinding(binding.id, e.target.checked)} />Habilitada</label>
                    <button className="midi-panel__button" type="button" onClick={() => onRemoveBinding(binding.id)}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="midi-panel__card" aria-labelledby="midi-panel-record-heading">
        <div className="midi-panel__heading"><div><h3 id="midi-panel-record-heading">Grabar en la app</h3><p>Captura lo que llega por MIDI. «SEQ REC» del Elite controla su secuenciador interno y tiene un estado independiente.</p></div><span className={`midi-panel__badge ${recording ? "midi-panel__badge--recording" : ""}`}>{recording ? "Grabando" : "Detenido"}</span></div>
        <p className="midi-panel__current">Eventos capturados: <strong>{recordedEvents}</strong></p>
        {unsavedRecording && <p role="alert">Esta toma sólo está en memoria. Guárdala o exporta el .mid antes de cerrar la pestaña.</p>}
        <div className="midi-panel__record-actions">
          <button className="midi-panel__button midi-panel__button--primary" type="button" onClick={recording ? onStopRecording : onStartRecording}>{recording ? "Detener grabación" : "Iniciar grabación"}</button>
          <button className="midi-panel__button" type="button" onClick={onExportRecording} disabled={!hasRecording || recording}>Exportar .mid</button>
          {unsavedRecording && <button className="midi-panel__button" type="button" onClick={onRetryRecording} disabled={savingRecording}>Reintentar guardado</button>}
          {unsavedRecording && <button className="midi-panel__button" type="button" onClick={onDiscardRecording} disabled={savingRecording}>Descartar toma sin guardar</button>}
        </div>
      </section>
    </div>
  );
}
