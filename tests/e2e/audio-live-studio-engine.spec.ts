import { expect, test, type Page } from "@playwright/test";

async function isolatedStudioPage(page: Page): Promise<void> {
  // Keep the real Vite modules, local OGGs and origin, without mounting the old
  // song App or the new PianoApp alongside the engine under test.
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body><button id='gesture'>Audio</button></body></html>",
  }));
  await page.goto("/");
}

test("motor live carga el núcleo local, conserva instancias y pedales, y dispone el grafo", async ({ page }) => {
  await isolatedStudioPage(page);
  const result = await page.evaluate(async () => {
    const [{ LiveStudioEngine }, { parseMidiMessage }] = await Promise.all([
      import("/src/audio/liveStudioEngine.ts"),
      import("/src/midi/message.ts"),
    ]);
    const engine = new LiveStudioEngine();
    const initialized = await engine.initialize();
    const before = engine.diagnostics();
    const origin = { inputId: "keyboard-a", channel: 0 };
    const other = { inputId: "keyboard-b", channel: 0 };
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), origin.inputId, performance.now()));
    const first = await engine.noteOn({ ...origin, originalNote: 60, mappedMidi: 60,
      rawVelocity: 100, amplitude: 0.7, eventTimestamp: performance.now() });
    const second = await engine.noteOn({ ...other, originalNote: 60, mappedMidi: 60,
      rawVelocity: 100, amplitude: 0.7, eventTimestamp: performance.now() });
    const held = engine.noteOff({ ...origin, originalNote: 60, eventTimestamp: performance.now() });
    const whilePedal = engine.diagnostics().voices;
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 0]), origin.inputId, performance.now()));
    const afterPedal = engine.diagnostics().voices;
    engine.releaseOrigin(other.inputId);
    const afterOrigin = engine.diagnostics().voices;
    engine.dispose();
    const disposed = engine.diagnostics();
    return {
      initialized, before, first, second, held, whilePedal, afterPedal,
      afterOrigin, disposed,
    };
  });
  expect(result.initialized).toBe(true);
  expect(result.before.samples.loaded).toBeGreaterThanOrEqual(7);
  expect(result.before.samples.missingVisible).toBe(0);
  expect(result.first).toBeGreaterThan(0);
  expect(result.second).toBeGreaterThan(0);
  expect(result.held).toBe(result.first);
  expect(result.whilePedal?.activeVoiceCount).toBe(2);
  expect(result.afterPedal?.activeVoiceCount).toBe(1);
  expect(result.afterOrigin?.activeVoiceCount).toBe(0);
  expect(result.disposed.phase).toBe("disposed");
});

test("dos pestañas transfieren el audio después de callar la voz anterior", async ({ context }) => {
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  await isolatedStudioPage(firstPage);
  await isolatedStudioPage(secondPage);
  const start = async (page: Page, inputId: string) => page.evaluate(async (id) => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const engine = new LiveStudioEngine();
    Reflect.set(window, "__liveStudioEngine", engine);
    return engine.noteOn({ inputId: id, channel: 0, originalNote: 60, mappedMidi: 60,
      rawVelocity: 100, amplitude: 0.65, eventTimestamp: performance.now() });
  }, inputId);
  const firstId = await start(firstPage, "port-a");
  const handoffStarted = Date.now();
  const secondId = await start(secondPage, "port-b");
  const handoffMs = Date.now() - handoffStarted;
  console.log(`Studio audio handoff: ${handoffMs} ms`);
  const firstState = await firstPage.evaluate(() => Reflect.get(window, "__liveStudioEngine").diagnostics());
  const secondState = await secondPage.evaluate(() => Reflect.get(window, "__liveStudioEngine").diagnostics());
  expect(firstId).toBeGreaterThan(0);
  expect(secondId).toBeGreaterThan(0);
  expect(firstState.audioLock.owns).toBe(false);
  expect(firstState.voices.activeVoiceCount).toBe(0);
  expect(secondState.audioLock.owns).toBe(true);
  expect(secondState.voices.activeVoiceCount).toBe(1);
  await Promise.all([firstPage, secondPage].map((page) => page.evaluate(() => {
    Reflect.get(window, "__liveStudioEngine").dispose();
  })));
});

test("37 teclas, segundo acorde con sustain y recuperación completa del motor live", async ({ page }) => {
  await isolatedStudioPage(page);
  const result = await page.evaluate(async () => {
    const [{ LiveStudioEngine }, { parseMidiMessage }] = await Promise.all([
      import("/src/audio/liveStudioEngine.ts"), import("/src/midi/message.ts"),
    ]);
    const engine = new LiveStudioEngine();
    await engine.initialize();
    const origin = { inputId: "smk37-stress", channel: 0 };
    const pitches = Array.from({ length: 37 }, (_, index) => 48 + index);
    const strike = () => Promise.all(pitches.map((note) => engine.noteOn({
      ...origin, originalNote: note, mappedMidi: note, rawVelocity: 100,
      amplitude: 0.7, eventTimestamp: performance.now(),
    })));
    const lift = () => pitches.forEach((note) => engine.noteOff({
      ...origin, originalNote: note, eventTimestamp: performance.now(),
    }));
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), origin.inputId, performance.now()));
    const first = await strike();
    const firstSnapshot = engine.diagnostics();
    lift();
    const pedalHeld = engine.diagnostics();
    const second = await strike();
    const secondSnapshot = engine.diagnostics();
    lift();
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 0]), origin.inputId, performance.now()));
    const released = engine.diagnostics();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const recovered = engine.diagnostics();
    engine.dispose();
    return {
      firstCount: first.filter((id) => id !== null).length,
      secondCount: second.filter((id) => id !== null).length,
      firstSnapshot, pedalHeld, secondSnapshot, released, recovered,
    };
  });
  expect(result.firstCount).toBe(37);
  expect(result.secondCount).toBe(37);
  expect(result.firstSnapshot.voices?.activeVoiceCount).toBe(37);
  expect(result.pedalHeld.voices?.activeVoiceCount).toBe(37);
  expect(result.secondSnapshot.voices?.activeVoiceCount).toBeGreaterThanOrEqual(37);
  expect(result.secondSnapshot.voices?.discardedAttackCount).toBe(0);
  expect(result.secondSnapshot.voices?.allocatedVoiceCount).toBeLessThanOrEqual(101);
  expect(result.released.voices?.activeVoiceCount).toBe(0);
  expect(result.recovered.voices?.allocatedVoiceCount).toBe(0);
  expect(result.recovered.audioContextState).toBe("running");
  expect(result.recovered.error).toBeNull();
});
