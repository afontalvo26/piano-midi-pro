import { expect, test } from "@playwright/test";

test("failed OGG decode loads pinned Virtuosity and FreePats AAC hits", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/virtuosityCore.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const decode = OfflineAudioContext.prototype.decodeAudioData;
    Object.defineProperty(OfflineAudioContext.prototype, "decodeAudioData", { configurable: true,
      value: function (bytes: ArrayBuffer) {
        const magic = new Uint8Array(bytes, 0, 4);
        if (magic[0] === 0x4f && magic[1] === 0x67 &&
            magic[2] === 0x67 && magic[3] === 0x53) {
          return Promise.reject(new DOMException("OGG unsupported", "EncodingError"));
        }
        return decode.call(this, bytes);
      } });
    const originalFetch = window.fetch.bind(window);
    const requested: string[] = [];
    window.fetch = (input, init) => {
      requested.push(String(input));
      return originalFetch(input, init);
    };
    const { fetchVirtuosityManifest, decodeVirtuosityPiece } =
      await import("/src/audio/virtuosityCore.ts");
    const { fetchFreePatsHandClapManifest, decodeFreePatsHandClap } =
      await import("/src/audio/freePatsHandClap.ts");
    const context = new OfflineAudioContext(2, 1, 48_000);
    const virtuosity = await fetchVirtuosityManifest();
    const [kick, snare, hatClosed, hatOpen, cowbell] = await Promise.all([
      "kick", "snare", "hatClosed", "hatOpen", "cowbell",
    ].map((piece) => decodeVirtuosityPiece(virtuosity,
      piece as "kick" | "snare" | "hatClosed" | "hatOpen" | "cowbell", context)));
    const clap = await decodeFreePatsHandClap(await fetchFreePatsHandClapManifest(), context);
    const measure = async (buffer: AudioBuffer) => {
      const offline = new OfflineAudioContext(1, 9_600, 48_000);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(0);
      const pcm = (await offline.startRendering()).getChannelData(0);
      let energy = 0;
      for (const sample of pcm) energy += sample ** 2;
      return energy;
    };
    const loadedVirtuosity = [kick, snare, hatClosed, hatOpen, cowbell]
      .reduce((sum, piece) => sum + [...piece.values()].reduce((part, hits) => part + hits.length, 0), 0);
    return { kickLayers: kick.size, kickVariants: [...kick.values()].map((items) => items.length),
      loadedVirtuosity,
      claps: clap.length, kickEnergy: await measure(kick.get(1)![0]!),
      clapEnergy: await measure(clap[0]!),
      virtuosityAac: requested.filter((url) => url.includes("/virtuosity/core-aac/")).length,
      clapAac: requested.filter((url) => url.includes("/freepats-handclap/core-aac/")).length };
  });
  expect(result.kickLayers).toBe(4);
  expect(result.kickVariants).toEqual([2, 2, 2, 2]);
  expect(result.claps).toBe(9);
  expect(result.loadedVirtuosity).toBe(38);
  expect(result.kickEnergy).toBeGreaterThan(0);
  expect(result.clapEnergy).toBeGreaterThan(0);
  expect(result.virtuosityAac).toBe(39);
  expect(result.clapAac).toBe(10);
});

test("supported OGG decoder does not request drum AAC", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/virtuosityCore.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const original = window.fetch.bind(window);
    const requested: string[] = [];
    window.fetch = (input, init) => {
      requested.push(String(input));
      return original(input, init);
    };
    const { fetchVirtuosityManifest, decodeVirtuosityPiece } =
      await import("/src/audio/virtuosityCore.ts");
    const { fetchFreePatsHandClapManifest, decodeFreePatsHandClap } =
      await import("/src/audio/freePatsHandClap.ts");
    const context = new OfflineAudioContext(2, 1, 48_000);
    const kick = await decodeVirtuosityPiece(await fetchVirtuosityManifest(), "kick", context);
    const clap = await decodeFreePatsHandClap(await fetchFreePatsHandClapManifest(), context);
    return { kickLayers: kick.size, claps: clap.length,
      aacRequests: requested.filter((url) => url.includes("/core-aac/")) };
  });
  expect(result.kickLayers).toBe(4);
  expect(result.claps).toBe(9);
  expect(result.aacRequests).toEqual([]);
});
