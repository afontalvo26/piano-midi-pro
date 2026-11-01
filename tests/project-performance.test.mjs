import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createProjectDocument } from "../app/src/project/model.ts";
import { validateProjectDocument, validateFocusedPatternEdit } from "../app/src/project/validate.ts";
import { canonicalizeProjectDocument, hashProjectDocument } from "../app/src/project/canonical.ts";
import { applyCommand, applySessionCommand } from "../app/src/project/commands.ts";

test("10,000-note project validates and hashes without truncating events", async () => {
  const base = createProjectDocument({ id: "performance-10000", at: 1000 });
  const document = {
    ...base,
    patterns: [{ id: "pattern-10000", name: "Large pattern", version: 1, lengthTicks: 10_000,
      notes: Array.from({ length: 10_000 }, (_, index) => ({
        id: `note-${index}`, startTick: index, durationTick: 1,
        pitch: 36 + index % 48, velocity: 1 + index % 127,
        releaseVelocity: 0, channel: 0, origin: { kind: "drawn" },
      })), expression: [] }],
  };
  const start = performance.now();
  validateProjectDocument(document);
  const afterValidation = performance.now();
  const serialized = canonicalizeProjectDocument(document);
  const afterCanonical = performance.now();
  const hash = await hashProjectDocument(document);
  const afterHash = performance.now();
  assert.equal(document.patterns[0].notes.length, 10_000);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(serialized.includes('"id":"note-9999"'));
  console.log(`PRJ 10k notes: validate=${(afterValidation - start).toFixed(1)}ms, canonical=${(afterCanonical - afterValidation).toFixed(1)}ms, hash=${(afterHash - afterCanonical).toFixed(1)}ms, JSON=${serialized.length} chars`);
});

test("bulk 128-note gesture uses focused validation without skipping provenance or undo", () => {
  const base = createProjectDocument({ id: "performance-bulk", at: 1000 });
  const pattern = { id: "bulk-pattern", name: "Bulk", version: 1, lengthTicks: 10_000,
    notes: Array.from({ length: 10_000 }, (_, index) => ({ id: `note-${index}`,
      startTick: index, durationTick: 1, pitch: 60, velocity: 80,
      releaseVelocity: 0, channel: 0, origin: { kind: "drawn" } })), expression: [] };
  const document = { ...base, patterns: [pattern] };
  validateProjectDocument(document);
  const next = { ...pattern, version: 2, notes: pattern.notes.map((note, index) =>
    index < 128 ? { ...note, velocity: 90 } : note) };
  assert.equal(validateFocusedPatternEdit(pattern, next), true);
  const command = { kind: "replacePattern", expectedVersion: 1, pattern: next, at: 2000 };
  const focused = applySessionCommand(document, command);
  const full = applyCommand(document, command);
  assert.deepEqual(focused.document, full.document);
  assert.deepEqual(applySessionCommand(focused.document, focused.inverse).document.patterns,
    document.patterns);
  const untrusted = { ...next, notes: next.notes.map((note, index) => index === 0
    ? { ...note, origin: { kind: "imported", sourceTakeId: "missing" } } : note) };
  assert.equal(validateFocusedPatternEdit(pattern, untrusted), false);
  assert.throws(() => applySessionCommand(document, { ...command, pattern: untrusted }),
    /toma MIDI inexistente/);
  const appended = { ...pattern, version: 2, notes: [...pattern.notes,
    { ...pattern.notes[0], id: "new-note", startTick: 9999 }] };
  assert.equal(validateFocusedPatternEdit(pattern, appended, document), true);
  const appendCommand = { ...command, pattern: appended };
  const added = applySessionCommand(document, appendCommand);
  assert.deepEqual(added.document, applyCommand(document, appendCommand).document);
  assert.deepEqual(applySessionCommand(added.document, added.inverse).document.patterns,
    document.patterns);
  const deleted = { ...pattern, version: 2,
    notes: pattern.notes.filter((note) => note.id !== "note-5000") };
  assert.equal(validateFocusedPatternEdit(pattern, deleted, document), true);
  const deleteCommand = { ...command, pattern: deleted };
  assert.deepEqual(applySessionCommand(document, deleteCommand).document,
    applyCommand(document, deleteCommand).document);
  const colliding = { ...appended, notes: [...pattern.notes,
    { ...pattern.notes[0], id: document.id, startTick: 9999 }] };
  assert.throws(() => validateFocusedPatternEdit(pattern, colliding, document), /identificador duplicado/);
});
