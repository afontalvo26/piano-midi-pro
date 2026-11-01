import { expect, test } from "@playwright/test";

test("operaciones y carriles MIDI editan patrón propio y deshacen a 390 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "roll-operations-mount";
    document.body.append(mount);
    const note = (id, tick, pitch) => ({ id, startTick: tick, durationTick: 240,
      pitch, velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } });
    const pattern = { id: "operations-pattern", name: "Hook", version: 1, lengthTicks: 3840,
      notes: [note("a", 241, 60), note("b", 480, 60), note("c", 960, 64)], expression: [] };
    let projectDoc = { ...createProjectDocument({ id: "operations-project" }), patterns: [pattern] };
    let undo = null;
    let redo = null;
    const root = ReactDOM.createRoot(mount);
    const apply = (command) => {
      const result = applyCommand(projectDoc, command);
      projectDoc = result.document; undo = result.inverse; redo = null; render();
    };
    const undoEdit = () => {
      if (!undo) return;
      const result = applyCommand(projectDoc, undo);
      projectDoc = result.document; redo = result.inverse; undo = null; render();
    };
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: projectDoc.patterns[0], playheadTick: 480,
        onCommand: apply, onUndo: undoEdit, canUndo: !!undo, canRedo: !!redo }));
    }
    render();
    window.__operationsPattern = () => projectDoc.patterns[0];
  });
  const roll = page.locator("#roll-operations-mount .piano-roll");
  await expect(roll).toBeVisible();
  await roll.getByRole("button", { name: "Nota siguiente" }).click();
  await expect(roll.getByRole("status").filter({ hasText: "tick 241" })).toBeVisible();
  await roll.locator(".piano-roll__operations summary").click();
  await roll.getByRole("button", { name: "Duplicar +240 ticks" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes.length)).toBe(4);
  const copied = await page.evaluate(() => window.__operationsPattern().notes.at(-1));
  expect(copied.startTick).toBe(481);
  expect(copied.id).not.toBe("a");
  await roll.getByRole("button", { name: "Copiar", exact: true }).click();
  await roll.getByLabel("Tick de pegado").fill("1440");
  await roll.getByRole("button", { name: /Pegar 1 notas/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes.length)).toBe(5);
  expect(await page.evaluate(() => window.__operationsPattern().notes.at(-1).startTick)).toBe(1440);
  await roll.getByRole("button", { name: "Silenciar notas" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes.at(-1).muted)).toBe(true);
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes.at(-1).muted)).toBeUndefined();
  await roll.locator(".piano-roll__canvas").focus();
  await page.keyboard.press("Control+a");
  await roll.getByRole("button", { name: "Prever cuantización" }).click();
  await expect(roll.getByRole("button", { name: "Aplicar cuantización" })).toBeVisible();
  expect(await page.evaluate(() => window.__operationsPattern().notes[0].startTick)).toBe(241);
  await roll.getByRole("button", { name: "Aplicar cuantización" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes[0].startTick)).toBe(240);
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().notes[0].startTick)).toBe(241);

  await roll.getByLabel("Tipo de carril").selectOption("cc");
  await roll.getByLabel("Tick de evento MIDI").fill("0");
  await roll.getByLabel("Valor de evento MIDI").fill("82");
  await roll.getByRole("button", { name: "Añadir evento" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().expression.length)).toBe(1);
  expect(await page.evaluate(() => window.__operationsPattern().expression[0].controller)).toBe(11);
  await roll.getByLabel("Tipo de carril").selectOption("pitchBend");
  await roll.getByLabel("Tick de evento MIDI").fill("120");
  await roll.getByLabel("Valor de evento MIDI").fill("9000");
  await roll.getByRole("button", { name: "Añadir evento" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().expression.length)).toBe(2);
  await expect(roll.getByText("bend compartido por canal MIDI 1.0")).toBeVisible();
  await roll.getByLabel("Valor de evento MIDI").fill("8192");
  await roll.getByRole("button", { name: "Aplicar evento" }).click();
  await expect.poll(async () => page.evaluate(() => window.__operationsPattern().expression[1].value14)).toBe(8192);
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect(roll.getByLabel("Valor de evento MIDI")).toHaveValue("9000");
  await page.screenshot({ path: "test-results/piano-roll-operations-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("10.000 notas permiten seleccionar cinco IDs exactos, cuantizar y deshacer", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "large-roll-operations";
    document.body.append(mount);
    const notes = Array.from({ length: 10_000 }, (_, index) => ({ id: `n-${index}`,
      startTick: index * 30, durationTick: 24, pitch: 36 + index % 48,
      velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } }));
    const pattern = { id: "large-ops", name: "10 mil propias", version: 1,
      lengthTicks: 300_100, notes, expression: [] };
    let projectDoc = { ...createProjectDocument({ id: "large-ops-project" }), patterns: [pattern] };
    let undo = null;
    const root = ReactDOM.createRoot(mount);
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: projectDoc.patterns[0],
        onCommand: (command) => { const result = applyCommand(projectDoc, command);
          projectDoc = result.document; undo = result.inverse; render(); },
        onUndo: () => { if (!undo) return; const result = applyCommand(projectDoc, undo);
          projectDoc = result.document; undo = null; render(); }, canUndo: !!undo }));
    }
    render();
    window.__largeOpsPattern = () => projectDoc.patterns[0];
  });
  const roll = page.locator("#large-roll-operations .piano-roll");
  await expect(roll).toBeVisible();
  await roll.locator(".piano-roll__operations summary").click();
  const ids = ["n-101", "n-202", "n-303", "n-404", "n-505"];
  const originals = await page.evaluate((selection) => selection.map((id) =>
    window.__largeOpsPattern().notes.find((note) => note.id === id).startTick), ids);
  await roll.getByLabel("IDs de notas para seleccionar").fill(ids.join(", "));
  await roll.getByRole("button", { name: "Seleccionar IDs" }).click();
  await expect(roll.locator(".piano-roll__selection-row [role=status]")).toHaveText("5 notas seleccionadas");
  await roll.getByRole("button", { name: "Prever cuantización" }).click();
  await roll.getByRole("button", { name: "Aplicar cuantización" }).click();
  await expect.poll(async () => page.evaluate((selection) => selection.map((id) =>
    window.__largeOpsPattern().notes.find((note) => note.id === id).startTick), ids))
    .not.toEqual(originals);
  await roll.getByRole("button", { name: "Deshacer" }).click();
  expect(await page.evaluate((selection) => selection.map((id) =>
    window.__largeOpsPattern().notes.find((note) => note.id === id).startTick), ids)).toEqual(originals);
  expect(await roll.locator("[data-note-id]").count()).toBe(0);
});
