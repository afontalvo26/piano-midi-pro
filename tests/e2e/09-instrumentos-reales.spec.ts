/**
 * Instrumentos reales — el bug que rompió el reproductor.
 *
 * Historia: `GMSamplerEngine` apuntaba a `midi.js-soundfonts` (con punto) en vez
 * de `midi-js-soundfonts`. Todo soundfont daba 404, el error se tragaba el
 * `catch` y CADA pista no-piano caía a los motores de síntesis: los bajos
 * sonaban a growl de sawtooth y la armónica a una sirena. Además, aun con los
 * soundfonts sanos, el ruteo de `triggerAttack` probaba los motores ANTES que
 * el sample, así que "bass"/"guitar" nunca llegaban al instrumento real.
 *
 * Estos tests cubren las dos mitades: la política de ruteo (función pura) y la
 * carga real de samples contra el CDN. Si alguien vuelve a romper cualquiera de
 * las dos, acá se cae.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

test.describe.configure({ timeout: 180_000 });

/** Piano Man trae bajo acústico + armónica + órgano + accordion + banjo. */
const MIDI_FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "app",
  "public",
  "demo",
  "Billy_Joel_-_Piano_Man.mid",
);

/**
 * Vallenato con canal 10 (bombo/cajón, congas, bongos, shaker, güiro…): es el
 * caso que estaba mudo porque el parser DESCARTABA la pista de percusión.
 */
const PERCUSSION_FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "app",
  "public",
  "demo",
  "BinomioDeOro_-_El_Osito_Dormilon.kar",
);

/** Instrumentos que el fixture debe cargar como sample real. */
const EXPECTED_SOUNDFONTS = [
  { instrument: "Acoustic Bass", file: "acoustic_bass" },
  { instrument: "Harmonica", file: "harmonica" },
];

async function loadFixture(page: Page, file: string = MIDI_FIXTURE): Promise<void> {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(file);
  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator(".seeker-container input[type=range]")
            .getAttribute("max"),
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

test.describe("Ruteo de audio — el sample real gana", () => {
  test("la política manda cada instrumento a su fuente correcta", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    // El router es una función pura: se puede ejercitar sin audio ni red.
    const decisions = await page.evaluate(async () => {
      const spec = "/src/utils/playbackRouting.ts";
      const mod = await import(/* @vite-ignore */ spec);
      const choose = mod.choosePlaybackSource as (input: {
        instrument: string;
        trackIndex: number;
        isPianoSamplerActive: boolean;
        samplerStatus: string;
      }) => string;

      return {
        bassLoaded: choose({
          instrument: "Acoustic Bass",
          trackIndex: 1,
          isPianoSamplerActive: true,
          samplerStatus: "loaded",
        }),
        harmonicaLoaded: choose({
          instrument: "Harmonica",
          trackIndex: 5,
          isPianoSamplerActive: true,
          samplerStatus: "loaded",
        }),
        guitarLoaded: choose({
          instrument: "Electric Guitar (clean)",
          trackIndex: 2,
          isPianoSamplerActive: true,
          samplerStatus: "loaded",
        }),
        bassWhileLoading: choose({
          instrument: "Acoustic Bass",
          trackIndex: 1,
          isPianoSamplerActive: true,
          samplerStatus: "loading",
        }),
        // Percusión latina: sin soundfont GM, la cubre el motor especializado.
        congasUnmapped: choose({
          instrument: "Congas",
          trackIndex: 3,
          isPianoSamplerActive: true,
          samplerStatus: "unmapped",
        }),
        acousticPiano: choose({
          instrument: "Acoustic Grand Piano",
          trackIndex: 0,
          isPianoSamplerActive: true,
          samplerStatus: "loaded",
        }),
        // Un Rhodes NO es el piano acústico: tiene su propio soundfont.
        electricPiano: choose({
          instrument: "Electric Piano 2",
          trackIndex: 4,
          isPianoSamplerActive: true,
          samplerStatus: "loaded",
        }),
        liveInput: choose({
          instrument: "Acoustic Grand Piano",
          trackIndex: -1,
          isPianoSamplerActive: true,
          samplerStatus: "unmapped",
        }),
      };
    });

    // El sample real gana siempre que esté cargado…
    expect(decisions.bassLoaded).toBe("soundfont");
    expect(decisions.harmonicaLoaded).toBe("soundfont");
    expect(decisions.guitarLoaded).toBe("soundfont");
    // …y mientras baja suena el sintetizador neutro, nunca el motor de arco.
    expect(decisions.bassWhileLoading).toBe("synth");
    // Sin soundfont para ese nombre, el motor especializado.
    expect(decisions.congasUnmapped).toBe("engine");
    // El piano acústico sigue siendo el sampler Salamander.
    expect(decisions.acousticPiano).toBe("piano-sampler");
    expect(decisions.liveInput).toBe("piano-sampler");
    // Un piano eléctrico no debe robar el sample del acústico.
    expect(decisions.electricPiano).toBe("soundfont");
  });
});

test.describe("Soundfonts GM — carga real desde el CDN", () => {
  test("bajo y armónica cargan samples reales y no el sintetizador", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));

    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
    await loadFixture(page);

    // Arranca el motor de audio (y con él la precarga de instrumentos).
    await page.locator(".playback-bar .btn.primary").first().click();

    for (const { file } of EXPECTED_SOUNDFONTS) {
      await expect
        .poll(() => logs.some((l) => l.includes(`✅ ${file} loaded and READY`)), {
          timeout: 90_000,
          message: `"${file}" nunca terminó de cargar desde el CDN de soundfonts`,
        })
        .toBe(true);
    }

    // Ninguna degradación silenciosa a síntesis.
    const failures = logs.filter((l) => l.includes("No se pudo cargar"));
    expect(failures, `soundfonts que cayeron al sintetizador:\n${failures.join("\n")}`).toEqual([]);

    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
  });
});

test.describe("Percusión (canal 10) — el ritmo que se estaba perdiendo", () => {
  test("un vallenato carga piezas de percusión reales", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));

    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
    await loadFixture(page, PERCUSSION_FIXTURE);

    await page.locator(".playback-bar .btn.primary").first().click();

    // El DrumKitEngine loguea cada pieza que consigue con sample real.
    await expect
      .poll(
        () => logs.filter((l) => l.startsWith("[DrumKit] nota ")).length,
        {
          timeout: 90_000,
          message: "la percusión del canal 10 nunca cargó samples",
        },
      )
      .toBeGreaterThanOrEqual(4);

    // Y al menos las piezas del ritmo traen varios golpes distintos
    // (round-robin) en vez de un sample repetido: repetir el mismo golpe en
    // 16avos suena a ametralladora. Se sondea porque la carga es asíncrona.
    await expect
      .poll(
        () =>
          logs.filter((l) => /\[DrumKit\] nota .*: [2-9] golpe/.test(l)).length,
        {
          timeout: 90_000,
          message: `piezas sin round-robin:\n${logs
            .filter((l) => l.startsWith("[DrumKit]"))
            .join("\n")}`,
        },
      )
      .toBeGreaterThanOrEqual(2);

    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
  });
});
