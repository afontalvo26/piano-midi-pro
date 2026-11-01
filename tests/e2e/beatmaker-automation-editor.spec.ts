import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true, isMobile: true });

test("AUT editor táctil crea, edita, copia, pega y deshace puntos exactos a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { AutomationEditor } = await import("/src/components/beatmaker/AutomationEditor.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "aut-editor-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "piano", name: "Piano", kind: "instrument", mix };
    let project = { ...createProjectDocument({ id: "aut-ui", at: 1000 }),
      tracks: [track], trackOrder: [track.id] };
    const availableTargets = [
      { scope: "track", ownerId: track.id, parameterId: "gainDb" },
      { scope: "track", ownerId: track.id, parameterId: "pan" },
      { scope: "master", parameterId: "masterGainDb" },
    ];
    let inverse = null;
    let redo = null;
    let ready = false;
    const root = ReactDOM.createRoot(mount);
    const render = () => root.render(React.createElement(AutomationEditor, {
      document: project, availableTargets, readPlaybackReady: ready,
      playheadTick: 0, canUndo: !!inverse, canRedo: !!redo,
      onCommand: (command) => {
        const result = applyCommand(project, command);
        project = result.document; inverse = result.inverse; redo = null; render();
      },
      onUndo: () => {
        if (!inverse) return;
        const result = applyCommand(project, inverse);
        project = result.document; redo = result.inverse; inverse = null; render();
      },
      onRedo: () => {
        if (!redo) return;
        const result = applyCommand(project, redo);
        project = result.document; inverse = result.inverse; redo = null; render();
      },
    }));
    render();
    window.__autEditorE2e = { snapshot: () => project, ready: () => { ready = true; render(); },
      insertUnknown: () => { project = { ...project, automation: [...project.automation,
        { id: "retired", target: { scope: "track", ownerId: track.id,
          parameterId: "retiredParameter" }, points: [{ id: "retired-point", tick: 0,
          value: 5, shape: "step" }] }] }; render(); } };
  });

  await expect(page.getByRole("region", { name: "Automatización" })).toHaveCount(0);
  await page.evaluate(() => window.__autEditorE2e.ready());
  const editor = page.getByRole("region", { name: "Automatización" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Crear curva" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation.length)).toBe(1);
  await editor.getByRole("spinbutton", { name: "Tick", exact: true }).fill("0");
  await editor.getByRole("spinbutton", { name: "Valor · dB" }).fill("-6");
  await editor.getByRole("button", { name: "Añadir punto" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(1);
  await editor.getByRole("spinbutton", { name: "Tick", exact: true }).fill("960");
  await editor.getByRole("spinbutton", { name: "Valor · dB" }).fill("0");
  await editor.getByRole("button", { name: "Añadir punto" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(2);
  await editor.getByRole("button", { name: "Dibujar / mover" }).tap();
  const canvas = editor.locator(".automation-editor__canvas");
  await canvas.tap({ position: { x: 103, y: 83 } });
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(3);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 161, bounds!.y + 61);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 176, bounds!.y + 61, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points
    .find((point) => point.value === 0)?.tick)).toBe(1080);
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points
    .find((point) => point.value === 0)?.tick)).toBe(960);
  await editor.getByRole("spinbutton", { name: "Inicio · tick" }).fill("0");
  await editor.getByRole("spinbutton", { name: "Fin · tick" }).fill("961");
  await editor.getByRole("button", { name: "Seleccionar tramo" }).tap();
  await expect(editor.getByText("3 puntos seleccionados")).toBeVisible();
  await editor.getByRole("button", { name: "Copiar puntos" }).tap();
  await editor.getByRole("spinbutton", { name: "Tick para pegar automatización" }).fill("1920");
  await editor.getByRole("button", { name: "Pegar 3 puntos" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(6);
  const pasted = await page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points);
  expect(pasted.slice(3).map((point) => point.tick)).toEqual(
    pasted.slice(0, 3).map((point) => point.tick + 1920));
  await editor.getByRole("button", { name: "Deshacer" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(3);
  await editor.getByRole("button", { name: "Rehacer" }).tap();
  await expect.poll(async () => page.evaluate(() => window.__autEditorE2e.snapshot().automation[0].points.length)).toBe(6);
  await page.evaluate(() => window.__autEditorE2e.insertUnknown());
  await editor.getByRole("combobox", { name: "Curva de automatización" }).selectOption("retired");
  await expect(editor.getByText(/se conserva sin cambios/)).toBeVisible();
  await expect(editor.getByRole("button", { name: "Añadir punto" })).toHaveCount(0);
  const tiny = await editor.locator("button, select, input").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
    }).map((element) => ({ text: element.textContent, size: element.getBoundingClientRect().toJSON() })));
  expect(tiny).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
