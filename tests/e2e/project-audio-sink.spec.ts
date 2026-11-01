import { expect, test } from "@playwright/test";

test("proyecto y 37 teclas comparten grafo; Stop deja vivo sustain y usa metrónomo grabado", async ({ page }) => {
  page.setDefaultTimeout(35_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { PROJECT_PIANO_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const mix = () => ({ gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] });
    const document = { ...createProjectDocument({ id: "qa-project", at: 1 }),
      trackOrder: ["piano", "drums"], tracks: [
        { id: "piano", name: "Piano", kind: "instrument" as const,
          instrument: PROJECT_PIANO_INSTRUMENT, mix: mix() },
        { id: "drums", name: "Drums", kind: "drum" as const,
          instrument: PROJECT_DRUM_INSTRUMENT, mix: mix() },
      ] };
    const pianoNote = { kind: "note" as const, eventId: "piano-note", sourceKind: "pattern",
      ownerPath: "track/piano/clip/c1", trackId: "piano", clipId: "c1", tick: 0,
      sequence: 0, channel: 0, pitch: 60, playedPitch: 60, velocity: 100,
      releaseVelocity: 64, durationTicks: 960, tailPolicy: "cut" as const };
    const drumNote = { ...pianoNote, eventId: "kick", ownerPath: "track/drums/clip/c2",
      trackId: "drums", clipId: "c2", pitch: 36, playedPitch: 36 };
    const resolver = (start: number, end: number) => [pianoNote, drumNote]
      .filter((event) => event.tick >= start && event.tick < end);
    const engine = new LiveStudioEngine();
    await engine.setMetronome({ enabled: true, bpm: 120 });
    const legacyBeforePrepare = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    const playback = await engine.prepareProjectPlayback(document, resolver);
    if (!playback) throw new Error("No se preparó el proyecto");
    const prepared = engine.projectPlaybackSnapshot();
    const legacyAfterPrepare = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    const pads = engine.projectPadStatus("drums");
    const previewNote = await engine.previewProjectNote("piano", 60, 0.75, "preview/qa-roll");
    const releasedNote = engine.releaseProjectPreview("preview/qa-roll");
    const previewed = await engine.previewProjectPad("drums", 36, 0.78, "preview/qa-pad");
    const releasedPreview = engine.releaseProjectPreview("preview/qa-pad");
    const played = await engine.playProjectPlayback(0);
    const during = engine.projectPlaybackSnapshot();
    const metronomeOwners = ((playback.sink as unknown as {
      metronomeDrums: { voiceSnapshot(): { byOwner: Array<{ ownerId: string }> } };
    }).metronomeDrums.voiceSnapshot()).byOwner.map((entry) => entry.ownerId);
    const legacyTimerActive = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    engine.pauseProjectPlayback();
    const resumed = await engine.playProjectPlayback();
    await new Promise((resolve) => setTimeout(resolve, 35));
    const legacyAfterQuickResume = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    engine.setGlobalPedal("qa-physical", "sustain", 127);
    const attacks = await Promise.all(Array.from({ length: 37 }, (_, index) => engine.noteOn({
      inputId: "smk-37-elite", channel: 4, originalNote: 48 + index, mappedMidi: 48 + index,
      rawVelocity: 100, amplitude: 0.7,
    })));
    for (let pitch = 48; pitch <= 84; pitch++) {
      engine.noteOff({ inputId: "smk-37-elite", channel: 4, originalNote: pitch });
    }
    engine.setProjectTrackMix("drums", { gainDb: -6, pan: -0.25 });
    engine.setProjectMasterGainDb(-3);
    const mixDuringLive = engine.projectPlaybackSnapshot()?.audio;
    engine.stopProjectPlayback();
    await new Promise((resolve) => setTimeout(resolve, 35));
    const legacyAfterStop = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    const afterStop = engine.diagnostics().voices?.activeVoiceCount;
    const transportAfterStop = engine.projectPlaybackSnapshot()?.transport.state;
    engine.setGlobalPedal("qa-physical", "sustain", 0);
    const afterPedal = engine.diagnostics().voices?.activeVoiceCount;
    engine.dispose();
    return { prepared, pads, previewNote, releasedNote, previewed, releasedPreview,
      mixDuringLive,
      played, during, metronomeOwners,
      legacyBeforePrepare, legacyAfterPrepare,
      legacyTimerActive, resumed, legacyAfterQuickResume, legacyAfterStop,
      attackCount: attacks.filter((attack) => attack !== null).length,
      afterStop, transportAfterStop, afterPedal };
  });
  expect(result.prepared?.audio.tracks.map((track) => track.status)).toEqual(["ready", "ready"]);
  expect(result.prepared?.audio.metronome).toEqual({ ready: true, error: null });
  expect(result.pads.map((pad) => pad.assetStatus)).toEqual(["ready", "ready", "ready", "ready", "ready"]);
  expect(result.previewNote).toBe(true);
  expect(result.releasedNote).toBe(1);
  expect(result.previewed).toBe(true);
  expect(result.releasedPreview).toBe(1);
  expect(result.played).toBe(true);
  expect(result.during?.transport.state).toBe("playing");
  expect(result.metronomeOwners.some((ownerId) => ownerId.startsWith("metronome/qa-project/epoch-"))).toBe(true);
  expect(result.legacyBeforePrepare).toBe(true);
  expect(result.legacyAfterPrepare).toBe(true);
  expect(result.legacyTimerActive).toBe(false);
  expect(result.resumed).toBe(true);
  expect(result.legacyAfterQuickResume).toBe(false);
  expect(result.legacyAfterStop).toBe(true);
  expect(result.attackCount).toBe(37);
  expect(result.mixDuringLive?.tracks.find((track) => track.trackId === "drums")).toMatchObject({
    gainDb: -6, pan: -0.25,
  });
  expect(result.mixDuringLive?.masterGainDb).toBe(-3);
  expect(result.afterStop).toBe(37);
  expect(result.transportAfterStop).toBe("stopped");
  expect(result.afterPedal).toBe(0);
});

test("solo conserva el bus antecesor y mute de bus corta sólo su rama", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { ProjectAudioSink, PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    await Tone.start();
    const destination = new Tone.Gain(0).toDestination();
    const bank = new DecodedPianoSampleBank();
    const raw = Tone.getContext().rawContext as AudioContext;
    const buffer = raw.createBuffer(1, raw.sampleRate, raw.sampleRate);
    for (const midi of [48, 54, 60, 66, 72, 78, 84]) bank.add({ midi, buffer });
    const mix = (outputBusTrackId?: string) => ({ gainDb: 0, pan: 0, mute: false,
      solo: false, armed: false, sends: [], effects: [], outputBusTrackId });
    const document = { ...createProjectDocument({ id: "bus-test", at: 1 }),
      trackOrder: ["piano", "other", "bus"], tracks: [
        { id: "piano", name: "Piano", kind: "instrument" as const,
          instrument: PROJECT_PIANO_INSTRUMENT, mix: mix("bus") },
        { id: "other", name: "Other", kind: "instrument" as const,
          instrument: PROJECT_PIANO_INSTRUMENT, mix: mix() },
        { id: "bus", name: "Bus", kind: "bus" as const, mix: mix() },
      ] };
    const sink = new ProjectAudioSink(document, destination, bank, () => true);
    sink.setTrackSolo("piano", true);
    const afterSolo = sink.diagnostics().tracks.map((track) => [track.trackId, track.muted]);
    sink.setTrackSolo("piano", false);
    sink.setTrackSolo("bus", true);
    const afterBusSolo = sink.diagnostics().tracks.map((track) => [track.trackId, track.muted]);
    const at = Tone.immediate() + 0.15;
    const event = { kind: "note" as const, eventId: "n1", sourceKind: "pattern",
      ownerPath: "track/piano/clip/c", ownerId: "transport/bus-test/track/piano/clip/c/iteration-0/epoch-1",
      trackId: "piano", clipId: "c", tick: 0, absoluteTick: 0, iteration: 0, epoch: 1,
      audioTime: at, sequence: 0, channel: 0, pitch: 60, playedPitch: 60,
      velocity: 100, releaseVelocity: 64, durationTicks: 960, tailPolicy: "cut" as const };
    const piano = sink.noteOn(event);
    const other = sink.noteOn({ ...event, eventId: "n2", trackId: "other",
      ownerPath: "track/other/clip/c", ownerId: "transport/bus-test/track/other/clip/c/iteration-0/epoch-1" });
    sink.setTrackMute("bus", true, Tone.immediate());
    const afterMute = sink.diagnostics().tracks.map((track) => [track.trackId, track.muted]);
    const activeAfterMute = sink.diagnostics().tracks.find((track) => track.trackId === "piano")?.activeVoices;
    sink.retire();
    const wrong = { ...document, tracks: document.tracks.map((track) => track.id === "piano"
      ? { ...track, instrument: { ...PROJECT_PIANO_INSTRUMENT, packageVersion: "unknown-version" } }
      : track) };
    const badSink = new ProjectAudioSink(wrong, destination, bank, () => true);
    const badStatus = badSink.diagnostics().tracks.find((track) => track.trackId === "piano");
    const badAttack = badSink.noteOn(event);
    badSink.retire();
    destination.dispose();
    return { afterSolo, afterBusSolo, afterMute, piano: Boolean(piano), other: Boolean(other),
      activeAfterMute, badStatus, badAttack: Boolean(badAttack) };
  });
  expect(result.afterSolo).toEqual([["piano", false], ["other", true], ["bus", false]]);
  expect(result.afterBusSolo).toEqual([["piano", false], ["other", true], ["bus", false]]);
  expect(result.piano).toBe(true);
  expect(result.other).toBe(false);
  expect(result.afterMute).toEqual([["piano", true], ["other", true], ["bus", true]]);
  expect(result.activeAfterMute).toBe(0);
  expect(result.badStatus).toMatchObject({ status: "error", instrumentId: "salamander-grand" });
  expect(result.badStatus?.error).toContain("versión/preset no aprobados");
  expect(result.badAttack).toBe(false);
});

test("tope global de piano de proyecto no consume las voces live", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { ProjectAudioSink, PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    await Tone.start();
    const destination = new Tone.Gain(0).toDestination();
    const bank = new DecodedPianoSampleBank();
    const raw = Tone.getContext().rawContext as AudioContext;
    const buffer = raw.createBuffer(1, raw.sampleRate, raw.sampleRate);
    for (const midi of [48, 54, 60, 66, 72, 78, 84]) bank.add({ midi, buffer });
    const document = { ...createProjectDocument({ id: "cap-project", at: 1 }),
      trackOrder: ["p"], tracks: [{ id: "p", name: "Piano", kind: "instrument" as const,
        instrument: PROJECT_PIANO_INSTRUMENT,
        mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } }] };
    const sink = new ProjectAudioSink(document, destination, bank, () => true);
    const at = Tone.immediate() + 0.3;
    const base = { kind: "note" as const, sourceKind: "pattern", ownerPath: "track/p/clip/c",
      ownerId: "transport/cap-project/track/p/clip/c/iteration-0/epoch-1", trackId: "p", clipId: "c",
      tick: 0, absoluteTick: 0, iteration: 0, epoch: 1, audioTime: at, sequence: 0,
      channel: 0, pitch: 60, playedPitch: 60, velocity: 100, releaseVelocity: 64,
      durationTicks: 960, tailPolicy: "cut" as const };
    const played = Array.from({ length: 65 }, (_, index) => Boolean(sink.noteOn({ ...base, eventId: `n-${index}` })));
    const before = sink.diagnostics();
    sink.cancelEpoch("transport/cap-project", 1, Tone.immediate());
    const after = sink.diagnostics();
    sink.retire();
    destination.dispose();
    return { played: played.filter(Boolean).length, before, after };
  });
  expect(result.played).toBe(64);
  expect(result.before).toMatchObject({ projectPianoSources: 64, projectPianoSourceLimit: 64, missingAttacks: 1 });
  expect(result.after.projectPianoSources).toBe(0);
});
