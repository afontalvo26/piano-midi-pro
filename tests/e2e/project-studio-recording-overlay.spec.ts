import { expect, test } from "@playwright/test";

test("toma MIDI en curso aparece en piano roll sin persistirla como edición del patrón", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  const tempo = page.getByRole("spinbutton", { name: "Tempo inicial del proyecto" });
  await tempo.fill("90");
  await tempo.blur();
  await page.getByRole("button", { name: "Interpretar" }).click();
  await page.getByRole("button", { name: "● Grabar MIDI" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down("z");
  await page.keyboard.up("z");
  await page.getByRole("button", { name: "Piano roll" }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 en grabación", { timeout: 20_000 });
  await expect(roll.locator(".piano-roll__facts")).toContainText("0 notas");
  await page.getByRole("button", { name: "Interpretar" }).click();
  await page.getByRole("button", { name: "■ Detener grabación" }).click();
  await page.getByRole("button", { name: "Piano roll" }).click();
  await expect(roll.locator(".piano-roll__facts")).not.toContainText("en grabación");
  await expect(roll.locator(".piano-roll__facts")).toContainText("0 notas");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pistas de tus grabaciones MIDI" })
    .locator(".recorded-tracks__take")).toHaveCount(1, { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
