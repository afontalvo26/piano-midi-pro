import { expect, test } from "@playwright/test";

test("16 pads visibles; un paso real se edita y deshace sin perder otros eventos", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { DrumMachine } = await import("/src/components/beatmaker/DrumMachine.tsx");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "drum-e2e-mount";
    document.body.append(mount);
    const pads = [
      { id: "kick-36", label: "Kick", midiNote: 36, channel: 9, sourceStatus: "ready", sourceCredit: "Virtuosity" },
      { id: "snare-38", label: "Snare", midiNote: 38, channel: 9, sourceStatus: "ready", sourceCredit: "Virtuosity" },
      { id: "hat-42", label: "Hat cerrado", midiNote: 42, channel: 9, sourceStatus: "ready", sourceCredit: "Virtuosity" },
      { id: "hat-46", label: "Hat abierto", midiNote: 46, channel: 9, sourceStatus: "ready", sourceCredit: "Virtuosity" },
      { id: "cowbell-56", label: "Cowbell", midiNote: 56, channel: 9, sourceStatus: "ready", sourceCredit: "Virtuosity" },
      ...Array.from({ length: 11 }, (_, index) => ({ id: `empty-${index}`, label: `Pad ${index + 6}`,
        midiNote: null, channel: 9, sourceStatus: "missing" })),
    ];
    const source = { id: "drum-e2e-pattern", name: "Ritmo propio", version: 1,
      lengthTicks: 15_360, notes: [], expression: [{ id: "cc-1", tick: 0, channel: 9, sequence: 0,
        kind: "cc", controller: 11, value: 80 }] };
    let projectDoc = { ...createProjectDocument({ id: "drum-e2e-project" }), patterns: [source] };
    let undo = null;
    let redo = null;
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
      root.render(React.createElement(DrumMachine, { pattern: projectDoc.patterns[0], pads,
        projectName: "Proyecto de prueba", trackName: "Batería", saveState: "clean",
        onCommand: apply, onUndo: undoEdit, onRedo: redoEdit, canUndo: !!undo, canRedo: !!redo }));
    }
    render();
    window.__drumE2ePattern = () => projectDoc.patterns[0];
  });

  const drums = page.locator("#drum-e2e-mount .drum-machine");
  await expect(drums).toBeVisible();
  await expect(drums.locator(".drum-machine__pad")).toHaveCount(16);
  await expect(drums.getByText("5 fuentes listas para tocar", { exact: false })).toBeVisible();
  await drums.getByRole("button", { name: /Kick, compás 1, paso 1, vacío/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes.length)).toBe(1);
  const created = await page.evaluate(() => window.__drumE2ePattern().notes[0]);
  expect(created.pitch).toBe(36);
  expect(created.startTick).toBe(0);
  expect(created.stepId).toBe("kick-36:0");
  await drums.getByLabel("Velocidad", { exact: true }).fill("112");
  await drums.getByRole("button", { name: "Aplicar valores" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes[0].velocity)).toBe(112);
  await drums.screenshot({ path: "test-results/drum-mobile.png" });
  await drums.getByRole("button", { name: "Deshacer" }).click();
  await expect(drums.getByLabel("Velocidad", { exact: true })).toHaveValue("100");
  expect(await page.evaluate(() => window.__drumE2ePattern().expression[0].value)).toBe(80);
  await drums.locator(".piano-roll__performance-fields summary").click();
  await drums.getByLabel("Microdesplazamiento · ticks").fill("12");
  await drums.getByLabel("Probabilidad · %").fill("75");
  await drums.getByLabel("Ratchet · golpes").fill("3");
  await drums.getByRole("button", { name: "Aplicar valores" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes[0].ratchetCount)).toBe(3);
  expect(await page.evaluate(() => window.__drumE2ePattern().notes[0].probability)).toBe(0.75);
  expect(await page.evaluate(() => window.__drumE2ePattern().notes[0].microOffsetTick)).toBe(12);
  await drums.getByRole("button", { name: "Deshacer" }).click();
  expect(await page.evaluate(() => window.__drumE2ePattern().notes[0].ratchetCount)).toBeUndefined();
  await drums.getByLabel("Longitud del patrón en pasos").fill("80");
  await drums.getByRole("button", { name: "Aplicar longitud" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().lengthTicks)).toBe(19_200);
  await drums.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().lengthTicks)).toBe(15_360);
  await drums.getByRole("button", { name: /Kick, compás 1, paso 2, vacío/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes.length)).toBe(2);
  await drums.getByRole("button", { name: "Prever swing" }).click();
  await expect(drums.getByRole("button", { name: "Aplicar swing" })).toBeVisible();
  expect(await page.evaluate(() => window.__drumE2ePattern().notes[1].startTick)).toBe(240);
  await drums.getByRole("button", { name: "Aplicar swing" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes[1].startTick)).toBe(270);
  await drums.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(async () => page.evaluate(() => window.__drumE2ePattern().notes[1].startTick)).toBe(240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
