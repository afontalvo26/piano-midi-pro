import { expect, test } from "@playwright/test";

test("tres secciones consecutivas conservan el siguiente nombre durante guardado asíncrono", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "arrangement-race-mount";
    document.body.append(mount);
    let project = createProjectDocument({ id: "arr-race" });
    const root = ReactDOM.createRoot(mount);
    const render = () => root.render(React.createElement(Arrangement, {
      document: project, playheadTick: 0,
      onCommand: async (command) => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        project = applyCommand(project, command).document;
        render();
      },
    }));
    render();
    window.__arrRaceSnapshot = () => project;
  });
  const arrangement = page.locator("#arrangement-race-mount .arrangement");
  await expect(arrangement).toBeVisible();
  const name = arrangement.getByLabel("Nombre de sección");
  const start = arrangement.getByLabel("Inicio de sección");
  const length = arrangement.getByLabel("Duración de sección");
  const create = arrangement.getByRole("button", { name: "+ Crear sección" });
  await length.fill("960");
  await name.fill("Intro");
  await start.fill("0");
  await create.click();
  await name.fill("Verso");
  await expect.poll(async () => page.evaluate(() => window.__arrRaceSnapshot().sections.length)).toBe(1);
  await expect(name).toHaveValue("Verso");
  await expect(create).toBeEnabled();
  await start.fill("960");
  await create.click();
  await name.fill("Hook");
  await expect.poll(async () => page.evaluate(() => window.__arrRaceSnapshot().sections.length)).toBe(2);
  await expect(name).toHaveValue("Hook");
  await expect(create).toBeEnabled();
  await start.fill("1920");
  await create.click();
  await expect.poll(async () => page.evaluate(() => window.__arrRaceSnapshot().sections.length)).toBe(3);
  expect(await page.evaluate(() => window.__arrRaceSnapshot().sections.map((section) => section.name)))
    .toEqual(["Intro", "Verso", "Hook"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
