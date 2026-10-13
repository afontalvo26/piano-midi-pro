/**
 * SettingsScreen — pantalla "Ajustes" del reproductor.
 *
 * QUÉ ES: la perilla **Groove** (interpretación), con el mismo patrón visual que la
 * pantalla de Ajustes del piano: `.panel-screen` → `.settings-group` (título) →
 * `.settings-row` (etiqueta + subtítulo a la izquierda, control a la derecha) con
 * el slider `.slider-custom`. No inventa ningún patrón: son las clases del piano.
 *
 * POR QUÉ ESTÁ EN EL REPRODUCTOR Y NO SÓLO EN EL PIANO: el dueño lo pidió explícito
 * ("la idea era hacer todo en el reproductor, no en el Studio"). El reproductor es
 * el producto principal: quien abra sólo http://localhost:1235 tiene que poder
 * subir esta perilla y escuchar el efecto, sin abrir el piano.
 *
 * La perilla persiste con la MISMA clave de `localStorage` que el piano
 * (`piano_groove_amount`), así que el valor es el mismo en los dos.
 */

import type { ChangeEvent } from "react";
import { stopArrowKeys } from "./keys";

export type SettingsScreenProps = {
  /** Posición de la perilla, 0..1. */
  grooveAmount: number;
  onGrooveChange: (amount: number) => void;
  /** Canción cargada, sólo para el texto de estado. */
  songTitle: string | null;
};

export function SettingsScreen({
  grooveAmount,
  onGrooveChange,
  songTitle,
}: SettingsScreenProps) {
  return (
    <section className="panel-screen">
      <div className="panel-screen-header">
        <h2>Ajustes del reproductor</h2>
        <p>
          Cómo suena la música que reproducís. Nada de esto cambia el archivo: se
          aplica al reproducir.
        </p>
      </div>

      {/* ── Perilla Groove ────────────────────────────────────────────────────
          Es la traducción a la UI de `@app/engine/groove`: 0 % = fiel al archivo
          MIDI, 100 % = la banda "respira". */}
      <div className="settings-group">
        <h3>Interpretación (Groove)</h3>

        <div className="settings-row">
          <div className="settings-col">
            <label htmlFor="player-groove">Groove</label>
            <span>
              Microtiming y dinámica: cada rol (percusión, bajo, armonía, melodía)
              cae en un punto ligeramente distinto del pulso y con una leve
              variación de intensidad, como una banda real. A 0 % suena exactamente
              como el archivo MIDI. El pulso no se mueve: los tiempos fuertes quedan
              fijos y la expresión vive en las subdivisiones.
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "250px",
            }}
          >
            <input
              id="player-groove"
              type="range"
              className="slider-custom"
              min={0}
              max={1}
              step={0.05}
              value={grooveAmount}
              aria-label="Groove — microtiming y dinámica de la interpretación"
              // El valor viaja como texto además del número: un lector de pantalla
              // anuncia "60 %" en vez de "0.6".
              aria-valuetext={`${Math.round(grooveAmount * 100)}%`}
              title="Groove — 0 % fiel al MIDI, 100 % máxima expresión"
              // Las flechas mueven ESTE slider y no buscan en la canción: el atajo
              // global de la barra ignora los inputs de texto pero no los `range`.
              onKeyDown={stopArrowKeys}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onGrooveChange(Number(event.target.value))
              }
            />
            <span style={{ minWidth: "45px", textAlign: "right" }}>
              {Math.round(grooveAmount * 100)}%
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-col">
            <label>Cuándo se aplica</label>
            <span>
              {songTitle
                ? `Al arrancar la reproducción o al buscar en la barra. Canción cargada: ${songTitle}.`
                : "Al arrancar la reproducción o al buscar en la barra. Todavía no hay una canción cargada."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
