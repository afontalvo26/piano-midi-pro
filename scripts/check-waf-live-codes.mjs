/**
 * check-waf-live-codes.mjs — audita los códigos de WebAudioFont que la app pide
 * HOY contra el manifiesto verificado.
 *
 * POR QUÉ: `WAF_SUGGESTIONS` (WebAudioFont.ts) y `wafDrumCode()`
 * (DrumKitEngine.ts) se escribieron a mano, antes de que existiera el
 * manifiesto. Si alguno no está en el manifiesto, esa variante da 404 y el
 * motor cae a sintetizador — justo lo que el manifiesto existe para evitar.
 *
 * USO
 * ---
 *   node scripts/check-waf-live-codes.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { WAF_VARIANTS, WAF_DRUMS } = await import(
  pathToFileURL(resolve("app/src/engine/wafManifest.ts")).href
);

const known = new Set();
for (const ids of Object.values(WAF_VARIANTS)) for (const id of ids) known.add(id);
const drumKnown = new Set();
for (const d of WAF_DRUMS) for (const id of d.variants) drumKnown.add(id);

const source = readFileSync("app/src/engine/WebAudioFont.ts", "utf8");
const block = source.slice(source.indexOf("WAF_SUGGESTIONS"));
const codes = [...block.matchAll(/"(\d{4}_[A-Za-z0-9_]+)"/g)].map((m) => m[1]);
const unique = [...new Set(codes)];

const bad = unique.filter((c) => !known.has(c) && !known.has(c + "_sf2_file"));

console.log(`códigos en WAF_SUGGESTIONS      : ${unique.length}`);
console.log(`  presentes en el manifiesto    : ${unique.length - bad.length}`);
console.log(`  AUSENTES (riesgo de 404)      : ${bad.length}`);
for (const b of bad) console.log(`    ${b}`);

// El código que arma DrumKitEngine hoy: `128<nota>_0_FluidR3_GM`.
const drumEngine = readFileSync("app/src/engine/DrumKitEngine.ts", "utf8");
const kit = /GM_KIT_INDEX = (\d+)/.exec(drumEngine)?.[1];
const kitSource = /GM_KIT_SOURCE = "([^"]+)"/.exec(drumEngine)?.[1];
console.log(`\nDrumKitEngine: kit ${kit}, fuente ${kitSource}`);

const missing = [];
let covered = 0;
for (const d of WAF_DRUMS) {
  if (d.variants.length === 0) continue;
  covered++;
  const wanted = `128${d.note}_${kit}_${kitSource}`;
  const ok = [...drumKnown].some(
    (id) => id === wanted || id === `${wanted}_sf2_file`,
  );
  if (!ok) missing.push(d.note);
}

console.log(`  notas que el manifiesto cubre : ${covered}`);
console.log(`  notas SIN ese kit/fuente      : ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
