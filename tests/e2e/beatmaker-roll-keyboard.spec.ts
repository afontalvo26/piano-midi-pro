import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true,
  isMobile: true, deviceScaleFactor: 2 });

test("teclado del roll mueve por rejilla o tick, preescucha, selecciona, borra y deshace sin llegar al piano live", async ({ page }) => {
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
    mount.id = "roll-keyboard-mount";
    document.body.append(mount);
    const note = (id, startTick, pitch) => ({ id, startTick, durationTick: 240, pitch,
      velocity: 91, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } });
    const pattern = { id: "keyboard-pattern", name: "Teclado", version: 1,
      lengthTicks: 3840, notes: [note("a", 240, 60), note("b", 720, 64)], expression: [] };
    let project = { ...createProjectDocument({ id: "keyboard-project" }), patterns: [pattern] };
    let undo = null;
    let redo = null;
    const root = ReactDOM.createRoot(mount);
    window.__keyboardPreviews = [];
    window.__leakedKeys = [];
    document.addEventListener("keydown", (event) => window.__leakedKeys.push(event.key));
    function render() {
      root.render(React.createElement(PianoRoll, { pattern: project.patterns[0],
        onCommand: (command) => { const result = applyCommand(project, command);
          project = result.document; undo = result.inverse; redo = null; render(); },
        onUndo: () => { if (!undo) return; const result = applyCommand(project, undo);
          project = result.document; redo = result.inverse; undo = null; render(); },
        onRedo: () => { if (!redo) return; const result = applyCommand(project, redo);
          project = result.document; undo = result.inverse; redo = null; render(); },
        canUndo: !!undo, canRedo: !!redo,
        onPreviewNote: (played, ownerId) => window.__keyboardPreviews.push({ played, ownerId }) }));
    }
    render();
    window.__keyboardPattern = () => project.patterns[0];
  });
  const roll = page.locator("#roll-keyboard-mount .piano-roll");
  await expect(roll).toBeVisible();
  await roll.getByRole("button", { name: "Nota siguiente" }).click();
  const status = roll.locator(".piano-roll__selection-row [role=status]");
  await expect(status).toContainText("tick 240");
  const canvas = roll.locator(".piano-roll__canvas");
  await canvas.focus();
  await canvas.press("ArrowRight");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes[0].startTick)).toBe(480);
  await canvas.press("Alt+ArrowRight");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes[0].startTick)).toBe(481);
  await canvas.press("Control+z");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes[0].startTick)).toBe(480);
  await canvas.press("Control+Shift+z");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes[0].startTick)).toBe(481);
  await canvas.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPreviews.length)).toBe(1);
  expect(await page.evaluate(() => window.__keyboardPreviews[0].played.pitch)).toBe(60);
  await canvas.press("Escape");
  await expect(status).toHaveText("0 notas seleccionadas");
  await canvas.press("Control+a");
  await expect(status).toHaveText("2 notas seleccionadas");
  await canvas.press("Delete");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes.length)).toBe(0);
  await canvas.press("Control+z");
  await expect.poll(async () => page.evaluate(() => window.__keyboardPattern().notes.length)).toBe(2);
  expect(await page.evaluate(() => window.__leakedKeys)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
