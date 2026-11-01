import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWavPcm, validateWavPcm, WavPcmError } from "../app/src/export/wavPcm.ts";

function read24(bytes, offset) {
  const value = bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
  return value & 0x800000 ? value - 0x1000000 : value;
}

test("PCM16 and PCM24 encode stereo samples with exact RIFF frame alignment", () => {
  const pcm = { sampleRate: 48000, left: new Float32Array([0, 0.5, -0.5, 1]),
    right: new Float32Array([0, -0.5, 0.5, -1]) };
  const a = encodeWavPcm(pcm, { format: "pcm16", dither: false });
  assert.deepEqual(validateWavPcm(a.bytes), { frames: 4, sampleRate: 48000, format: "pcm16" });
  assert.equal(a.bytes.byteLength, 60);
  const data16 = new DataView(a.bytes.buffer);
  assert.equal(data16.getInt16(48, true), 16384);
  assert.equal(data16.getInt16(50, true), -16383);
  assert.equal(data16.getInt16(56, true), 32767);
  const b = encodeWavPcm(pcm, { format: "pcm24", dither: false });
  assert.deepEqual(validateWavPcm(b.bytes), { frames: 4, sampleRate: 48000, format: "pcm24" });
  assert.equal(b.bytes.byteLength, 68);
  assert.equal(read24(b.bytes, 50), 4194304);
  assert.equal(read24(b.bytes, 53), -4194303);
  assert.equal(read24(b.bytes, 62), 8388607);
  assert.equal(b.report.channels, 2);
  assert.equal(b.report.durationSeconds, 4 / 48000);
});

test("normalization prevents source overs and deterministic dither reproduces bytes", () => {
  const pcm = { sampleRate: 44100, left: new Float32Array([1.25, 0.2, -0.5]),
    right: new Float32Array([-1.1, 0.1, 0.4]) };
  assert.throws(() => encodeWavPcm(pcm, { format: "pcm16" }),
    (error) => error instanceof WavPcmError && error.code === "clipping" && error.count === 2);
  const options = { format: "pcm16", normalizePeakDbfs: -1, seed: "beat-1" };
  const first = encodeWavPcm(pcm, options);
  const second = encodeWavPcm(pcm, options);
  assert.deepEqual(first.bytes, second.bytes);
  assert.ok(Math.abs(first.report.outputPeak - 10 ** (-1 / 20)) < 0.000001);
  assert.ok(first.report.normalizationGainDb < 0);
  assert.equal(first.report.dithered, true);
});

test("silence, nonfinite PCM, wrong channel length and tampered headers fail closed", () => {
  const silence = { sampleRate: 48000, left: new Float32Array(64), right: new Float32Array(64) };
  assert.throws(() => encodeWavPcm(silence, { format: "pcm24" }),
    (error) => error instanceof WavPcmError && error.code === "silent");
  const nonfinite = { ...silence, left: new Float32Array([Number.NaN, 0]) ,
    right: new Float32Array(2) };
  assert.throws(() => encodeWavPcm(nonfinite, { format: "pcm16" }), /no finito/);
  assert.throws(() => encodeWavPcm({ ...silence, right: new Float32Array(63) },
    { format: "pcm16" }), /estéreo/);
  const impulse = { sampleRate: 48000, left: new Float32Array([0.4]),
    right: new Float32Array([-0.4]) };
  const wav = encodeWavPcm(impulse, { format: "pcm16", dither: false }).bytes;
  const truncated = wav.subarray(0, wav.byteLength - 1);
  assert.throws(() => validateWavPcm(truncated), /Cabecera/);
  const wrongChannels = wav.slice();
  new DataView(wrongChannels.buffer).setUint16(22, 1, true);
  assert.throws(() => validateWavPcm(wrongChannels), /Cabecera/);
});
