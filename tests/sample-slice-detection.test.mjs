import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTransientBoundaries, equalSliceBoundaries } from "../app/src/components/tracks/sampleSliceDraft.ts";

test("equal slicing keeps exact integer frame endpoints without loss", () => {
  assert.deepEqual(equalSliceBoundaries(10_003, 8), [0, 1250, 2500, 3751, 5001, 6251, 7502, 8752, 10_003]);
  assert.throws(() => equalSliceBoundaries(3, 8), /fuera/);
});

test("transient suggestion finds two recorded attacks and leaves editable frame boundaries", () => {
  const frames = new Float32Array(8_000);
  for (const start of [2_400, 5_200]) {
    for (let frame = start; frame < start + 80; frame++) frames[frame] = 0.8;
  }
  const audio = { length: frames.length, sampleRate: 8_000, numberOfChannels: 1,
    getChannelData: () => frames };
  assert.deepEqual(detectTransientBoundaries(audio, 0.5), [0, 2_400, 5_200, 8_000]);
  assert.deepEqual(detectTransientBoundaries({ ...audio, getChannelData: () => new Float32Array(8_000) },
    1), [0, 8_000]);
});
