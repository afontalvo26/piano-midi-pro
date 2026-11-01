import { expect, test } from "@playwright/test";

test("piano roll móvil crea y edita una nota con ticks exactos, y deshace", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const firstPattern = { id: "roll-e2e-pattern", name: "Patrón propio", version: 1,
      lengthTicks: 15_360, notes: [], expression: [] };
    let projectDoc = { ...createProjectDocument({ id: "roll-e2e-project" }), patterns: [firstPattern] };
    let undo = null;
    let redo = null;
    const mount = document.createElement("div");
    mount.id = "roll-e2e-mount";
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.body.append(mount);
    const root = ReactDOM.createRoot(mount);
    const apply = (command) => {
      const result = applyCommand(projectDoc, command);
      projectDoc = result.document;
      undo = result.inverse;
      redo = null;
      render();
    };
    const undoEdit = () => {
      if (!undo) return;
      const result = applyCommand(projectDoc, undo);
      projectDoc = result.document;
      redo = result.inverse;
      undo = null;
      render();
    };
    const redoEdit = () => {
      if (!redo) return;
      const result = applyCommand(projectDoc, redo);
      projectDoc = result.document;
      undo = result.inverse;
      redo = null;
      render();
    };
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: projectDoc.patterns[0],
        projectName: "Proyecto de prueba", trackName: "Piano", saveState: "clean",
        onCommand: apply, onUndo: undoEdit, onRedo: redoEdit, canUndo: !!undo, canRedo: !!redo }));
    }
    render();
    window.__rollE2ePattern = () => projectDoc.patterns[0];
  });

  const roll = page.locator("#roll-e2e-mount .piano-roll");
  await expect(roll).toBeVisible();
  await roll.getByRole("button", { name: "Dibujar" }).click();
  await roll.locator(".piano-roll__canvas").click({ position: { x: 124, y: 90 } });
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  const created = await page.evaluate(() => window.__rollE2ePattern().notes[0]);
  expect(created.id).toBeTruthy();
  expect(created.startTick % 240).toBe(0);
  await roll.getByRole("button", { name: /Inspector/ }).click();
  await roll.getByLabel("Inicio · tick").fill("241");
  await roll.getByLabel("Velocidad", { exact: true }).fill("111");
  await roll.getByRole("button", { name: "Aplicar valores" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rollE2ePattern().notes[0].startTick)).toBe(241);
  const edited = await page.evaluate(() => window.__rollE2ePattern().notes[0]);
  expect(edited.id).toBe(created.id);
  expect(edited.velocity).toBe(111);
  await roll.screenshot({ path: testInfo.outputPath("piano-roll-mobile.png") });
  await page.screenshot({ path: testInfo.outputPath("piano-roll-full-mobile.png"), fullPage: true });
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__rollE2ePattern().notes[0].startTick)).toBe(created.startTick);
  await expect(roll.getByLabel("Inicio · tick")).toHaveValue(String(created.startTick));
  await expect(roll.getByLabel("Velocidad", { exact: true })).toHaveValue(String(created.velocity));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("10.000 notas se pintan en canvas sin 10.000 nodos ni desbordar a 200 %", async ({ page }, testInfo) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.documentElement.style.zoom = "2";
    const mount = document.createElement("div");
    mount.id = "roll-e2e-mount";
    document.body.append(mount);
    const notes = Array.from({ length: 10_000 }, (_, index) => ({
      id: `note-${index}`, startTick: index * 30, durationTick: 24, pitch: 36 + index % 48,
      velocity: 80, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" },
    }));
    const pattern = { id: "roll-large", name: "10 mil notas", version: 1,
      lengthTicks: 300_100, notes, expression: [] };
    ReactDOM.createRoot(mount).render(React.createElement(PianoRoll, { pattern, onCommand: () => {} }));
  });
  const roll = page.locator("#roll-e2e-mount .piano-roll");
  await expect(roll).toBeVisible();
  expect(await roll.locator(".piano-roll__canvas").count()).toBe(1);
  expect(await roll.locator(".piano-roll__lane-canvas").count()).toBe(1);
  expect(await roll.locator("[data-note-id]").count()).toBe(0);
  await roll.locator(".piano-roll__viewport").evaluate(async (element: HTMLElement) => {
    element.scrollLeft = 12_000;
    element.scrollTop = 1_000;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await roll.screenshot({ path: testInfo.outputPath("piano-roll-mobile-200.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
