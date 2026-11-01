import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

for (const width of [320, 390]) test(`fantasmas, escala, pads y toma abierta no escriben al patrón a ${width} px`, async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    window.__padLabelsDrawn = [];
    CanvasRenderingContext2D.prototype.fillText = function(...args) {
      window.__padLabelsDrawn.push(args[0]);
      return Reflect.apply(originalFillText, this, args);
    };
    const mount = document.createElement("div");
    mount.id = "roll-overlays-mount";
    document.body.append(mount);
    const note = (id, pitch) => ({ id, startTick: 240, durationTick: 240, pitch,
      velocity: 90, releaseVelocity: 64, channel: 0, origin: { kind: "drawn" } });
    const pattern = { id: "main", name: "Main", version: 1, lengthTicks: 3840,
      notes: [note("main-note", 60)], expression: [] };
    const ghost = { id: "ghost", name: "Otra pista", version: 1, lengthTicks: 3840,
      notes: [note("ghost-note", 64)], expression: [] };
    window.__overlayPreview = [];
    window.__overlayPattern = pattern;
    ReactDOM.createRoot(mount).render(React.createElement(PianoRoll, { pattern,
      ghostPatterns: [ghost], captureOverlay: [{ ...note("open-note", 62), startTick: 6000 }],
      padNames: { 60: "Kick", 61: "Snare", 62: "Hi Hat" },
      onCommand: () => { throw new Error("Overlay no debe persistir"); },
      onPreviewNote: (played, ownerId) => { window.__overlayPreview.push({ played, ownerId }); } }));
  });
  const roll = page.locator("#roll-overlays-mount .piano-roll");
  await expect(roll).toBeVisible();
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 en grabación");
  await roll.locator(".piano-roll__pad-legend summary").click();
  await expect(roll.locator(".piano-roll__pad-legend")).toContainText("MIDI 61Snare");
  await expect.poll(async () => page.evaluate(() => window.__padLabelsDrawn.includes("Snare") &&
    window.__padLabelsDrawn.includes("Hi Hat"))).toBe(true);
  expect(await roll.locator(".piano-roll__world").evaluate((element) => element.clientWidth)).toBeGreaterThan(700);
  const canvas = roll.locator(".piano-roll__canvas");
  await expect(canvas).toBeVisible();
  const ghostPixel = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    const viewport = element.closest(".piano-roll__viewport")!;
    const scale = window.devicePixelRatio;
    const x = Math.round((80 - viewport.scrollLeft) * scale);
    const y = Math.round(((127 - 64) * 22 - viewport.scrollTop + 10) * scale);
    return [...context.getImageData(x, y, 1, 1).data];
  });
  await roll.getByRole("button", { name: "Ocultar notas fantasma" }).click();
  await expect(roll.getByRole("button", { name: "Mostrar notas fantasma" })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const hiddenPixel = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    const viewport = element.closest(".piano-roll__viewport")!;
    const scale = window.devicePixelRatio;
    const x = Math.round((80 - viewport.scrollLeft) * scale);
    const y = Math.round(((127 - 64) * 22 - viewport.scrollTop + 10) * scale);
    return [...context.getImageData(x, y, 1, 1).data];
  });
  expect(hiddenPixel).not.toEqual(ghostPixel);
  const scalePixel = async () => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    const viewport = element.closest(".piano-roll__viewport")!;
    const scale = window.devicePixelRatio;
    const x = Math.round((173 - viewport.scrollLeft) * scale);
    const y = Math.round(((127 - 54) * 22 - viewport.scrollTop + 10) * scale);
    return [...context.getImageData(x, y, 1, 1).data];
  });
  const unmarkedScale = await scalePixel();
  await roll.getByLabel("Tipo de escala").selectOption("major");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const cMajor = await scalePixel();
  expect(cMajor).not.toEqual(unmarkedScale);
  await roll.getByLabel("Tónica de escala").selectOption("7");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await scalePixel()).not.toEqual(cMajor);
  await canvas.click({ position: { x: 20, y: 134 } });
  await expect.poll(async () => page.evaluate(() => window.__overlayPreview.length)).toBe(1);
  expect(await page.evaluate(() => window.__overlayPreview[0].played.pitch)).toBe(60);
  expect(await page.evaluate(() => window.__overlayPattern.notes.length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
