import { expect, test } from "@playwright/test";

test("SMF Worker exports 10,000 notes without running the writer on the UI thread", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/src/export/arrangementMidiClient.ts");
  const result = await page.evaluate(async () => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ArrangementMidiExporter } = await import("/src/export/arrangementMidiClient.ts");
    const base = createProjectDocument({ id: "worker-export-10k", at: 1000 });
    const track = { id: "piano", name: "Piano", kind: "instrument" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const notes = Array.from({ length: 10_000 }, (_, index) => ({
      id: `note-${index}`, startTick: index, durationTick: 1, pitch: 36 + index % 48,
      velocity: 1 + index % 127, releaseVelocity: 0, channel: 0,
      origin: { kind: "drawn" as const },
    }));
    const pattern = { id: "pattern", name: "10k", version: 1, lengthTicks: 10_000,
      notes, expression: [] };
    const document = { ...base, tracks: [track], trackOrder: [track.id], patterns: [pattern],
      clips: [{ id: "clip", kind: "pattern" as const, trackId: track.id, sourceId: pattern.id,
        sourceVersion: 1, startTick: 0, lengthTicks: 10_000, sourceOffsetTick: 0,
        loopMode: "none" as const, tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false }] };
    const exporter = new ArrangementMidiExporter();
    let maxFrameGapMs = 0;
    let previousFrame = 0;
    let tracking = true;
    const frame = (time: number) => {
      if (previousFrame) maxFrameGapMs = Math.max(maxFrameGapMs, time - previousFrame);
      previousFrame = time;
      if (tracking) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const start = performance.now();
    const pending = exporter.export(document, { seed: "fixed-seed" });
    const enqueueMs = performance.now() - start;
    const output = await pending;
    const totalMs = performance.now() - start;
    tracking = false;
    exporter.close();
    return { noteCount: output.report.noteCount, ppq: output.report.ppq,
      header: Array.from(output.bytes.slice(0, 14)), byteLength: output.bytes.length,
      enqueueMs, totalMs, maxFrameGapMs };
  });
  expect(result.noteCount).toBe(10_000);
  expect(result.ppq).toBe(960);
  expect(result.header).toEqual([77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 2, 3, 192]);
  expect(result.byteLength).toBeGreaterThan(10_000);
  console.log(`EXP Chromium 390x844 desktop CPU: 10k notes, enqueue=${result.enqueueMs.toFixed(1)}ms, ` +
    `Worker total=${result.totalMs.toFixed(1)}ms, max rAF=${result.maxFrameGapMs.toFixed(1)}ms`);
});
