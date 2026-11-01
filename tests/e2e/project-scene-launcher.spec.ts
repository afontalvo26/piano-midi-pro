import { expect, test } from "@playwright/test";

test("launcher cuantiza por reloj con cambio de BPM, libera sólo pistas tomadas y captura segmentos", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { ProjectPlayback } = await import("/src/audio/projectPlayback.ts?qa=scene-1");
    const { OwnedVoiceRegistry } = await import("/src/audio/ownedVoiceRegistry.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const note = (id: string, pitch: number) => ({ id, startTick: 0, durationTick: 120,
      pitch, velocity: 100, releaseVelocity: 64, channel: 9,
      origin: { kind: "drawn" as const } });
    const patterns = [
      { id: "pa", name: "A", version: 1, lengthTicks: 960, notes: [note("na", 36)], expression: [] },
      { id: "pb", name: "B", version: 1, lengthTicks: 960, notes: [note("nb", 38)], expression: [] },
      { id: "pc", name: "C", version: 1, lengthTicks: 960, notes: [note("nc", 39)], expression: [] },
    ];
    const clip = (id: string, trackId: string, sourceId: string) => ({ id, trackId,
      kind: "pattern" as const, sourceId, sourceVersion: 1, startTick: 0,
      lengthTicks: 3_840, sourceOffsetTick: 0, loopMode: "loop" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false });
    const document = { ...createProjectDocument({ id: "qa-scenes", at: 1 }),
      tempoMap: [{ tick: 0, microsPerQuarter: 500_000 },
        { tick: 960, microsPerQuarter: 1_000_000 }],
      trackOrder: ["t1", "t2"], tracks: [
        { id: "t1", name: "Drums A", kind: "drum" as const, mix },
        { id: "t2", name: "Drums B", kind: "drum" as const, mix },
      ], patterns, clips: [clip("c1", "t1", "pa"), clip("c2", "t2", "pc")],
      scenes: [
        { id: "scene-a", name: "A", launchQuantizationTicks: 960,
          slots: [{ id: "slot-a", trackId: "t1", patternId: "pa" }] },
        { id: "scene-b", name: "B", launchQuantizationTicks: 960,
          slots: [{ id: "slot-b1", trackId: "t1", patternId: "pb" },
            { id: "slot-b2", trackId: "t2", patternId: "pc" }] },
        { id: "instant", name: "Instant", launchQuantizationTicks: 0,
          slots: [{ id: "slot-i", trackId: "t1", patternId: "pa" }] },
      ] };
    const registry = new OwnedVoiceRegistry();
    for (let pitch = 48; pitch <= 84; pitch++) {
      registry.register({ ownerId: `live/smk37/${pitch}`, epoch: 0, release: () => {} });
    }
    const owners = new Map<object, { trackId: string; ownerId: string }>();
    const order: string[] = [];
    const boundaries: Array<{ tick: number; tracks: readonly string[]; at: number }> = [];
    const fakeSink = { projectId: document.id, rootOwnerId: `transport/${document.id}`,
      hasAudioOwnership: () => true,
      noteOn(event: { trackId: string; ownerId: string; epoch: number;
        sourceKind: string; tick: number }) {
        order.push(`on:${event.sourceKind}:${event.tick}:${event.trackId}`);
        const handle = registry.register({ ownerId: event.ownerId, epoch: event.epoch,
          release: () => {} });
        owners.set(handle, { trackId: event.trackId, ownerId: event.ownerId });
        return handle;
      },
      noteOff(handle: object, event: { audioTime: number }) {
        registry.releaseHandle(handle, event.audioTime);
      },
      control() {},
      authorityChange(event: { tick: number; trackIds: readonly string[]; audioTime: number }) {
        order.push(`authority:${event.tick}`);
        boundaries.push({ tick: event.tick, tracks: event.trackIds, at: event.audioTime });
        for (const [handle, owner] of owners) {
          if (event.trackIds.includes(owner.trackId)) registry.releaseHandle(handle, event.audioTime);
        }
      },
      cancelEpoch(root: string, epoch: number, audioTime: number) {
        registry.releaseEpoch(root, epoch, audioTime, 0.008, true);
      },
      diagnostics: () => ({}),
      retire() {},
    };
    const audio = { currentTime: 1, state: "running" as const };
    const playback = new ProjectPlayback(document, fakeSink as never, audio,
      createArrangementResolver(document), undefined, false);
    const queuedWhileStopped = playback.queueScene("instant");
    const stoppedSnapshot = playback.launchSnapshot();
    playback.stopScene();
    playback.play(0);
    const launchA = playback.queueScene("scene-a");
    const queuedA = playback.launchSnapshot();
    audio.currentTime = 1.55;
    const delayedA = playback.launchSnapshot();
    playback.scheduler.pump();
    const activeA = playback.launchSnapshot();
    const launchB = playback.queueScene("scene-b");
    audio.currentTime = 2.55;
    const delayedB = playback.launchSnapshot();
    playback.scheduler.pump();
    const activeB = playback.launchSnapshot();
    const stopTick = playback.stopScene();
    audio.currentTime = 3.55;
    playback.scheduler.pump();
    const afterStopScene = playback.launchSnapshot();
    playback.clearPerformedSceneSegments();
    const afterAck = playback.launchSnapshot();
    playback.stop();
    const liveAfterStop = registry.snapshot().byOwner.filter((entry) =>
      entry.ownerId.startsWith("live/")).reduce((sum, entry) => sum + entry.active, 0);
    return { queuedWhileStopped, stoppedSnapshot, launchA, queuedA, delayedA, activeA,
      launchB, delayedB, activeB, stopTick, afterStopScene, afterAck, boundaries,
      order, liveAfterStop };
  });
  expect(result.queuedWhileStopped).toBe(0);
  expect(result.stoppedSnapshot).toMatchObject({ activeSceneId: null, queuedSceneId: "instant",
    queuedStartTick: 0 });
  expect(result.launchA).toBe(960);
  expect(result.queuedA).toMatchObject({ activeSceneId: null, queuedSceneId: "scene-a",
    queuedStartTick: 960 });
  expect(result.delayedA).toMatchObject({ activeSceneId: null,
    queuedSceneId: "scene-a", performedSceneSegments: [] });
  expect(result.activeA.activeSceneId).toBe("scene-a");
  expect(result.launchB).toBe(1920);
  expect(result.delayedB).toMatchObject({ activeSceneId: null,
    queuedSceneId: "scene-b", performedSceneSegments: [] });
  expect(result.activeB.activeSceneId).toBe("scene-b");
  expect(result.stopTick).toBe(2880);
  expect(result.afterStopScene).toMatchObject({ activeSceneId: null,
    performedSceneSegments: [
      { sceneId: "scene-a", startTick: 960, endTick: 1920 },
      { sceneId: "scene-b", startTick: 1920, endTick: 2880 },
    ], performanceRevision: 2 });
  expect(result.afterAck.performedSceneSegments).toEqual([]);
  expect(result.afterAck.performanceRevision).toBe(2);
  expect(result.boundaries.map((entry) => [entry.tick, entry.tracks])).toEqual([
    [960, ["t1"]], [1920, ["t1", "t2"]], [2880, ["t1", "t2"]],
  ]);
  expect(result.boundaries[0]?.at).toBeCloseTo(1.508, 2);
  expect(result.order.indexOf("authority:960")).toBeLessThan(
    result.order.indexOf("on:launcher:960:t1"));
  expect(result.liveAfterStop).toBe(37);
});
