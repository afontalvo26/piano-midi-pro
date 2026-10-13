/**
 * main — punto de entrada del reproductor independiente.
 *
 * POR QUÉ NO HAY `<StrictMode>` (a diferencia del piano)
 * ------------------------------------------------------
 * StrictMode monta, desmonta y vuelve a montar cada efecto en desarrollo. Acá el
 * estado vive en un motor de audio con `AudioContext`, samplers y un
 * `Tone.Transport`: remontar significa arrancar el contexto dos veces y duplicar
 * la carga de samples en cada arranque en frío. Las dos cosas que StrictMode
 * protege (efectos idempotentes y limpieza correcta) están resueltas a mano: el
 * motor es un singleton por montaje y su liberación real es el cierre de pestaña.
 *
 * EL CSS ES EL DEL PIANO, IMPORTADO TAL CUAL
 * ------------------------------------------
 *   `@app/index.css` → variables (`--bg-app`, `--accent-primary`…), reset y
 *                      scrollbars. Sin esto los componentes del piano se verían
 *                      con los colores del navegador.
 *   `@app/App.css`   → el armazón (`.app-container`, `.sidebar-rail`,
 *                      `.topbar-header`, `.panel-screen`), los botones (`.btn`),
 *                      el mezclador de pistas y el importador.
 *   Los CSS de cada componente los importa el propio componente: `player.css`
 *   (barra, cola, vista de reproducción), `music.css` (pantalla Música),
 *   `SongLibrary.css` (Canciones). Por eso no se importan acá.
 *
 * Es a propósito: la orden es que el reproductor se vea EXACTAMENTE como el del
 * piano, y la única forma de garantizarlo es que sea la misma hoja de estilos.
 * Lo que pudiera chocar (reglas de Studio/teclado/juego) está todo scopeado por
 * clase, y esas clases no existen en este DOM; lo poco que sí hacía falta
 * ajustar vive en `shell.css`, con el prefijo del armazón y nada más.
 */

import { createRoot } from "react-dom/client";
import "@app/index.css";
import "@app/App.css";
import "./shell/shell.css";
import { PlayerProvider } from "@app/music/PlayerContext";
import { initLibraryStore } from "@app/music/libraryStore";
import { PlayerShell } from "./shell/PlayerShell";

// La biblioteca (metadatos, playlists, "me gusta", historial) se hidrata de
// localStorage ANTES del primer render, igual que en el piano: si no, la pantalla
// Música parpadearía vacía en cada arranque.
initLibraryStore();

const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root en index.html");

createRoot(container).render(
  <PlayerProvider>
    <PlayerShell />
  </PlayerProvider>,
);
