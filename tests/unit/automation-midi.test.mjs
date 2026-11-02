import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDocument } from "../../app/src/project/model.ts";
import { automationMidiAction, automationMidiValueMode, parseAutomationMidiAction,
  scaleAutomationMidiValue, advancePickup } from "../../app/src/midi/automationMidi.ts";
import { learnMidiBinding, resolveBindings } from "../../app/src/midi/profile.ts";
import { parseMidiMessage } from "../../app/src/midi/message.ts";

test("AUT-06 aprende exactamente puerto/canal/CC y conserva banco observado", () => {
  const event = parseMidiMessage(Uint8Array.from([0xb2, 74, 91]), "input-a", 123);
  const action = automationMidiAction("lane-gain", "pickup");
  const learned = learnMidiBinding(event, { id: "learn-1", action, bank: "2",
    valueMode: automationMidiValueMode("pickup") });
  assert(learned);
  assert.deepEqual(learned.matcher, { kind: "cc", inputId: "input-a",
    channel: 2, number: 74, bank: "2" });
  assert.equal(resolveBindings(event, [learned], { bank: "1" }).length, 0);
  assert.equal(resolveBindings(event, [learned], { bank: "2" }).length, 1);
  const otherPort = parseMidiMessage(Uint8Array.from([0xb2, 74, 91]), "input-b", 124);
  assert.equal(resolveBindings(otherPort, [learned], { bank: "2" }).length, 0);
});

test("AUT-06 action codifica takeover sin adivinar el hardware", () => {
  for (const takeover of ["pickup", "absolute", "relative-twos-complement",
    "relative-binary-offset"]) {
    const action = automationMidiAction("lane-123", takeover);
    assert.deepEqual(parseAutomationMidiAction(action), { laneId: "lane-123", takeover });
  }
  assert.equal(parseAutomationMidiAction("volume.master"), null);
  assert.throws(() => automationMidiAction("lane with spaces", "pickup"), /inválido/);
});

test("pickup no salta: adquiere al alcanzar o cruzar el valor software", () => {
  let state;
  let step = advancePickup(state, 0.1, 0.6); state = step.state;
  assert.equal(step.acquired, false);
  step = advancePickup(state, 0.4, 0.6); state = step.state;
  assert.equal(step.acquired, false);
  step = advancePickup(state, 0.65, 0.6); state = step.state;
  assert.equal(step.acquired, true);
  step = advancePickup(state, 0.2, 0.6);
  assert.equal(step.acquired, true);
});

test("absoluto y relativo respetan el rango del parámetro", () => {
  const descriptor = { min: -60, max: 12 };
  assert.equal(scaleAutomationMidiValue(0, "absolute", -10, descriptor), -60);
  assert.equal(scaleAutomationMidiValue(127, "absolute", -10, descriptor), 12);
  const up = scaleAutomationMidiValue(1, "relative-twos-complement", -10, descriptor);
  assert(up > -10 && up < -9);
  assert.equal(scaleAutomationMidiValue(127, "relative-twos-complement", 11.9, descriptor), 12);
});

test("CC11 sigue siendo expresión y no crea binding de mixer por sí solo", () => {
  const event = parseMidiMessage(Uint8Array.from([0xb0, 11, 100]), "input-a", 10);
  assert.equal(event.kind, "cc");
  assert.equal(event.controller, 11);
  assert.equal(resolveBindings(event, [], { bank: "1" }).length, 0);
  const document = createProjectDocument({ id: "aut-midi", at: 1 });
  assert.equal(document.automation.length, 0);
});
