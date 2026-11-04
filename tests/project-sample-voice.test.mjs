import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { canonicalizeProjectDocument } from "../app/src/project/canonical.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";

const hash = "a".repeat(64);
const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const region = { startFrame: 0, endFrame: 100, fadeInFrames: 0, fadeOutFrames: 0,
  rootMidi: 60, cents: 0, reverse: false, loopMode: "loop", playMode: "gate" };
const voice = { mode: "mono", retrigger: "legato", glideMs: 180,
  attackMs: 12, releaseMs: 0, saturation: 0.35, subGainDb: -12 };

function project() {
  const base = createProjectDocument({ id: "sample-voice-qa", at: 1 });
  return { ...base,
    assets: [{ id: "sample", sha256: hash, byteLength: 100, mimeType: "audio/wav",
      sourceKind: "user", license: "user-owned", frameCount: 100,
      sampleRate: 48_000, channelCount: 1 }],
    trackOrder: ["sampler"], tracks: [{ id: "sampler", name: "Sampler",
      kind: "instrument", instrument: { instrumentId: "user-sampler",
        packageVersion: `sha256:${hash}`, presetId: "asset:sample", sampleRegion: region }, mix }] };
}

test("sampleVoice CAS command is reversible and retains sample region", () => {
  const before = project();
  validateProjectDocument(before);
  const applied = applyCommand(before, { kind: "replaceSampleVoice", trackId: "sampler",
    expected: undefined, voice, at: 2 });
  assert.deepEqual(applied.document.tracks[0].instrument.sampleVoice, voice);
  assert.deepEqual(applied.document.tracks[0].instrument.sampleRegion, region);
  assert.match(canonicalizeProjectDocument(applied.document), /"sampleVoice"/);
  const undone = applyCommand(applied.document, applied.inverse).document;
  assert.equal(undone.tracks[0].instrument.sampleVoice, undefined);
  assert.deepEqual(undone.tracks[0].instrument.sampleRegion, region);
  assert.equal(canonicalizeProjectDocument(undone), canonicalizeProjectDocument(before));
  assert.throws(() => applyCommand(applied.document, { kind: "replaceSampleVoice",
    trackId: "sampler", expected: undefined, voice, at: 3 }), /desactualizado/);
});

test("sampleVoice enforces poly defaults, legato gate/loop and finite ranges", () => {
  const base = project();
  const set = (candidate) => validateProjectDocument({ ...base,
    tracks: [{ ...base.tracks[0], instrument: {
      ...base.tracks[0].instrument, sampleVoice: candidate } }] });
  set({ mode: "poly", retrigger: "always", glideMs: 0, attackMs: 0, releaseMs: 0 });
  set(voice);
  assert.throws(() => set({ ...voice, mode: "poly" }), /polifonía/);
  assert.throws(() => set({ ...voice, glideMs: 2001 }), /glideMs/);
  assert.throws(() => set({ ...voice, releaseMs: Number.NaN }), /no serializable|releaseMs/);
  assert.throws(() => set({ ...voice, saturation: 1.01 }), /saturation/);
  assert.throws(() => set({ ...voice, subGainDb: -36.1 }), /subGainDb/);
  assert.throws(() => set({ ...voice, mode: "poly", retrigger: "always", glideMs: 0 }),
    /procesamiento mono/);
  assert.throws(() => validateProjectDocument({ ...base,
    tracks: [{ ...base.tracks[0], instrument: { ...base.tracks[0].instrument,
      sampleRegion: { ...region, loopMode: "none" }, sampleVoice: voice } }] }),
  /gate con loop/);
  assert.throws(() => validateProjectDocument({ ...base,
    tracks: [{ ...base.tracks[0], instrument: { instrumentId: "salamander-grand",
      packageVersion: "official", presetId: "natural", sampleVoice: voice } }] }),
  /sólo para sampler propio/);
});

test("region edits preserve voice settings and reject removal while legato depends on gate loop", () => {
  const withVoice = applyCommand(project(), { kind: "replaceSampleVoice",
    trackId: "sampler", expected: undefined, voice, at: 2 }).document;
  const nextRegion = { ...region, endFrame: 90 };
  const changed = applyCommand(withVoice, { kind: "replaceSampleRegion",
    trackId: "sampler", expected: region, region: nextRegion, at: 3 }).document;
  assert.deepEqual(changed.tracks[0].instrument.sampleVoice, voice);
  assert.throws(() => applyCommand(changed, { kind: "replaceSampleRegion",
    trackId: "sampler", expected: nextRegion, region: undefined, at: 4 }), /legato requiere/);
});
