import { expect, test } from "@playwright/test";
import {
  LiveVoiceController,
  type LiveVoiceAttack,
  type LiveVoiceFactory,
  type LiveVoiceHandle,
  type LiveVoiceInitialState,
} from "../../app/src/audio/liveVoiceController";
import { DecodedPianoSampleBank } from "../../app/src/audio/toneSampleVoiceFactory";

interface VoiceLog {
  attack: LiveVoiceAttack;
  initial: LiveVoiceInitialState;
  release: Array<[number, number]>;
  gains: Array<[number, number]>;
  bends: Array<[number, number]>;
  soft: Array<[boolean, number]>;
  modulation: Array<[number, number]>;
  end(): void;
}

function makeFactory(): { factory: LiveVoiceFactory; logs: VoiceLog[] } {
  const logs: VoiceLog[] = [];
  const factory: LiveVoiceFactory = {
    create(attack, initial, onEnded): LiveVoiceHandle {
      const log: VoiceLog = {
        attack,
        initial,
        release: [],
        gains: [],
        bends: [],
        soft: [],
        modulation: [],
        end: onEnded,
      };
      logs.push(log);
      return {
        release: (time, fade) => log.release.push([time, fade]),
        setGain: (gain, time) => log.gains.push([gain, time]),
        setBend: (semitones, time) => log.bends.push([semitones, time]),
        setSoftPedal: (active, time) => log.soft.push([active, time]),
        setModulation: (depth, time) => log.modulation.push([depth, time]),
      };
    },
  };
  return { factory, logs };
}

function attack(override: Partial<Parameters<LiveVoiceController["noteOn"]>[0]> = {}) {
  return {
    inputId: "port-a",
    channel: 0,
    originalNote: 60,
    mappedMidi: 60,
    rawVelocity: 100,
    amplitude: 0.6,
    audioTime: 1,
    ...override,
  };
}

test("una ráfaga Note On, CC64 y Note Off usa el estado de pedal inmediato y libera la instancia", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };

  const id = voices.noteOn(attack());
  voices.setSustain(origin, 127, 1.01);
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.02 })).toBe(id);
  expect(logs[0].release).toHaveLength(0);
  expect(voices.snapshot().activeVoiceCount).toBe(1);

  voices.setSustain(origin, 0, 1.03);
  expect(logs[0].release).toEqual([[1.03, 1.2]]);
  expect(voices.snapshot().activeVoiceCount).toBe(0);
  expect(voices.snapshot().allocatedVoiceCount).toBe(1);
  logs[0].end();
  expect(voices.snapshot().allocatedVoiceCount).toBe(0);
});

test("notas repetidas y dos puertos retienen dueño, FIFO y Note Off original aunque cambie el mapeo", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const a = { inputId: "port-a", channel: 0 };
  const b = { inputId: "port-b", channel: 0 };
  const first = voices.noteOn(attack({ mappedMidi: 72 }));
  const second = voices.noteOn(attack({ mappedMidi: 84, audioTime: 1.1 }));
  const third = voices.noteOn(attack({ inputId: b.inputId, audioTime: 1.2 }));

  expect(voices.noteOff({ ...a, originalNote: 60, audioTime: 2 })).toBe(first);
  expect(logs[0].release[0][0]).toBe(2);
  expect(logs[1].release).toHaveLength(0);
  expect(logs[2].release).toHaveLength(0);
  voices.releaseOrigin(a.inputId, 2.1);
  expect(logs[1].release[0][0]).toBe(2.1);
  expect(logs[2].release).toHaveLength(0);
  expect(voices.noteOff({ ...b, originalNote: 60, audioTime: 2.2 })).toBe(third);
  expect(voices.noteOff({ ...a, originalNote: 60, audioTime: 2.3 })).toBeNull();
  expect(second).not.toBe(first);
});

test("CC7, CC11, aftertouch, bend y MOD se aplican también a una nota sostenida", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.noteOn(attack());
  voices.setSustain(origin, 127, 1.1);
  voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.2 });
  voices.setVolume(origin, 64, 1.3);
  voices.setExpression(origin, 64, 1.4);
  voices.setChannelPressure(origin, 127, 1.5);
  voices.setPitchBend(origin, 0.5, 2, 1.6);
  voices.setModulation(origin, 127, 1.65);
  expect(logs[0].gains.at(-1)?.[0]).toBeGreaterThan(0);
  expect(logs[0].gains.at(-1)?.[0]).toBeLessThan(0.2);
  expect(logs[0].bends.at(-1)).toEqual([1, 1.6]);
  expect(logs[0].modulation.at(-1)).toEqual([1, 1.65]);
  voices.setPitchBend(origin, 0, 2, 1.7);
  voices.setModulation(origin, 0, 1.75);
  expect(logs[0].bends.at(-1)).toEqual([0, 1.7]);
  expect(logs[0].modulation.at(-1)).toEqual([0, 1.75]);
  voices.noteOn(attack({ originalNote: 62, mappedMidi: 62, audioTime: 1.8 }));
  expect(logs[1].initial.bendSemitones).toBe(0);
  expect(logs[1].initial.modulation).toBe(0);
  expect(logs[1].initial.gain).toBeCloseTo(logs[0].gains.at(-1)![0]);
});

test("MOD nuevo hereda profundidad de CC1 y se limpia al terminar la voz", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.setModulation(origin, 127, 1);
  voices.noteOn(attack({ audioTime: 1.1 }));
  expect(logs[0].initial.modulation).toBe(1);
  expect(voices.snapshot().voices[0].modulation).toBe(1);
  voices.setModulation(origin, 0, 1.2);
  expect(logs[0].modulation.at(-1)).toEqual([0, 1.2]);
  voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.3 });
  logs[0].end();
  expect(voices.snapshot().allocatedVoiceCount).toBe(0);
});

test("sostenuto captura sólo teclas que estaban abajo al pisarlo", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.noteOn(attack());
  voices.setSostenuto(origin, true, 1.1);
  voices.noteOn(attack({ originalNote: 62, mappedMidi: 62, audioTime: 1.2 }));
  voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.3 });
  voices.noteOff({ ...origin, originalNote: 62, audioTime: 1.4 });
  expect(logs[0].release).toHaveLength(0);
  expect(logs[1].release[0][0]).toBe(1.4);
  voices.setSostenuto(origin, false, 1.5);
  expect(logs[0].release[0][0]).toBe(1.5);
});

test("pedales locales y globales se combinan; half-pedal alarga la liberación", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.setGlobalSustain("space", 127, 1);
  voices.noteOn(attack({ audioTime: 1.1 }));
  voices.setSustain(origin, 127, 1.2);
  voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.3 });
  voices.setGlobalSustain("space", 0, 1.4);
  expect(logs[0].release).toHaveLength(0);
  voices.setSustain(origin, 0, 1.5);
  expect(logs[0].release[0][0]).toBe(1.5);

  voices.setHalfPedal(origin, 1, 2);
  voices.noteOn(attack({ originalNote: 62, mappedMidi: 62, audioTime: 2.1 }));
  voices.noteOff({ ...origin, originalNote: 62, audioTime: 2.2 });
  expect(logs[1].release[0][1]).toBeCloseTo(3);
});

test("sostenuto global no anula sustain local de otro origen", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const a = { inputId: "port-a", channel: 0 };
  const b = { inputId: "port-b", channel: 0 };
  voices.noteOn(attack());
  voices.noteOn(attack({ inputId: b.inputId, originalNote: 62, mappedMidi: 62, audioTime: 1.1 }));
  voices.setSustain(b, 127, 1.2);
  voices.setGlobalSostenuto("ui", true, 1.3);
  voices.noteOff({ ...a, originalNote: 60, audioTime: 1.4 });
  voices.noteOff({ ...b, originalNote: 62, audioTime: 1.5 });
  expect(logs[0].release).toHaveLength(0);
  expect(logs[1].release).toHaveLength(0);
  voices.setGlobalSostenuto("ui", false, 1.6);
  expect(logs[0].release[0][0]).toBe(1.6);
  expect(logs[1].release).toHaveLength(0);
  voices.setSustain(b, 0, 1.7);
  expect(logs[1].release[0][0]).toBe(1.7);
});

test("una corda modifica voz nueva y sostenida; All Sound Off libera sólo su canal", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const a = { inputId: "port-a", channel: 0 };
  const otherChannel = { inputId: "port-a", channel: 1 };
  voices.noteOn(attack());
  voices.noteOn(attack({ channel: 1, audioTime: 1.1 }));
  voices.setUnaCorda(a, true, 1.2);
  expect(logs[0].soft).toEqual([[true, 1.2]]);
  expect(logs[1].soft).toHaveLength(0);
  voices.noteOn(attack({ originalNote: 62, mappedMidi: 62, audioTime: 1.3 }));
  expect(logs[2].initial.softPedal).toBe(true);
  expect(logs[2].initial.gain).toBeCloseTo(logs[0].initial.gain * 0.75);
  voices.allSoundOff(a, 1.4);
  expect(logs[0].release.at(-1)).toEqual([1.4, 0.012]);
  expect(logs[2].release.at(-1)).toEqual([1.4, 0.012]);
  expect(logs[1].release).toHaveLength(0);
  expect(voices.snapshot().voices.find((voice) => voice.channel === otherChannel.channel)?.released).toBe(false);
});

test("All Notes Off respeta pedal; al terminar un buffer se limpian las colas", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.setSustain(origin, 127, 1);
  voices.noteOn(attack({ audioTime: 1.1 }));
  voices.allNotesOff(origin, 1.2);
  expect(logs[0].release).toHaveLength(0);
  voices.noteOn(attack({ audioTime: 1.3 }));
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.4 })).toBe(logs[1].attack.attackId);
  voices.setSustain(origin, 0, 1.5);
  expect(logs[0].release[0][0]).toBe(1.5);
  expect(logs[1].release[0][0]).toBe(1.5);
  logs[0].end();
  logs[1].end();
  expect(voices.snapshot().allocatedVoiceCount).toBe(0);
});

test("un ataque sin muestra y uno que termina naturalmente no cortan la siguiente repetición", () => {
  const { factory, logs } = makeFactory();
  let sampleReady = false;
  const intermittentFactory: LiveVoiceFactory = {
    create(attack, initial, onEnded) {
      return sampleReady ? factory.create(attack, initial, onEnded) : null;
    },
  };
  const voices = new LiveVoiceController(intermittentFactory);
  const origin = { inputId: "port-a", channel: 0 };
  expect(voices.noteOn(attack())).toBeNull();
  expect(voices.snapshot().pendingSilentNoteCount).toBe(1);
  sampleReady = true;
  const audible = voices.noteOn(attack({ audioTime: 1.1 }));
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.2 })).toBeNull();
  expect(voices.snapshot().pendingSilentNoteCount).toBe(0);
  expect(logs[0].release).toHaveLength(0);
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.3 })).toBe(audible);

  voices.noteOn(attack({ audioTime: 2 }));
  logs[1].end(); // recording exhausted while the physical key is still down
  expect(voices.snapshot().pendingSilentNoteCount).toBe(1);
  const later = voices.noteOn(attack({ audioTime: 2.1 }));
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 2.2 })).toBeNull();
  expect(logs[2].release).toHaveLength(0);
  expect(voices.noteOff({ ...origin, originalNote: 60, audioTime: 2.3 })).toBe(later);
});

test("límite duro mantiene fades acotados y prioriza una tecla levantada con pedal", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory, 1.2, { maxVoices: 4 });
  const origin = { inputId: "port-a", channel: 0 };
  voices.setSustain(origin, 127, 1);
  voices.noteOn(attack({ audioTime: 1.1 }));
  voices.noteOn(attack({ originalNote: 62, mappedMidi: 62, audioTime: 1.2 }));
  voices.noteOn(attack({ originalNote: 64, mappedMidi: 64, audioTime: 1.3 }));
  voices.noteOff({ ...origin, originalNote: 60, audioTime: 1.4 });
  voices.noteOn(attack({ originalNote: 66, mappedMidi: 66, audioTime: 1.5 }));
  expect(logs[0].release.at(-1)).toEqual([1.5, 0.012]);
  expect(logs[1].release).toHaveLength(0);
  expect(logs[2].release).toHaveLength(0);
  expect(voices.snapshot()).toMatchObject({
    maxVoices: 4,
    activeVoiceLimit: 3,
    activeVoiceCount: 3,
    allocatedVoiceCount: 4,
    retiringVoiceCount: 1,
    stolenVoiceCount: 1,
    discardedAttackCount: 0,
  });
  expect(voices.noteOn(attack({ originalNote: 68, mappedMidi: 68, audioTime: 1.6 }))).toBeNull();
  expect(voices.snapshot().allocatedVoiceCount).toBe(4);
  expect(voices.snapshot().discardedAttackCount).toBe(1);
  expect(voices.snapshot().pendingSilentNoteCount).toBe(1);
  voices.noteOff({ ...origin, originalNote: 68, audioTime: 1.7 });
  logs[0].end();
  expect(voices.snapshot().allocatedVoiceCount).toBe(3);
  expect(voices.snapshot().pendingSilentNoteCount).toBe(0);
});

test("37 teclas repetidas con pedal conservan el segundo acorde y recuperan el techo", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "smk37", channel: 0 };
  voices.setSustain(origin, 127, 1);
  const playChord = (audioTime: number) => Array.from({ length: 37 }, (_, index) => {
    const midi = 48 + index;
    return voices.noteOn(attack({ ...origin, originalNote: midi, mappedMidi: midi, audioTime }));
  });
  const releaseKeys = (audioTime: number) => {
    for (let midi = 48; midi <= 84; midi++) {
      voices.noteOff({ ...origin, originalNote: midi, audioTime });
    }
  };

  expect(playChord(1.01).filter((id) => id !== null)).toHaveLength(37);
  releaseKeys(1.02);
  expect(playChord(1.03).filter((id) => id !== null)).toHaveLength(37);
  const second = voices.snapshot();
  expect(second).toMatchObject({
    maxVoices: 101,
    activeVoiceLimit: 56,
    maxRetiringVoices: 45,
    activeVoiceCount: 56,
    allocatedVoiceCount: 74,
    retiringVoiceCount: 18,
    stolenVoiceCount: 18,
    discardedAttackCount: 0,
  });
  expect(logs.filter((log) => log.release.at(-1)?.[1] === 0.012)).toHaveLength(18);

  releaseKeys(1.04);
  // Simulate onended after the 12 ms fades, then a third 37-key burst.
  for (const log of logs.slice(0, 18)) log.end();
  expect(playChord(1.06).filter((id) => id !== null)).toHaveLength(37);
  expect(voices.snapshot()).toMatchObject({
    allocatedVoiceCount: 93,
    discardedAttackCount: 0,
  });
  releaseKeys(1.07);
  voices.setSustain(origin, 0, 1.08);
  for (const log of logs) log.end();
  expect(voices.snapshot()).toMatchObject({
    activeVoiceCount: 0,
    allocatedVoiceCount: 0,
    pendingSilentNoteCount: 0,
  });
});

test("robar una nota repetida conserva FIFO y prefiere el mismo origen", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory, 1.2, { maxVoices: 4 });
  const a = { inputId: "port-a", channel: 0 };
  const b = { inputId: "port-b", channel: 0 };
  voices.noteOn(attack({ audioTime: 1 }));
  const second = voices.noteOn(attack({ audioTime: 1.1 }));
  const other = voices.noteOn(attack({ inputId: b.inputId, audioTime: 1.2 }));
  const fourth = voices.noteOn(attack({ audioTime: 1.3 }));
  expect(logs[0].release.at(-1)).toEqual([1.3, 0.012]);
  expect(logs[2].release).toHaveLength(0);
  logs[0].end();
  expect(voices.snapshot().pendingSilentNoteCount).toBe(1);
  expect(voices.noteOff({ ...a, originalNote: 60, audioTime: 1.4 })).toBeNull();
  expect(voices.noteOff({ ...a, originalNote: 60, audioTime: 1.5 })).toBe(second);
  expect(voices.noteOff({ ...b, originalNote: 60, audioTime: 1.6 })).toBe(other);
  expect(voices.noteOff({ ...a, originalNote: 60, audioTime: 1.7 })).toBe(fourth);
  expect(voices.snapshot().pendingSilentNoteCount).toBe(0);
});

test("un tail ya liberado se roba antes que una tecla aún presionada", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory, 1.2, { maxVoices: 4 });
  const a = { inputId: "port-a", channel: 0 };
  const b = { inputId: "port-b", channel: 0 };
  voices.noteOn(attack({ audioTime: 1 }));
  voices.noteOn(attack({ inputId: b.inputId, originalNote: 62, mappedMidi: 62, audioTime: 1.1 }));
  voices.noteOff({ ...b, originalNote: 62, audioTime: 1.2 });
  voices.noteOn(attack({ originalNote: 64, mappedMidi: 64, audioTime: 1.3 }));
  voices.noteOn(attack({ originalNote: 66, mappedMidi: 66, audioTime: 1.4 }));
  expect(logs[1].release.at(-1)).toEqual([1.4, 0.012]);
  expect(logs[0].release).toHaveLength(0);
  expect(logs[2].release).toHaveLength(0);
});

test("aftertouch mantiene continuidad y monotonía hasta velocidad máxima", () => {
  const { factory, logs } = makeFactory();
  const voices = new LiveVoiceController(factory);
  const origin = { inputId: "port-a", channel: 0 };
  voices.noteOn(attack({ amplitude: 1 }));
  expect(logs[0].initial.gain).toBeCloseTo(0.85);
  for (const [pressure, time] of [[1, 1.1], [64, 1.2], [127, 1.3]] as const) {
    voices.setChannelPressure(origin, pressure, time);
  }
  const gains = logs[0].gains.map(([gain]) => gain);
  expect(gains[0]).toBeGreaterThan(0.85);
  expect(gains[0] - 0.85).toBeLessThan(0.002);
  expect(gains[1]).toBeGreaterThan(gains[0]);
  expect(gains[2]).toBeGreaterThan(gains[1]);
  expect(gains[2]).toBeCloseTo(1);
  voices.setChannelPressure(origin, 0, 1.4);
  expect(logs[0].gains.at(-1)?.[0]).toBeCloseTo(0.85);
});

test("banco de muestras informa bytes PCM sin contar dos veces un buffer compartido", () => {
  const bank = new DecodedPianoSampleBank();
  const first = {
    duration: 1,
    length: 100,
    sampleRate: 100,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(100),
  } as unknown as AudioBuffer;
  const second = {
    duration: 1,
    length: 50,
    sampleRate: 50,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(50),
  } as unknown as AudioBuffer;
  bank.add({ midi: 60, buffer: first });
  bank.add({ midi: 61, buffer: first });
  expect(bank.decodedPcmBytes).toBe(800);
  bank.add({ midi: 62, buffer: second });
  expect(bank.decodedPcmBytes).toBe(1000);
  bank.add({ midi: 60, buffer: second });
  bank.add({ midi: 61, buffer: second });
  expect(bank.decodedPcmBytes).toBe(200);
});

test("ruta real conserva ganancia al recrear voces y un segundo release no alarga la cola", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
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
    const pcm = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / raw.sampleRate);
    const bank = new DecodedPianoSampleBank();
    bank.add({ midi: 69, buffer });
    const bus = new Tone.Gain(1);
    const analyser = raw.createAnalyser();
    analyser.fftSize = 2048;
    bus.connect(analyser);
    analyser.connect(raw.destination);
    const factory = new ToneSampleVoiceFactory(bank, bus, { maxShiftSemitones: 0 });
    const origin = { inputId: "repeat-render", channel: 0 };
    const rmsValues: number[] = [];
    const allocatedAfterRelease: number[] = [];
    for (let iteration = 0; iteration < 3; iteration++) {
      const controller = new LiveVoiceController(factory, 0.03);
      controller.noteOn({
        ...origin, originalNote: 69, mappedMidi: 69,
        rawVelocity: 100, amplitude: 0.8, audioTime: Tone.immediate() + 0.01,
      });
      await new Promise((resolve) => setTimeout(resolve, 90));
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      rmsValues.push(Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
      controller.noteOff({ ...origin, originalNote: 69, audioTime: Tone.immediate() });
      // Tone's source cleanup callback runs on its context ticker after the
      // 30 ms fade. Allow the 100 ms balanced scheduler window and headless jitter.
      await new Promise((resolve) => setTimeout(resolve, 180));
      allocatedAfterRelease.push(controller.snapshot().allocatedVoiceCount);
      controller.dispose(Tone.immediate());
    }
    let ended = false;
    const start = Tone.immediate() + 0.01;
    const handle = factory.create(
      { ...origin, attackId: 999, originalNote: 69, mappedMidi: 69,
        rawVelocity: 100, amplitude: 0.8, audioTime: start },
      { gain: 0.68, bendSemitones: 0, softPedal: false, modulation: 0 },
      () => { ended = true; },
    );
    handle?.release(start + 0.02, 0.03);
    handle?.release(start + 0.03, 0.4);
    await new Promise((resolve) => setTimeout(resolve, 250));
    bus.dispose();
    analyser.disconnect();
    return { rmsValues, allocatedAfterRelease, ended, pcmBytes: bank.decodedPcmBytes };
  });
  expect(result.rmsValues).toHaveLength(3);
  for (const rms of result.rmsValues) expect(rms).toBeGreaterThan(0.04);
  const min = Math.min(...result.rmsValues);
  const max = Math.max(...result.rmsValues);
  expect(max / min).toBeLessThan(1.2);
  expect(result.allocatedAfterRelease).toEqual([0, 0, 0]);
  expect(result.ended).toBe(true);
  expect(result.pcmBytes).toBeGreaterThan(0);
});

test("diagnóstico de 37 voces: construcción, salida y liberación frente a ruta mínima", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
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
    const buffer = raw.createBuffer(1, raw.sampleRate * 2, raw.sampleRate);
    const pcm = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / raw.sampleRate);
    const bank = new DecodedPianoSampleBank();
    for (let midi = 48; midi <= 84; midi++) bank.add({ midi, buffer });
    const bus = new Tone.Gain(0.04);
    const analyser = raw.createAnalyser();
    analyser.fftSize = 2048;
    bus.connect(analyser);
    analyser.connect(raw.destination);
    const originalDispose = Tone.ToneBufferSource.prototype.dispose;
    let sourceDisposals = 0;
    Tone.ToneBufferSource.prototype.dispose = function () {
      sourceDisposals++;
      return originalDispose.call(this);
    };
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: false });
    const readLevel = () => {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return {
        rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
        peak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
        maxStep: samples.reduce((step, value, index) =>
          index === 0 ? step : Math.max(step, Math.abs(value - samples[index - 1])), 0),
      };
    };
    try {
      const simpleSources: Array<{ source: InstanceType<typeof Tone.ToneBufferSource>; gain: InstanceType<typeof Tone.Gain> }> = [];
      let started = performance.now();
      for (let midi = 48; midi <= 84; midi++) {
        const gain = new Tone.Gain(0.68).connect(bus);
        const voice = new Tone.ToneBufferSource({ url: buffer, fadeOut: 0.02 }).connect(gain);
        voice.onended = () => gain.dispose();
        voice.start(Tone.immediate() + 0.004);
        simpleSources.push({ source: voice, gain });
      }
      const simpleConstructMs = performance.now() - started;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const simpleLevel = readLevel();
      const simpleStopped = Tone.immediate();
      for (const entry of simpleSources) entry.source.stop(simpleStopped);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const simpleDisposals = sourceDisposals;

      const factory = new ToneSampleVoiceFactory(bank, bus, { maxShiftSemitones: 0 });
      const voices = new LiveVoiceController(factory, 0.02);
      const origin = { inputId: "37-key-test", channel: 0 };
      voices.setSustain(origin, 127, Tone.immediate());
      started = performance.now();
      for (let midi = 48; midi <= 84; midi++) {
        voices.noteOn({ ...origin, originalNote: midi, mappedMidi: midi,
          rawVelocity: 100, amplitude: 0.8, audioTime: Tone.immediate() + 0.004 });
      }
      const fullConstructMs = performance.now() - started;
      const held = voices.snapshot();
      const busesWhileHeld = factory.activeOriginBusCount;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const fullLevel = readLevel();
      const fullStopped = Tone.immediate();
      for (let midi = 48; midi <= 84; midi++) {
        voices.noteOff({ ...origin, originalNote: midi, audioTime: fullStopped });
      }
      const secondStart = performance.now();
      const secondRegistrationMs: number[] = [];
      const secondAttacks: Array<number | null> = [];
      for (let midi = 48; midi <= 84; midi++) {
        secondAttacks.push(voices.noteOn({ ...origin, originalNote: midi, mappedMidi: midi,
          rawVelocity: 100, amplitude: 0.8, audioTime: Tone.immediate() + 0.004 }));
        secondRegistrationMs.push(performance.now() - secondStart);
      }
      const secondConstructMs = performance.now() - secondStart;
      const secondHeld = voices.snapshot();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const secondLevel = readLevel();
      const secondStopped = Tone.immediate();
      for (let midi = 48; midi <= 84; midi++) {
        voices.noteOff({ ...origin, originalNote: midi, audioTime: secondStopped });
      }
      voices.setSustain(origin, 0, secondStopped);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const after = voices.snapshot();
      const fullDisposals = sourceDisposals - simpleDisposals;
      const busesAfterRelease = factory.activeOriginBusCount;
      voices.dispose(Tone.immediate());
      return {
        simpleConstructMs, fullConstructMs,
        secondConstructMs,
        secondRegistrationP95Ms: secondRegistrationMs[Math.floor(secondRegistrationMs.length * 0.95)],
        secondRegistrationMaxMs: Math.max(...secondRegistrationMs),
        secondAttackCount: secondAttacks.filter((id) => id !== null).length,
        maxLongTaskMs: Math.max(0, ...longTasks),
        longTaskCount: longTasks.length,
        simpleLevel, fullLevel, secondLevel,
        simpleDisposals, fullDisposals,
        held: {
          activeVoiceCount: held.activeVoiceCount,
          allocatedVoiceCount: held.allocatedVoiceCount,
          stolenVoiceCount: held.stolenVoiceCount,
          discardedAttackCount: held.discardedAttackCount,
        },
        secondHeld: {
          activeVoiceCount: secondHeld.activeVoiceCount,
          allocatedVoiceCount: secondHeld.allocatedVoiceCount,
          retiringVoiceCount: secondHeld.retiringVoiceCount,
          stolenVoiceCount: secondHeld.stolenVoiceCount,
          discardedAttackCount: secondHeld.discardedAttackCount,
        },
        after: {
          activeVoiceCount: after.activeVoiceCount,
          allocatedVoiceCount: after.allocatedVoiceCount,
        },
        busesWhileHeld, busesAfterRelease,
        sampleBytes: bank.decodedPcmBytes,
      };
    } finally {
      observer.disconnect();
      Tone.ToneBufferSource.prototype.dispose = originalDispose;
      bus.dispose();
      analyser.disconnect();
    }
  });
  console.log("[audio37-diagnostic]", JSON.stringify(result));
  expect(result.held).toMatchObject({
    activeVoiceCount: 37,
    allocatedVoiceCount: 37,
    stolenVoiceCount: 0,
    discardedAttackCount: 0,
  });
  expect(result.secondAttackCount).toBe(37);
  expect(result.secondHeld).toMatchObject({
    activeVoiceCount: 56,
    allocatedVoiceCount: 74,
    retiringVoiceCount: 18,
    stolenVoiceCount: 18,
    discardedAttackCount: 0,
  });
  expect(result.simpleLevel.rms).toBeGreaterThan(0.01);
  expect(result.fullLevel.rms).toBeGreaterThan(0.005);
  expect(result.secondLevel.rms).toBeGreaterThan(0.005);
  expect(result.secondLevel.peak).toBeLessThan(0.98);
  expect(result.after.activeVoiceCount).toBe(0);
  expect(result.after.allocatedVoiceCount).toBe(0);
  expect(result.busesWhileHeld).toBe(1);
  expect(result.busesAfterRelease).toBe(0);
  expect(result.simpleConstructMs).toBeGreaterThan(0);
  expect(result.fullConstructMs).toBeGreaterThan(0);
});
