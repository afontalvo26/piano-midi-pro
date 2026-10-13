/**
 * Cambio de canción — la barra del reproductor tiene que seguirla.
 *
 * Bug reportado por el dueño: "las canciones no se cambian correctamente, los
 * controles están dañados". Medido: al cargar un MIDI desde el input del Studio
 * la barra inferior seguía diciendo "Nada en reproducción" (y su chip "Studio",
 * el seeker y siguiente/anterior quedaban deshabilitados para siempre).
 *
 * Los tres casos de acá son los que fallaban:
 *
 *   1. cargar un MIDI en el Studio  → la barra lo muestra y su play funciona
 *   2. cargar OTRO MIDI encima      → la barra cambia, el tiempo vuelve a 0 y
 *                                     no queda audio de la anterior
 *   3. elegir en la pestaña Canciones → la barra lo toma, y cambiar a otra
 *                                     canción la reinicia desde 0
 *
 * ── La sonda de audio ─────────────────────────────────────────────────────
 * Reusa el tap de `scripts/qa-switch.mjs`: intercepta `connect(destination)`,
 * cuela un AnalyserNode y expone `window.__RMS()` en dB. El config de la suite
 * lanza Chromium con `--mute-audio` y en ese modo el navegador no llega a
 * renderizar el grafo (la sonda devolvería silencio SIEMPRE, y la aserción de
 * "no queda audio" pasaría sin probar nada — ver `verify-audio-glitches.spec.ts`).
 * Por eso este archivo lanza su propio navegador sin ese flag.
 *
 * Dos cuidados que salieron de medir, no de suponer:
 *
 *   • Los instrumentos bajan del CDN: los primeros segundos de una canción
 *     pueden sonar por debajo de -60 dB (la política de ruteo espera al sample
 *     real en vez de sintetizar). La sonda se considera "viva" cuando ve
 *     *cualquier* señal por encima de -90 dB, y sólo entonces se evalúa el
 *     silencio; si el entorno no renderiza, queda anotado en el reporte.
 *   • Detener y cambiar de canción NO cortan las notas en seco a propósito
 *     (`audioTiming.fadeOutNodeVolume` + el release propio de cada sample):
 *     se midió una cola que decae de -22 dB a silencio digital en ~5,5 s. Por
 *     eso el test exige que la salida *llegue* al silencio (una nota colgada
 *     nunca baja), en vez de exigirlo en el instante siguiente al cambio.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

test.describe.configure({ timeout: 180_000 });

test.use({
  launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
});

const DEMO_DIR = path.join(__dirname, "..", "..", "app", "public", "demo");
const SONG_A = path.join(DEMO_DIR, "Bolero_-_Besame_Mucho.kar");
const SONG_B = path.join(DEMO_DIR, "BinomioDeOro_-_El_Osito_Dormilon.kar");
const SONG_C = path.join(DEMO_DIR, "Salsa_-_Ruben_Blades_Pedro_Navaja.kar");
/** El título de un archivo subido es el nombre sin extensión. */
const TITLE_A = "Bolero_-_Besame_Mucho";
const TITLE_B = "BinomioDeOro_-_El_Osito_Dormilon";
const TITLE_C = "Salsa_-_Ruben_Blades_Pedro_Navaja";

/** Tap de salida real — copiado de `scripts/qa-switch.mjs`. */
const AUDIO_TAP = `
(() => {
  let analyser = null, buf = null;
  const ensure = (ctx) => {
    if (analyser) return analyser;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    return analyser;
  };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try { orig.call(this, ensure(this.context)); } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  };
})();
`;

/** Pico de salida (dB) muestreado durante ~1 s. */
async function peakDb(page: Page, samples = 8): Promise<number> {
  let best = -Infinity;
  for (let i = 0; i < samples; i++) {
    const value = await page.evaluate(
      () => (window as unknown as { __RMS?: () => number | null }).__RMS?.() ?? null,
    );
    if (value !== null && value > best) best = value;
    await page.waitForTimeout(120);
  }
  return best;
}

/** Umbral de "esto ya es silencio" (el ruido de fondo del entorno está muy por debajo). */
const SILENCE_DB = -70;
/** Por debajo de esto la sonda no ve nada en absoluto (entorno sin render). */
const TAP_DEAD_DB = -90;

/**
 * Espera a que la sonda vea señal: prueba que el navegador está renderizando el
 * grafo de audio y que, por lo tanto, la aserción de silencio significa algo.
 */
async function waitForLiveTap(page: Page, timeoutMs = 25_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let best = -Infinity;
  while (Date.now() < deadline) {
    const value = await peakDb(page, 2);
    if (value > best) best = value;
    if (best > TAP_DEAD_DB) return best;
    await page.waitForTimeout(200);
  }
  return best;
}

/**
 * Espera a que la salida caiga al silencio. La cola de release de la canción
 * anterior decae en unos segundos; una nota que quedó colgada no baja nunca.
 */
async function waitForSilence(page: Page, timeoutMs = 20_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -Infinity;
  while (Date.now() < deadline) {
    last = await peakDb(page, 2);
    if (last < SILENCE_DB) return last;
    await page.waitForTimeout(250);
  }
  return last;
}

/**
 * Cierra la parte de audio del test: si la sonda nunca vio señal, el entorno no
 * renderiza (queda anotado) y exigir silencio no probaría nada.
 */
async function expectSilenceAfterSwitch(page: Page, tapWasLive: boolean): Promise<void> {
  if (!tapWasLive) {
    test.info().annotations.push({
      type: "audio-tap",
      description: "sin señal: el navegador no renderiza el grafo, no se evalúa el silencio",
    });
    return;
  }
  const level = await waitForSilence(page);
  expect(
    level,
    `quedó audio sonando después del cambio (${level.toFixed(1)} dB tras 20 s)`,
  ).toBeLessThan(SILENCE_DB);
  test.info().annotations.push({
    type: "audio-tap",
    description: `silencio verificado: ${level.toFixed(1)} dB`,
  });
}

const barTitle = (page: Page) => page.locator(".pm-bar__title");
const barRange = (page: Page) => page.locator(".pm-bar__range");
const barTransport = (page: Page) => page.locator(".pm-bar__transport .pm-tbtn--solid");

/** Posición que la barra está pintando, en segundos. */
async function barPosition(page: Page): Promise<number> {
  return Number(await barRange(page).inputValue());
}

/** Carga un archivo por el input del Studio (el camino que reportó el dueño). */
async function loadInStudio(page: Page, file: string, title: string): Promise<void> {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(file);
  // El título del topbar es la señal de que el Studio ya tiene la canción nueva.
  await expect(page.locator(".title-container p")).toContainText(title, {
    timeout: 30_000,
  });
}

test.describe("La barra sigue a la canción que carga el Studio", () => {
  test("cargar un MIDI hace que la barra lo muestre y su play funcione", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    // Punto de partida: sin canción, la barra lo dice y sus controles están mudos.
    await expect(barTitle(page)).toHaveText("Nada en reproducción");
    await expect(page.locator(".pm-bar__chip", { hasText: "Studio" })).toBeDisabled();

    await loadInStudio(page, SONG_A, TITLE_A);

    // 1) La barra se entera de la canción cargada…
    await expect(barTitle(page)).toContainText(TITLE_A, { timeout: 20_000 });
    await expect(page.locator(".pm-bar__artist")).toContainText("Mis importaciones");

    // 2) …y sus controles quedan operativos.
    await expect(page.locator(".pm-bar__chip", { hasText: "Studio" })).toBeEnabled();
    await expect(
      page.locator('.pm-bar__transport button[aria-label="Canción anterior"]'),
    ).toBeEnabled();
    // "Siguiente" queda deshabilitado a propósito: cargar un archivo NO arma una
    // cola (ver BUG 5), así que no hay nada por delante que ofrecer.
    await expect(
      page.locator('.pm-bar__transport button[aria-label="Canción siguiente"]'),
    ).toBeDisabled();
    await expect(page.locator(".pm-bar__queue-count")).toHaveText("0");
    await expect
      .poll(async () => Number(await barRange(page).getAttribute("max")), {
        timeout: 15_000,
      })
      .toBeGreaterThan(1);

    // 3) El botón de la barra arranca la canción cargada…
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Reproducir");
    await barTransport(page).click();
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Pausar", {
      timeout: 30_000,
    });
    await expect
      .poll(() => barPosition(page), { timeout: 45_000 })
      .toBeGreaterThan(0.4);

    // …y el MISMO botón pausa (antes se quedaba en "Pausar" para siempre:
    // `paused` nunca volvía a false y `toggle()` llamaba a play() de nuevo).
    await barTransport(page).click();
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Reproducir", {
      timeout: 15_000,
    });
    const frozen = await barPosition(page);
    await page.waitForTimeout(900);
    expect(await barPosition(page)).toBeCloseTo(frozen, 1);
  });
});

test.describe("Cambiar de canción", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(AUDIO_TAP);
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("cargar otra canción la cambia limpia: tiempo a 0 y sin audio", async ({
    page,
  }) => {
    await loadInStudio(page, SONG_A, TITLE_A);
    await expect(barTitle(page)).toContainText(TITLE_A, { timeout: 20_000 });

    await barTransport(page).click();
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Pausar", {
      timeout: 30_000,
    });
    await expect
      .poll(() => barPosition(page), { timeout: 45_000 })
      .toBeGreaterThan(0.5);

    // La sonda tiene que estar viva, si no la aserción de silencio no probaría nada.
    const tapWasLive = (await waitForLiveTap(page)) > TAP_DEAD_DB;

    // ── el cambio ──
    await loadInStudio(page, SONG_B, TITLE_B);

    // La barra cambia a la canción nueva…
    await expect(barTitle(page)).toContainText(TITLE_B, { timeout: 20_000 });
    // …deja de decir que está sonando (la anterior se cortó)…
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Reproducir", {
      timeout: 15_000,
    });
    // …el tiempo vuelve a 0 y el seeker toma la duración de la nueva…
    await expect.poll(() => barPosition(page), { timeout: 15_000 }).toBeLessThan(0.5);
    await expect
      .poll(async () => Number(await barRange(page).getAttribute("max")), {
        timeout: 15_000,
      })
      .toBeGreaterThan(1);
    // …y no queda audio de la canción anterior.
    await expectSilenceAfterSwitch(page, tapWasLive);
  });

  test("elegir en Canciones llena la barra y cambiar reinicia desde 0", async ({
    page,
  }) => {
    // Las dos canciones entran por el input del Studio, así la pestaña
    // "Canciones" las tiene aunque el catálogo demo todavía esté parseando.
    await loadInStudio(page, SONG_A, TITLE_A);
    await loadInStudio(page, SONG_B, TITLE_B);

    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator(".lib-root")).toBeVisible({ timeout: 20_000 });

    // ── elegir la primera: la barra la tiene que tomar ──
    await page.locator(".lib-card", { hasText: TITLE_A }).locator(".lib-card__play").click();
    await expect(page.locator(".studio-workspace")).toBeVisible();
    await expect(barTitle(page)).toContainText(TITLE_A, { timeout: 20_000 });

    await barTransport(page).click();
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Pausar", {
      timeout: 30_000,
    });
    await expect
      .poll(() => barPosition(page), { timeout: 45_000 })
      .toBeGreaterThan(0.5);
    const tapWasLive = (await waitForLiveTap(page)) > TAP_DEAD_DB;

    // ── cambiar a la segunda ──
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await page.locator(".lib-card", { hasText: TITLE_B }).locator(".lib-card__play").click();
    await expect(page.locator(".studio-workspace")).toBeVisible();

    await expect(barTitle(page)).toContainText(TITLE_B, { timeout: 20_000 });
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Reproducir", {
      timeout: 15_000,
    });
    await expect.poll(() => barPosition(page), { timeout: 15_000 }).toBeLessThan(0.5);
    await expectSilenceAfterSwitch(page, tapWasLive);
  });

  test("cargar archivos no deja cola navegable: 'siguiente' no salta a la biblioteca", async ({
    page,
  }) => {
    // Escenario exacto del BUG 5 del QA: barra vacía → tres archivos por el
    // input del Studio → "siguiente". Antes la cola quedaba con la biblioteca
    // entera detrás (158 → 159 → 160 entradas) y "siguiente" pasaba a una demo
    // que el usuario nunca encoló (−22,1 dB).
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    await loadInStudio(page, SONG_A, TITLE_A);
    await loadInStudio(page, SONG_B, TITLE_B);
    await loadInStudio(page, SONG_C, TITLE_C);

    // La cola es la canción cargada y nada más.
    await expect(barTitle(page)).toContainText(TITLE_C, { timeout: 20_000 });
    await expect(page.locator(".pm-bar__queue-count")).toHaveText("0");
    await page.locator(".pm-bar__queue-btn").click();
    await expect(page.locator(".pm-queue__row")).toHaveCount(1, { timeout: 15_000 });
    await page.locator('.pm-queue button[aria-label="Cerrar la cola"]').click();

    // "Siguiente" no puede ofrecer material que nadie encoló.
    const nextButton = page.locator(
      '.pm-bar__transport button[aria-label="Canción siguiente"]',
    );
    await expect(nextButton).toBeDisabled();

    // Y si se dispara por teclado (N), no puede tener efecto destructivo:
    // antes pausaba la música ("apreté siguiente y se cortó").
    await barTransport(page).click();
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Pausar", {
      timeout: 30_000,
    });
    await page.keyboard.press("n");
    await page.waitForTimeout(1500);
    await expect(barTitle(page)).toContainText(TITLE_C);
    await expect(barTransport(page)).toHaveAttribute("aria-label", "Pausar");
  });
});
