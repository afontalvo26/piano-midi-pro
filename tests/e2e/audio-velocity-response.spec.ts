import { expect, test } from "@playwright/test";

test("Salamander responde a pianissimo, mezzo y forte con nivel y color medibles", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Prueba de audio</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const measured = await page.evaluate(async () => {
    const source = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = source.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se pudo encontrar Tone para el motor real");
    const [Tone, voiceModule, velocityModule] = await Promise.all([
      import(toneUrl),
      import("/src/audio/toneSampleVoiceFactory.ts"),
      import("/src/utils/velocity.ts"),
    ]);
    await Tone.start();
    const raw = Tone.getContext().rawContext as AudioContext;
    const sampleBytes = await fetch("/audio/salamander/core/C4.ogg").then((response) => response.arrayBuffer());
    const sample = await raw.decodeAudioData(sampleBytes);
    const bank = new voiceModule.DecodedPianoSampleBank();
    bank.add({ midi: 60, buffer: sample });
    const tap = new Tone.Gain(1);
    const analyser = raw.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    tap.connect(analyser);
    analyser.connect(raw.destination);
    const factory = new voiceModule.ToneSampleVoiceFactory(bank, tap, {
      maxShiftSemitones: 0,
      velocityColor: true,
    });
    const results: Array<{ velocity: number; amplitude: number; rms: number; peak: number }> = [];
    for (const velocity of [8, 32, 64, 96, 127]) {
      const expression = velocityModule.computeVelocityExpression(
        velocity,
        "expressive",
        velocityModule.DEFAULT_PHYSICAL_CALIBRATION,
      );
      const audioTime = Tone.immediate() + 0.025;
      const voice = factory.create({
        attackId: velocity,
        inputId: `measure-${velocity}`,
        channel: 0,
        originalNote: 60,
        mappedMidi: 60,
        rawVelocity: velocity,
        amplitude: expression.gain,
        audioTime,
      }, { gain: expression.gain, bendSemitones: 0, softPedal: false, modulation: 0 }, () => {});
      if (!voice) throw new Error(`Sin muestra a velocity ${velocity}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const waveform = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(waveform);
      let sum = 0;
      let peak = 0;
      for (const value of waveform) {
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      results.push({
        velocity,
        amplitude: expression.gain,
        rms: Math.sqrt(sum / waveform.length),
        peak,
      });
      voice.release(Tone.immediate(), 0.01);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    tap.dispose();
    analyser.disconnect();
    return results;
  });
  console.log("Respuesta Salamander real:", JSON.stringify(measured));
  for (let i = 1; i < measured.length; i++) {
    expect(measured[i].amplitude).toBeGreaterThan(measured[i - 1].amplitude);
    expect(measured[i].rms).toBeGreaterThan(measured[i - 1].rms);
  }
  expect(measured[0].rms).toBeLessThan(measured[4].rms / 12);
  expect(measured[2].rms).toBeGreaterThan(measured[0].rms * 4);
  expect(measured[2].rms).toBeLessThan(measured[4].rms * 0.6);
  expect(measured[4].peak).toBeLessThan(1);
});

test("la misma muestra adquiere color distinto al pulsar muy suave y fuerte", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Prueba espectral</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const results = await page.evaluate(async () => {
    const source = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = source.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se pudo encontrar Tone para el motor real");
    const [Tone, voiceModule] = await Promise.all([
      import(toneUrl), import("/src/audio/toneSampleVoiceFactory.ts"),
    ]);
    const decoder = new AudioContext();
    const bytes = await fetch("/audio/salamander/core/C4.ogg").then((response) => response.arrayBuffer());
    const sample = await decoder.decodeAudioData(bytes);
    await decoder.close();
    const sampleRate = sample.sampleRate;
    function highFrequencyRatio(data: Float32Array): number {
      const n = 8192;
      const real = new Float64Array(n);
      const imaginary = new Float64Array(n);
      const start = Math.round(0.2 * sampleRate);
      for (let i = 0; i < n; i++) {
        real[i] = data[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
      }
      let j = 0;
      for (let i = 1; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
          const value = real[i];
          real[i] = real[j];
          real[j] = value;
        }
      }
      for (let length = 2; length <= n; length <<= 1) {
        const angle = -2 * Math.PI / length;
        for (let i = 0; i < n; i += length) {
          for (let k = 0; k < length / 2; k++) {
            const c = Math.cos(angle * k);
            const s = Math.sin(angle * k);
            const a = i + k;
            const b = a + length / 2;
            const nextReal = real[b] * c - imaginary[b] * s;
            const nextImaginary = real[b] * s + imaginary[b] * c;
            real[b] = real[a] - nextReal;
            imaginary[b] = imaginary[a] - nextImaginary;
            real[a] += nextReal;
            imaginary[a] += nextImaginary;
          }
        }
      }
      let total = 0;
      let high = 0;
      for (let i = 1; i < n / 2; i++) {
        const power = real[i] ** 2 + imaginary[i] ** 2;
        total += power;
        if (i * sampleRate / n >= 1800) high += power;
      }
      return high / total;
    }
    const measured = [];
    for (const velocity of [8, 32, 64, 96, 127]) {
      const rendered = await Tone.Offline(() => {
        const bank = new voiceModule.DecodedPianoSampleBank();
        bank.add({ midi: 60, buffer: sample });
        const output = new Tone.Gain(1).toDestination();
        const factory = new voiceModule.ToneSampleVoiceFactory(bank, output, {
          maxShiftSemitones: 0, velocityColor: true, attackSeconds: 0,
        });
        factory.create({ attackId: velocity, inputId: "spectrum", channel: 0,
          originalNote: 60, mappedMidi: 60, rawVelocity: velocity,
          amplitude: 0.7, audioTime: 0.1 },
        { gain: 0.7, bendSemitones: 0, softPedal: false, modulation: 0 }, () => {});
      }, 0.55, 1, sampleRate);
      const data = rendered.get().getChannelData(0);
      measured.push({ velocity, highRatio: highFrequencyRatio(data) });
    }
    return measured;
  });
  console.log("Color Salamander, ganancia igual:", JSON.stringify(results));
  expect(results[0].highRatio).toBeGreaterThan(0);
  for (let i = 1; i < results.length; i++) {
    expect(results[i].highRatio).toBeGreaterThan(results[i - 1].highRatio);
  }
  expect(results[4].highRatio).toBeGreaterThan(results[0].highRatio * 1.2);
});

test("37 ataques, sustain y otro acorde mantienen señal y recuperan el audio", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("http://localhost:1234/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Prueba de polifonía</body></html>",
  }));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const source = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = source.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se pudo encontrar Tone para el motor real");
    const [Tone, { LiveStudioEngine }, { parseMidiMessage }] = await Promise.all([
      import(toneUrl),
      import("/src/audio/liveStudioEngine.ts"),
      import("/src/midi/message.ts"),
    ]);
    const engine = new LiveStudioEngine({ masterVolumeDb: -10, reverbSend: 0 });
    await engine.initialize();
    const raw = Tone.getContext().rawContext as AudioContext;
    const analyser = raw.createAnalyser();
    analyser.fftSize = 4096;
    Tone.getDestination().connect(analyser);
    analyser.connect(raw.destination);
    const waveform = new Float32Array(analyser.fftSize);
    function measure() {
      analyser.getFloatTimeDomainData(waveform);
      let sum = 0;
      let peak = 0;
      for (const value of waveform) {
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      return { rms: Math.sqrt(sum / waveform.length), peak };
    }
    const origin = { inputId: "stress-smk37", channel: 0 };
    const notes = Array.from({ length: 37 }, (_, index) => 48 + index);
    const strike = () => Promise.all(notes.map((note) => engine.noteOn({
      ...origin,
      originalNote: note,
      mappedMidi: note,
      rawVelocity: 100,
      amplitude: 0.65,
      eventTimestamp: performance.now(),
    })));
    const lift = () => notes.forEach((note) => engine.noteOff({
      ...origin,
      originalNote: note,
      eventTimestamp: performance.now(),
    }));
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 127]), origin.inputId, performance.now()));
    const firstIds = await strike();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const first = measure();
    lift();
    const secondIds = await strike();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const second = measure();
    const overlap = engine.diagnostics().voices;
    lift();
    engine.applyMidiExpression(parseMidiMessage(new Uint8Array([0xb0, 64, 0]), origin.inputId, performance.now()));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const recovered = engine.diagnostics();
    const lastId = await engine.noteOn({
      ...origin,
      originalNote: 60,
      mappedMidi: 60,
      rawVelocity: 90,
      amplitude: 0.55,
      eventTimestamp: performance.now(),
    });
    await new Promise((resolve) => setTimeout(resolve, 170));
    const after = measure();
    engine.noteOff({ ...origin, originalNote: 60, eventTimestamp: performance.now() });
    engine.dispose();
    analyser.disconnect();
    return { firstIds, secondIds, first, second, overlap, recovered, lastId, after };
  });
  console.log("37+37 señal real:", JSON.stringify({
    first: result.first,
    second: result.second,
    after: result.after,
  }));
  expect(result.firstIds.filter((id: number | null) => id !== null)).toHaveLength(37);
  expect(result.secondIds.filter((id: number | null) => id !== null)).toHaveLength(37);
  expect(result.overlap?.discardedAttackCount).toBe(0);
  expect(result.overlap?.allocatedVoiceCount).toBeLessThanOrEqual(101);
  expect(result.first.rms).toBeGreaterThan(0.002);
  expect(result.second.rms).toBeGreaterThan(0.002);
  expect(result.first.peak).toBeLessThan(1);
  expect(result.second.peak).toBeLessThan(1);
  expect(result.recovered.voices?.allocatedVoiceCount).toBe(0);
  expect(result.lastId).toBeGreaterThan(0);
  expect(result.after.rms).toBeGreaterThan(0.002);
});
