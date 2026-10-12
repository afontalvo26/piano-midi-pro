/**
 * report-waf-coverage.mjs — imprime la matriz legible de cobertura del
 * manifiesto: variantes por programa GM y kits/fuentes por nota de percusión.
 *
 * Es sólo lectura del manifiesto generado; sirve para armar el informe y para
 * revisar de un vistazo qué se puede pedir y qué no.
 *
 * USO
 * ---
 *   node scripts/report-waf-coverage.mjs
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const manifestPath = process.argv[2] ?? "app/src/engine/wafManifest.ts";
const { WAF_VARIANTS, WAF_DRUMS, WAF_NEEDED_PROGRAMS, WAF_DRUM_KITS } = await import(
  pathToFileURL(resolve(manifestPath)).href
);

const KIT_NAME = (k) => WAF_DRUM_KITS[k] ?? `kit${k}`;
const bareSource = (s) => s.replace(/_sf2(_file)?$/i, "");

console.log("== PROGRAMAS GM ==");
let totalVariants = 0;
for (const prog of Object.keys(WAF_NEEDED_PROGRAMS).map(Number).sort((a, b) => a - b)) {
  const ids = WAF_VARIANTS[prog] ?? [];
  totalVariants += ids.length;
  const sources = [...new Set(ids.map((id) => bareSource(id.slice(id.indexOf("_") + 1))))];
  const codes = [...new Set(ids.map((id) => id.slice(0, id.indexOf("_"))))];
  console.log(
    `  ${String(prog).padStart(3)} ${WAF_NEEDED_PROGRAMS[prog].padEnd(28)} ${String(ids.length).padStart(2)} variantes  [${codes.join(" ")}]  {${sources.join(", ")}}`,
  );
}
console.log(`  TOTAL: ${totalVariants} variantes en ${Object.keys(WAF_VARIANTS).length} programas`);

// La app elige la PRIMERA variante de cada programa, así que interesa saber qué
// fuente es la que realmente va a sonar por defecto.
const firstSource = new Map();
const notGeneralUserGS = [];
for (const prog of Object.keys(WAF_VARIANTS).map(Number).sort((a, b) => a - b)) {
  const ids = WAF_VARIANTS[prog] ?? [];
  if (!ids.length) continue;
  const src = bareSource(ids[0].slice(ids[0].indexOf("_") + 1));
  firstSource.set(src, (firstSource.get(src) ?? 0) + 1);
  if (src !== "GeneralUserGS") notGeneralUserGS.push(`${prog}=${ids[0]}`);
}
console.log("");
console.log("-- fuente que la app elige PRIMERO por programa --");
for (const [src, n] of [...firstSource].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(2)}  ${src}`);
if (notGeneralUserGS.length) {
  console.log("-- programas sin GeneralUserGS como primera opción --");
  for (const x of notGeneralUserGS) console.log(`  ${x}`);
}
console.log("");

console.log("== PERCUSIÓN (canal 10) ==");
const kitsUsed = new Set();
const sourcesUsed = new Set();
let totalDrums = 0;
const empty = [];
for (const d of WAF_DRUMS) {
  if (d.variants.length === 0) {
    empty.push(d.note);
    console.log(`  ${String(d.note).padStart(3)}  SIN COBERTURA`);
    continue;
  }
  totalDrums += d.variants.length;
  const byKit = new Map();
  for (const id of d.variants) {
    const rest = id.slice(id.indexOf("_") + 1);
    const kit = Number(rest.slice(0, rest.indexOf("_")));
    const src = rest.slice(rest.indexOf("_") + 1);
    kitsUsed.add(kit);
    sourcesUsed.add(bareSource(src));
    if (!byKit.has(kit)) byKit.set(kit, []);
    byKit.get(kit).push(bareSource(src));
  }
  const parts = [...byKit]
    .sort((a, b) => a[0] - b[0])
    .map(([k, srcs]) => `${KIT_NAME(k)}: ${srcs.join("/")}`);
  console.log(`  ${String(d.note).padStart(3)}  ${String(d.variants.length).padStart(2)} var  ${parts.join("  |  ")}`);
}
console.log(
  `  TOTAL: ${totalDrums} variantes en ${WAF_DRUMS.length - empty.length} notas; kits [${[...kitsUsed].sort((a, b) => a - b).join(", ")}]; fuentes [${[...sourcesUsed].sort().join(", ")}]`,
);
console.log(`  SIN COBERTURA (${empty.length}): ${empty.join(", ")}`);
