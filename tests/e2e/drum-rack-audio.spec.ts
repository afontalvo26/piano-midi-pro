import { expect, test } from "@playwright/test";

test("rack de 16 pads carga fuentes exactas, preview y choke/Stop por owner", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { ProjectAudioSink, PROJECT_DRUM_INSTRUMENT, PROJECT_CLAP_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    await Tone.start();
    const pads = Array.from({ length: 16 }, (_, index) => {
      const note = [36, 39, 42, 46][index] ?? 60 + index;
      const source = index === 0 ? { kind: "instrument" as const,
        ref: PROJECT_DRUM_INSTRUMENT, sourceNote: 36 }
        : index === 1 ? { kind: "instrument" as const,
          ref: PROJECT_CLAP_INSTRUMENT, sourceNote: 39 }
          : index === 2 || index === 3 ? { kind: "instrument" as const,
            ref: PROJECT_DRUM_INSTRUMENT, sourceNote: note } : null;
      return { id: `pad-${index}`, name: `Pad ${index}`, color: "#334455", midiNote: note,
        channel: 9, source, gainDb: index === 0 ? -6 : 0, pan: index === 0 ? -0.4 : 0,
        pitchSemitones: index === 0 ? -2 : 0, startFrame: 0, attackMs: 1,
        decayMs: 20, playMode: index === 1 ? "gate" as const : "oneShot" as const,
        mute: false, solo: false, chokeGroup: index >= 2 && index <= 3 ? "hats" : undefined,
        stepTicks: 240, stepCount: 16 };
    });
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-rack", at: 1 }),
      trackOrder: ["rack"], tracks: [{ id: "rack", name: "Drum rack",
        kind: "drum" as const, drumRack: { pads }, mix }] };
    const destination = new Tone.Gain(0).toDestination();
    const sink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(), () => true);
    const prepared = await sink.prepare();
    const status = sink.padStatus("rack");
    const at = Tone.immediate() + 0.18;
    const base = { kind: "note" as const, eventId: "hit", sourceKind: "pattern",
      ownerPath: "track/rack/clip/c", ownerId: "transport/qa-rack/track/rack/clip/c/iteration-0/epoch-1",
      trackId: "rack", clipId: "c", tick: 0, absoluteTick: 0, iteration: 0, epoch: 1,
      audioTime: at, sequence: 0, channel: 9, pitch: 42, playedPitch: 42,
      velocity: 110, releaseVelocity: 64, durationTicks: 240, tailPolicy: "cut" as const };
    const hatClosed = sink.noteOn(base);
    const hatOpen = sink.noteOn({ ...base, eventId: "open", pitch: 46, playedPitch: 46 });
    const afterChoke = sink.diagnostics().tracks[0];
    const preview = sink.previewRackPad("rack", "pad-1", 0.8, "preview/rack-clap", at);
    const previewReleased = sink.releasePreview("preview/rack-clap");
    sink.setRackPadMute("rack", "pad-0", true);
    const mutedKick = sink.previewRackPad("rack", "pad-0", 0.8, "preview/kick", at);
    sink.setRackPadSolo("rack", "pad-1", true);
    const soloStatus = sink.padStatus("rack");
    sink.setRackPadSolo("rack", "pad-1", false);
    sink.cancelEpoch(sink.rootOwnerId, 1, Tone.immediate());
    const afterStop = sink.diagnostics().tracks[0];
    sink.dispose();
    destination.dispose();
    return { prepared: prepared.tracks[0], status, hatClosed: Boolean(hatClosed),
      hatOpen: Boolean(hatOpen), afterChoke, preview: Boolean(preview), previewReleased,
      mutedKick: Boolean(mutedKick), soloStatus, afterStop };
  });
  expect(result.prepared).toMatchObject({ status: "ready", error: null });
  expect(result.status).toHaveLength(16);
  expect(result.status.slice(0, 4).map((pad) => pad.assetStatus)).toEqual([
    "ready", "ready", "ready", "ready",
  ]);
  expect(result.status.slice(4).every((pad) => pad.assetStatus === "error" &&
    pad.sourceLabel === "Sin muestra asignada")).toBe(true);
  expect(result.status[0]?.sourceLabel).toContain("Virtuosity Drums");
  expect(result.status[1]?.sourceLabel).toContain("FreePats World Percussion");
  expect(result.hatClosed).toBe(true);
  expect(result.hatOpen).toBe(true);
  expect(result.afterChoke?.activeVoices).toBe(1);
  expect(result.preview).toBe(true);
  expect(result.previewReleased).toBe(1);
  expect(result.mutedKick).toBe(false);
  expect(result.soloStatus[0]?.muted).toBe(true);
  expect(result.soloStatus[1]?.muted).toBe(false);
  expect(result.afterStop?.activeVoices).toBe(0);
});
