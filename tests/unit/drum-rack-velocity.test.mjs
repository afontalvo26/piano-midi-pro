import assert from "node:assert/strict";
import test from "node:test";
import { shapeDrumPadVelocity } from "../../app/src/audio/drumRackEngine.ts";

test("pad velocity sensitivity 1 conserva la respuesta histórica", () => {
  for (const velocity of [1, 32, 64, 96, 127]) {
    assert.equal(shapeDrumPadVelocity(velocity, 1), velocity / 127);
  }
});

test("pad velocity sensitivity 0 aplana y 2 aumenta contraste", () => {
  assert.equal(shapeDrumPadVelocity(32, 0), 0.75);
  assert.equal(shapeDrumPadVelocity(127, 0), 0.75);
  assert(shapeDrumPadVelocity(32, 2) < 32 / 127);
  assert(shapeDrumPadVelocity(127, 2) > 0.99);
  assert.throws(() => shapeDrumPadVelocity(0, 1), /inválida/);
  assert.throws(() => shapeDrumPadVelocity(64, 2.01), /inválida/);
});
