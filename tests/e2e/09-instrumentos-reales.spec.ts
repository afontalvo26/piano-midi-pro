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
    // …y mientras baja, SILENCIO: la política ya no puede devolver un
    // sintetizador (era justo el sonido electrónico que se rechazó).
    expect(decisions.bassWhileLoading).toBe("wait");
    // Sin fuente real para ese nombre, tampoco se sintetiza.
    expect(decisions.congasUnmapped).toBe("none");
    // El piano acústico sigue siendo el sampler Salamander.
    expect(decisions.acousticPiano).toBe("piano-sampler");
    expect(decisions.liveInput).toBe("piano-sampler");
    // Un piano eléctrico no debe robar el sample del acústico.
    expect(decisions.electricPiano).toBe("soundfont");
    // Ningún caso devuelve osciladores.
    for (const [name, value] of Object.entries(decisions)) {
      expect(value, `${name} no puede sintetizar`).not.toBe("synth");
      expect(value, `${name} no puede usar motores de osciladores`).not.toBe(
        "engine",
      );
    }
  });
});

test.describe("Soundfonts GM — carga real desde el CDN", () => {
  test("bajo y armónica resuelven a samples reales (nunca a sintetizador)", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));

    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
    await loadFixture(page);

    // Arranca el motor de audio (y con él la precarga de instrumentos).
    await page.locator(".playback-bar .btn.primary").first().click();

    // Cada instrumento loguea a qué fuente real resolvió.
    for (const instrument of ["Acoustic Bass", "Harmonica"]) {
      await expect
        .poll(
          () =>
            logs.some((l) =>
              new RegExp(`\\[fuentes\\] "${instrument}" →`).test(l),
            ),
          {
            timeout: 60_000,
            message: `"${instrument}" no resolvió a ninguna fuente real`,
          },
        )
        .toBe(true);
    }

    // Y ninguna fuente cayó al sintetizador: el ruteo ya no puede devolverlo.
    const synthFallbacks = logs.filter((l) =>
      /se usará el sintetizador|usando sintetizador/i.test(l),
    );
    expect(
      synthFallbacks,
      `instrumentos degradados a sintetizador:\n${synthFallbacks.join("\n")}`,
    ).toEqual([]);

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
