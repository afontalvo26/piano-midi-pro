import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { applyCommand } from "../app/src/project/commands.ts";
import { validateProjectDocument } from "../app/src/project/validate.ts";
import { commitPortableRecordedOverdub } from "../app/src/project/portableOverdub.ts";

const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
  armed: false, sends: [], effects: [] };
const take = { id: "take-overdub", kind: "midi", recordingId: "library-recording",
  assetId: "smf-asset", createdAt: 2, midiImport: { sourceSha256: "a".repeat(64), sourceByteLength: 64,
    sourcePpq: 480, tempoMap: [{ tick: 0, microsPerQuarter: 500_000 }],
    meterMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    sourceTempoEvents: [], sourceMeterEvents: [], roundedPositions: 0,
    ignoredMetaEvents: 0, ignoredSysExEvents: 0, normalizedZeroDurations: 0 } };
const asset = { id: "smf-asset", sha256: "a".repeat(64), byteLength: 64,
  mimeType: "audio/midi", sourceKind: "recorded", license: "user-owned" };

function fixture() {
  const base = createProjectDocument({ id: "overdub-project", at: 1 });
  const pattern = { id: "pattern-one", name: "Patrón", version: 1, lengthTicks: 3840,
    notes: [{ id: "prior-note", startTick: 0, durationTick: 240, pitch: 60,
      velocity: 100, releaseVelocity: 0, channel: 0, origin: { kind: "drawn" } }],
    expression: [] };
  const clip = (id, startTick) => ({ id, kind: "pattern", trackId: "piano",
    sourceId: pattern.id, sourceVersion: 1, startTick, lengthTicks: 3840,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
    gainDb: 0, muted: false });
  return { ...base, trackOrder: ["piano"], tracks: [{ id: "piano", name: "Piano",
    kind: "instrument", instrument: { instrumentId: "salamander", packageVersion: "1",
      presetId: "grand" }, mix }], patterns: [pattern],
    clips: [clip("first-clip", 0), clip("second-clip", 3840)] };
}

function command(before, source = take) {
  const pattern = before.patterns[0];
  return { kind: "overdubRecordedTake", expectedVersion: pattern.version,
    take: source, asset, at: 2, pattern: { ...pattern, version: pattern.version + 1,
      notes: [...pattern.notes, { id: "overdub-note", startTick: 960,
        durationTick: 480, pitch: 64, velocity: 91, releaseVelocity: 20,
        channel: 0, origin: { kind: "imported", sourceTakeId: source.id,
          sourcePpq: 480, sourceStartTick: 480 } }],
      expression: [...pattern.expression, { id: "overdub-bend", kind: "pitchBend",
        tick: 960, channel: 0, sequence: 1, value14: 9000,
        sourceTakeId: source.id, sourcePpq: 480, sourceTick: 480 }] } };
}

test("overdub atomically adds take provenance, updates shared clips, and undo/redo preserves bytes outside project", () => {
  const before = fixture();
  validateProjectDocument(before);
  const added = applyCommand(before, command(before));
  assert.equal(added.document.takes.length, 1);
  assert.equal(added.document.assets.length, 1);
  assert.deepEqual(added.document.clips.map((clip) => clip.sourceVersion), [2, 2]);
  assert.deepEqual(added.document.patterns[0].notes[0], before.patterns[0].notes[0],
    "existing event remains semantically unchanged");
  const undone = applyCommand(added.document, added.inverse);
  assert.equal(undone.document.takes.length, 0);
  assert.equal(undone.document.assets.length, 0);
  assert.deepEqual(undone.document.clips.map((clip) => clip.sourceVersion), [1, 1]);
  assert.deepEqual(undone.document.patterns[0], before.patterns[0]);
  const redone = applyCommand(undone.document, undone.inverse);
  assert.deepEqual(redone.document.patterns[0], added.document.patterns[0]);
  assert.deepEqual(redone.document.takes, [take]);
  assert.deepEqual(redone.document.assets, [asset]);
});

test("undo keeps a take referenced by another pattern; redo reuses the exact take ref", () => {
  const before = fixture();
  const added = applyCommand(before, command(before));
  const cloned = { ...added.document.patterns[0], id: "pattern-clone", version: 1,
    notes: added.document.patterns[0].notes.map((note) => ({ ...note, id: `clone-${note.id}` })),
    expression: added.document.patterns[0].expression.map((event) => ({ ...event, id: `clone-${event.id}` })) };
  const withClone = applyCommand(added.document, { kind: "createPattern", pattern: cloned, at: 3 }).document;
  const undone = applyCommand(withClone, added.inverse);
  assert.equal(undone.document.takes.length, 1);
  assert.equal(undone.document.assets.length, 1);
  assert.equal(undone.document.patterns[1].notes[1].origin.sourceTakeId, take.id);
  const redone = applyCommand(undone.document, undone.inverse);
  assert.equal(redone.document.takes.length, 1);
  assert.equal(redone.document.patterns[0].version, 2);
});

test("rejects stale, duplicate, altered or unreferenced overdubs", () => {
  const before = fixture();
  const valid = command(before);
  assert.throws(() => applyCommand(before, { ...valid, expectedVersion: 2 }), /desactualizada/);
  assert.throws(() => applyCommand(before, { ...valid, pattern: { ...valid.pattern,
    notes: [{ ...valid.pattern.notes[0], pitch: 61 }, valid.pattern.notes[1]] } }),
  /modificar notas existentes/);
  assert.throws(() => applyCommand(before, { ...valid, pattern: { ...valid.pattern,
    notes: [valid.pattern.notes[0], { ...valid.pattern.notes[1], origin: { kind: "imported" } }] } }),
  /Procedencia/);
  const applied = applyCommand(before, valid).document;
  assert.throws(() => applyCommand(applied, { ...valid, expectedVersion: 2,
    pattern: { ...valid.pattern, version: 3 } }), /duplicada/);
  assert.throws(() => validateProjectDocument({ ...before, patterns: [{ ...before.patterns[0],
    notes: [{ ...before.patterns[0].notes[0], origin: { kind: "imported",
      sourceTakeId: "missing" } }] }] }), /toma MIDI inexistente/);
});

test("legacy local-only take is upgraded atomically and restored by undo", () => {
  const { assetId: _unused, ...legacy } = take;
  const before = { ...fixture(), takes: [legacy] };
  const added = applyCommand(before, command(before));
  assert.equal(added.document.takes[0].assetId, asset.id);
  assert.deepEqual(applyCommand(added.document, added.inverse).document.takes, [legacy]);
});

test("changed source SMF is rejected before staging or dispatch", async () => {
  const before = fixture();
  let staged = false;
  let dispatched = false;
  const bytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
    0, 0, 0, 1, 1, 0]);
  await assert.rejects(() => commitPortableRecordedOverdub(
    { getBytes: async () => bytes },
    { stageAsset: async () => { staged = true; }, readAsset: async () => null },
    { getSnapshot: () => ({ document: before }), dispatch: () => { dispatched = true; },
      save: async () => ({}) },
    { expectedVersion: 1, pattern: command(before).pattern, take, at: 2 },
  ), /hash o longitud/);
  assert.equal(staged, false);
  assert.equal(dispatched, false);
});

test("portable commit seals pattern-local retimed timing for exact later restoration", async () => {
  const bytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
    0, 0, 0, 1, 1, 0]);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0")).join("");
  const source = { ...take, midiImport: { ...take.midiImport,
    sourceSha256: sha256, sourceByteLength: bytes.byteLength } };
  let document = fixture();
  const staged = [];
  const session = {
    getSnapshot: () => ({ document }),
    dispatch: (next) => { document = applyCommand(document, next).document; },
    save: async () => ({}),
  };
  await commitPortableRecordedOverdub(
    { getBytes: async () => bytes },
    { stageAsset: async (ref, data) => { staged.push([ref.sha256, data.size]); },
      readAsset: async () => null },
    session,
    { expectedVersion: 1, pattern: command(document).pattern, take: source,
      assetId: "smf-asset", at: 2 },
  );
  const imported = document.patterns[0].notes[1];
  assert.deepEqual([imported.origin.importedProjectStartTick,
    imported.origin.importedProjectDurationTick], [960, 480]);
  assert.deepEqual(staged, [[sha256, bytes.byteLength]]);
  validateProjectDocument(document);
  const { importedProjectDurationTick: _missingDuration, ...incompleteOrigin } = imported.origin;
  assert.throws(() => validateProjectDocument({ ...document,
    patterns: [{ ...document.patterns[0], notes: [document.patterns[0].notes[0],
      { ...imported, origin: incompleteOrigin }] }] }), /inicio y duración juntos/);
});
