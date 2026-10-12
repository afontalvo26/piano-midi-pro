/**
 * probe-waf-urls.mjs — verifica URLs de WebAudioFont con HEAD real y correlaciona
 * cada respuesta con su URL.
 *
 * POR QUÉ EXISTE
 * --------------
 * WebAudioFont no publica inventario de percusión: el índice del directorio sólo
 * lista los 82 archivos de KIT COMPLETO (`drums_<kit>_<Fuente><Nombre>`), no los
 * `128<nota>_<kit>_<Fuente>` de una sola pieza que usa la app. Así que la única
 * forma de saber qué notas existen de verdad es tantear el CDN. Y `curl -I` no
 * correlaciona código con URL sin `-w`, que se rompe al pasar por PowerShell.
 *
 * QUÉ HACE
 * --------
 *  1. Genera las URLs de percusión `128<nota>_<kit>_<Fuente>_sf2_file.js` para
 *     el producto cartesiano notas × kits × fuentes, más las URLs melódicas
 *     `NNNN_Fuente_sf2_file.js` que se le pidan por archivo de lista.
 *  2. Hace HEAD con concurrencia acotada, con timeout y reintentos.
 *  3. Escribe un TSV `status<TAB>url` ordenado por URL.
 *
 * USO
 * ---
 *   node scripts/probe-waf-urls.mjs --mode=drums --out=.logs/waf-probe/drums.tsv
 *   node scripts/probe-waf-urls.mjs --mode=list --list=.logs/waf-probe/melodic.txt
 *
 * Siempre por `scripts/run-bounded.ps1`: son cientos de pedidos de red.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = "https://surikov.github.io/webaudiofontdata/sound";

const NOTES = [
  31, 32, 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  70, 73, 74, 82, 24, 29, 1,
];
const KITS = [0, 8, 16, 20, 21, 22, 27, 30];
const SOURCES = ["Chaos_sf2_file", "FluidR3_GM_sf2_file", "JCLive_sf2_file", "SBLive_sf2"];

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const mode = arg("mode", "drums");
const out = arg("out", ".logs/waf-probe/probe.tsv");
const CONCURRENCY = Number(arg("concurrency", "16"));
const TIMEOUT_MS = Number(arg("timeout", "20000"));

/**
 * PRNG con semilla (mulberry32): el muestreo al azar tiene que ser
 * reproducible, si no la verificación no se puede repetir.
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestreo aleatorio sin repetición y estratificado por grupo. */
function sampleStratified(items, count, groupOf, mustIncludeIds, seed) {
  const rng = makeRng(seed);
  // `mustIncludeIds` viene en ids y `items` son objetos: se resuelve acá para
  // que el Set contenga el MISMO tipo que el resto.
  const picks = new Set(items.filter((it) => mustIncludeIds.includes(it.id)));
  const byGroup = new Map();
  for (const item of items) {
    const g = groupOf(item);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(item);
  }
  for (const g of byGroup.keys()) {
    const pool = byGroup.get(g).filter((x) => !picks.has(x));
    if (pool.length) picks.add(pool[Math.floor(rng() * pool.length)]);
  }
  const rest = items.filter((x) => !picks.has(x));
  while (picks.size < count && rest.length) {
    picks.add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  return [...picks].slice(0, Math.max(count, mustIncludeIds.length));
}

/**
 * OJO con el sufijo: una "fuente" de WebAudioFont ya viene con `_sf2_file`
 * pegado (`FluidR3_GM_sf2_file`), así que la URL final NO lleva `_sf2_file`
 * añadido. El id del manifiesto es `<código>_<fuente>`, p. ej.
 * `12836_0_FluidR3_GM_sf2_file`, y la URL es ese id + `.js`.
 */
const toUrl = (id) =>
  id.startsWith("http")
    ? id
    : `${BASE}/${/_sf2(_file)?$/i.test(id) ? id : `${id}_sf2_file`}.js`;

/** @type {string[]} */
let urls = [];
if (mode === "drums") {
  for (const note of NOTES)
    for (const kit of KITS)
      for (const source of SOURCES)
        urls.push(`${BASE}/128${note}_${kit}_${source}.js`);
} else if (mode === "sample" || mode === "manifest") {
  // Se IMPORTA el manifiesto generado en vez de parsearlo con regex: así se
  // verifica exactamente lo que la app va a pedir. Node ≥ 22 borra los tipos
  // de un `.ts` sin tipos propios, y este archivo sólo tiene `type`/`interface`.
  const manifestPath = arg("manifest", "app/src/engine/wafManifest.ts");
  const { WAF_VARIANTS, WAF_DRUMS } = await import(
    pathToFileURL(resolve(manifestPath)).href
  );

  const flat = [];
  for (const [prog, ids] of Object.entries(WAF_VARIANTS))
    ids.forEach((id, i) => flat.push({ id, kind: "prog", group: `prog${prog}`, first: i === 0 }));
  for (const d of WAF_DRUMS)
    d.variants.forEach((id, i) =>
      flat.push({ id, kind: "drum", group: `note${d.note}`, first: i === 0, note: d.note }),
    );

  if (!flat.some((f) => f.id)) throw new Error("el manifiesto no tiene variantes");
  const mustNotes = arg("must-notes", "36,42,70,62,60")
    .split(",")
    .map((s) => Number(s.trim()));

  const mustInclude = [];
  // Las notas de percusión críticas tienen que estar sí o sí, con su PRIMERA
  // variante (la que la app elige por prioridad) — incluso en modo `manifest`,
  // donde el resto es todo el manifiesto.
  for (const n of mustNotes) {
    const hit = flat.find((f) => f.kind === "drum" && f.note === n && f.first);
    if (hit) mustInclude.push(hit.id);
    else console.warn(`aviso: nota ${n} sin variantes en el manifiesto`);
  }

  // `manifest` prueba TODO; `sample`, una muestra estratificada reproducible.
  const picked =
    mode === "manifest"
      ? flat
      : sampleStratified(flat, Number(arg("count", "30")), (f) => f.group, mustInclude, 20261012);
  urls = picked.map((p) => toUrl(p.id));
} else {
  const list = readFileSync(arg("list", ""), "utf8");
  urls = list
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(toUrl);
}

async function headOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    return { status: res.status, cors: res.headers.get("access-control-allow-origin") };
  } catch (err) {
    return { status: 0, cors: null, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function head(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await headOnce(url);
    if (r.status !== 0) return r;
    await new Promise((res) => setTimeout(res, 400 * attempt));
  }
  return { status: 0, cors: null, error: "sin respuesta tras 3 intentos" };
}

const results = new Array(urls.length);
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= urls.length) return;
    results[i] = { url: urls[i], ...(await head(urls[i])) };
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

const lines = results
  .slice()
  .sort((a, b) => a.url.localeCompare(b.url))
  .map((r) => `${r.status}\t${r.cors ?? "-"}\t${r.url}`);
writeFileSync(out, lines.join("\n") + "\n", "utf8");

const tally = new Map();
for (const r of results) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
console.log(`mode        : ${mode}`);
console.log(`urls        : ${urls.length}`);
console.log(`segundos    : ${elapsed}`);
console.log(`codigos     : ${[...tally].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}=${n}`).join(" ")}`);
console.log(`escrito     : ${out}`);
