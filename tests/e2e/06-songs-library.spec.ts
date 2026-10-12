import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// The library is populated after the curated demo MIDI files are fetched and
// parsed (a few seconds on a cold load, more when several pages parse in
// parallel), so every test needs a bigger budget than the 45s default and
// web-first assertions instead of fixed sleeps.
test.describe.configure({ timeout: 180_000 });

// Only these genres ship in app/src/constants/demoSongs.ts, rendered in
// GENRE_ORDER order (see app/src/types/song.ts). Genres with zero songs are
// omitted by the library, so this list must stay exactly the non-empty ones.
const GENRES = ["Vallenato", "Bolero", "Pop & Rock", "Clásica"];

/** Espera a que la biblioteca termine de parsear los MIDI demo. */
async function waitForLibrary(page: Page, min = 30): Promise<number> {
  await expect(page.locator(".lib-card").first()).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(
      async () => {
        const total = Number(await page.locator(".lib-hero__count").innerText());
        const cards = await page.locator(".lib-card").count();
        return total >= min && total === cards ? total : -1;
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThanOrEqual(min);
  return Number(await page.locator(".lib-hero__count").innerText());
}

test.describe("Biblioteca de Canciones", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator(".lib-root")).toBeVisible();
    await waitForLibrary(page);
  });

  test("hay al menos 30 canciones demo", async ({ page }) => {
    const total = Number(await page.locator(".lib-hero__count").innerText());
    expect(total).toBeGreaterThanOrEqual(30);
    await expect(page.locator(".lib-card")).toHaveCount(total);
  });

  test("las canciones se agrupan por género", async ({ page }) => {
    await expect(page.locator(".lib-group__label")).toHaveText(GENRES);
    // Cada grupo tiene su propia grid de tarjetas
    await expect(page.locator(".lib-grid")).toHaveCount(GENRES.length);
    const groupCounts = (
      await page.locator(".lib-group__count").allTextContents()
    ).map((n) => Number(n));
    expect(groupCounts.reduce((a, b) => a + b, 0)).toBe(
      Number(await page.locator(".lib-hero__count").innerText()),
    );
  });

  test("cada canción tiene título, artista, BPM, duración, notas y pistas", async ({
    page,
  }) => {
    const firstCard = page.locator(".lib-card").first();
    await firstCard.scrollIntoViewIfNeeded();

    await expect(firstCard.locator(".lib-card__title")).not.toBeEmpty();
    await expect(firstCard.locator(".lib-card__artist")).not.toBeEmpty();

    const meta = firstCard.locator(".lib-card__meta");
    await expect(meta).toContainText("BPM");
    await expect(meta).toContainText(/\d+:\d{2}/); // duración M:SS
    await expect(meta).toContainText("notas");
    await expect(meta).toContainText(/pistas?/);

    // …y todas las tarjetas, no sólo la primera
    const incomplete = await page.locator(".lib-card").evaluateAll((cards) =>
      cards.filter((card) => {
        const title = card.querySelector(".lib-card__title")?.textContent?.trim();
        const artist = card.querySelector(".lib-card__artist")?.textContent?.trim();
        const field = (t: string) =>
          card
            .querySelector(`.lib-card__meta-item[title="${t}"]`)
            ?.textContent?.trim() ?? "";
        return (
          !title ||
          !artist ||
          !/\dBPM/.test(field("BPM").replace(/\s+/g, "")) ||
          !/\d+:\d{2}/.test(field("Duración")) ||
          !/notas/.test(field("Notas")) ||
          !/pistas?/.test(field("Pistas"))
        );
      }).length,
    );
    expect(incomplete).toBe(0);
  });

  test("Für Elise está en la lista", async ({ page }) => {
    await expect(page.locator(".lib-card__title", { hasText: "Für Elise" })).toHaveCount(1);
  });

  test("La Gota Fría de Carlos Vives está en la lista", async ({ page }) => {
    // El demo trae además "Vallenato Clásico - La Gota Fría (vallenato)",
    // así que se busca el título completo para no ser ambiguo.
    await expect(
      page.locator(".lib-card__title", { hasText: "Carlos Vives - La Gota Fría" }),
    ).toHaveCount(1);
  });

  test("Bohemian Rhapsody está en la lista", async ({ page }) => {
    await expect(
      page.locator(".lib-card__title", { hasText: "Bohemian Rhapsody" }),
    ).toHaveCount(1);
  });

  test("las tarjetas muestran el conteo de pistas", async ({ page }) => {
    const tracks = page.locator('.lib-card__meta-item[title="Pistas"]').first();
    await expect(tracks.locator(".lib-card__meta-value")).toHaveText(/^\d+$/);
    await expect(tracks.locator(".lib-card__meta-unit")).toHaveText(/^pistas?$/);
    // Toda la biblioteca tiene al menos una pista (regresión: pistas en 0)
    const emptyTracks = await page
      .locator('.lib-card__meta-item[title="Pistas"] .lib-card__meta-value')
      .evaluateAll(
        (values) => values.filter((v) => Number(v.textContent?.trim()) === 0).length,
      );
    expect(emptyTracks).toBe(0);
  });

  test("ninguna canción demo tiene 0 notas (bug fix)", async ({ page }) => {
    // Regresión del bug histórico: canciones demo parseadas sin notas
    const emptyNotes = await page
      .locator('.lib-card__meta-item[title="Notas"] .lib-card__meta-value')
      .evaluateAll(
        (values) =>
          values.filter((v) => {
            const raw = (v.textContent ?? "").trim().replace(",", ".");
            return !raw || Number.parseFloat(raw) === 0;
          }).length,
      );
    expect(emptyNotes).toBe(0);
  });

  test("búsqueda filtra canciones", async ({ page }) => {
    const total = Number(await page.locator(".lib-hero__count").innerText());
    const searchInput = page.locator(".lib-search__input");
    await searchInput.fill("beethoven");

    await expect(page.locator(".lib-card")).toHaveCount(2);
    expect(2).toBeLessThan(total);
    await expect(
      page.locator(".lib-card__title", { hasText: /Beethoven/i }).first(),
    ).toBeVisible();
  });

  test("búsqueda sin resultados vacía la grid", async ({ page }) => {
    const searchInput = page.locator(".lib-search__input");
    await searchInput.fill("xyzxyz123noexiste");

    await expect(page.locator(".lib-card")).toHaveCount(0);
    await expect(page.locator(".lib-empty__title")).toBeVisible();
  });

  test("limpiar búsqueda muestra todas las canciones", async ({ page }) => {
    const total = Number(await page.locator(".lib-hero__count").innerText());
    const searchInput = page.locator(".lib-search__input");

    await searchInput.fill("queen");
    await expect(page.locator(".lib-card")).toHaveCount(1);

    await searchInput.fill("");
    await expect(page.locator(".lib-card")).toHaveCount(total);
  });

  test("filtrar por género muestra solo ese género", async ({ page }) => {
    const total = Number(await page.locator(".lib-hero__count").innerText());
    const vallenatoPill = page.locator(".lib-genre-pill", { hasText: "Vallenato" });
    await expect(vallenatoPill).toHaveAttribute("aria-pressed", "false");

    await vallenatoPill.click();
    await expect(vallenatoPill).toHaveAttribute("aria-pressed", "true");

    // Sólo quedan tarjetas de Vallenato y se ocultan las cabeceras de grupo
    await expect(page.locator(".lib-card").first()).toBeVisible();
    const badges = await page.locator(".lib-card__badge-label").allTextContents();
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.length).toBeLessThan(total);
    expect([...new Set(badges)]).toEqual(["Vallenato"]);
    await expect(page.locator(".lib-group__head")).toHaveCount(0);

    await page.locator(".lib-genre-pill", { hasText: "Todos" }).click();
    await expect(page.locator(".lib-card")).toHaveCount(total);
    await expect(page.locator(".lib-group__head")).toHaveCount(GENRES.length);
  });

  test("botón 'Tocar' carga la canción y navega al Studio", async ({ page }) => {
    const firstCard = page.locator(".lib-card").first();
    const title = (await page.locator(".lib-card__title").first().textContent())?.trim();
    expect(title).toBeTruthy();
    await expect(firstCard.locator(".lib-card__play")).toHaveText("Tocar");

    await firstCard.locator(".lib-card__play").click();
    await page.waitForTimeout(200);
    await expect(page.locator(".studio-workspace")).toBeVisible();
    await expect(page.locator(".title-container p")).toContainText(title!);
  });

  test("cargar 'Für Elise' actualiza el título en el topbar", async ({ page }) => {
    const searchInput = page.locator(".lib-search__input");
    await searchInput.fill("Für Elise");

    const eliseCard = page.locator(".lib-card", { hasText: "Für Elise" });
    await expect(eliseCard).toHaveCount(1);
    await eliseCard.locator(".lib-card__play").click();

    await expect(page.locator(".studio-workspace")).toBeVisible();
    const topbar = page.locator(".title-container p");
    await expect(topbar).toContainText("Für Elise");
    await expect(topbar).not.toContainText("Sin canción cargada");
  });

  test("importPanel visible en pantalla Canciones", async ({ page }) => {
    // Sección de importación colapsable de la biblioteca
    const importSection = page.locator(".lib-import");
    await expect(importSection).toBeVisible();
    const toggle = importSection.locator(".lib-import__toggle");
    await expect(toggle).toContainText("Subir tu propio MIDI o partitura");

    if ((await toggle.getAttribute("aria-expanded")) === "false") {
      await toggle.click();
    }
    await expect(importSection.locator(".import-panel")).toBeVisible();
    await expect(importSection.locator(".import-dropzone")).toBeVisible();
  });
});
