import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true,
  deviceScaleFactor: 2 });

test("perfil CPU 4x separa pintura canvas y React del roll de 10.000 notas", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    document.getElementById("root")?.remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const mount = document.createElement("div");
    mount.id = "roll-profile-mount";
    document.body.append(mount);
    const notes = Array.from({ length: 10_000 }, (_, index) => ({ id: `n-${index}`,
      startTick: index * 24, durationTick: 48, pitch: 48 + index % 37,
      velocity: 60 + index % 60, releaseVelocity: 64, channel: 0,
      origin: { kind: "drawn" } }));
    const pattern = { id: "roll-profile", name: "Perfil", version: 1,
      lengthTicks: 245_760, notes, expression: [] };
    ReactDOM.createRoot(mount).render(React.createElement(PianoRoll, { pattern,
      onCommand: () => { throw new Error("Sólo lectura"); } }));
    window.__rollProfilePattern = pattern;
  });
  await expect(page.locator("#roll-profile-mount .piano-roll")).toBeVisible();
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await page.evaluate(async () => {
    const panel = document.querySelector("#roll-profile-mount")!;
    const viewport = panel.querySelector<HTMLElement>(".piano-roll__viewport")!;
    const zoomIn = panel.querySelector<HTMLButtonElement>('button[aria-label="Acercar"]')!;
    const zoomOut = panel.querySelector<HTMLButtonElement>('button[aria-label="Alejar"]')!;
    const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())));
    for (let index = 0; index < 24; index++) { viewport.scrollLeft += 180; await twoFrames(); }
    for (let index = 0; index < 10; index++) {
      (index % 2 ? zoomOut : zoomIn).click(); await twoFrames();
    }
  });
  const { profile } = await cdp.send("Profiler.stop");
  const nodes = profile.nodes.map((node) => ({ functionName: node.callFrame.functionName,
    url: node.callFrame.url, hitCount: node.hitCount ?? 0 }))
    .filter((node) => node.hitCount > 0).sort((a, b) => b.hitCount - a.hitCount).slice(0, 20);
  const isolated = await page.evaluate(async () => {
    const { paintPianoRoll } = await import("/src/composition/pianoRollCanvas.ts");
    const { paintPianoRollLane } = await import("/src/composition/pianoRollLanes.ts");
    const { PianoRollNoteIndex } = await import("/src/composition/pianoRollModel.ts");
    const pattern = window.__rollProfilePattern;
    const index = new PianoRollNoteIndex(pattern.notes);
    const canvas = document.createElement("canvas");
    const laneCanvas = document.createElement("canvas");
    const selectedNoteIds = new Set<string>();
    const mainMs: number[] = [];
    const laneMs: number[] = [];
    for (let iteration = 0; iteration < 24; iteration++) {
      const viewport = { scrollLeft: iteration * 180, scrollTop: 1100,
        width: 320, height: 300, pixelsPerQuarter: 96 };
      let start = performance.now();
      paintPianoRoll(canvas, { pattern, index, viewport, selectedNoteIds,
        snapTicks: 240, meterNumerator: 4, meterDenominator: 4 });
      mainMs.push(performance.now() - start);
      start = performance.now();
      paintPianoRollLane(laneCanvas, { pattern, noteIndex: index, viewport,
        kind: "velocity", channel: 0, controller: 1, selectedNoteIds });
      laneMs.push(performance.now() - start);
    }
    return { mainMs, laneMs };
  });
  const p = (values: number[], fraction: number) => {
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.ceil(ordered.length * fraction) - 1] ?? 0;
  };
  console.log(`ROLL_CPU4X_PROFILE ${JSON.stringify({ topJsNodes: nodes,
    isolatedMainP50Ms: p(isolated.mainMs, 0.5), isolatedMainP95Ms: p(isolated.mainMs, 0.95),
    isolatedLaneP50Ms: p(isolated.laneMs, 0.5), isolatedLaneP95Ms: p(isolated.laneMs, 0.95) })}`);
});
