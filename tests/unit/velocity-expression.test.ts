import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PHYSICAL_CALIBRATION,
  DEFAULT_VELOCITY_CALIBRATION_BANK,
  getPortVelocityCalibration,
  midiVelocityToGain,
  normalizeVelocity,
  recordPortVelocity,
  setPortVelocityCalibration,
} from "../../app/src/utils/velocity.ts";
import { mapPhysicalNote } from "../../app/src/midi/profile.ts";

test("los 127 golpes físicos tienen dinámica estricta desde pianissimo a forte", () => {
  const levels = Array.from({ length: 127 }, (_, index) =>
    midiVelocityToGain(index + 1, "expressive", DEFAULT_PHYSICAL_CALIBRATION));
  assert.ok(levels[0] > 0 && levels[0] < 0.01);
  assert.ok(levels[7] < 0.025, "velocity 8 debe ser muy suave");
  assert.ok(levels[31] < 0.18, "velocity 32 debe seguir suave");
  assert.ok(levels[63] > 0.25 && levels[63] < 0.4, "velocity 64 debe ser intermedia");
  assert.ok(levels[95] > 0.5 && levels[95] < 0.75, "velocity 96 debe sentirse fuerte");
  assert.equal(levels[126], 1);
  for (let index = 1; index < levels.length; index++) {
    assert.ok(levels[index] > levels[index - 1], `paso ${index + 1} se perdió`);
  }
  assert.equal(midiVelocityToGain(0, "expressive", DEFAULT_PHYSICAL_CALIBRATION), 0);
});

test("piso cero permite pianissimo extremo sin meseta y conserva el rango medio", () => {
  const calibration = { ...DEFAULT_PHYSICAL_CALIBRATION, audibilityFloor: 0 };
  const levels = Array.from({ length: 127 }, (_, index) =>
    midiVelocityToGain(index + 1, "expressive", calibration));
  assert.ok(levels[0] > 0 && levels[0] < 0.001);
  assert.ok(levels[63] > 0.25 && levels[63] < 0.4);
  for (let index = 1; index < levels.length; index++) {
    assert.ok(levels[index] > levels[index - 1]);
  }
});

test("el aprendizaje por puerto no aplana las velocidades ni contamina otro dispositivo", () => {
  const elite = { profileId: "smk37-elite", inputId: "elite-1", inputName: "SMK-37 Elite" };
  const other = { profileId: "generic", inputId: "keyboard-b", inputName: "Otro MIDI" };
  let bank = DEFAULT_VELOCITY_CALIBRATION_BANK;
  for (let i = 0; i < 160; i++) {
    bank = recordPortVelocity(bank, elite, [32, 48, 64, 80, 96][i % 5]);
  }
  const learned = getPortVelocityCalibration(bank, elite);
  assert.equal(getPortVelocityCalibration(bank, other).sampleCount, 0);
  assert.equal(learned.sampleCount, 160);
  const values = Array.from({ length: 127 }, (_, index) => normalizeVelocity(index + 1, learned));
  for (let index = 1; index < values.length; index++) {
    assert.ok(values[index] > values[index - 1], `calibración aplanó ${index + 1}`);
  }
  assert.ok(values[109] > values[89]);
  assert.ok(values[126] > values[109]);
  bank = setPortVelocityCalibration(bank, other, {
    ...DEFAULT_PHYSICAL_CALIBRATION,
    audibilityFloor: 0,
  });
  assert.equal(getPortVelocityCalibration(bank, elite).audibilityFloor, 0.005);
  assert.equal(getPortVelocityCalibration(bank, other).audibilityFloor, 0);
});

test("el SMK-37 se ancla a 37 teclas; MIDI genérico conserva nota hasta calibrarlo", () => {
  const options = { physicalBase: 48, rangeStart: 60, profileId: "generic" as const };
  assert.equal(mapPhysicalNote(48, { ...options, identity: { name: "SMK_37 Midi" } }), 60);
  assert.equal(mapPhysicalNote(48, { ...options, identity: { name: "Controlador X" } }), 48);
  assert.equal(mapPhysicalNote(48, { ...options, identity: { name: "Controlador X" }, explicitlyCalibrated: true }), 60);
});
