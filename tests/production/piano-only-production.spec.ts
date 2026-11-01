import { expect, test } from "@playwright/test";

test("el build sirve únicamente Studio, Pistas y Configuración", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".piano-app__instrument", { timeout: 15_000 });

  const navigation = page.getByRole("navigation", { name: "Secciones principales" });
  await expect(navigation.getByRole("button")).toHaveText(["Studio", "Pistas", "Configuración"]);
  await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
  await expect(page.locator(".piano-key-element")).toHaveCount(37);
  await expect(page.locator(".studio-workspace, .player-bar, .song-library, .game-hud, .score-viewer")).toHaveCount(0);
  await expect(page.locator(".instrument-browser__current strong")).toHaveText("Salamander Grand · natural");
  expect(requested.filter((url) => url.includes("/audio/salamander/multivelocity/"))).toEqual([]);
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await expect(page.locator(".instrument-browser__presets li")).toHaveCount(16);
  await page.getByLabel("Motor de sonido").selectOption("webaudiofont");
  await expect(page.locator(".instrument-browser__presets li")).toHaveCount(12);
  await page.getByRole("button", { name: "Cerrar instrumentos" }).click();
  await page.getByRole("button", { name: "Activar audio" }).click();
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.getByLabel("Motor de sonido").selectOption("all");
  await page.getByRole("button", { name: /Salamander Grand · 4 capas reales/ }).click();
  await expect(page.locator(".instrument-browser__current strong"))
    .toHaveText("Salamander Grand · 4 capas reales", { timeout: 90_000 });
  expect(requested.filter((url) => /\/audio\/salamander\/multivelocity\/v\d+\/.*\.ogg$/.test(url))).toHaveLength(52);

  await navigation.getByRole("button", { name: "Pistas" }).click();
  await expect(page.getByRole("heading", { name: "Pistas de tus grabaciones MIDI" })).toBeVisible();
  await navigation.getByRole("button", { name: "Configuración" }).click();
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reproducir", exact: true })).toHaveCount(0);

  expect(requested.filter((url) => /\/(demo|covers|samples|player)\//i.test(url))).toEqual([]);
});
