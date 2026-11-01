import { expect, test } from "@playwright/test";
import { MusicalClock, validateLoopRange, wrapLoopTick } from "../../app/src/sequencer/musicalClock";

test("960 PPQ integra cambios de tempo y redondea sólo en la frontera", () => {
  const clock = new MusicalClock([
    { tick: 0, microsPerQuarter: 500_000 },
    { tick: 960, microsPerQuarter: 250_000 },
    { tick: 1920, microsPerQuarter: 1_000_000 },
  ], [{ tick: 0, numerator: 4, denominator: 4 }, { tick: 1920, numerator: 3, denominator: 8 }]);
  expect(clock.tickToSeconds(0)).toBe(0);
  expect(clock.tickToSeconds(960)).toBe(0.5);
  expect(clock.tickToSeconds(1920)).toBe(0.75);
  expect(clock.tickToSeconds(2880)).toBe(1.75);
  expect(clock.tempoAt(959).microsPerQuarter).toBe(500_000);
  expect(clock.tempoAt(960).microsPerQuarter).toBe(250_000);
  expect(clock.meterAt(1919).numerator).toBe(4);
  expect(clock.meterAt(1920).denominator).toBe(8);
  for (const tick of [0, 1, 120, 959, 960, 961, 1919, 1920, 2880, 10_000]) {
    expect(clock.secondsToTick(clock.tickToSeconds(tick), "nearest")).toBe(tick);
  }
  expect(clock.secondsToTick(0.5 + 0.25 / 960 * 0.4, "floor")).toBe(960);
  expect(clock.secondsToTick(0.5 + 0.25 / 960 * 0.4, "ceil")).toBe(961);
});

test("loop semiabierto: endTick pertenece sólo a la vuelta siguiente", () => {
  const loop = validateLoopRange({ startTick: 960, endTick: 1920 });
  expect(wrapLoopTick(959, loop)).toEqual({ tick: 959, iteration: 0 });
  expect(wrapLoopTick(960, loop)).toEqual({ tick: 960, iteration: 0 });
  expect(wrapLoopTick(1919, loop)).toEqual({ tick: 1919, iteration: 0 });
  expect(wrapLoopTick(1920, loop)).toEqual({ tick: 960, iteration: 1 });
  expect(wrapLoopTick(2880, loop)).toEqual({ tick: 960, iteration: 2 });
});

test("mapas sin primer punto, repetidos, desordenados o compás inválido se rechazan", () => {
  const meter = [{ tick: 0, numerator: 4, denominator: 4 }];
  expect(() => new MusicalClock([], meter)).toThrow();
  expect(() => new MusicalClock([{ tick: 1, microsPerQuarter: 500_000 }], meter)).toThrow();
  expect(() => new MusicalClock([
    { tick: 0, microsPerQuarter: 500_000 }, { tick: 0, microsPerQuarter: 400_000 },
  ], meter)).toThrow();
  expect(() => new MusicalClock([{ tick: 0, microsPerQuarter: 500_000 }],
    [{ tick: 0, numerator: 3, denominator: 3 }])).toThrow();
  expect(() => validateLoopRange({ startTick: 2, endTick: 2 })).toThrow();
});
