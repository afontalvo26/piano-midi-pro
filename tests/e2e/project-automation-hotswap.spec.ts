import { expect, test } from "@playwright/test";

test("AUT hot-swap mantiene valor audible y reprograma sin caída a base", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((reply) => reply.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { ProjectPlayback } = await import("/src/audio/projectPlayback.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const bytes = await fetch("/audio/salamander/core/C4.ogg").then((reply) => reply.arrayBuffer());
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/ogg" }),
      "aut-hotswap-piano", new OfflineAudioContext(1, 1, 48_000));
    const base = createProjectDocument({ id: "aut-hotswap", at: 1 });
    const lane = { id: "gain", target: { scope: "track" as const, ownerId: "audio",
      parameterId: "gainDb" }, points: [
      { id: "a", tick: 0, value: -24, shape: "linear" as const },
      { id: "b", tick: 1920, value: 0, shape: "step" as const },
    ] };
    const document = { ...base, trackOrder: ["audio"],
      tracks: [{ id: "audio", name: "Audio", kind: "audio" as const,
        mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
          sends: [], effects: [] } }],
      clips: [{ id: "clip", trackId: "audio", kind: "audio" as const,
        sourceId: analyzed.ref.id, startTick: 0, lengthTicks: 1920,
        sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
        transpose: 0, gainDb: 0, muted: false, sourceStartFrame: 0,
        sourceEndFrame: Math.min(analyzed.buffer.length, 48_000),
        fadeInFrames: 0, fadeOutFrames: 0 }],
      assets: [analyzed.ref], automation: [lane] };
    const reader = { readAsset: async () => analyzed.data };
    async function render(mode: "dry" | "change" | "remove") {
      const first = mode === "dry" ? { ...document, automation: [] } : document;
      const buffer = await Tone.Offline(async () => {
        const sink = new ProjectAudioSink(first, Tone.getDestination(),
          new DecodedPianoSampleBank(), () => true, reader);
        const prepared = await sink.prepare({ metronome: false });
        if (prepared.tracks.some((track) => track.error)) throw new Error("Clip no listo");
        const audio = { currentTime: 0, state: "running" as const };
        const playback = new ProjectPlayback(first, sink, audio,
          createArrangementResolver(first), undefined, false);
        playback.play(0);
        if (mode !== "dry") {
          audio.currentTime = 0.2;
          const next = { ...first, automation: mode === "remove" ? [] : [{ ...lane,
            points: [{ id: "a", tick: 0, value: -12, shape: "step" as const }] }] };
          playback.replaceAutomationRevision(next);
        }
      }, 0.55, 2, 48_000);
      return buffer.get()!.getChannelData(0).slice();
    }
    // Tone.Offline swaps a module-global context, so each realm render is serial.
    const dry = await render("dry");
    const changed = await render("change");
    const removed = await render("remove");
    function energyRatio(signal: Float32Array, from: number, to: number): number {
      let actual = 0;
      let reference = 0;
      for (let i = Math.floor(from * 48_000); i < Math.floor(to * 48_000); i++) {
        actual += signal[i]! * signal[i]!;
        reference += dry[i]! * dry[i]!;
      }
      if (reference < 1e-9) throw new Error("Piano grabado sin energía en ventana");
      return Math.sqrt(actual / reference);
    }
    return { changedBefore: energyRatio(changed, 0.19, 0.199),
      changedDuring: energyRatio(changed, 0.2, 0.207),
      changedAfter: energyRatio(changed, 0.22, 0.23),
      removedDuring: energyRatio(removed, 0.2, 0.207),
      removedAfter: energyRatio(removed, 0.23, 0.24) };
  });
  console.log("AUT hot-swap ratios:", JSON.stringify(result));
  expect(result.changedBefore).toBeGreaterThan(0.07);
  expect(result.changedBefore).toBeLessThan(0.15);
  expect(result.changedDuring).toBeGreaterThan(0.09);
  expect(result.changedDuring).toBeGreaterThan(result.changedBefore);
  expect(result.changedDuring).toBeLessThan(0.3);
  expect(result.changedAfter).toBeGreaterThan(0.23);
  expect(result.changedAfter).toBeLessThan(0.28);
  expect(result.removedDuring).toBeLessThan(0.7);
  expect(result.removedAfter).toBeGreaterThan(0.95);
});
