/**
 * Cambio de canción con una biblioteca que apunta a canciones que ya no están.
 *
 * ── EL BUG QUE ESTE TEST PROTEGE (reporte del dueño, textual) ──────────────
 *
 *   *"Sigue sin poder cambiar de canción correctamente y además cuando hago clic
 *   sobre otra tampoco cambia, se quedan cargando."*
 *   *"Se queda cargando y deja de responder."*
 *
 * El escenario que fallaba **no** era una pestaña limpia (ahí el camino feliz
 * anda): era el navegador del dueño, que tiene la biblioteca guardada de ayer.
 * Otro proceso reconstruyó el catálogo —miles de archivos renombrados y
 * borrados—, así que las canciones guardadas en «Me gusta» y en el historial
 * apuntan a rutas que el `catalog.json` nuevo ya no tiene.
 *
 * Al tocar una de esas canciones:
 *
 *   1. `resolveTrack` no encontraba la ruta en el índice y devolvía `null`
 *      (el `return song as SongData` se comía el `null` con un cast).
 *   2. `loadEntry` hacía `putSessionSong(null)` → `song.trackId` → **TypeError**.
 *   3. Como `loadEntry` se llama con `void`, esa promesa rechazada no la veía
 *      nadie: `setIsLoading(false)` no se ejecutaba **nunca**, así que la barra
 *      quedaba en "Cargando…" para siempre, sin ningún error en pantalla.
 *
 * Medido antes del arreglo: 20 s después del clic el spinner seguía encendido,
 * el estado no cambiaba y había una promesa rechazada
 * (`TypeError: Cannot read properties of null (reading 'trackId')`).
 *
 * ── CÓMO SE REPRODUCE SIN TOCAR EL CATÁLOGO ───────────────────────────────
 *
 * Se siembra `localStorage` ANTES de que arranque la app, con la misma forma que
 * deja el reproductor: una ficha de canción guardada cuya ruta no existe en el
 * catálogo, marcada con ❤️ y presente en el historial. Es exactamente el estado
 * del navegador del dueño, y no depende de qué archivos haya en disco hoy.
 *
 * Corre contra el REPRODUCTOR (`localhost:1235`), que es el producto del dueño y
 * el único que restaura la sesión; el piano vive en el 1234 y lo levanta la
 * `webServer` de este mismo archivo de configuración.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe.configure({ timeout: 180_000 });

const PLAYER_URL = "http://localhost:1235/";

/** Una canción que el catálogo de hoy no tiene (simula el catálogo reconstruido). */
const FANTASMA = "d./demo/Bolero_-_La_Que_Ya_No_Esta.kar";
const FANTASMA_TITULO = "La Que Ya No Está";
const FANTASMA_ARTISTA = "Trío Viejo";

/**
 * Una canción REAL del catálogo de hoy, leída del JSON que sirve la app.
 *
 * El test de recuperación necesita una canción viva para comprobar que el
 * reproductor salta a ella en vez de quedarse trabado. Se lee del disco y no se
 * escribe a mano: un id o un título hardcodeado se rompe en silencio la próxima
 * vez que se renumere el catálogo, y el test fallaría por el fixture, no por el
 * bug.
 */
function cancionReal(): { id: string; titulo: string } {
  const file = path.join(__dirname, "..", "..", "app", "public", "demo", "catalog.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    fields: string[];
    songs: unknown[][];
  };
  const iP = raw.fields.indexOf("path");
  const iT = raw.fields.indexOf("trackId");
  const iTi = raw.fields.indexOf("title");
  const row = raw.songs.find((r) => r[iT] && r[iP]);
  if (!row) throw new Error("catalog.json no tiene canciones: no se puede armar el fixture.");
  return { id: String(row[iT]), titulo: String(row[iTi]) };
}

/** La ficha que el reproductor persiste para una canción (`music/types.TrackMeta`). */
function ficha(id: string, titulo: string, ref: string, artista: string) {
  return {
    id,
    title: titulo,
    artist: artista,
    album: artista,
    duration: 180,
    bpm: 90,
    noteCount: 1200,
    trackCount: 4,
    hasLyrics: false,
    source: { origin: "demo", ref, bytes: 0 },
  };
}

/**
 * Siembra la biblioteca guardada.
 *
 * `liked` es lo que hace visible la canción en «Tus me gusta» del Inicio, y
 * `history` en «Recién escuchadas»: son las dos colecciones que se arman con la
 * biblioteca PERSISTIDA —no con el catálogo de hoy—, así que son justo las que
 * pueden ofrecer una canción que ya no existe. Tocar una fila de ahí es el clic
 * del dueño.
 */
async function sembrarBiblioteca(page: Page, liked: string[]): Promise<void> {
  const real = cancionReal();
  const tracks: Record<string, unknown> = {
    [FANTASMA]: ficha(
      FANTASMA,
      FANTASMA_TITULO,
      "/demo/Bolero_-_La_Que_Ya_No_Esta.kar",
      FANTASMA_ARTISTA,
    ),
  };
  if (liked.includes(real.id)) {
    tracks[real.id] = ficha(real.id, real.titulo, "/demo/real.kar", "Artista Real");
  }

  await page.addInitScript(
    ({ fantasma, tracks: fichas, likedIds }) => {
      try {
        localStorage.setItem(
          "piano_player_library_v1",
          JSON.stringify({
            version: 1,
            tracks: fichas,
            trackOrder: Object.keys(fichas),
            playlists: [],
            liked: likedIds,
            playCounts: {},
            history: [{ trackId: fantasma, at: Date.now() }],
          }),
        );
        // Sin sesión guardada: lo que se mide es el clic, no la restauración.
        localStorage.removeItem("player_session_v1");
        localStorage.removeItem("player_resume_v1");
        // Se arranca en Música y sin búsqueda, para que las shelves estén a la vista.
        localStorage.setItem("player_screen", JSON.stringify("music"));
        localStorage.setItem("player_search_query", JSON.stringify(""));
      } catch {
        /* `about:blank` no tiene origen: el documento real sí. */
      }
    },
    { fantasma: FANTASMA, tracks, likedIds: liked },
  );
}

/**
 * Toca la canción fantasma desde «Me gusta».
 *
 * Se entra por «Ver todo» de la shelf «Tus me gusta» en vez de tocar la tarjeta
 * de la shelf: la vista de la colección es la lista de filas (`li.pm-row`), que
 * es el mismo camino que el usuario hace al abrir una colección y elegir una
 * canción de ahí — y el que dispara `playCollection(...)` con la canción pedida
 * al frente.
 */
async function tocarFantasma(page: Page): Promise<void> {
  const shelf = page.locator(".pm-shelf", { hasText: "Tus me gusta" });
  await expect(shelf).toBeVisible({ timeout: 30_000 });
  await shelf.locator(".pm-shelf__more").click();

  const fila = page.locator(`li.pm-row[data-track-id="${FANTASMA}"] button.pm-row__main`);
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await fila.scrollIntoViewIfNeeded();
  await fila.click();
}

async function abrirReproductor(page: Page): Promise<string[]> {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(PLAYER_URL, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".pm-bar")).toBeVisible({ timeout: 30_000 });
  return errores;
}

test("una canción que ya no está: error claro y nunca «Cargando…» para siempre", async ({
  page,
}) => {
  await sembrarBiblioteca(page, [FANTASMA]);
  const errores = await abrirReproductor(page);

  await tocarFantasma(page);

  // La barra toma la canción pedida (el título sale de la ficha guardada).
  await expect(page.locator(".pm-bar__title")).toHaveText(FANTASMA_TITULO, {
    timeout: 20_000,
  });

  // ── LO QUE FALLABA ────────────────────────────────────────────────────────
  // El estado del reproductor tiene que decir QUÉ pasó. Antes esto no se escribía
  // en ninguna parte: la excepción salía por una promesa que nadie miraba.
  await expect(page.locator(".status-pill").first()).toContainText(
    "ya no está disponible",
    { timeout: 25_000 },
  );

  // Y el spinner se apaga: el invariante es que "Cargando…" nunca es un estado
  // final. Antes quedaba encendido para siempre.
  await expect(page.locator('.pm-bar__spinner[aria-label="Cargando"]')).toHaveCount(0, {
    timeout: 25_000,
  });

  // Sin excepciones sin dueño: el `TypeError` de `putSessionSong(null)` era el
  // que se llevaba puesta la carga entera.
  expect(errores).toEqual([]);
});

test("si la lista tiene una canción viva, salta a ella en vez de trabarse", async ({
  page,
}) => {
  const real = cancionReal();
  // La fantasma primero: es la que se toca, y el salto tiene que ir hacia adelante.
  await sembrarBiblioteca(page, [FANTASMA, real.id]);
  const errores = await abrirReproductor(page);

  await tocarFantasma(page);

  // El reproductor no se queda en la canción rota: sigue con la siguiente, que
  // es lo que hace con cualquier pista no disponible.
  await expect(page.locator(".pm-bar__title")).toHaveText(real.titulo, {
    timeout: 30_000,
  });

  // Y queda reproduciendo de verdad, no mostrando una canción muerta.
  await expect(page.locator('.pm-bar button[aria-label="Pausar"]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator('.pm-bar__spinner[aria-label="Cargando"]')).toHaveCount(0, {
    timeout: 25_000,
  });
  expect(errores).toEqual([]);
});
