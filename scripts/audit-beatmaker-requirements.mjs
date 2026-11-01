#!/usr/bin/env node
/**
 * Contract count gate. Every BM requirement lives in exactly one of 15 module
 * specifications; no feature is marked accepted by passing this structural gate.
 *
 * Run: node scripts/audit-beatmaker-requirements.mjs
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const groups = {
  PRJ: ["project-storage", 8], ENG: ["audio-engine", 8],
  CLK: ["transport", 8], MID: ["midi-controller", 8],
  ROL: ["piano-roll", 7], DRM: ["drum-machine", 7],
  SMP: ["sampler-808", 7], AUD: ["audio-recording", 7],
  INS: ["instrument-library", 8], ARR: ["arrangement", 7],
  MIX: ["mixer-effects", 7], AUT: ["automation", 7],
  EXP: ["export", 7], UXP: ["studio-experience", 8],
  QLT: ["quality-gates", 9],
};
let total = 0;
const errors = [];
const seen = new Set();
for (const [prefix, [name, count]] of Object.entries(groups)) {
  const file = resolve(" .kiro/specs/beatmaker-studio/modules".trim(), name, "requirements.md");
  try {
    const content = await readFile(file, "utf8");
    const ids = [...content.matchAll(new RegExp(`^- (${prefix}-\\d{2})\\b`, "gm"))]
      .map((match) => match[1]);
    if (ids.length !== count) errors.push(`${prefix}: ${ids.length}/${count} requirements`);
    for (let index = 0; index < count; index++) {
      const id = `${prefix}-${String(index + 1).padStart(2, "0")}`;
      if (!ids.includes(id)) errors.push(`Missing ${id}`);
    }
    for (const id of ids) {
      if (seen.has(id)) errors.push(`Duplicate ${id}`);
      seen.add(id);
    }
    total += ids.length;
    console.log(`${prefix}: ${ids.length}/${count}`);
  } catch (error) {
    errors.push(`${prefix}: could not read ${file}: ${String(error)}`);
  }
}
if (total !== 113) errors.push(`Requirement inventory: ${total}/113`);
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS contract inventory: 113 distinct criteria across 15 modules");
  console.log("NOTE: inventory integrity is not product acceptance or physical QA.");
}
