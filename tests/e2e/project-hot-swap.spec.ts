import { expect, test } from "@playwright/test";

test("edición MIDI cambia sólo horizonte futuro y conserva beat, tick y 37 live", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { ProjectPlayback } = await import("/src/audio/projectPlayback.ts?qa=hot-swap-1");
    const { OwnedVoiceRegistry } = await import("/src/audio/ownedVoiceRegistry.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const makeNote = (pitch: number) => ({ id: "n", startTick: 0,
      durationTick: 900, pitch, velocity: 100, releaseVelocity: 64, channel: 9,
      origin: { kind: "drawn" as const } });
    const pattern = (pitch: number) => ({ id: "pat", name: "Beat", version: 1,
      lengthTicks: 960, notes: [makeNote(pitch)], expression: [] });
    const clip = { id: "clip", trackId: "drums", kind: "pattern" as const,
      sourceId: "pat", sourceVersion: 1, startTick: 0, lengthTicks: 3_840,
      sourceOffsetTick: 0, loopMode: "loop" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false };
    const initial = { ...createProjectDocument({ id: "qa-hot-swap", at: 1 }),
      trackOrder: ["drums"], tracks: [{ id: "drums", name: "Drums", kind: "drum" as const, mix }],
      patterns: [pattern(36)], clips: [clip],
      scenes: [{ id: "scene", name: "Beat", launchQuantizationTicks: 960,
        slots: [{ id: "slot", trackId: "drums", patternId: "pat" }] }] };
    const registry = new OwnedVoiceRegistry();
    for (let pitch = 48; pitch <= 84; pitch++) {
      registry.register({ ownerId: `live/smk37/${pitch}`, epoch: 0, release: () => {} });
    }
    const attacks: Array<{ pitch: number; tick: number; sourceKind: string }> = [];
    const mixCalls: Array<{ trackId: string; patch: unknown }> = [];
    const masterCalls: number[] = [];
    const fakeSink = { projectId: initial.id, rootOwnerId: `transport/${initial.id}`,
      hasAudioOwnership: () => true,
      noteOn(event: { pitch: number; tick: number; sourceKind: string;
        ownerId: string; epoch: number }) {
        attacks.push({ pitch: event.pitch, tick: event.tick, sourceKind: event.sourceKind });
        return registry.register({ ownerId: event.ownerId, epoch: event.epoch, release: () => {} });
      },
      noteOff(handle: object, event: { audioTime: number }) {
        registry.releaseHandle(handle, event.audioTime);
      },
      control() {}, authorityChange() {},
      setTrackMix(trackId: string, patch: unknown) { mixCalls.push({ trackId, patch }); },
      setMasterGainDb(gainDb: number) { masterCalls.push(gainDb); },
      cancelEpoch(root: string, epoch: number, at: number) {
        registry.releaseEpoch(root, epoch, at, 0.008, true);
      },
      diagnostics: () => ({}), retire() {},
    };
    const audio = { currentTime: 1, state: "running" as const };
    const playback = new ProjectPlayback(initial, fakeSink as never, audio,
      createArrangementResolver(initial), undefined, false);
    playback.play(0);
    const before = playback.scheduler.snapshot();
    const mixed = { ...initial, updatedAt: 2,
      tracks: [{ ...initial.tracks[0]!, mix: { ...mix, gainDb: -6, pan: 0.3 } }],
      mix: { ...initial.mix, masterGainDb: -3 } };
    const mixEffectiveTick = playback.syncLiveMixRevision(mixed);
    const next = { ...mixed, updatedAt: 3, patterns: [pattern(38)] };
    const swap = playback.replaceArrangementRevision(next);
    const after = playback.scheduler.snapshot();
    const liveDuring = registry.snapshot().byOwner.filter((entry) =>
      entry.ownerId.startsWith("live/")).reduce((sum, entry) => sum + entry.active, 0);
    const projectDuring = registry.snapshot().byOwner.filter((entry) =>
      entry.ownerId.startsWith("transport/")).reduce((sum, entry) => sum + entry.active, 0);
    let rejectedTempo = "";
    try { playback.replaceArrangementRevision({ ...next,
      tempoMap: [{ tick: 0, microsPerQuarter: 700_000 }] }); }
    catch (error) { rejectedTempo = String(error); }
    let rejectedAudioClip = "";
    try { playback.replaceArrangementRevision({ ...next, clips: [...next.clips,
      { ...clip, id: "new-audio", kind: "audio" as const,
        sourceStartFrame: 0, sourceEndFrame: 1, fadeInFrames: 0, fadeOutFrames: 0 }] }); }
    catch (error) { rejectedAudioClip = String(error); }
    let rejectedRoute = "";
    try { playback.syncLiveMixRevision({ ...next, tracks: [{ ...next.tracks[0]!,
      mix: { ...next.tracks[0]!.mix, outputBusTrackId: "new-bus" } }] }); }
    catch (error) { rejectedRoute = String(error); }
    const queuedScene = playback.queueScene("scene");
    audio.currentTime = 1.55;
    playback.scheduler.pump();
    const sceneAttacks = attacks.filter((entry) => entry.sourceKind === "launcher");
    playback.stop();
    const liveAfterStop = registry.snapshot().byOwner.filter((entry) =>
      entry.ownerId.startsWith("live/")).reduce((sum, entry) => sum + entry.active, 0);
    return { attacks, before, after, swap, liveDuring, projectDuring, liveAfterStop,
      rejectedTempo, rejectedAudioClip, rejectedRoute,
      queuedScene, sceneAttacks, mixEffectiveTick, mixCalls, masterCalls };
  });
  expect(result.attacks[0]).toMatchObject({ pitch: 36, tick: 0 });
  expect(result.swap.affectedTrackIds).toEqual(["drums"]);
  expect(result.swap.effectiveTick).toBeGreaterThan(0);
  expect(result.mixEffectiveTick).toBeGreaterThan(0);
  expect(result.mixCalls).toEqual([{ trackId: "drums", patch: { gainDb: -6, pan: 0.3 } }]);
  expect(result.masterCalls).toEqual([-3]);
  expect(result.after.tick).toBe(result.before.tick);
  expect(result.after.epoch).toBe(result.before.epoch);
  expect(result.after.state).toBe("playing");
  expect(result.liveDuring).toBe(37);
  expect(result.projectDuring).toBe(1);
  expect(result.rejectedTempo).toContain("requiere preparar audio de nuevo");
  expect(result.rejectedAudioClip).toContain("requiere preparar audio de nuevo");
  expect(result.rejectedRoute).toContain("no admite cambiar ruta");
  expect(result.queuedScene).toBe(960);
  expect(result.sceneAttacks[0]).toMatchObject({ pitch: 38, tick: 960 });
  expect(result.liveAfterStop).toBe(37);
});
