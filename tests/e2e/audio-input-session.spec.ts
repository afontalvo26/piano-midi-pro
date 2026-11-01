import { expect, test } from "@playwright/test";

test("entrada pide permiso al armar, monitor apagado y WAV conserva frames/tiempo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { AudioInputSession, projectTakeFromCapture } =
      await import("/src/audio/audioInputSession.ts");
    const { ProjectAssetStore } = await import("/src/project/assets.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    const context = new AudioContext();
    await context.resume();
    let chunks = 0;
    const session = new AudioInputSession({ context, ownsAudio: () => true,
      onChunk: () => { chunks++; } });
    const before = session.snapshot();
    const armed = await session.arm(undefined, 1);
    let riskError = "";
    try { session.setMonitorEnabled(true); } catch (error) { riskError = String(error); }
    const monitoring = session.setMonitorEnabled(true, true);
    session.setMonitorEnabled(false);
    const plannedStart = context.currentTime + 0.12;
    const started = await session.start({ assetId: "qa-audio-1", trackId: "audio-1",
      epoch: 7, startTick: 960, audioTime: plannedStart, latencyOffsetFrames: 12 });
    const take = await session.stop(plannedStart + 0.25);
    if (!take) throw new Error("No se cerró la toma");
    const store = new ProjectAssetStore({ databaseName: `qa-audio-${crypto.randomUUID()}` });
    await store.stageAsset(take.ref, take.data);
    const reopened = await store.readAsset(take.ref);
    await store.close();
    const takeRef = projectTakeFromCapture(take, "take-audio-1", 42);
    const document = { ...createProjectDocument({ id: "qa-audio-project", at: 1 }),
      assets: [take.ref], takes: [takeRef] };
    validateProjectDocument(document);
    const decoded = await context.decodeAudioData(await take.data.arrayBuffer());
    const after = session.snapshot();
    await context.close();
    return { before, armed, riskError, monitoring, started, plannedStart,
      after, chunks, take: { ...take, data: null }, takeRef,
      reopened: reopened?.size ?? null,
      decodedFrames: decoded.length };
  });
  expect(result.before).toMatchObject({ state: "idle", permission: "unknown", monitorEnabled: false });
  expect(result.armed).toMatchObject({ state: "armed", permission: "granted", monitorEnabled: false });
  expect(result.riskError).toContain("realimentación");
  expect(result.monitoring).toMatchObject({ monitorEnabled: true, feedbackRisk: true });
  expect(result.started).toBeGreaterThanOrEqual(result.plannedStart - 0.003);
  expect(result.chunks).toBeGreaterThan(0);
  expect(result.take.incomplete).toBe(false);
  expect(result.take.reason).toBe("stop");
  expect(result.take.startTick).toBe(960);
  expect(result.take.epoch).toBe(7);
  expect(result.take.latencyOffsetFrames).toBe(12);
  expect(result.takeRef.audioCapture).toMatchObject({ frameCount: result.take.frameCount,
    sampleRate: result.take.sampleRate, latencyOffsetFrames: 12, incomplete: false });
  expect(result.take.frameCount).toBeGreaterThan(8_000);
  expect(result.take.frameCount).toBeLessThan(16_000);
  expect(result.decodedFrames).toBe(result.take.frameCount);
  expect(result.reopened).toBe(result.take.ref.byteLength);
  expect(result.after).toMatchObject({ state: "ready", monitorEnabled: false });
});

test("pérdida del lock cierra toma incompleta; cancelar descarta bytes", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { AudioInputSession } = await import("/src/audio/audioInputSession.ts");
    const context = new AudioContext();
    await context.resume();
    let owns = true;
    let completed = 0;
    const session = new AudioInputSession({ context, ownsAudio: () => owns,
      onTake: () => { completed++; } });
    await session.arm();
    await session.start({ assetId: "partial", trackId: "audio-1", epoch: 1, startTick: 0 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    owns = false;
    session.interrupt("audio-lock-lost");
    const interrupted = await session.stop();
    const interruptedState = session.snapshot().state;
    owns = true;
    await session.arm();
    await session.start({ assetId: "discard", trackId: "audio-1", epoch: 2, startTick: 0 });
    session.cancel();
    const cancelled = await session.stop();
    const cancelledState = session.snapshot().state;
    await context.close();
    return { interrupted: interrupted ? { reason: interrupted.reason,
      incomplete: interrupted.incomplete, frames: interrupted.frameCount } : null,
      interruptedState, completed, cancelled, cancelledState };
  });
  expect(result.interrupted).toMatchObject({ reason: "audio-lock-lost", incomplete: true });
  expect(result.interrupted?.frames).toBeGreaterThan(0);
  expect(result.interruptedState).toBe("interrupted");
  expect(result.completed).toBe(1);
  expect(result.cancelled).toBeNull();
  expect(result.cancelledState).toBe("idle");
});

test("Studio crea captura sobre su mismo AudioContext y panic interrumpe", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/liveStudioEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const engine = new LiveStudioEngine();
    const session = await engine.createAudioInputSession();
    const shared = (session as unknown as { context: AudioContext }).context === Tone.getContext().rawContext;
    await session.arm();
    await session.start({ assetId: "engine-capture", trackId: "audio-1", epoch: 5, startTick: 0 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    engine.releaseAll();
    const take = await session.stop();
    const state = session.snapshot().state;
    engine.releaseAudioInputSession(session);
    engine.dispose();
    return { shared, take: take ? { incomplete: take.incomplete,
      reason: take.reason, frames: take.frameCount } : null, state };
  });
  expect(result.shared).toBe(true);
  expect(result.take).toMatchObject({ incomplete: true, reason: "panic" });
  expect(result.take?.frames).toBeGreaterThan(0);
  expect(result.state).toBe("interrupted");
});

test("el primer frame confirmado guarda µs de proyecto antes de redondear tick", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { AudioInputSession, projectTakeFromCapture } =
      await import("/src/audio/audioInputSession.ts");
    const { MusicalClock } = await import("/src/sequencer/musicalClock.ts");
    const context = new AudioContext();
    await context.resume();
    const clock = new MusicalClock([{ tick: 0, microsPerQuarter: 500_000 }],
      [{ tick: 0, numerator: 4, denominator: 4 }]);
    const plannedTime = context.currentTime + 0.12;
    const anchor = plannedTime - 0.499_741;
    const position = (time: number) => {
      const projectUs = Math.round((time - anchor) * 1_000_000);
      return { projectUs, projectTick: clock.secondsToTick(projectUs / 1_000_000) };
    };
    const session = new AudioInputSession({ context, ownsAudio: () => true,
      projectPositionAtAudioTime: position });
    await session.arm();
    const actualStart = await session.start({ assetId: "precise-capture", trackId: "audio",
      epoch: 1, startTick: 0, audioTime: plannedTime });
    const take = await session.stop(plannedTime + 0.2);
    if (!take) throw new Error("No se cerró toma precisa");
    const ref = projectTakeFromCapture(take, "precise-take", 1);
    const expected = position(actualStart);
    session.dispose();
    await context.close();
    return { take: { tick: take.startTick, us: take.startProjectUs,
      actualTime: take.startAudioTime, frames: take.frameCount },
      expected, savedUs: ref.audioCapture?.startProjectUs };
  });
  expect(result.take.actualTime).toBeGreaterThan(0);
  expect(result.take.frames).toBeGreaterThan(0);
  expect(result.take.tick).toBe(result.expected.projectTick);
  expect(result.take.us).toBe(result.expected.projectUs);
  expect(result.savedUs).toBe(result.take.us);
});

test("count-in grabado y punch usan un AudioContext; Stop cancela antes del primer frame", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { projectTakeFromCapture } = await import("/src/audio/audioInputSession.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const engine = new LiveStudioEngine();
    const document = createProjectDocument({ id: "qa-count-in", at: 1,
      microsPerQuarter: 200_000 });
    const playback = await engine.prepareProjectPlayback(document, () => []);
    if (!playback) throw new Error("No se preparó transporte de captura");
    const session = await engine.createAudioInputSession();
    await session.arm();
    const now = engine.projectAudioNow()!;
    const schedule = await engine.scheduleProjectAudioRecording(session,
      { startTick: 0, countInBars: 1, punch: { startTick: 0, endTick: 960 } },
      { assetId: "qa-count-in-wav", trackId: "capture-audio", epoch: 1,
        latencyOffsetFrames: 0 });
    const stateDuringCountIn = session.state;
    const started = await schedule.started;
    const stateDuringPunch = session.state;
    const take = await schedule.completed;
    if (!take) throw new Error("Punch no produjo toma");
    const takeRef = projectTakeFromCapture(take, "qa-count-in-take", 1);
    engine.stopProjectPlayback();
    await session.arm();
    const cancelledSchedule = await engine.scheduleProjectAudioRecording(session,
      { startTick: 0, countInBars: 1 },
      { assetId: "qa-cancelled", trackId: "capture-audio", epoch: 2 });
    cancelledSchedule.cancel("user-cancel");
    let cancelled = false;
    try { await cancelledSchedule.started; } catch { cancelled = true; }
    const cancelledState = session.state;
    const transportAfterCancel = playback.scheduler.snapshot().state;
    await session.arm();
    const interruptedSchedule = await engine.scheduleProjectAudioRecording(session,
      { startTick: 0, countInBars: 0, punch: { startTick: 0, endTick: 9600 } },
      { assetId: "qa-partial-punch", trackId: "capture-audio", epoch: 3 });
    await interruptedSchedule.started;
    await new Promise((resolve) => setTimeout(resolve, 100));
    engine.stopProjectPlayback();
    const partial = await interruptedSchedule.completed;
    engine.releaseAudioInputSession(session);
    engine.dispose();
    return { now, schedule: { startAudioTime: schedule.startAudioTime,
      endAudioTime: schedule.endAudioTime, countInClicks: schedule.countInClicks },
      stateDuringCountIn, stateDuringPunch, started,
      take: { startTick: take.startTick, startProjectUs: take.startProjectUs,
        startAudioTime: take.startAudioTime, endAudioTime: take.endAudioTime,
        frameCount: take.frameCount, incomplete: take.incomplete, punch: take.punch },
      takeRef: takeRef.audioCapture, cancelled, cancelledState, transportAfterCancel,
      partial: partial ? { incomplete: partial.incomplete, reason: partial.reason,
        frameCount: partial.frameCount } : null,
      transportState: playback.scheduler.snapshot().state };
  });
  expect(result.schedule.countInClicks).toBe(4);
  expect(result.schedule.startAudioTime - result.now).toBeGreaterThan(0.79);
  expect(result.schedule.endAudioTime! - result.schedule.startAudioTime).toBeCloseTo(0.2, 2);
  expect(result.stateDuringCountIn).toBe("starting");
  expect(result.stateDuringPunch).toBe("stopping");
  expect(result.started).toBeGreaterThanOrEqual(result.schedule.startAudioTime - 1 / 44_100);
  expect(result.take.startTick).toBe(0);
  expect(result.take.startProjectUs).toBeGreaterThanOrEqual(0);
  expect(result.take.frameCount).toBeGreaterThan(7_000);
  expect(result.take.frameCount).toBeLessThan(12_000);
  expect(result.take.incomplete).toBe(false);
  expect(result.take.punch).toMatchObject({ startTick: 0, endTick: 960 });
  expect(result.take.punch?.startAudioTime).toBe(result.take.startAudioTime);
  expect(result.takeRef?.punch).toEqual(result.take.punch);
  expect(result.cancelled).toBe(true);
  expect(result.cancelledState).toBe("idle");
  expect(result.transportAfterCancel).toBe("stopped");
  expect(result.partial).toMatchObject({ incomplete: true, reason: "transport-stopped" });
  expect(result.partial?.frameCount).toBeGreaterThan(0);
  expect(result.partial?.frameCount).toBeLessThan(48_000);
  expect(result.transportState).toBe("stopped");
});

test("punch futuro con loop repite tempo y persiste µs del frame confirmado", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { projectTakeFromCapture } = await import("/src/audio/audioInputSession.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    const document = { ...createProjectDocument({ id: "qa-loop-punch", at: 1 }),
      tempoMap: [{ tick: 0, microsPerQuarter: 500_000 },
        { tick: 1440, microsPerQuarter: 250_000 }] };
    const engine = new LiveStudioEngine();
    const playback = await engine.prepareProjectPlayback(document, () => [],
      { startTick: 960, endTick: 1920 });
    if (!playback || !(await engine.playProjectPlayback(960))) throw new Error("Loop no inició");
    const session = await engine.createAudioInputSession();
    await session.arm();
    const expectedUs = playback.scheduler.projectUsAtAbsoluteTick(2880);
    const schedule = await engine.scheduleProjectAudioRecording(session,
      { startTick: 2880, countInBars: 0, punch: { startTick: 2880, endTick: 3000 } },
      { assetId: "qa-loop-punch-wav", trackId: "capture-loop", epoch: 1 });
    await schedule.started;
    const take = await schedule.completed;
    if (!take) throw new Error("Punch de loop sin toma");
    const ref = projectTakeFromCapture(take, "qa-loop-punch-take", 1);
    validateProjectDocument({ ...document, assets: [take.ref], takes: [ref] });
    const transportState = playback.scheduler.state;
    engine.stopProjectPlayback();
    engine.releaseAudioInputSession(session);
    engine.dispose();
    return { expectedUs, startUs: take.startProjectUs, tick: take.startTick,
      punch: take.punch, frames: take.frameCount, incomplete: take.incomplete,
      scheduledDuration: schedule.endAudioTime! - schedule.startAudioTime,
      transportState };
  });
  expect(Math.abs(result.startUs! - result.expectedUs)).toBeLessThan(1000);
  expect(result.tick).not.toBe(2880);
  expect(result.punch?.startTick).toBe(result.tick);
  expect(result.punch?.endTick).toBeGreaterThan(result.tick);
  expect(result.frames).toBeGreaterThan(1_000);
  expect(result.incomplete).toBe(false);
  expect(result.scheduledDuration).toBeCloseTo(0.0625, 3);
  expect(result.transportState).toBe("playing");
});
