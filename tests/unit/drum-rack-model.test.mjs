import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand } from "../../app/src/project/commands.ts";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { validateProjectDocument } from "../../app/src/project/validate.ts";
import { addDrumRackStep, commonDrumCycleTicks, drumPadStepAtTick, editDrumRackPad,
  editDrumRackPadInProject,
  projectDrumPadCycle, swingDrumRackPattern } from "../../app/src/composition/drumRackModel.ts";

const pads = Array.from({ length: 16 }, (_, index) => ({
  id: `pad-${index}`, name: `Pad ${index}`, color: "#1288cc", midiNote: 36 + index,
  channel: 9, source: index === 0 ? { kind: "asset", assetId: "asset-kick",
    sha256: "a".repeat(64) } : null,
  gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0, attackMs: 0,
  decayMs: 20, playMode: "oneShot", mute: false, solo: false,
  stepTicks: index === 1 ? 180 : 240, stepCount: 16,
}));
const rack = { pads };
const track = { id: "track-drum", name: "Batería", kind: "drum", drumRack: rack,
  mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
const note = { id: "hit-1", startTick: 265, durationTick: 80, pitch: 36,
  velocity: 100, releaseVelocity: 64, channel: 9, origin: { kind: "drawn" } };
const pattern = { id: "pattern-drum", name: "Beat", version: 1, lengthTicks: 11520,
  notes: [note], expression: [{ id: "cc-1", kind: "cc", tick: 0, sequence: 0,
    channel: 9, controller: 11, value: 100 }] };

test("ciclo común de 16 pads y proyección de una sola vuelta conservan golpes libres", () => {
  assert.equal(commonDrumCycleTicks(rack), 11520);
  assert.equal(drumPadStepAtTick(pads[0], 3840 + 265), 1);
  const cells = projectDrumPadCycle(pattern, pads[0]);
  assert.equal(cells.length, 16);
  assert.equal(cells[1].startTick, 240);
  assert.deepEqual(cells[1].offsetNotes, [note]);
  assert.deepEqual(cells[1].exactNotes, []);
  assert.equal(projectDrumPadCycle(pattern, pads[1]).flatMap((cell) => cell.exactNotes).length, 0);
});

test("crear paso del rack conserva las otras notas y expresión con ID estable", () => {
  const next = addDrumRackStep(pattern, pads[0], 3, "hit-2");
  assert.equal(next.version, 2);
  assert.equal(next.notes[0], note);
  assert.equal(next.notes[1].startTick, 720);
  assert.equal(next.notes[1].stepId, "pad-0:3");
  assert.equal(next.expression, pattern.expression);
  assert.throws(() => addDrumRackStep(pattern, pads[1], 0), /muestra grabada/);
  assert.throws(() => addDrumRackStep(pattern, pads[0], 16), /Paso/);
  assert.throws(() => addDrumRackStep(pattern, pads[0], 3, "hit-1"), /Paso o ID/);
});

test("edición de pad entrega replaceDrumRack con snapshot esperado", () => {
  const changed = { ...pads[0], gainDb: -4, name: "Kick A" };
  const command = editDrumRackPad(track, changed, 2000);
  assert.equal(command.kind, "replaceDrumRack");
  assert.equal(command.expected, rack);
  assert.equal(command.rack.pads[0], changed);
  assert.equal(command.rack.pads[1], pads[1]);
  assert.equal(command.at, 2000);
});

test("cambiar polirritmo o disparo actualiza patrón vinculado en un comando atómico", () => {
  const clip = { id: "clip-drum", trackId: track.id, kind: "pattern", sourceId: pattern.id,
    sourceVersion: pattern.version, startTick: 0, lengthTicks: 11520,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
    gainDb: 0, muted: false };
  const document = { tracks: [track], clips: [clip], scenes: [], patterns: [pattern] };
  const cycleCommand = editDrumRackPadInProject(document, track.id,
    { ...pads[1], stepTicks: 240 }, 2100);
  assert.equal(cycleCommand.kind, "replaceDrumRackPatterns");
  assert.equal(cycleCommand.expectedRack, rack);
  assert.equal(cycleCommand.patterns[0].expectedVersion, 1);
  assert.equal(cycleCommand.patterns[0].pattern.lengthTicks, 3840);
  assert.equal(cycleCommand.patterns[0].pattern.version, 2);
  assert.equal(cycleCommand.patterns[0].pattern.notes[0], note);
  const triggerCommand = editDrumRackPadInProject(document, track.id,
    { ...pads[0], midiNote: 60, channel: 10 }, 2200);
  assert.equal(triggerCommand.kind, "replaceDrumRackPatterns");
  assert.equal(triggerCommand.patterns[0].pattern.notes[0].pitch, 60);
  assert.equal(triggerCommand.patterns[0].pattern.notes[0].channel, 10);
  assert.equal(pattern.notes[0].pitch, 36);
  assert.equal(editDrumRackPadInProject(document, track.id,
    { ...pads[0], gainDb: -4 }, 2300).kind, "replaceDrumRack");
});

test("comando atómico del editor pasa validador, actualiza clip y deshace exactamente", () => {
  const clip = { id: "clip-drum", trackId: track.id, kind: "pattern", sourceId: pattern.id,
    sourceVersion: pattern.version, startTick: 0, lengthTicks: 11520,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
    gainDb: 0, muted: false };
  const initial = createProjectDocument({ id: "rack-project", at: 1000 });
  const document = { ...initial, tracks: [track], trackOrder: [track.id],
    patterns: [pattern], clips: [clip], assets: [{ id: "asset-kick", sha256: "a".repeat(64),
      byteLength: 4096, mimeType: "audio/wav", sourceKind: "user", license: "Propio",
      frameCount: 16000, sampleRate: 48000, channelCount: 1 }] };
  validateProjectDocument(document);
  const command = editDrumRackPadInProject(document, track.id, { ...pads[1], stepTicks: 240 }, 2100);
  const result = applyCommand(document, command);
  assert.equal(result.document.patterns[0].lengthTicks, 3840);
  assert.equal(result.document.patterns[0].version, 2);
  assert.equal(result.document.clips[0].sourceVersion, 2);
  assert.deepEqual(applyCommand(result.document, result.inverse).document, document);
  const trigger = editDrumRackPadInProject(document, track.id,
    { ...pads[0], midiNote: 60, channel: 10 }, 2200);
  const moved = applyCommand(document, trigger).document;
  assert.equal(moved.patterns[0].notes[0].pitch, 60);
  assert.equal(moved.patterns[0].notes[0].channel, 10);
});

test("swing por pad desplaza pasos impares sin tocar microtiming ni expresión", () => {
  const source = { ...pattern, notes: [{ ...note, probability: 0.6,
    ratchetCount: 2, microOffsetTick: -5 }] };
  const next = swingDrumRackPattern(source, rack, 0.25);
  assert.equal(next.version, 2);
  assert.equal(next.notes[0].startTick, 295);
  assert.equal(next.notes[0].microOffsetTick, -5);
  assert.equal(next.notes[0].probability, 0.6);
  assert.equal(next.notes[0].ratchetCount, 2);
  assert.equal(next.expression, source.expression);
  assert.equal(swingDrumRackPattern(source, rack, 0), source);
  assert.throws(() => swingDrumRackPattern(source, rack, 1.1), /0…100/);
});
