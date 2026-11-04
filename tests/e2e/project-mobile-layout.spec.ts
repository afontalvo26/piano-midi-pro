import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

test("los editores conservan controles táctiles y desplazamiento local a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).tap();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).tap();
  const noPageOverflow = async () => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
  expect(await noPageOverflow()).toBe(true);

  await page.getByRole("button", { name: "Batería", exact: true }).tap();
  const drums = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  await expect(drums.locator(".drum-rack__row")).toHaveCount(16);
  expect(await noPageOverflow()).toBe(true);

  await page.getByRole("button", { name: "Arreglo", exact: true }).tap();
  const arrangement = page.getByRole("region", { name: "Arreglo" });
  await expect(arrangement.locator(".arrangement__clip")).toHaveCount(2);
  expect(await noPageOverflow()).toBe(true);

  await arrangement.getByLabel("Nombre de sección").fill("Intro");
  await arrangement.getByRole("button", { name: "+ Crear sección" }).tap();
  await expect(arrangement.getByRole("button", { name: "Intro" })).toBeVisible();
});

test("Studio, Pistas y Configuración ofrecen controles táctiles efectivos a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).tap();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).tap();

  async function audit(view: string) {
    const result = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        "button, input, select")];
      const small = controls.filter((control) => {
        if (control.disabled) return false;
        const box = control.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.left >= innerWidth || box.right <= 0) return false;
        const target = control.matches('input[type="checkbox"]')
          ? control.closest("label") ?? control : control;
        const effective = target.getBoundingClientRect();
        return effective.width < 44 || effective.height < 44;
      }).map((control) => control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName);
      return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(result, view).toEqual({ small: [], overflow: 0 });
  }

  for (const name of ["Interpretar", "Piano roll", "Batería", "Arreglo", "Sampler",
    "Mezclador", "Grabar audio", "Exportar audio"]) {
    await page.getByRole("button", { name, exact: true }).tap();
    await audit(name);
  }
  for (const name of ["Pistas", "Configuración"]) {
    await page.getByRole("button", { name, exact: true }).tap();
    await audit(name);
  }
});
