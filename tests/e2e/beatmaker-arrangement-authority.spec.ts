import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true,
  isMobile: true, deviceScaleFactor: 2 });

test("escena en cola no toma autoridad y al entrar sólo reemplaza sus pistas a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
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
    mount.id = "arr-authority-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const tracks = [
      { id: "piano", name: "Piano", kind: "instrument", mix },
      { id: "drums", name: "Batería", kind: "drum", mix },
      { id: "audio", name: "Voz", kind: "audio", mix },
    ];
    const patterns = [{ id: "hook", name: "Hook", version: 1, lengthTicks: 3840,
      notes: [], expression: [] }, { id: "beat", name: "Beat", version: 1,
      lengthTicks: 3840, notes: [], expression: [] }];
    const clip = (id, trackId, sourceId) => ({ id, kind: "pattern", trackId, sourceId,
      sourceVersion: 1, startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0,
      loopMode: "loop", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false });
    const documentSnapshot = { ...createProjectDocument({ id: "arr-authority-project" }),
      tracks, trackOrder: tracks.map((track) => track.id), patterns,
      clips: [clip("piano-clip", "piano", "hook"), clip("drum-clip", "drums", "beat")],
      scenes: [{ id: "scene-hook", name: "Hook en vivo", launchQuantizationTicks: 3840,
        slots: [{ id: "slot-piano", trackId: "piano", patternId: "hook" }] }] };
    let activeSceneId = null;
    let queuedSceneId = "scene-hook";
    const root = ReactDOM.createRoot(mount);
    function render() {
      root.render(React.createElement(Arrangement, { document: documentSnapshot,
        playheadTick: 0, activeSceneId, queuedSceneId, queuedStartTick: queuedSceneId ? 3840 : null,
        onCommand: () => { throw new Error("QA de lectura"); } }));
    }
    render();
    window.__arrAuthority = {
      enter: () => { activeSceneId = "scene-hook"; queuedSceneId = null; render(); },
      return: () => { activeSceneId = null; render(); },
    };
  });
  const arrangement = page.locator("#arr-authority-mount .arrangement");
  await expect(arrangement).toBeVisible();
  const rows = arrangement.locator(".arrangement__track-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.locator(".arrangement__authority")).toHaveText(["Arreglo", "Arreglo", "Arreglo"]);
  await expect(arrangement.getByText("En cola: Hook en vivo · tick 3840")).toBeVisible();
  await page.evaluate(() => window.__arrAuthority.enter());
  await expect(rows.locator(".arrangement__authority")).toHaveText(["Escena · Hook", "Arreglo", "Arreglo"]);
  await expect(rows.nth(0).locator(".arrangement__row-label")).toHaveAttribute("title",
    "Piano: escena Hook en vivo, patrón Hook");
  await expect(rows.nth(2).locator(".arrangement__row-label")).toHaveAttribute("title",
    "Voz: autoridad del arreglo");
  await expect(arrangement.getByText("Autoridad: Hook en vivo en 1 pista; las demás usan arreglo")).toBeVisible();
  await page.evaluate(() => window.__arrAuthority.return());
  await expect(rows.locator(".arrangement__authority")).toHaveText(["Arreglo", "Arreglo", "Arreglo"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
});
