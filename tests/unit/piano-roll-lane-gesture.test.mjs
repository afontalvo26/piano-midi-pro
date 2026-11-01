import assert from "node:assert/strict";
import test from "node:test";
import { hitPianoRollLaneEvent, laneValueFromY } from "../../app/src/composition/pianoRollLanes.ts";

test("gesto vertical conserva extremos MIDI de velocity/release y bend 14 bit", () => {
  assert.equal(laneValueFromY("velocity", 109), 0);
  assert.equal(laneValueFromY("velocity", 11), 127);
  assert.equal(laneValueFromY("releaseVelocity", 20), 115);
  assert.equal(laneValueFromY("pitchBend", 109), 0);
  assert.equal(laneValueFromY("pitchBend", 11), 16383);
});

test("puntos CC simultáneos se distinguen por valor y canal", () => {
  const pattern = { id: "lanes", name: "MIDI", version: 1, lengthTicks: 3840,
    notes: [], expression: [
      { id: "low", kind: "cc", tick: 480, sequence: 0, channel: 0, controller: 11, value: 12 },
      { id: "high", kind: "cc", tick: 480, sequence: 1, channel: 0, controller: 11, value: 110 },
      { id: "other", kind: "cc", tick: 480, sequence: 2, channel: 1, controller: 11, value: 110 },
    ] };
  assert.equal(hitPianoRollLaneEvent(pattern, "cc", 0, 11, 480, 20, 108, 15)?.id, "high");
  assert.equal(hitPianoRollLaneEvent(pattern, "cc", 0, 11, 480, 20, 10, 15)?.id, "low");
  assert.equal(hitPianoRollLaneEvent(pattern, "cc", 0, 11, 480, 20, 60, 15), null);
});
