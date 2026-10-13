/**
 * catalog — el catálogo de canciones del reproductor.
 *
 * En el piano esto vive dentro del `useEffect` de `App.tsx` (líneas ~293-383):
 * baja cada demo de `app/public/demo`, la parsea con `parseMidiBytes` (que usa
 * el Worker) y la registra en `libraryStore` —la MISMA biblioteca que la pantalla
 * Música y el buscador leen— además de dejarla cacheada en la sesión para que el
 * reproductor no la vuelva a bajar al pulsar play.
 *
 * Se replica acá sin el piano, con las mismas tres consecuencias:
 *
 *  1. **Mismo parser.** `parseMidiBytes` es el del piano, así que las pistas,
 *     los índices y los ids son idénticos: una canción suena igual en los dos.
 *  2. **Se cede el hilo entre archivos.** Parsear ~130 archivos sin respirar
 *     bloquea el render; el piano cede con `scheduler.yield` y acá se hace igual.
 *  3. **Los metadatos sí se persisten** (son livianos) — de eso viven los "Me
 *     gusta", el historial y las playlists al reabrir. Las notas NO: pesan
 *     megabytes y por eso se re-parsean en cada arranque.
 */

import type { DemoSong, SongData } from "@app/types/song";
import { DEMO_SONGS } from "@app/constants/demoSongs";
import { idForSong, sourceInfoFor } from "@app/music/ids";
import { libraryStore } from "@app/music/libraryStore";
import { parseMidiBytes, putSessionSong } from "@app/music/resolve";

/** Cede el hilo para que el render no se congele entre dos parseos pesados. */
function yieldToMain(): Promise<void> {
  return new Promise<void>((resolve) => {
    const scheduler = (
      window as unknown as { scheduler?: { yield?: () => Promise<void> } }
    ).scheduler;
    if (scheduler?.yield) {
      void scheduler.yield().then(() => resolve());
    } else if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Baja y parsea UNA demo del catálogo del piano.
 *
 * Mismo `fetch` que el piano (el middleware de `vite.config.ts` sirve
 * `app/public/demo` en `/demo/...`) y mismo `parseMidiBytes`, con `trackId`,
 * `demoPath`, título, artista y género: sin esos campos el reproductor no
 * podría resolver la canción después (`music/resolve.ts`).
 */
export async function parseDemoSong(demo: DemoSong): Promise<SongData | null> {
  try {
    const response = await fetch(demo.path);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const parsed = await parseMidiBytes(bytes, {
      id: `${demo.artist}-${demo.title}`,
      trackId: demo.trackId,
      title: demo.title,
      artist: demo.artist,
      genre: demo.genre,
      defaultBpm: demo.bpm,
      demoPath: demo.path,
    });
    // Cacheada en la sesión: pulsar play no vuelve a bajar ni a parsear.
    putSessionSong(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Cada cuánto se avisa del progreso, como mucho (ms).
 *
 * POR QUÉ HAY UN TOPE: avisar por CADA archivo son ~130 renders de la pantalla
 * Música mientras el catálogo carga, y cada uno reemplaza la lista y sus nodos.
 * Medido: un click sobre una tarjeta en ese momento cae sobre un nodo que React
 * está por reemplazar y el click se pierde (la canción no se carga y el usuario
 * ve que "no pasa nada"). Con el aviso limitado a ~4 por segundo la ventana se
 * achica a lo imperceptible y la lista deja de parpadear.
 */
const PROGRESS_THROTTLE_MS = 250;

/**
 * Carga el catálogo completo y lo registra en la biblioteca del reproductor.
 *
 * @param onProgress se llama con la lista acumulada (como mucho cada
 *   `PROGRESS_THROTTLE_MS`): la pantalla Música aparece con lo que ya está listo
 *   en vez de esperar los ~130 archivos.
 * @returns todos los `SongData` cargados (los que fallaron se omiten).
 */
export async function loadDemoCatalog(
  onProgress?: (songs: SongData[]) => void,
): Promise<SongData[]> {
  const loaded: SongData[] = [];
  let lastEmit = 0;

  for (const demo of DEMO_SONGS) {
    const song = await parseDemoSong(demo);
    if (song) {
      loaded.push(song);
      const now = performance.now();
      if (onProgress && now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now;
        onProgress([...loaded]);
      }
    }
    await yieldToMain();
  }

  if (loaded.length > 0) {
    // `registerTracks` es idempotente y barato: sólo las filas que cambian
    // producen un estado nuevo. Se llama UNA vez, al final: registrar de a uno
    // haría ~130 re-renders de la biblioteca entera.
    libraryStore.registerTracks(
      loaded.map((song) => ({
        song,
        source: sourceInfoFor(song, idForSong(song)),
      })),
    );
    onProgress?.([...loaded]);
  }
  return loaded;
}

/**
 * Carga UNA demo suelta por nombre de archivo (`?demo=Algo.mid`).
 *
 * Es el camino para escuchar cualquiera de los ~200 MIDI del proyecto sin pasar
 * por el catálogo curado, y es lo que usan las mediciones para tener material
 * determinista. Si la canción ya está en el catálogo se devuelve la misma
 * instancia (mismo `trackId`), así que no se duplica nada.
 */
export async function loadSingleDemo(fileName: string): Promise<SongData | null> {
  const path = `/demo/${fileName}`;
  const known = DEMO_SONGS.find((demo) => demo.path === path);
  if (known) return parseDemoSong(known);

  // Fuera del catálogo curado: se parsea sin metadatos de artista/género, con el
  // nombre del archivo como título (mismo criterio que una importación).
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const title = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ");
    const song = await parseMidiBytes(bytes, {
      id: title,
      trackId: `d.${path}`,
      title,
      artist: "Demos del proyecto",
      defaultBpm: 120,
      demoPath: path,
    });
    putSessionSong(song);
    libraryStore.registerTracks([
      { song, source: sourceInfoFor(song, idForSong(song)) },
    ]);
    return song;
  } catch {
    return null;
  }
}
