import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INSTRUMENT_ID,
  INSTRUMENTS,
  getInstrument,
} from "../../app/src/instruments/catalog.ts";
import { WAF_VARIANTS } from "../../app/src/engine/wafManifest.ts";

test("el piano Salamander local sigue siendo el predeterminado", () => {
  const instrument = getInstrument(DEFAULT_INSTRUMENT_ID);
  assert.ok(instrument);
  assert.equal(instrument.engineId, "salamander");
  assert.deepEqual(instrument.source, { kind: "salamander", voicing: "natural" });
  assert.equal(instrument.requiresNetwork, false);
  assert.equal(getInstrument("preset-inexistente"), undefined);
});

test("cada preset tiene identidad, atribución y ventana tocable de 37 notas", () => {
  assert.equal(new Set(INSTRUMENTS.map(({ id }) => id)).size, INSTRUMENTS.length);

  for (const instrument of INSTRUMENTS) {
    assert.match(instrument.id, /^[a-z0-9-]+$/);
    assert.ok(instrument.label.trim());
    assert.ok(instrument.category.trim());
    assert.ok(instrument.sourceCredit.trim());
    assert.ok(instrument.licenseUrl.startsWith("https://"));
    assert.equal(
      instrument.suggestedRange.maxMidi - instrument.suggestedRange.minMidi,
      36,
      instrument.id,
    );
    assert.ok(instrument.suggestedRange.minMidi >= 0, instrument.id);
    assert.ok(instrument.suggestedRange.maxMidi <= 127, instrument.id);
  }
});

test("todos los códigos remotos son variantes FluidR3 publicadas para su programa GM", () => {
  const remote = INSTRUMENTS.filter(
    (instrument) => instrument.source.kind === "waf",
  );
  assert.ok(remote.length >= 8);

  for (const instrument of remote) {
    assert.equal(instrument.engineId, "webaudiofont");
    assert.equal(instrument.requiresNetwork, true);
    if (instrument.source.kind !== "waf") throw new Error(instrument.id);
    const { program, code } = instrument.source;
    assert.ok(WAF_VARIANTS[program]?.includes(code), code);
    assert.match(code, /^\d{4}_FluidR3_GM_sf2_file$/);
    assert.equal(Number(code.slice(0, 3)), program, code);
  }
});
