import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true,
  isMobile: true, deviceScaleFactor: 2 });

test("10.000 notas: preview se invalida al cambiar parámetros o selección y una cola no se recorta", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "preview-tail-mount";
    document.body.append(mount);
    const notes = [{ id: "tail", startTick: 245_680, durationTick: 480, pitch: 60,
      velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "captured" } },
    ...Array.from({ length: 9999 }, (_, index) => ({ id: `n-${index}`,
      startTick: index * 24, durationTick: 48, pitch: 36 + index % 48,
      velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } }))];
    const pattern = { id: "preview-tail", name: "Toma con cola", version: 1,
      lengthTicks: 245_760, notes, expression: [] };
    let project = { ...createProjectDocument({ id: "preview-tail-project" }), patterns: [pattern] };
    const root = ReactDOM.createRoot(mount);
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: project.patterns[0],
        onCommand: (command) => { project = applyCommand(project, command).document; render(); } }));
    }
    render();
    window.__previewTailPattern = () => project.patterns[0];
  });
  const roll = page.locator("#preview-tail-mount .piano-roll");
  await expect(roll.locator(".piano-roll__facts")).toContainText("10.000 notas");
  await roll.locator(".piano-roll__operations summary").click();
  const ids = roll.getByLabel("IDs de notas para seleccionar");
  await ids.fill("tail");
  await roll.getByRole("button", { name: "Seleccionar IDs" }).click();
  await expect(roll.getByText(/1 nota termina después del tick 245760/)).toBeVisible();
  await roll.getByRole("button", { name: "Prever cuantización" }).click();
  await expect(roll.getByRole("button", { name: "Aplicar cuantización" })).toBeVisible();
  await roll.getByLabel("Fuerza de cuantización").fill("50");
  await expect(roll.getByRole("button", { name: "Aplicar cuantización" })).toHaveCount(0);
  await roll.getByRole("button", { name: "Prever cuantización" }).click();
  await expect(roll.getByRole("button", { name: "Aplicar cuantización" })).toBeVisible();
  await ids.fill("n-1");
  await roll.getByRole("button", { name: "Seleccionar IDs" }).click();
  await expect(roll.getByRole("button", { name: "Aplicar cuantización" })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const pattern = window.__previewTailPattern();
    return [pattern.version, pattern.notes.length,
      pattern.notes.find((note) => note.id === "tail").startTick,
      pattern.notes.find((note) => note.id === "tail").durationTick];
  })).toEqual([1, 10_000, 245_680, 480]);
  expect(await roll.locator("[data-note-id]").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
