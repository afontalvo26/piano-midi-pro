import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSmk37Capture } from "../../scripts/gate-smk37-midi.mjs";

function fixture(noteCount = 37, repeat = 2) {
  const events = [];
  for (const cc of [64, 66, 67]) events.push({ bytes: [0xb0, cc, 127] });
  for (let round = 0; round < repeat; round++) {
    for (let note = 0; note < noteCount; note++) {
      events.push({ bytes: [0x90, 48 + note, 90] });
    }
    for (let note = 0; note < noteCount; note++) {
      events.push({ bytes: [0x80, 48 + note, 64] });
    }
  }
  return events;
}

test("full raw-MIDI 37+37/pedals fixture satisfies MIDI-only gate", () => {
  const result = analyzeSmk37Capture(fixture());
  assert.equal(result.distinctPitches, 37);
  assert.equal(result.maxSimultaneous, 37);
  assert.equal(result.fullChordWindows, 2);
  assert.equal(result.midiEvidenceReady, true);
  assert.equal(result.physicalAudioCertified, false);
  assert.equal(result.physicalLatencyCertified, false);
});

test("historical capture-like partial coverage remains incomplete", () => {
  const result = analyzeSmk37Capture(fixture(23, 1));
  assert.equal(result.midiEvidenceReady, false);
  assert.equal(result.checks.thirtySevenPitches, false);
  assert.equal(result.checks.fullChordTwice, false);
});

test("unmatched notes and missing pedals block acceptance", () => {
  const events = fixture();
  events.push({ bytes: [0x80, 2, 0] });
  const result = analyzeSmk37Capture(events.filter((event) => event.bytes[1] !== 66));
  assert.equal(result.checks.balancedReleases, false);
  assert.equal(result.checks.sostenutoCC66, false);
  assert.equal(result.midiEvidenceReady, false);
});

test("malformed MIDI events are rejected", () => {
  assert.throws(() => analyzeSmk37Capture([{ bytes: [0x90, 60, 999] }]), /invalid|inválida/i);
});
