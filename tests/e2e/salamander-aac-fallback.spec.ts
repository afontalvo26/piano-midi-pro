import { expect, test } from "@playwright/test";

test("OGG compatible browser loads only the original recorded core", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/corePianoPreload.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const original = window.fetch.bind(window);
    const requested: string[] = [];
    window.fetch = (input, init) => {
      requested.push(String(input));
      return original(input, init);
    };
    const { getCorePianoBuffer } = await import("/src/audio/corePianoPreload.ts?qa=ogg-first");
    const buffer = await getCorePianoBuffer("C4");
    return { length: buffer?.length ?? 0,
      aacRequests: requested.filter((url) => url.includes("/core-aac/")) };
  });
  expect(result.length).toBeGreaterThan(1_000);
  expect(result.aacRequests).toEqual([]);
});

test("failed OGG decode loads pinned AAC-LC and plays a recorded C4 note", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/corePianoPreload.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const originalDecode = OfflineAudioContext.prototype.decodeAudioData;
    Object.defineProperty(OfflineAudioContext.prototype, "decodeAudioData", { configurable: true,
      value: function (bytes: ArrayBuffer) {
        const magic = new Uint8Array(bytes, 0, 4);
        if (magic[0] === 0x4f && magic[1] === 0x67 &&
            magic[2] === 0x67 && magic[3] === 0x53) {
          return Promise.reject(new DOMException("OGG unsupported", "EncodingError"));
        }
        return originalDecode.call(this, bytes);
      } });
    const originalFetch = window.fetch.bind(window);
    const requested: string[] = [];
    window.fetch = (input, init) => {
      requested.push(String(input));
      return originalFetch(input, init);
    };
    const { getCorePianoBuffer } = await import("/src/audio/corePianoPreload.ts?qa=forced-aac");
    const buffer = await getCorePianoBuffer("C4");
    if (!buffer) throw new Error("AAC fallback did not decode C4");
    const offline = new OfflineAudioContext(1, 4_800, 48_000);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    const played = await offline.startRendering();
    const pcm = played.getChannelData(0);
    let energy = 0;
    for (const sample of pcm) energy += sample ** 2;
    const { loadVerifiedSalamanderCore } = await import("/src/audio/verifiedSalamanderCore.ts");
    const bank = await loadVerifiedSalamanderCore(new OfflineAudioContext(2, 1, 48_000));
    return { energy, channels: buffer.numberOfChannels,
      coverage: bank.coverage(48, 84, 6).missing,
      aacRequests: requested.filter((url) => url.includes("/core-aac/")).length,
      oggRequests: requested.filter((url) => url.endsWith(".ogg")).length };
  });
  expect(result.energy).toBeGreaterThan(0);
  expect(result.channels).toBe(2);
  expect(result.coverage).toEqual([]);
  expect(result.aacRequests).toBeGreaterThanOrEqual(8);
  expect(result.oggRequests).toBeGreaterThanOrEqual(7);
});
