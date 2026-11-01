import { expect, test } from "@playwright/test";

test("WAV Worker encodes a stereo frame fixture and cancellation leaves no file", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/export/wavPcmClient.ts");
  const result = await page.evaluate(async () => {
    const { encodeWavPcmAsync } = await import("/src/export/wavPcmClient.ts");
    const { validateWavPcm } = await import("/src/export/wavPcm.ts");
    const frames = 48_000;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame++) {
      left[frame] = Math.sin(frame * 2 * Math.PI * 440 / 48_000) * 0.4;
      right[frame] = Math.sin(frame * 2 * Math.PI * 660 / 48_000) * 0.3;
    }
    const result = await encodeWavPcmAsync({ sampleRate: 48_000, left, right },
      { format: "pcm24", normalizePeakDbfs: -1, seed: "worker-fixture" });
    const parsed = validateWavPcm(result.bytes);
    const detached = left.byteLength === 0 && right.byteLength === 0;
    const controller = new AbortController();
    controller.abort();
    let cancelled = false;
    try {
      await encodeWavPcmAsync({ sampleRate: 48_000,
        left: new Float32Array([0.4]), right: new Float32Array([0.4]) },
      { format: "pcm16" }, controller.signal);
    } catch (error) { cancelled = error instanceof DOMException && error.name === "AbortError"; }
    return { parsed, detached, cancelled, outputPeak: result.report.outputPeak,
      bytes: result.bytes.byteLength, dithered: result.report.dithered };
  });
  expect(result.parsed).toEqual({ frames: 48_000, sampleRate: 48_000, format: "pcm24" });
  expect(result.detached).toBe(true);
  expect(result.cancelled).toBe(true);
  expect(result.bytes).toBe(44 + 48_000 * 6);
  expect(result.dithered).toBe(true);
  expect(result.outputPeak).toBeGreaterThan(0.89);
  expect(result.outputPeak).toBeLessThan(0.9);
});
