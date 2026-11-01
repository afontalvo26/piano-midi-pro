import { expect, test, type Page } from "@playwright/test";

function sineWav(): string {
  const rate = 16_000;
  const frames = 8_000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    const fade = Math.min(1, frame / 120) * Math.min(1, (frames - frame) / 120);
    bytes.writeInt16LE(Math.round(Math.sin(frame * 2 * Math.PI * 220 / rate) * fade * 9000), 44 + frame * 2);
  }
  return bytes.toString("base64");
}

const WAVE_BASE64 = sineWav();
const WAF_FIXTURE = `var _tone_fixture={zones:[${Array.from({ length: 15 }, (_, index) => {
  const midi = 24 + index * 6;
  return `{originalPitch:${midi * 100},fineTune:20,keyRangeLow:21,keyRangeHigh:108,sampleRate:16000,loopStart:1600,loopEnd:6400,file:'${WAVE_BASE64}'}`;
}).join(",")}]};`;

async function isolatedStudioPage(page: Page): Promise<void> {
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body><button id='gesture'>Audio</button></body></html>",
  }));
  await page.goto("/");
}

test("Studio filtra instrumentos reales por familia y motor, cambia un piano local y lo restaura", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const catalog = await page.evaluate(async () => {
    const { INSTRUMENTS } = await import("/src/instruments/catalog.ts");
    return INSTRUMENTS.map(({ id, label, category, engineId, source, licenseUrl }) =>
      ({ id, label, category, engineId, kind: source.kind, licenseUrl }));
  });
  expect(new Set(catalog.map((item) => item.id)).size).toBe(catalog.length);
  expect(catalog.some((item) => item.engineId === "webaudiofont")).toBe(true);
  expect(catalog.every((item) => item.licenseUrl.startsWith("https://"))).toBe(true);
  const warm = catalog.find((item) => item.id === "salamander-warm");
  expect(warm).toBeDefined();

  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.getByLabel("Motor de sonido").selectOption("salamander");
  const visiblePresets = page.locator(".instrument-browser__presets li");
  await expect(visiblePresets).toHaveCount(catalog.filter((item) => item.engineId === "salamander").length);
  await page.getByLabel("Familia de instrumentos").selectOption("Guitarras");
  await expect(visiblePresets).toHaveCount(0);
  await page.getByLabel("Motor de sonido").selectOption("webaudiofont");
  await expect(visiblePresets).toHaveCount(catalog.filter((item) => item.category === "Guitarras").length);
  await page.getByLabel("Familia de instrumentos").selectOption("all");
  await page.getByLabel("Motor de sonido").selectOption("salamander");
  await visiblePresets.filter({ hasText: warm!.label }).locator("button").click();
  await expect(page.locator(".instrument-browser__current strong")).toHaveText(warm!.label);
  await expect(page.locator(".instrument-browser__notice")).toContainText("listo para tocar");
  expect(await page.evaluate(() => localStorage.getItem("piano_live_instrument_id"))).toContain(warm!.id);

  await page.reload();
  await expect(page.locator(".instrument-browser__current strong")).toHaveText(warm!.label);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await expect(page.locator(".instrument-browser__catalog")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test("un instrumento agudo ajusta el rango de 37 teclas sólo después de cargar", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route(/\/sound\/.*\.js$/, (route) => route.fulfill({
    status: 200, contentType: "text/javascript", body: WAF_FIXTURE,
  }));
  await page.goto("/");
  const before = await page.evaluate(() => localStorage.getItem("piano_range_start"));
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.locator(".instrument-browser__presets li").filter({ hasText: "Flauta" }).locator("button").click();
  await expect(page.locator(".instrument-browser__current strong")).toHaveText("Flauta");
  await expect(page.locator(".instrument-browser__notice")).toContainText("Rango ajustado");
  const after = await page.evaluate(() => localStorage.getItem("piano_range_start"));
  expect(after).not.toBe(before);
  expect(Number(JSON.parse(after!))).toBe(60);
  await expect(page.locator(".piano-key-element")).toHaveCount(37);
});

test("un banco WebAudioFont usa voces individuales, conserva sostenidas al cambiar y libera todo", async ({ page }) => {
  await page.route(/\/sound\/.*\.js$/, (route) => route.fulfill({
    status: 200, contentType: "text/javascript", body: WAF_FIXTURE,
  }));
  await isolatedStudioPage(page);
  const result = await page.evaluate(async () => {
    const [{ LiveStudioEngine }, { INSTRUMENTS }, { parseMidiMessage }] = await Promise.all([
      import("/src/audio/liveStudioEngine.ts"), import("/src/instruments/catalog.ts"),
      import("/src/midi/message.ts"),
    ]);
    const waf = INSTRUMENTS.find((item) => item.source.kind === "waf")!;
    const engine = new LiveStudioEngine();
    const initialized = await engine.initialize();
    const origin = { inputId: "waf-stress", channel: 0 };
    const on = (note: number) => engine.noteOn({ ...origin, originalNote: note, mappedMidi: note,
      rawVelocity: 100, amplitude: 0.65, eventTimestamp: performance.now() });
    const off = (note: number) => engine.noteOff({ ...origin, originalNote: note,
      eventTimestamp: performance.now() });
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), origin.inputId, performance.now()));
    const oldAttack = await on(60);
    off(60);
    const changed = await engine.selectInstrument(waf.id);
    const stillHeld = engine.diagnostics().voices?.activeVoiceCount;
    const start = waf.suggestedRange.minMidi;
    const notes = Array.from({ length: 37 }, (_, index) => start + index);
    const first = await Promise.all(notes.map(on));
    notes.forEach(off);
    const second = await Promise.all(notes.map(on));
    const loaded = engine.diagnostics();
    notes.forEach(off);
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 0]), origin.inputId, performance.now()));
    const released = engine.diagnostics();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const recovered = engine.diagnostics();
    engine.dispose();
    return { initialized, oldAttack, changed, stillHeld,
      firstCount: first.filter((id) => id !== null).length,
      secondCount: second.filter((id) => id !== null).length,
      loaded, released, recovered };
  });
  expect(result.initialized).toBe(true);
  expect(result.oldAttack).toBeGreaterThan(0);
  expect(result.changed).toBe(true);
  expect(result.stillHeld).toBe(1);
  expect(result.firstCount).toBe(37);
  expect(result.secondCount).toBe(37);
  expect(result.loaded.voices?.activeVoiceCount).toBeLessThanOrEqual(56);
  expect(result.loaded.voices?.discardedAttackCount).toBe(0);
  expect(result.loaded.voices?.allocatedVoiceCount).toBeLessThanOrEqual(101);
  expect(result.released.voices?.activeVoiceCount).toBe(0);
  expect(result.recovered.voices?.allocatedVoiceCount).toBe(0);
  expect(result.recovered.error).toBeNull();
});

test("la decodificación WebAudioFont conserva afinación fina y puntos de loop", async ({ page }) => {
  await page.route(/\/sound\/.*\.js$/, (route) => route.fulfill({
    status: 200, contentType: "text/javascript", body: WAF_FIXTURE,
  }));
  await isolatedStudioPage(page);
  const sample = await page.evaluate(async () => {
    const { loadWafDecodedBank } = await import("/src/engine/WebAudioFont.ts");
    const bank = await loadWafDecodedBank("0000_FluidR3_GM_sf2_file");
    const anchor = bank.samples.find((item) => item.midi === 60)!;
    return { count: bank.samples.length, midi: anchor.midi, pitchMidi: anchor.pitchMidi,
      loopStartSec: anchor.loopStartSec, loopEndSec: anchor.loopEndSec };
  });
  expect(sample.count).toBe(15);
  expect(sample.midi).toBe(60);
  expect(sample.pitchMidi).toBeCloseTo(59.8, 5);
  expect(sample.loopStartSec).toBeCloseTo(0.1, 5);
  expect(sample.loopEndSec).toBeCloseTo(0.4, 5);
});

test("un timbre WAF cargado sigue tocando aunque fallen las muestras Salamander", async ({ page }) => {
  await page.route(/\/sound\/.*\.js$/, (route) => route.fulfill({
    status: 200, contentType: "text/javascript", body: WAF_FIXTURE,
  }));
  await page.route(/\/salamander\/.*\.ogg$/, (route) => route.abort("failed"));
  await isolatedStudioPage(page);
  const result = await page.evaluate(async () => {
    const [{ LiveStudioEngine }, { INSTRUMENTS }] = await Promise.all([
      import("/src/audio/liveStudioEngine.ts"), import("/src/instruments/catalog.ts"),
    ]);
    const waf = INSTRUMENTS.find((item) => item.source.kind === "waf")!;
    const engine = new LiveStudioEngine();
    const selected = await engine.selectInstrument(waf.id);
    const first = await engine.noteOn({ inputId: "waf-no-salamander", channel: 0,
      originalNote: 60, mappedMidi: 60, rawVelocity: 100, amplitude: 0.6,
      eventTimestamp: performance.now() });
    const second = await engine.noteOn({ inputId: "waf-no-salamander", channel: 0,
      originalNote: 64, mappedMidi: 64, rawVelocity: 100, amplitude: 0.6,
      eventTimestamp: performance.now() });
    const diagnostics = engine.diagnostics();
    engine.releaseAll();
    engine.dispose();
    return { selected, first, second, diagnostics };
  });
  expect(result.selected).toBe(true);
  expect(result.first).toBeGreaterThan(0);
  expect(result.second).toBeGreaterThan(0);
  expect(result.diagnostics.instrument.activeId).toBe("fluid-grand");
  expect(result.diagnostics.samples.loaded).toBeGreaterThan(0);
  expect(result.diagnostics.error).toBeNull();
});

test("un error de red deja el piano activo y no guarda un preset fallido", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route(/\/sound\/.*\.js$/, (route) => route.abort("failed"));
  await page.goto("/");
  const waf = await page.evaluate(async () => {
    const { INSTRUMENTS } = await import("/src/instruments/catalog.ts");
    const item = INSTRUMENTS.find((instrument) => instrument.source.kind === "waf")!;
    return { id: item.id, label: item.label };
  });
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.locator(".instrument-browser__presets li").filter({ hasText: waf.label }).locator("button").click();
  await expect(page.locator(".instrument-browser__error")).toContainText(`No se pudo activar ${waf.label}`);
  await expect(page.locator(".instrument-browser__current strong")).toHaveText("Salamander Grand · natural");
  expect(await page.evaluate(() => localStorage.getItem("piano_live_instrument_id"))).not.toBe(waf.id);
});

test("dos selecciones rápidas sólo activan la última aunque la primera responda tarde", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route(/\/sound\/.*\.js$/, async (route) => {
    if (route.request().url().includes("0000_FluidR3")) {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    try {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: WAF_FIXTURE });
    } catch {
      // The first request is expected to be aborted when the next selection starts.
    }
  });
  await isolatedStudioPage(page);
  const result = await page.evaluate(async () => {
    const [{ LiveStudioEngine }, { INSTRUMENTS }] = await Promise.all([
      import("/src/audio/liveStudioEngine.ts"), import("/src/instruments/catalog.ts"),
    ]);
    const remote = INSTRUMENTS.filter((item) => item.source.kind === "waf");
    const first = remote.find((item) => item.id === "fluid-grand")!;
    const second = remote.find((item) => item.id === "fluid-bright-grand")!;
    const engine = new LiveStudioEngine();
    const pendingFirst = engine.selectInstrument(first.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const pendingSecond = engine.selectInstrument(second.id);
    const [firstResult, secondResult] = await Promise.all([pendingFirst, pendingSecond]);
    const activeId = engine.currentInstrumentId;
    const diagnostics = engine.diagnostics().instrument;
    engine.dispose();
    return { firstResult, secondResult, activeId, diagnostics, expectedId: second.id };
  });
  expect(result.firstResult).toBe(false);
  expect(result.secondResult).toBe(true);
  expect(result.activeId).toBe(result.expectedId);
  expect(result.diagnostics.loadingId).toBeNull();
  expect(result.diagnostics.error).toBeNull();
});
