/**
 * TracksScreen — el mezclador por pista, con la UI del piano.
 *
 * QUÉ ES: la pantalla "Pistas" de Piano MIDI Pro (`App.tsx`, bloque
 * `screen === "tracks"`, líneas ~5515-5690) reproducida con las MISMAS clases
 * CSS (`.tracks-list`, `.track-item-card`, `.track-instrument-select`,
 * `.track-volume-block`, `.btn-mute-solo`, `active-mute`, `active-solo`) y el
 * mismo listado de instrumentos General MIDI (`INSTRUMENT_FAMILIES`).
 *
 * POR QUÉ ESTÁ EN EL REPRODUCTOR: en el piano, el volumen/mute/solo/instrumento
 * por pista vive acá (no en la barra), y es la única forma de escuchar una mano
 * sola. El encargo pide paridad funcional del mezclador, así que se trae tal
 * cual. NO se trae el `PartMixer` de MusicXML (las partituras quedan afuera).
 */

import type { SongTrack } from "@app/types/song";
import { INSTRUMENT_FAMILIES } from "@app/constants/piano";
import { TRACK_COLORS } from "@app/constants/ui";
import { stopArrowKeys } from "./keys";
export type TrackMixerState = {
  muted: Record<number, boolean>;
  solo: Record<number, boolean>;
  volumes: Record<number, number>;
  instruments: Record<number, string>;
  colors: Record<number, string>;
};

export type TracksScreenProps = {
  tracks: readonly SongTrack[];
  mix: TrackMixerState;
  onToggleMute: (trackIndex: number) => void;
  onToggleSolo: (trackIndex: number) => void;
  onVolume: (trackIndex: number, volume: number) => void;
  onInstrument: (trackIndex: number, instrument: string) => void;
  onColor: (trackIndex: number, color: string) => void;
  /** "🎹 Solo Piano": deja sólo las pistas de piano audibles. */
  onSoloPiano: () => void;
};

export function TracksScreen({
  tracks,
  mix,
  onToggleMute,
  onToggleSolo,
  onVolume,
  onInstrument,
  onColor,
  onSoloPiano,
}: TracksScreenProps) {
  return (
    <section className="panel-screen">
      <div className="panel-screen-header">
        <h2>Gestor de Pistas MIDI</h2>
        <p>
          Mapea instrumentos y silencia pistas individuales para practicar una
          mano específica.
        </p>
        {tracks.length > 0 && (
          <button
            className="btn secondary"
            style={{ marginTop: 12, width: "fit-content" }}
            // El "encendido" del botón son los "Solo" de las pistas de piano, que
            // quedan marcados a la vista: no hace falta estado propio.
            onClick={onSoloPiano}
          >
            🎹 Solo Piano
          </button>
        )}
      </div>

      <div className="tracks-list">
        {tracks.map((track) => {
          const isMuted = Boolean(mix.muted[track.index]);
          const isSolo = Boolean(mix.solo[track.index]);
          const trackVol = mix.volumes[track.index] ?? 0.8;
          const trackColor =
            mix.colors[track.index] || track.color || "#8b5cf6";

          return (
            <div key={track.index} className="track-item-card">
              <div className="track-item-left">
                <div
                  className="track-color-picker-dot"
                  style={{ backgroundColor: trackColor }}
                  title="Cambiar color"
                  onClick={() => {
                    const randomColor =
                      TRACK_COLORS[
                        Math.floor(Math.random() * TRACK_COLORS.length)
                      ];
                    onColor(track.index, randomColor);
                  }}
                />
                <div className="track-name-box">
                  <h4>{track.name}</h4>
                  <span>{track.noteCount} notas asignadas</span>
                </div>
              </div>

              <div className="track-item-center">
                <select
                  className="track-instrument-select"
                  aria-label={`Instrumento de la pista ${track.name}`}
                  value={
                    mix.instruments[track.index] || "Acoustic Grand Piano"
                  }
                  onChange={(event) =>
                    onInstrument(track.index, event.target.value)
                  }
                >
                  {INSTRUMENT_FAMILIES.map((instrument) => (
                    <option key={instrument} value={instrument}>
                      {instrument}
                    </option>
                  ))}
                </select>

                <div className="track-volume-block">
                  <input
                    type="range"
                    className="slider-custom"
                    min={0}
                    max={1}
                    step={0.05}
                    value={trackVol}
                    aria-label={`Volumen de la pista ${track.name}`}
                    // Las flechas del teclado mueven ESTE slider y nada más: el
                    // atajo global de la barra también las atiende y buscaba ±5 s
                    // en la canción (ver `shell/keys.ts`).
                    onKeyDown={stopArrowKeys}
                    onChange={(event) =>
                      onVolume(track.index, Number(event.target.value))
                    }
                  />
                  <span>{Math.round(trackVol * 100)}%</span>
                </div>
              </div>

              <div className="track-item-right">
                <button
                  className={`btn btn-mute-solo ${isMuted ? "active-mute" : ""}`}
                  onClick={() => onToggleMute(track.index)}
                >
                  Silencio
                </button>
                <button
                  className={`btn btn-mute-solo ${isSolo ? "active-solo" : ""}`}
                  onClick={() => onToggleSolo(track.index)}
                >
                  Solo
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
