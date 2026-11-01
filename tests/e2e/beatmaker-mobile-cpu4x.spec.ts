import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true,
  deviceScaleFactor: 2 });

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? 0;
}

async function throttle4x(page: import("@playwright/test").Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

test("línea base CPU 4x: 10.000 puntos AUT a 320 px", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  await throttle4x(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { AutomationEditor } = await import("/src/components/beatmaker/AutomationEditor.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "aut-cpu4x-mount";
    document.body.append(mount);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "piano", name: "Piano", kind: "instrument", mix };
    const points = Array.from({ length: 10_000 }, (_, index) => ({ id: `p-${index}`,
      tick: index * 24, value: -24 + index % 48, shape: index % 2 ? "step" : "linear" }));
    const lane = { id: "aut-10k", target: { scope: "track", ownerId: track.id,
      parameterId: "gainDb" }, writeMode: "read", points };
    const project = { ...createProjectDocument({ id: "aut-10k" }),
      tracks: [track], trackOrder: [track.id], automation: [lane] };
    ReactDOM.createRoot(mount).render(React.createElement(AutomationEditor, {
      document: project, readPlaybackReady: true,
      availableTargets: [lane.target], onCommand: () => { throw new Error("Benchmark de lectura"); },
    }));
  });
  const editor = page.locator("#aut-cpu4x-mount .automation-editor");
  await expect(editor).toBeVisible();
  expect(await editor.locator("canvas").count()).toBe(2);
  expect(await editor.locator("[data-point-id]").count()).toBe(0);
  const metrics = await page.evaluate(async () => {
    const panel = document.querySelector("#aut-cpu4x-mount")!;
    const timeline = panel.querySelector<HTMLElement>(".automation-editor__timeline")!;
    const zoomIn = panel.querySelector<HTMLButtonElement>('button[aria-label="Acercar automatización"]')!;
    const zoomOut = panel.querySelector<HTMLButtonElement>('button[aria-label="Alejar automatización"]')!;
    const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())));
    const gaps: number[] = [];
    let active = true;
    let previous = 0;
    function frame(stamp: number) {
      if (previous) gaps.push(stamp - previous);
      previous = stamp;
      if (active) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const scrollMs: number[] = [];
    const zoomMs: number[] = [];
    for (let index = 0; index < 20; index++) {
      const start = performance.now();
      timeline.scrollLeft += 180;
      await twoFrames();
      scrollMs.push(performance.now() - start);
    }
    for (let index = 0; index < 10; index++) {
      const start = performance.now();
      (index % 2 ? zoomOut : zoomIn).click();
      await twoFrames();
      zoomMs.push(performance.now() - start);
    }
    const startInput = panel.querySelector<HTMLInputElement>('input[aria-label="Inicio · tick"]');
    const endInput = panel.querySelector<HTMLInputElement>('input[aria-label="Fin · tick"]');
    // Labels wrap the inputs; dispatching input keeps React's controlled state in sync.
    const setValue = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const startField = startInput ?? [...panel.querySelectorAll<HTMLInputElement>("input")]
      .find((input) => input.parentElement?.textContent?.includes("Inicio · tick"))!;
    const endField = endInput ?? [...panel.querySelectorAll<HTMLInputElement>("input")]
      .find((input) => input.parentElement?.textContent?.includes("Fin · tick"))!;
    setValue(startField, "12000"); setValue(endField, "12120");
    await twoFrames();
    const button = [...panel.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent === "Seleccionar tramo")!;
    const selection = panel.querySelector<HTMLElement>(".automation-editor__selection")!;
    const start = performance.now();
    button.click();
    for (let attempt = 0; attempt < 60 && !selection.textContent?.includes("5 puntos"); attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const selectFiveMs = performance.now() - start;
    active = false;
    return { gaps, scrollMs, zoomMs, selectFiveMs, selected: selection.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  expect(metrics.selected).toContain("5 puntos seleccionados");
  expect(metrics.overflow).toBe(false);
  console.log(`AUT_CPU4X ${JSON.stringify({ points: 10_000, width: 320, cpuThrottle: 4,
    frameGapP50Ms: percentile(metrics.gaps, 0.5), frameGapP95Ms: percentile(metrics.gaps, 0.95),
    scrollPaintP50Ms: percentile(metrics.scrollMs, 0.5),
    scrollPaintP95Ms: percentile(metrics.scrollMs, 0.95),
    zoomPaintP50Ms: percentile(metrics.zoomMs, 0.5),
    zoomPaintP95Ms: percentile(metrics.zoomMs, 0.95),
    selectFiveMs: metrics.selectFiveMs })}`);
});

test("línea base CPU 4x: 10.000 notas ROL a 320 px", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  await throttle4x(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "roll-cpu4x-mount";
    document.body.append(mount);
    const notes = Array.from({ length: 10_000 }, (_, index) => ({ id: `n-${index}`,
      startTick: index * 24, durationTick: 48, pitch: 48 + index % 37,
      velocity: 60 + index % 60, releaseVelocity: 64, channel: 0,
      origin: { kind: "drawn" } }));
    const pattern = { id: "roll-10k", name: "Carga móvil", version: 1,
      lengthTicks: 245_760, notes, expression: [] };
    ReactDOM.createRoot(mount).render(React.createElement(PianoRoll, { pattern,
      onCommand: () => { throw new Error("Benchmark de lectura"); } }));
  });
  const roll = page.locator("#roll-cpu4x-mount .piano-roll");
  await expect(roll).toBeVisible();
  await expect(roll.locator(".piano-roll__facts")).toContainText("10.000 notas");
  const metrics = await page.evaluate(async () => {
    const panel = document.querySelector("#roll-cpu4x-mount")!;
    const viewport = panel.querySelector<HTMLElement>(".piano-roll__viewport")!;
    const zoomIn = panel.querySelector<HTMLButtonElement>('button[aria-label="Acercar"]')!;
    const zoomOut = panel.querySelector<HTMLButtonElement>('button[aria-label="Alejar"]')!;
    const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())));
    const gaps: number[] = [];
    let active = true;
    let previous = 0;
    function frame(stamp: number) {
      if (previous) gaps.push(stamp - previous);
      previous = stamp;
      if (active) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const scrollMs: number[] = [];
    const zoomMs: number[] = [];
    for (let index = 0; index < 20; index++) {
      const start = performance.now(); viewport.scrollLeft += 180; await twoFrames();
      scrollMs.push(performance.now() - start);
    }
    for (let index = 0; index < 10; index++) {
      const start = performance.now(); (index % 2 ? zoomOut : zoomIn).click();
      await twoFrames(); zoomMs.push(performance.now() - start);
    }
    active = false;
    return { gaps, scrollMs, zoomMs,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  await roll.locator(".piano-roll__operations summary").click();
  await roll.getByLabel("IDs de notas para seleccionar").fill("n-5, n-25, n-125, n-1025, n-9025");
  const selectFiveMs = await page.evaluate(async () => {
    const panel = document.querySelector("#roll-cpu4x-mount")!;
    const button = [...panel.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent === "Seleccionar IDs")!;
    const status = panel.querySelector<HTMLElement>(".piano-roll__selection-row [role=status]")!;
    const start = performance.now(); button.click();
    for (let attempt = 0; attempt < 60 && !status.textContent?.includes("5 notas"); attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return { ms: performance.now() - start, selected: status.textContent };
  });
  expect(selectFiveMs.selected).toContain("5 notas");
  expect(metrics.overflow).toBe(false);
  console.log(`ROL_CPU4X ${JSON.stringify({ notes: 10_000, width: 320, cpuThrottle: 4,
    frameGapP50Ms: percentile(metrics.gaps, 0.5), frameGapP95Ms: percentile(metrics.gaps, 0.95),
    scrollPaintP50Ms: percentile(metrics.scrollMs, 0.5),
    scrollPaintP95Ms: percentile(metrics.scrollMs, 0.95),
    zoomPaintP50Ms: percentile(metrics.zoomMs, 0.5),
    zoomPaintP95Ms: percentile(metrics.zoomMs, 0.95), selectFiveMs: selectFiveMs.ms })}`);
});
