import { useSyncExternalStore } from "react";
import { midiToLabel } from "../../utils/audioMidiUtils";
import { clearLiveStrikeHistory, getLivePerformanceSnapshot, subscribeLivePerformance } from "./livePerformanceStore";
import "./LivePerformanceReadout.css";

function percent(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)} %`;
}

function relativeDb(gain: number): string {
  return gain <= 0 ? "−∞ dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

export function LivePerformanceReadout({ midiInputActive }: { midiInputActive: boolean }) {
  const { lastStrike: strike, recentMidi } = useSyncExternalStore(
    subscribeLivePerformance, getLivePerformanceSnapshot, getLivePerformanceSnapshot);
  const source = strike?.source === "midi" ? `MIDI físico · ${strike.inputName}`
    : strike?.source === "keyboard" ? "Teclado de computadora" : "Piano en pantalla";

  return <section className="live-performance" aria-label="Expresión de la última pulsación">
    <div className="live-performance__heading">
      <div><strong>Expresión en vivo</strong><span>La última pulsación recibida</span></div>
      <span className={midiInputActive ? "live-performance__port is-active" : "live-performance__port"}>
        {midiInputActive ? "Entrada MIDI escuchando" : "Sin entrada MIDI en escucha"}
      </span>
    </div>
    {strike ? <>
      <div className="live-performance__source"><span>{source}</span><strong>{midiToLabel(strike.playedNote)}</strong></div>
      <div className="live-performance__metrics">
        <div><small>Velocidad recibida</small><strong>{strike.rawVelocity}<span> / 127</span></strong></div>
        <div><small>Velocidad calibrada</small><strong>{percent(strike.normalizedVelocity)}</strong></div>
        <div><small>Ganancia de la nota</small><strong>{percent(strike.gain)}</strong></div>
      </div>
      <div className="live-performance__bars" aria-hidden="true">
        <span style={{ width: `${strike.normalizedVelocity * 100}%` }} />
        <span style={{ width: `${strike.gain * 100}%` }} />
      </div>
      <small className="live-performance__detail">Nota de entrada: {strike.physicalNote} · Curva: {strike.curveLabel} · La ganancia indicada precede al volumen maestro y a los controles MIDI de expresión.</small>
    </> : <p>Toca una tecla para ver cuánto transmite el controlador y cómo responde el piano.</p>}
    <div className="live-performance__test">
      <div><strong>Prueba de cinco intensidades MIDI</strong><p>Toca cinco veces de muy suave a fuerte. Compara la velocidad y el nivel relativo de cada golpe.</p></div>
      <button type="button" onClick={clearLiveStrikeHistory} disabled={recentMidi.length === 0}>Reiniciar lecturas</button>
    </div>
    <div className="live-performance__history" aria-label="Últimas cinco pulsaciones MIDI físicas">
      {Array.from({ length: 5 }, (_, index) => {
        const sample = recentMidi[index];
        return <div key={index}>
          <span>{index + 1}</span>
          <strong>{sample ? `${sample.rawVelocity} / 127` : "—"}</strong>
          <small>{sample ? relativeDb(sample.gain) : "sin golpe"}</small>
        </div>;
      })}
    </div>
  </section>;
}
