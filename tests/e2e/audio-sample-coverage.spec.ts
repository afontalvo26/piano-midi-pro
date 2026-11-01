import { expect, test } from "@playwright/test";
import { DecodedPianoSampleBank } from "../../app/src/audio/toneSampleVoiceFactory";

test("siete muestras de arranque cubren C3-C6 con desplazamiento máximo de tres semitonos", () => {
  const bank = new DecodedPianoSampleBank();
  const decoded = {
    duration: 1,
    length: 44100,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(44100),
  } as unknown as AudioBuffer;
  for (const midi of [48, 54, 60, 66, 72, 78, 84]) {
    bank.add({ midi, buffer: decoded });
  }
  expect(bank.pitches()).toEqual([48, 54, 60, 66, 72, 78, 84]);
  expect(bank.coverage(48, 84, 3).missing).toEqual([]);
  expect(bank.coverage(21, 108, 6).missing.length).toBeGreaterThan(0);
  expect(bank.closest(81, 3)?.midi).toBe(84);
  expect(bank.closest(21, 6)).toBeNull();
});

test("el banco rechaza datos no decodificados y publica huecos sin fingir un sintetizador", () => {
  const bank = new DecodedPianoSampleBank();
  expect(() => bank.add({ midi: 60, buffer: { duration: 1 } as AudioBuffer })).toThrow();
  expect(bank.coverage(60, 62)).toEqual({ playable: [], missing: [60, 61, 62] });
});
