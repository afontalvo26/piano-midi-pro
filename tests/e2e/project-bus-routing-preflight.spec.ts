import { expect, test } from "@playwright/test";

test("resampling preflight includes nested sources, excludes destination and blocks sends", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { findBusResampleRoutes } = await import("/src/project/busResampleRouting.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      effects: [], sends: [] };
    const tracks = [
      { id: "source-direct", name: "Directa", kind: "instrument" as const,
        mix: { ...mix, outputBusTrackId: "main" } },
      { id: "source-nested", name: "Anidada", kind: "drum" as const,
        mix: { ...mix, outputBusTrackId: "child" } },
      { id: "child", name: "Sub-bus", kind: "bus" as const,
        mix: { ...mix, outputBusTrackId: "main" } },
      { id: "main", name: "Bus principal", kind: "bus" as const, mix },
      { id: "destination", name: "Destino", kind: "audio" as const,
        mix: { ...mix, outputBusTrackId: "main" } },
      { id: "outside", name: "Fuera", kind: "audio" as const, mix },
    ];
    const base = createProjectDocument({ id: "routing-preflight", at: 1 });
    const doc = { ...base, tracks, trackOrder: tracks.map((track) => track.id) };
    const selected = findBusResampleRoutes(doc, "main", "destination");
    const empty = findBusResampleRoutes(doc, "missing", "destination");
    const withSend = { ...doc, tracks: tracks.map((track) => track.id === "child"
      ? { ...track, mix: { ...track.mix,
        sends: [{ id: "send", busTrackId: "main", gainDb: -6 }] } } : track) };
    const blocked = findBusResampleRoutes(withSend, "main", "destination");
    return {
      selectedSources: selected.sourceTrackIds,
      routedIds: selected.routedTracks.map((track) => track.id).sort(),
      hasUnsupportedSends: selected.hasUnsupportedSends,
      emptySources: empty.sourceTrackIds,
      blockedSends: blocked.hasUnsupportedSends,
    };
  });
  expect(result.selectedSources).toEqual(["source-direct", "source-nested"]);
  expect(result.routedIds).toEqual(["child", "main", "source-direct", "source-nested"]);
  expect(result.hasUnsupportedSends).toBe(false);
  expect(result.emptySources).toEqual([]);
  expect(result.blockedSends).toBe(true);
});
