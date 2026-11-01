import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

for (const width of [320, 390]) {
  test(`zoom y 16 pads tienen objetivos de 44 px sin overflow a ${width} px`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/");
    await page.getByRole("button", { name: "Nuevo proyecto" }).tap();
    const size = async (selector: string) => page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
    const noOverflow = async () => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
    expect(await size(".piano-roll__zoom button")).toHaveLength(2);
    for (const rect of await size(".piano-roll__zoom button")) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    expect(await noOverflow()).toBe(true);

    await page.getByRole("button", { name: "Batería", exact: true }).tap();
    const drums = page.getByRole("region", { name: "Rack de batería de 16 pads" });
    await expect(drums.getByRole("button", { name: /^Configurar / })).toHaveCount(16);
    const buttons = await size(".drum-rack__pad button[aria-label^='Configurar ']");
    expect(buttons).toHaveLength(16);
    for (const rect of buttons) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    expect(await noOverflow()).toBe(true);

    await page.getByRole("button", { name: "Arreglo", exact: true }).tap();
    await expect(page.getByRole("region", { name: "Arreglo" })).toBeVisible();
    expect(await size(".arrangement__zoom button")).toHaveLength(2);
    for (const rect of await size(".arrangement__zoom button")) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    expect(await noOverflow()).toBe(true);
  });
}
