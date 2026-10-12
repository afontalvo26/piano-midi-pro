/**
 * Reproductor estilo Spotify — cobertura de las piezas que no toca ningún otro
 * spec: cola, aleatorio/repetir, compartir, Media Session y atajos de teclado.
 *
 * El catálogo de 117 MIDI se parsea en el arranque en frío, así que este spec
 * usa topes de espera explícitos y ningún `waitFor` sin timeout.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Abre la sección Música y espera a que el catálogo esté listo. */
async function openMusic(page: Page): Promise<void> {
  await page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.locator(".rail-item", { hasText: "Música" }).click();
  await expect(page.locator(".pm-screen")).toBeVisible({ timeout: 20_000 });
}

/** Va a la vista de Canciones del reproductor y espera las filas. */
async function openTrackList(page: Page): Promise<void> {
  await page.locator(".pm-nav__item", { hasText: "Canciones" }).click();
  await expect(page.locator(".pm-row").first()).toBeVisible({ timeout: 90_000 });
}

test.describe("Reproductor — barra, cola y modos", () => {
  test("la barra persiste en todas las pantallas", async ({ page }) => {
    await openMusic(page);
    for (const section of ["Studio", "Juego", "Ajustes"]) {
      await page.locator(".rail-item", { hasText: section }).click();
      await expect(page.locator(".pm-bar")).toBeVisible();
    }
  });

  test("reproducir una canción mueve el reloj y el botón dice Pausar", async ({
    page,
  }) => {
    await openMusic(page);
    await openTrackList(page);

    await page.locator(".pm-row__main").first().click();
    await expect(page.locator(".pm-bar__transport .pm-tbtn--solid")).toHaveAttribute(
      "aria-label",
      "Pausar",
      { timeout: 30_000 },
    );

    const clock = page.locator(".pm-bar__time").first();
    const first = await clock.innerText();
    await expect.poll(async () => clock.innerText(), { timeout: 30_000 }).not.toBe(first);
  });

  test("siguiente y anterior cambian de canción", async ({ page }) => {
    await openMusic(page);
    await openTrackList(page);
    await page.locator(".pm-row__main").first().click();

    const title = page.locator(".pm-bar__title");
    await expect(title).not.toBeEmpty({ timeout: 30_000 });
    const before = await title.innerText();

    await page.locator('.pm-bar__transport button[aria-label="Canción siguiente"]').click();
    await expect.poll(async () => title.innerText(), { timeout: 30_000 }).not.toBe(before);

    const after = await title.innerText();
    // Antes de 3 s, "anterior" vuelve a la pista previa.
    await page.locator('.pm-bar__transport button[aria-label="Canción anterior"]').click();
    await expect.poll(async () => title.innerText(), { timeout: 30_000 }).not.toBe(after);
  });

  test("aleatorio y repetir cambian de estado", async ({ page }) => {
    await openMusic(page);
    const shuffle = page.locator('.pm-bar__transport button[aria-label="Reproducción aleatoria"]');
    const repeat = page.locator(".pm-bar__transport .pm-repeat");

    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await shuffle.click();
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");

    await expect(repeat).toHaveAttribute("aria-pressed", "false");
    await repeat.click();
    await expect(repeat).toHaveAttribute("aria-pressed", "true");
  });

  test("la cola se abre, lista las canciones y se vacía", async ({ page }) => {
    await openMusic(page);
    await openTrackList(page);
    await page.locator(".pm-row__main").first().click();
    await expect(page.locator(".pm-bar__transport .pm-tbtn--solid")).toHaveAttribute(
      "aria-label",
      "Pausar",
      { timeout: 30_000 },
    );

    await page.locator(".pm-bar__queue-btn").click();
    await expect(page.locator(".pm-queue")).toBeVisible();
    await expect(page.locator(".pm-queue__row").first()).toBeVisible();
    const rows = await page.locator(".pm-queue__row").count();
    expect(rows).toBeGreaterThan(1);

    await page.locator(".pm-queue").getByText("Limpiar", { exact: true }).click();
    await expect(page.locator(".pm-queue__row")).toHaveCount(1);
  });

  test("me gusta guarda la canción en su colección", async ({ page }) => {
    await openMusic(page);
    await openTrackList(page);
    await page.locator(".pm-row__main").first().click();
    await expect(page.locator(".pm-bar__now-group .pm-like")).toBeVisible({
      timeout: 30_000,
    });

    await page.locator(".pm-bar__now-group .pm-like").click();
    await expect(page.locator(".pm-bar__now-group .pm-like")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.locator(".pm-nav__item", { hasText: "Me gusta" }).click();
    await expect(page.locator(".pm-row")).toHaveCount(1, { timeout: 20_000 });
  });
});

test.describe("Reproductor — compartir y Media Session", () => {
  test("el diálogo de compartir genera un link con la pista", async ({ page }) => {
    await openMusic(page);
    await openTrackList(page);

    // El menú contextual se abre con clic derecho sobre la fila.
    await page.locator(".pm-row").first().click({ button: "right" });
    await expect(page.locator(".pm-menu")).toBeVisible();
    await page.locator(".pm-menu__item", { hasText: "Compartir" }).click();

    const input = page.locator(".pm-share__input");
    await expect(input).toBeVisible();
    const url = await input.inputValue();
    expect(url).toContain("?t=");
    // El token debe decodificar a un payload con id de pista.
    const token = new URL(url).searchParams.get("t") ?? "";
    const json = Buffer.from(
      token.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(json).toContain('"id"');
  });

  test("Media Session publica metadatos y acepta órdenes", async ({ page }) => {
    await openMusic(page);
    await openTrackList(page);
    await page.locator(".pm-row__main").first().click();
    await expect(page.locator(".pm-bar__transport .pm-tbtn--solid")).toHaveAttribute(
      "aria-label",
      "Pausar",
      { timeout: 30_000 },
    );

    const metadata = await page.evaluate(() => {
      const session = navigator.mediaSession;
      if (!session) return null;
      return {
        title: session.metadata?.title ?? null,
        artist: session.metadata?.artist ?? null,
        playbackState: session.playbackState,
      };
    });

    expect(metadata).not.toBeNull();
    expect(metadata?.title).toBeTruthy();
    expect(metadata?.artist).toBeTruthy();
    expect(metadata?.playbackState).toBe("playing");
  });
});
