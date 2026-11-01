import { expect, test } from "@playwright/test";

const BUDGET = {
  frameGapP95Ms: 34,
  frameGapP99Ms: 67,
  scrollPaintP95Ms: 70,
  zoomPaintP95Ms: 90,
  selectFiveMs: 150,
} as const;

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

for (const width of [320, 390]) {
  test(`10.000 notas: scroll, zoom y selección exacta a ${width} px respetan presupuesto`, async ({ page }) => {
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
      const mount = document.createElement("div");
      mount.id = "roll-performance-mount";
      document.body.append(mount);
      const notes = Array.from({ length: 10_000 }, (_, index) => ({
        id: `perf-${index}`, startTick: index * 24, durationTick: 48,
        pitch: 48 + index % 37, velocity: 60 + index % 60,
        releaseVelocity: 64, channel: 0, origin: { kind: "drawn" },
      }));
      const pattern = { id: "perf-pattern", name: "Carga real", version: 1,
        lengthTicks: 245_760, notes, expression: [] };
      ReactDOM.createRoot(mount).render(React.createElement(PianoRoll, {
        pattern, onCommand: () => { throw new Error("Benchmark de lectura"); },
      }));
    });
    const roll = page.locator("#roll-performance-mount .piano-roll");
    await expect(roll).toBeVisible();
    await expect(roll.locator(".piano-roll__facts")).toContainText("10.000 notas");
    expect(await roll.locator("canvas").count()).toBeLessThan(4);
    const first = await page.evaluate(async () => {
      const panel = document.querySelector("#roll-performance-mount");
      const viewport = panel.querySelector(".piano-roll__viewport");
      const zoom = panel.querySelector('button[aria-label="Acercar"]');
      const twoFrames = () => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const gaps: number[] = [];
      let sampling = true;
      let previous = 0;
      function frame(stamp: number) {
        if (previous) gaps.push(stamp - previous);
        previous = stamp;
        if (sampling) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      const scroll: number[] = [];
      const zoomPaint: number[] = [];
      for (let index = 0; index < 24; index++) {
        const start = performance.now();
        viewport.scrollLeft += 180;
        await twoFrames();
        scroll.push(performance.now() - start);
      }
      for (let index = 0; index < 8; index++) {
        const start = performance.now();
        zoom.click();
        await twoFrames();
        zoomPaint.push(performance.now() - start);
      }
      sampling = false;
      return { gaps, scroll, zoomPaint };
    });
    await roll.locator(".piano-roll__operations summary").click();
    await roll.getByLabel("IDs de notas para seleccionar").fill("perf-5, perf-25, perf-125, perf-1025, perf-9025");
    const selectFiveMs = await page.evaluate(async () => {
      const panel = document.querySelector("#roll-performance-mount");
      const button = [...panel.querySelectorAll("button")].find((item) => item.textContent === "Seleccionar IDs");
      const status = panel.querySelector(".piano-roll__selection-row [role=status]");
      const start = performance.now();
      button.click();
      for (let attempt = 0; attempt < 60 && !status.textContent.includes("5 notas"); attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return { ms: performance.now() - start, selected: status.textContent };
    });
    expect(selectFiveMs.selected).toContain("5 notas");
    const percentile = (values: number[], fraction: number) => {
      const ordered = [...values].sort((a, b) => a - b);
      return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] ?? 0;
    };
    const metrics = {
      width, notes: 10_000,
      frameGapP95Ms: percentile(first.gaps, 0.95),
      frameGapP99Ms: percentile(first.gaps, 0.99),
      scrollPaintP95Ms: percentile(first.scroll, 0.95),
      zoomPaintP95Ms: percentile(first.zoomPaint, 0.95),
      selectFiveMs: selectFiveMs.ms,
    };
    console.log(`ROLL_PERFORMANCE ${JSON.stringify({ metrics, budget: BUDGET })}`);
    expect(metrics.frameGapP95Ms).toBeLessThanOrEqual(BUDGET.frameGapP95Ms);
    expect(metrics.frameGapP99Ms).toBeLessThanOrEqual(BUDGET.frameGapP99Ms);
    expect(metrics.scrollPaintP95Ms).toBeLessThanOrEqual(BUDGET.scrollPaintP95Ms);
    expect(metrics.zoomPaintP95Ms).toBeLessThanOrEqual(BUDGET.zoomPaintP95Ms);
    expect(metrics.selectFiveMs).toBeLessThanOrEqual(BUDGET.selectFiveMs);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
