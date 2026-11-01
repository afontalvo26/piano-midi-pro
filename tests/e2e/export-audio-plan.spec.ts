import { expect, test } from "@playwright/test";

test("WAV plan maps tempo and nested bus stems without hiding unsupported DSP", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/export/audioPlan.ts");
  const result = await page.evaluate(async () => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { planProjectAudioExport } = await import("/src/export/audioPlan.ts");
    const mix = (outputBusTrackId?: string) => ({ gainDb: 0, pan: 0,
      mute: false, solo: false, armed: false, sends: [], effects: [],
      ...(outputBusTrackId ? { outputBusTrackId } : {}) });
    const track = (id: string, kind: "instrument" | "drum" | "audio" | "bus", outputBusTrackId?: string) =>
      ({ id, name: id, kind, mix: mix(outputBusTrackId) });
    const base = createProjectDocument({ id: "export-plan", at: 1 });
    const tracks = [track("direct", "instrument"), track("kick", "drum", "drum-bus"),
      track("bass", "instrument", "music-bus"), track("empty", "instrument"),
      track("notes-muted", "instrument"),
      track("drum-bus", "bus", "music-bus"),
      track("music-bus", "bus")];
    const clip = (id: string, trackId: string) => ({ id, trackId, kind: "pattern" as const,
      sourceId: `${trackId}-pattern`, sourceVersion: 1, startTick: 0, lengthTicks: 1920,
      sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false });
    const pattern = (id: string, hasNote: boolean) => ({ id: `${id}-pattern`,
      name: id, version: 1, lengthTicks: 1920,
      notes: hasNote ? [{ id: `${id}-note`, startTick: 0, durationTick: 120,
        pitch: 60, velocity: 100, releaseVelocity: 64, channel: 0,
        origin: { kind: "drawn" as const } }] : [], expression: [] });
    const mutedPattern = pattern("notes-muted", true);
    const document = { ...base, tempoMap: [{ tick: 0, microsPerQuarter: 500_000 },
        { tick: 960, microsPerQuarter: 1_000_000 }],
      tracks, trackOrder: tracks.map(({ id }) => id),
      patterns: [pattern("direct", true), pattern("kick", true),
        pattern("bass", true), pattern("empty", false),
        { ...mutedPattern, notes: mutedPattern.notes.map((note) => ({ ...note, muted: true })) }],
      clips: [clip("clip-direct", "direct"), clip("clip-kick", "kick"),
        clip("clip-bass", "bass"), clip("clip-empty", "empty"),
        clip("clip-muted", "notes-muted")] };
    const tracksPlan = planProjectAudioExport(document, { sampleRate: 48_000,
      stems: "tracks", tailSeconds: 0.5 });
    const busesPlan = planProjectAudioExport(document, { sampleRate: 44_100,
      stems: "buses", startTick: 960, endTick: 1920, tailSeconds: 0 });
    const rejected = (candidate: typeof document, options: Parameters<typeof planProjectAudioExport>[1]) => {
      try { planProjectAudioExport(candidate, options); return ""; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    const supportedEffectError = rejected({ ...document, mix: { ...document.mix,
      masterEffects: [{ id: "fx", kind: "reverb", enabled: true,
        parameters: { roomSize: 0.5, dampeningHz: 4000, wet: 0.2 } }] } },
    { sampleRate: 48_000, stems: "none" });
    const unknownEffectError = rejected({ ...document, mix: { ...document.mix,
      masterEffects: [{ id: "fx", kind: "future-effect", enabled: true, parameters: {} }] } },
    { sampleRate: 48_000, stems: "none" });
    const sendsError = rejected({ ...document, tracks: document.tracks.map((track) =>
      track.id === "direct" ? { ...track, mix: { ...track.mix,
        sends: [{ id: "send", busTrackId: "music-bus", gainDb: -6 }] } } : track) },
    { sampleRate: 48_000, stems: "none" });
    const automationError = rejected({ ...document, automation: [{ id: "future-lane",
      target: { scope: "track" as const, ownerId: "direct", parameterId: "gainDb" },
      points: [{ id: "point", tick: 0, value: -6, shape: "bezier" as const }] }] },
    { sampleRate: 48_000, stems: "none" });
    const durationError = rejected(document,
      { sampleRate: 48_000, stems: "none", endTick: 960 * 60 * 11 });
    const rangeError = rejected(document,
      { sampleRate: 48_000, stems: "none", startTick: 1920, endTick: 1920 });
    return {
      tracks: tracksPlan.stems.map((stem) => stem.sourceTrackIds),
      omitted: tracksPlan.omittedSourceTrackIds,
      trackDuration: tracksPlan.durationSeconds,
      excluded: tracksPlan.excludedStudioChain,
      buses: busesPlan.stems.map((stem) => [stem.id, stem.sourceTrackIds]),
      busDuration: busesPlan.durationSeconds,
      busesAdditive: busesPlan.stemsAdditive,
      busesOverlap: busesPlan.busStemsOverlap,
      supportedEffectError, unknownEffectError, sendsError, automationError, durationError, rangeError,
    };
  });
  expect(result.tracks).toEqual([["direct"], ["kick"], ["bass"]]);
  expect(result.omitted).toEqual(["empty", "notes-muted"]);
  expect(result.trackDuration).toBe(1.5);
  expect(result.excluded).toEqual(["piano-live-chorus", "piano-live-reverb",
    "piano-live-compressor", "piano-live-master-volume"]);
  expect(result.buses).toEqual([["drum-bus", ["kick"]],
    ["music-bus", ["kick", "bass"]], ["master-direct", ["direct"]]]);
  expect(result.busDuration).toBe(1);
  expect(result.busesAdditive).toBe(false);
  expect(result.busesOverlap).toBe(true);
  expect(result.supportedEffectError).toBe("");
  expect(result.unknownEffectError).toMatch(/no disponible para WAV/);
  expect(result.sendsError).toMatch(/envíos/);
  expect(result.automationError).toMatch(/bezier/);
  expect(result.durationError).toMatch(/5 minutos/);
  expect(result.rangeError).toMatch(/Rango/);
});
