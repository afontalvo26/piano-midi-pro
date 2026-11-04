import assert from "node:assert/strict";
import test from "node:test";
import { drumPadMidiAction, parseDrumPadMidiAction } from "../../app/src/midi/drumPadMidi.ts";
import { learnMidiBinding, resolveBindings } from "../../app/src/midi/profile.ts";
import { parseMidiMessage } from "../../app/src/midi/message.ts";

test("DRM MIDI Learn codifica identidad persistente del pad, no una nota destino supuesta", () => {
  const action = drumPadMidiAction("pad-kick-uuid");
  assert.equal(action, "drum.pad:pad-kick-uuid");
  assert.deepEqual(parseDrumPadMidiAction(action), { padId: "pad-kick-uuid" });
  assert.equal(parseDrumPadMidiAction("drum.pad"), null);
  assert.throws(() => drumPadMidiAction("pad with spaces"), /inválido/);
});

test("DRM Learn conserva puerto canal nota física y banco observados", () => {
  const event = parseMidiMessage(Uint8Array.from([0x94, 52, 111]), "smk-port-a", 100);
  const action = drumPadMidiAction("pad-snare");
  const learned = learnMidiBinding(event, {
    id: "drum-learn-1", action, bank: "2", valueMode: "trigger", consumeNote: true,
  });
  assert(learned);
  assert.equal(learned.action, action);
  assert.equal(learned.consumeNote, true);
  assert.deepEqual(learned.matcher, {
    kind: "noteOn", inputId: "smk-port-a", channel: 4, number: 52, bank: "2",
  });
  assert.equal(resolveBindings(event, [learned], { bank: "1" }).length, 0);
  assert.equal(resolveBindings(event, [learned], { bank: "2" }).length, 1);
  const otherNote = parseMidiMessage(Uint8Array.from([0x94, 53, 111]), "smk-port-a", 101);
  assert.equal(resolveBindings(otherNote, [learned], { bank: "2" }).length, 0);
  const otherPort = parseMidiMessage(Uint8Array.from([0x94, 52, 111]), "smk-port-b", 102);
  assert.equal(resolveBindings(otherPort, [learned], { bank: "2" }).length, 0);
});
