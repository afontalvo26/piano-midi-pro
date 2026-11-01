import { expect, test } from "@playwright/test";

test("las cuatro capas se cargan sólo al elegirlas y no ralentizan la siguiente apertura", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const active = page.locator(".instrument-browser__current-copy strong");
  await expect(active).toHaveText("Salamander Grand · natural");
  await page.getByRole("button", { name: "Activar audio" }).click();
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.getByRole("button", { name: /Salamander Grand · 4 capas reales/ }).click();
  await expect(active).toHaveText("Salamander Grand · 4 capas reales", { timeout: 90_000 });
  await expect(page.locator(".instrument-browser__error")).toHaveCount(0);
  await expect(page.locator(".instrument-browser__loading")).toHaveCount(0);

  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/audio/salamander/multivelocity/")) requests.push(request.url());
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(active).toHaveText("Salamander Grand · natural");
  await expect(page.locator(".instrument-browser__notice"))
    .toContainText("está disponible en Cambiar instrumento");
  expect(requests).toEqual([]);
});

test("cancelar la carga multicapa conserva el piano que ya está sonando", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  let releaseFirstFile: (() => void) | undefined;
  let firstFileRequested = false;
  const gate = new Promise<void>((resolve) => { releaseFirstFile = resolve; });
  await page.route("**/audio/salamander/multivelocity/v1/C3v1.ogg", async (route) => {
    firstFileRequested = true;
    await gate;
    await route.continue().catch(() => {});
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const active = page.locator(".instrument-browser__current-copy strong");
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.getByRole("button", { name: /Salamander Grand · 4 capas reales/ }).click();
  await expect.poll(() => firstFileRequested, { timeout: 20_000 }).toBe(true);
  await expect(page.locator(".instrument-browser__loading")).toContainText("Sigue sonando Salamander Grand · natural");
  await page.getByRole("button", { name: "Cancelar carga" }).click();
  releaseFirstFile?.();
  await expect(page.locator(".instrument-browser__loading")).toHaveCount(0);
  await expect(active).toHaveText("Salamander Grand · natural");
  await expect(page.locator(".instrument-browser__error")).toHaveCount(0);
  await expect(page.locator(".instrument-browser__notice"))
    .toContainText("Carga cancelada");
});

test("una muestra multicapa ausente no sustituye ni silencia el piano activo", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  await page.route("**/audio/salamander/multivelocity/v5/C4v5.ogg", (route) => route.fulfill({
    status: 404,
    contentType: "text/plain",
    body: "missing",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const active = page.locator(".instrument-browser__current-copy strong");
  await page.getByRole("button", { name: "Cambiar instrumento" }).click();
  await page.getByRole("button", { name: /Salamander Grand · 4 capas reales/ }).click();
  await expect(page.locator(".instrument-browser__error"))
    .toContainText("Sigue sonando Salamander Grand · natural", { timeout: 60_000 });
  await expect(active).toHaveText("Salamander Grand · natural");
  await expect(page.locator(".instrument-browser__loading")).toHaveCount(0);
});

test("el banco de cuatro capas cubre 37 notas y selecciona grabaciones distintas por velocity", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Prueba de capas</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const [{ loadSalamanderLayers, MAX_LAYERED_PCM_BYTES }, { getCorePianoBuffer }] = await Promise.all([
      import("/src/audio/salamanderLayers.ts"),
      import("/src/audio/corePianoPreload.ts"),
    ]);
    const reference = await getCorePianoBuffer("C4");
    if (!reference) throw new Error("Muestra C4 de referencia ausente");
    const progress: number[] = [];
    const loaded = await loadSalamanderLayers(reference, new AbortController().signal,
      (item) => progress.push(item.loaded));
    const sampled = [8, 45, 76, 127].map((velocity) => ({
      velocity,
      layer: loaded.bank.closest(60, 2, velocity)?.velocityLayer,
      gainCompensation: loaded.bank.closest(60, 2, velocity)?.gainCompensation,
    }));
    return {
      size: loaded.bank.size,
      coverage: loaded.bank.coverage(48, 84, 2),
      decodedPcmBytes: loaded.bank.decodedPcmBytes,
      ceiling: MAX_LAYERED_PCM_BYTES,
      gain: loaded.levelMatchGain,
      progress,
      sampled,
    };
  });
  expect(result.size).toBe(52);
  expect(result.coverage.playable).toHaveLength(37);
  expect(result.coverage.missing).toHaveLength(0);
  expect(result.decodedPcmBytes).toBeGreaterThan(240 * 1024 * 1024);
  expect(result.decodedPcmBytes).toBeLessThan(result.ceiling);
  expect(result.progress).toHaveLength(52);
  expect(result.progress[0]).toBe(1);
  expect(result.progress.at(-1)).toBe(52);
  expect(result.sampled.map((item) => item.layer)).toEqual([1, 5, 10, 16]);
  expect(result.sampled.every((item) => (item.gainCompensation ?? 0) > 0)).toBe(true);
  expect(result.gain).toBeGreaterThan(0.1);
  expect(result.gain).toBeLessThan(1);
});

test("los cambios entre capas conservan el nivel del ataque sin saltos bruscos", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Continuidad de capas</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const measured = await page.evaluate(async () => {
    const factorySource = await fetch("/src/audio/toneSampleVoiceFactory.ts")
      .then((response) => response.text());
    const toneUrl = factorySource.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no encontrado");
    const [Tone, { getCorePianoBuffer }, { loadSalamanderLayers }, voiceModule, velocityModule] =
      await Promise.all([
        import(toneUrl), import("/src/audio/corePianoPreload.ts"),
        import("/src/audio/salamanderLayers.ts"),
        import("/src/audio/toneSampleVoiceFactory.ts"),
        import("/src/utils/velocity.ts"),
      ]);
    const reference = await getCorePianoBuffer("C4");
    if (!reference) throw new Error("C4 de referencia ausente");
    const loaded = await loadSalamanderLayers(reference, new AbortController().signal, () => {});
    const velocities = [28, 29, 30, 60, 61, 62, 99, 100, 101];
    const result = [];
    for (const velocity of velocities) {
      const amplitude = velocityModule.midiVelocityToGain(velocity, "expressive",
        velocityModule.DEFAULT_PHYSICAL_CALIBRATION);
      const rendered = await Tone.Offline(() => {
        const output = new Tone.Gain(loaded.levelMatchGain).toDestination();
        const factory = new voiceModule.ToneSampleVoiceFactory(loaded.bank, output, {
          maxShiftSemitones: 2, attackSeconds: 0, velocityColor: true,
        });
        factory.create({ attackId: velocity, inputId: "continuity", channel: 0,
          originalNote: 60, mappedMidi: 60, rawVelocity: velocity,
          amplitude, audioTime: 0.1 },
        { gain: amplitude * 0.85, bendSemitones: 0, softPedal: false, modulation: 0 }, () => {});
      }, 0.55, 1, 48000);
      const data = rendered.get().getChannelData(0);
      const start = Math.round(0.2 * 48000);
      const end = Math.round(0.35 * 48000);
      let energy = 0;
      for (let index = start; index < end; index++) energy += data[index] ** 2;
      result.push({ velocity, layer: loaded.bank.closest(60, 2, velocity)?.velocityLayer,
        rms: Math.sqrt(energy / (end - start)) });
    }
    return result;
  });
  console.log("Continuidad multicapa C4:", JSON.stringify(measured));
  for (const first of [0, 3, 6]) {
    for (let index = first + 1; index <= first + 2; index++) {
      const previous = measured[index - 1];
      const current = measured[index];
      const jumpDb = 20 * Math.log10(current.rms / previous.rms);
      expect(jumpDb).toBeGreaterThan(-0.5);
      expect(jumpDb).toBeLessThan(2);
    }
  }
});

test("el preset multicapa sigue sonando con 37+37 y conserva octavas fuera de C3–C6", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Estrés multicapa</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const source = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = source.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no encontrado");
    const [Tone, { LiveStudioEngine }, { parseMidiMessage }, velocityModule] = await Promise.all([
      import(toneUrl), import("/src/audio/liveStudioEngine.ts"),
      import("/src/midi/message.ts"), import("/src/utils/velocity.ts"),
    ]);
    let waitingForCoverage = false;
    let resolveCoverage: (() => void) | null = null;
    const coverageReady = new Promise<void>((resolve) => { resolveCoverage = resolve; });
    const engine = new LiveStudioEngine({ masterVolumeDb: -10, reverbSend: 0,
      onDiagnostics: (diagnostics) => {
        if (waitingForCoverage && diagnostics.instrument.activeId === "salamander-layered"
          && diagnostics.samples.missingVisible === 0) {
          waitingForCoverage = false;
          resolveCoverage?.();
        }
      },
    });
    await engine.initialize();
    if (!await engine.selectInstrument("salamander-layered")) {
      throw new Error(`No cargó multicapa: ${engine.diagnostics().instrument.error}`);
    }
    const raw = Tone.getContext().rawContext as AudioContext;
    const analyser = raw.createAnalyser();
    analyser.fftSize = 4096;
    Tone.getDestination().connect(analyser);
    analyser.connect(raw.destination);
    const waveform = new Float32Array(analyser.fftSize);
    const rms = () => {
      analyser.getFloatTimeDomainData(waveform);
      let sum = 0;
      let peak = 0;
      for (const value of waveform) {
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      return { rms: Math.sqrt(sum / waveform.length), peak };
    };
    const origin = { inputId: "layered-smk37", channel: 0 };
    const notes = Array.from({ length: 37 }, (_, index) => 48 + index);
    const strike = () => Promise.all(notes.map((note) => engine.noteOn({
      ...origin, originalNote: note, mappedMidi: note, rawVelocity: 100,
      amplitude: velocityModule.midiVelocityToGain(100, "expressive",
        velocityModule.DEFAULT_PHYSICAL_CALIBRATION), eventTimestamp: performance.now(),
    })));
    const lift = () => notes.forEach((note) => engine.noteOff({
      ...origin, originalNote: note, eventTimestamp: performance.now(),
    }));
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), origin.inputId, performance.now()));
    const firstIds = await strike();
    await new Promise((resolve) => setTimeout(resolve, 170));
    const first = rms();
    lift();
    const secondIds = await strike();
    await new Promise((resolve) => setTimeout(resolve, 170));
    const second = rms();
    const overlap = engine.diagnostics();
    lift();
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 0]), origin.inputId, performance.now()));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const recovered = engine.diagnostics();
    waitingForCoverage = true;
    engine.setVisibleRangeStart(60);
    let coverageTimeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      coverageReady,
      new Promise<void>((_, reject) => {
        coverageTimeout = setTimeout(() => reject(new Error("Fallback mono no cubrió C4–C7")), 15_000);
      }),
    ]).finally(() => clearTimeout(coverageTimeout));
    const shifted = engine.diagnostics();
    const highId = await engine.noteOn({ ...origin, originalNote: 96, mappedMidi: 96,
      rawVelocity: 90, amplitude: 0.5, eventTimestamp: performance.now() });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const outside = rms();
    engine.noteOff({ ...origin, originalNote: 96, eventTimestamp: performance.now() });
    engine.dispose();
    analyser.disconnect();
    return { firstIds, secondIds, first, second, overlap, recovered, shifted, highId, outside };
  });
  console.log("Multicapa 37+37 y nota C7:", JSON.stringify({
    first: result.first, second: result.second, outside: result.outside,
    residentBytes: result.shifted.samples.residentDecodedPcmBytes,
  }));
  expect(result.firstIds.filter((id: number | null) => id !== null)).toHaveLength(37);
  expect(result.secondIds.filter((id: number | null) => id !== null)).toHaveLength(37);
  expect(result.overlap.voices?.discardedAttackCount).toBe(0);
  expect(result.overlap.voices?.allocatedVoiceCount).toBeLessThanOrEqual(101);
  expect(result.first.rms).toBeGreaterThan(0.002);
  expect(result.second.rms).toBeGreaterThan(0.002);
  expect(result.first.peak).toBeLessThan(1);
  expect(result.second.peak).toBeLessThan(1);
  expect(result.recovered.voices?.allocatedVoiceCount).toBe(0);
  expect(result.shifted.samples.missingVisible).toBe(0);
  expect(result.shifted.samples.residentDecodedPcmBytes).toBeLessThanOrEqual(432 * 1024 * 1024);
  expect(result.highId).toBeGreaterThan(0);
  expect(result.outside.rms).toBeGreaterThan(0.001);
});
