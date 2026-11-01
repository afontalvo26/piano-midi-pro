import { expect, test } from "@playwright/test";

test("arreglo móvil edita, deshace, hace único, captura escena y secciona sin controles inertes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
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
    mount.id = "arrangement-e2e-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "arr-track", name: "Piano", kind: "instrument", mix };
    const pattern = { id: "arr-pattern", name: "Hook propio", version: 1, lengthTicks: 960,
      notes: [{ id: "arr-note", startTick: 0, durationTick: 240, pitch: 60,
        velocity: 100, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } }], expression: [] };
    const clip = { id: "arr-clip", kind: "pattern", trackId: track.id, sourceId: pattern.id,
      sourceVersion: 1, startTick: 0, lengthTicks: 1920, sourceOffsetTick: 0,
      loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
    let projectDoc = { ...createProjectDocument({ id: "arr-e2e" }),
      tracks: [track], trackOrder: [track.id], patterns: [pattern], clips: [clip] };
    let undo = null;
    let redo = null;
    let activeSceneId = null;
    let queuedSceneId = null;
    let queuedStartTick = null;
    let launchTick = null;
    let performedSceneSegments = [];
    let acknowledgedPerformances = 0;
    let openedPatternId = null;
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
      root.render(React.createElement(Arrangement, { document: projectDoc, playheadTick: 480,
        onCommand: apply, onUndo: undoEdit, onRedo: redoEdit, canUndo: !!undo, canRedo: !!redo,
        onOpenPattern: (id) => { openedPatternId = id; },
        onLaunchScene: (id, tick) => { queuedSceneId = id; queuedStartTick = tick;
          launchTick = tick; render(); },
        onStopScene: () => { queuedSceneId = null; queuedStartTick = 1920; render(); },
        onPerformanceCaptured: () => { acknowledgedPerformances += 1;
          performedSceneSegments = []; render(); },
        activeSceneId, queuedSceneId, queuedStartTick, performedSceneSegments }));
    }
    render();
    window.__arrE2e = { snapshot: () => projectDoc, launchTick: () => launchTick,
      activateQueued: () => { activeSceneId = queuedSceneId; queuedSceneId = null;
        queuedStartTick = null; render(); },
      completeReturn: () => { performedSceneSegments = [{ sceneId: activeSceneId,
        startTick: launchTick, endTick: queuedStartTick }]; activeSceneId = null;
        queuedStartTick = null; render(); },
      acknowledgements: () => acknowledgedPerformances,
      openedPatternId: () => openedPatternId };
  });

  const arrangement = page.locator("#arrangement-e2e-mount .arrangement");
  await expect(arrangement).toBeVisible();
  await arrangement.locator(".arrangement__clip").first().click();
  await arrangement.getByLabel("Duración · ticks").fill("1440");
  await arrangement.getByRole("button", { name: "Aplicar cambios" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().clips[0].lengthTicks)).toBe(1440);
  await arrangement.getByRole("button", { name: "Deshacer" }).click();
  await expect(arrangement.getByLabel("Duración · ticks")).toHaveValue("1920");
  await arrangement.getByRole("button", { name: "Duplicar clip" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().clips.length)).toBe(2);
  await expect(arrangement.getByText("2 instancias de esta fuente")).toBeVisible();
  await arrangement.getByRole("button", { name: "Hacer único" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().patterns.length)).toBe(2);
  const sources = await page.evaluate(() => window.__arrE2e.snapshot().clips.map((clip) => clip.sourceId));
  expect(sources[0]).not.toBe("arr-pattern"); // the selected original became unique
  expect(sources[1]).toBe("arr-pattern");
  await arrangement.getByRole("button", { name: "Editar patrón" }).click();
  expect(await page.evaluate(() => window.__arrE2e.openedPatternId())).not.toBeNull();
  await arrangement.getByLabel("Nombre de sección").fill("Intro");
  await arrangement.getByLabel("Inicio de sección").fill("0");
  await arrangement.getByRole("button", { name: "+ Crear sección" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().sections.length)).toBe(1);
  await arrangement.locator(".arrangement__section").first().click();
  await arrangement.getByLabel("Nombre de sección seleccionada").fill("Intro largo");
  await arrangement.getByRole("button", { name: "Aplicar sección" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().sections[0].name)).toBe("Intro largo");
  await arrangement.getByRole("button", { name: "Duplicar sección y contenido" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().sections.length)).toBe(2);
  expect(await page.evaluate(() => window.__arrE2e.snapshot().clips.length)).toBeGreaterThan(2);
  await arrangement.getByLabel("Nombre de escena").fill("Hook");
  await arrangement.getByRole("button", { name: "Capturar clips del cabezal" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().scenes.length)).toBe(1);
  await arrangement.getByRole("button", { name: "Editar", exact: true }).click();
  await arrangement.getByLabel("Nombre de escena seleccionada").fill("Hook nuevo");
  await arrangement.getByLabel("Cuantización de escena seleccionada").fill("960");
  await arrangement.getByRole("button", { name: "Aplicar escena" }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().scenes[0].name)).toBe("Hook nuevo");
  await arrangement.getByRole("button", { name: "Lanzar" }).click();
  expect(await page.evaluate(() => window.__arrE2e.launchTick())).toBe(960);
  await expect(arrangement.getByText("En cola: Hook nuevo · tick 960")).toBeVisible();
  await expect(arrangement.getByRole("button", { name: "En cola" })).toBeDisabled();
  await expect(arrangement.getByRole("button", { name: "Borrar", exact: true })).toBeDisabled();
  await page.evaluate(() => window.__arrE2e.activateQueued());
  await expect(arrangement.getByText(/Autoridad: Hook nuevo en 1 pista; las demás usan arreglo/)).toBeVisible();
  await expect(arrangement.getByRole("button", { name: "Borrar", exact: true })).toBeDisabled();
  await arrangement.getByRole("button", { name: "Volver al arreglo" }).click();
  await expect(arrangement.getByText("En cola: arreglo · tick 1920")).toBeVisible();
  await expect(arrangement.getByRole("button", { name: "Retorno en cola" })).toBeDisabled();
  await page.evaluate(() => window.__arrE2e.completeReturn());
  await expect(arrangement.getByText("Autoridad: arreglo")).toBeVisible();
  await expect(arrangement.getByRole("button", { name: "Borrar", exact: true })).toBeEnabled();
  const clipsBeforePerformance = await page.evaluate(() => window.__arrE2e.snapshot().clips.length);
  await arrangement.getByRole("button", { name: /Volcar actuación al arreglo/ }).click();
  await expect.poll(async () => page.evaluate(() => window.__arrE2e.snapshot().clips.length))
    .toBe(clipsBeforePerformance + 1);
  expect(await page.evaluate(() => window.__arrE2e.acknowledgements())).toBe(1);
  await expect(arrangement.getByRole("button", { name: /Volcar actuación al arreglo/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("10.000 clips mantienen DOM virtual y no desbordan la página al 200 %", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "arrangement-e2e-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "track", name: "Piano", kind: "instrument", mix };
    const pattern = { id: "pattern", name: "A", version: 1, lengthTicks: 960, notes: [], expression: [] };
    const clip = { kind: "pattern", trackId: track.id, sourceId: pattern.id, sourceVersion: 1,
      lengthTicks: 960, sourceOffsetTick: 0, loopMode: "loop", tailPolicy: "cut",
      transpose: 0, gainDb: 0, muted: false };
    const projectDoc = { ...createProjectDocument({ id: "large-arr" }), tracks: [track],
      trackOrder: [track.id], patterns: [pattern], clips: Array.from({ length: 10_000 }, (_, index) =>
        ({ ...clip, id: `clip-${index}`, startTick: index * 960 })) };
    ReactDOM.createRoot(mount).render(React.createElement(Arrangement,
      { document: projectDoc, onCommand: () => { throw new Error("read-only benchmark"); } }));
  });
  const arrangement = page.locator("#arrangement-e2e-mount .arrangement");
  await expect(arrangement).toBeVisible();
  await expect.poll(async () => arrangement.locator(".arrangement__clip").count()).toBeLessThan(20);
  await page.evaluate(() => { document.body.style.zoom = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
