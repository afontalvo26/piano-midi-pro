import { expect, test } from "@playwright/test";

test("una voz real ToneBufferSource produce señal, cambia controles y libera su nodo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    // Use the same optimized module URL as the factory. Importing the path
    // without Vite's version query makes a second Tone context instance.
    const source = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = source.match(/from "([^\"]*\/tone\.js\?v=[^\"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Could not locate the factory's Tone module");
    const Tone = await import(toneUrl);
    const { LiveVoiceController } = await import("/src/audio/liveVoiceController.ts");
    const { DecodedPianoSampleBank, ToneSampleVoiceFactory } = await import(
      "/src/audio/toneSampleVoiceFactory.ts"
    );
    await Tone.start();
    const raw = Tone.getContext().rawContext as AudioContext;
    const buffer = raw.createBuffer(1, raw.sampleRate, raw.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / raw.sampleRate);
    }
    const bank = new DecodedPianoSampleBank();
    bank.add({ midi: 69, buffer });
    const tap = new Tone.Gain(1);
    const analyser = raw.createAnalyser();
    analyser.fftSize = 2048;
    tap.connect(analyser);
    analyser.connect(raw.destination);
    const controller = new LiveVoiceController(
      new ToneSampleVoiceFactory(bank, tap, { maxShiftSemitones: 0 }),
      0.03,
    );
    const origin = { inputId: "render-test", channel: 0 };
    const id = controller.noteOn({
      ...origin,
      originalNote: 69,
      mappedMidi: 69,
      rawVelocity: 100,
      amplitude: 0.8,
      audioTime: Tone.immediate() + 0.02,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const time = Tone.immediate();
    controller.setModulation(origin, 127, time);
    controller.setPitchBend(origin, 0.5, 2, time);
    controller.setVolume(origin, 64, time);
    const held = controller.snapshot();
    controller.noteOff({ ...origin, originalNote: 69, audioTime: Tone.immediate() });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const after = controller.snapshot();
    controller.dispose(Tone.immediate());
    tap.dispose();
    analyser.disconnect();
    return { id, rms, held, after };
  });

  expect(result.id).toBeGreaterThan(0);
  expect(result.rms).toBeGreaterThan(0.01);
  expect(result.held.activeVoiceCount).toBe(1);
  expect(result.held.voices[0].modulation).toBe(1);
  expect(result.held.voices[0].bendSemitones).toBe(1);
  expect(result.after.activeVoiceCount).toBe(0);
  expect(result.after.allocatedVoiceCount).toBe(0);
});
