import { expect, test } from "@playwright/test";

test("cabezales avanzan por frame sin render React ni repintar las 10.000 notas", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const ReactDOM = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { PianoRoll } = await import("/src/components/beatmaker/PianoRoll.tsx");
    const { Arrangement } = await import("/src/components/beatmaker/Arrangement.tsx");
    const { createProjectDocument } = await import("/src/project/model.ts");
    document.getElementById("root").remove();
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    window.__playheadTick = 0;
    window.__renderCounts = { roll: 0, arrangement: 0, mainPaints: 0 };
    const originalContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (this.classList.contains("piano-roll__canvas")) window.__renderCounts.mainPaints++;
      return originalContext.apply(this, args);
    };
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] };
    const track = { id: "track", name: "Piano", kind: "instrument", mix };
    const pattern = { id: "pattern", name: "10 mil notas", version: 1, lengthTicks: 300_100,
      notes: Array.from({ length: 10_000 }, (_, index) => ({ id: `note-${index}`, startTick: index * 30,
        durationTick: 24, pitch: 36 + index % 48, velocity: 80, releaseVelocity: 64,
        channel: 0, origin: { kind: "drawn" } })), expression: [] };
    const clip = { id: "clip", kind: "pattern", trackId: track.id, sourceId: pattern.id,
      sourceVersion: 1, startTick: 0, lengthTicks: pattern.lengthTicks,
      sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
    const projectDoc = { ...createProjectDocument({ id: "playhead-project" }),
      tracks: [track], trackOrder: [track.id], patterns: [pattern], clips: [clip] };
    const read = () => window.__playheadTick;
    const rollMount = document.createElement("div");
    rollMount.id = "live-roll-mount";
    document.body.append(rollMount);
    const arrangeMount = document.createElement("div");
    arrangeMount.id = "live-arrange-mount";
    document.body.append(arrangeMount);
    function RollWrapper() {
      window.__renderCounts.roll++;
      return React.createElement(PianoRoll, { pattern, readPlayheadTick: read, playheadTick: 0,
        onCommand: () => { throw new Error("read only"); } });
    }
    function ArrangementWrapper() {
      window.__renderCounts.arrangement++;
      return React.createElement(Arrangement, { document: projectDoc, readPlayheadTick: read,
        playheadTick: 0, onCommand: () => { throw new Error("read only"); } });
    }
    ReactDOM.createRoot(rollMount).render(React.createElement(RollWrapper));
    ReactDOM.createRoot(arrangeMount).render(React.createElement(ArrangementWrapper));
  });
  const rollLine = page.locator("#live-roll-mount .piano-roll__live-playhead");
  await expect(rollLine).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__renderCounts.mainPaints)).toBeGreaterThan(0);
  const before = await page.evaluate(() => ({ ...window.__renderCounts }));
  const rollBefore = await rollLine.evaluate((line: HTMLElement) => line.style.transform);
  await page.evaluate(() => { window.__playheadTick = 960; });
  await expect.poll(async () => rollLine.evaluate((line: HTMLElement) => line.style.transform))
    .not.toBe(rollBefore);
  const after = await page.evaluate(() => ({ ...window.__renderCounts }));
  expect(after.roll).toBe(before.roll);
  expect(after.mainPaints).toBe(before.mainPaints);

  const arrangement = page.locator("#live-arrange-mount .arrangement");
  await arrangement.scrollIntoViewIfNeeded();
  const arrangementLine = arrangement.locator(".arrangement__playhead");
  await expect(arrangementLine).toBeVisible();
  const arrangementBefore = await arrangementLine.evaluate((line: HTMLElement) => line.style.left);
  await page.evaluate(() => { window.__playheadTick = 1920; });
  await expect.poll(async () => arrangementLine.evaluate((line: HTMLElement) => line.style.left))
    .not.toBe(arrangementBefore);
  expect(await page.evaluate(() => window.__renderCounts.arrangement)).toBe(1);
});
