/**
 * verify-waf-manifest.mjs — re-verifica TODO `app/src/engine/wafManifest.ts`
 * contra el CDN real, con HEAD, y escribe un informe.
 *
 * POR QUÉ EXISTE
 * --------------
 * El generador arma el manifiesto con datos del índice (melódicos) y de un
 * tanteo previo (percusión). Eso deja dos huecos que sólo se cierran revisando
 * el archivo final: un error de armado de URL (p. ej. doblar `_sf2_file`) y una
 * variante que existía en el índice pero ya no está publicada. Además, las
 * notas que declaramos SIN cobertura hay que re-confirmarlas: un 404 suelto
 * puede ser un fallo de red, no una ausencia real.
 *
 * QUÉ HACE
 * --------
 *  1. Importa el manifiesto (Node ≥ 22 borra los tipos de un `.ts` sin tipos
 *     propios) — verifica lo que la app va a pedir, no una copia paralela.
 *  2. HEAD de cada variante, con concurrencia acotada, timeout y reintentos.
 *  3. Reintenta aparte las notas declaradas sin cobertura, por si el 404 fue
 *     transitorio.
 *  4. Escribe un TSV con `status<TAB>cors<TAB>url` y un resumen con el reparto
 *     de códigos, la cobertura por fuente y la lista de fallos.
 *
 * USO
 * ---
 *   node scripts/verify-waf-manifest.mjs --out=.logs/waf-probe/verify-all.tsv
 *
 * Siempre por `scripts/run-bounded.ps1`: son ~1500 pedidos de red.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = "https://surikov.github.io/webaudiofontdata/sound";

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const manifestPath = arg("manifest", "app/src/engine/wafManifest.ts");
const out = arg("out", ".logs/waf-probe/verify-all.tsv");
const report = arg("report", ".logs/waf-probe/verify-all.txt");
const CONCURRENCY = Number(arg("concurrency", "20"));
const TIMEOUT_MS = Number(arg("timeout", "20000"));

const { WAF_VARIANTS, WAF_DRUMS, WAF_NEEDED_PROGRAMS } = await import(
  pathToFileURL(resolve(manifestPath)).href
);

/**
 * La URL de un id: la fuente ya trae su sufijo (`FluidR3_GM_sf2_file`,
 * `SBLive_sf2`, `LK_Godin_Nylon_SF2_file`), así que sólo se añade `_sf2_file`
 * cuando NO lo trae (los melódicos `NNNN_GeneralUserGS`). Doblarlo da 404.
 *
 * El test va con `/i` A PROPÓSITO: hay dos fuentes con el sufijo en mayúsculas
 * (`LK_*_SF2_file`). Con un test sensible a mayúsculas se les añadía `_sf2_file`
 * y las dos daban 404 — que es exactamente el bug que este script detectó.
 */
const SUFFIXED = /_sf2(_file)?$/i;
const toUrl = (id) =>
  id.startsWith("http") ? id : `${BASE}/${SUFFIXED.test(id) ? id : `${id}_sf2_file`}.js`;

const jobs = [];
for (const [prog, ids] of Object.entries(WAF_VARIANTS))
  ids.forEach((id, i) =>
    jobs.push({ id, url: toUrl(id), kind: "prog", prog: Number(prog), first: i === 0 }),
  );
for (const d of WAF_DRUMS)
  d.variants.forEach((id, i) =>
    jobs.push({ id, url: toUrl(id), kind: "drum", note: d.note, first: i === 0 }),
  );

const coverageMissingNotes = WAF_DRUMS.filter((d) => d.variants.length === 0).map((d) => d.note);

async function headOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    return {
      status: res.status,
      cors: res.headers.get("access-control-allow-origin"),
      bytes: Number(res.headers.get("content-length") ?? 0),
    };
  } catch (err) {
    return { status: 0, cors: null, bytes: 0, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function head(url, attempts = 3) {
  for (let a = 1; a <= attempts; a++) {
    const r = await headOnce(url);
    if (r.status !== 0) return r;
    if (a < attempts) await new Promise((res) => setTimeout(res, 500 * a));
  }
  return { status: 0, cors: null, bytes: 0, error: "sin respuesta" };
}

async function runAll(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        items[i] = { ...items[i], ...(await worker(items[i])) };
      }
    }),
  );
}

const started = Date.now();
await runAll(jobs, (j) => head(j.url));
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

// Reintento aparte de las notas declaradas sin cobertura: más intentos y más
// lentos, para poder afirmar "no existe" y no "no me contestó".
const missingProbe = [];
for (const note of coverageMissingNotes)
  for (const kit of [0, 8, 16, 20, 21, 22, 27, 30])
    for (const source of ["Chaos_sf2_file", "FluidR3_GM_sf2_file", "JCLive_sf2_file", "SBLive_sf2"])
      missingProbe.push({
        note,
        kit,
        source,
        url: `${BASE}/128${note}_${kit}_${source}.js`,
      });
await runAll(missingProbe, (m) => head(m.url, 3));

// ── informe ──────────────────────────────────────────────────────────────────

const tally = new Map();
for (const j of jobs) tally.set(j.status, (tally.get(j.status) ?? 0) + 1);

const failures = jobs.filter((j) => j.status !== 200);
const corsMissing = jobs.filter((j) => j.status === 200 && j.cors !== "*");

const bySource = new Map();
for (const j of jobs) {
  if (j.status !== 200) continue;
  const src = j.kind === "drum" ? j.id.slice(j.id.indexOf("_", 4) + 1) : j.id.slice(j.id.indexOf("_") + 1);
  bySource.set(src, (bySource.get(src) ?? 0) + 1);
}

const stillMissing = new Map();
for (const m of missingProbe) {
  if (m.status === 200) stillMissing.set(m.note, (stillMissing.get(m.note) ?? 0) + 1);
}

const programCovered = Object.keys(WAF_VARIANTS).filter(
  (p) => (WAF_VARIANTS[p] ?? []).length > 0,
).length;
const drumCovered = WAF_DRUMS.filter((d) => d.variants.length > 0).length;

const lines = [];
lines.push("== VERIFICACION REAL DEL MANIFIESTO WebAudioFont ==");
lines.push(`manifiesto : ${resolve(manifestPath)}`);
lines.push(`urls       : ${jobs.length} (${jobs.length - jobs.filter((j) => j.kind === "drum").length} melódicas, ${jobs.filter((j) => j.kind === "drum").length} de percusión)`);
lines.push(`segundos   : ${elapsed}`);
lines.push(`codigos    : ${[...tally].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}=${n}`).join(" ")}`);
lines.push(`CORS != *  : ${corsMissing.length}`);
lines.push("");
lines.push(`programas cubiertos : ${programCovered}/${Object.keys(WAF_NEEDED_PROGRAMS).length}`);
lines.push(`notas cubiertas     : ${drumCovered}/${WAF_DRUMS.length}`);
lines.push(`SIN cobertura       : ${coverageMissingNotes.length ? coverageMissingNotes.join(", ") : "(ninguna)"}`);
lines.push("");
lines.push("-- cobertura por fuente --");
for (const [src, n] of [...bySource].sort((a, b) => b[1] - a[1]))
  lines.push(`  ${String(n).padStart(4)}  ${src}`);
lines.push("");
lines.push("-- notas declaradas SIN cobertura: re-tanteo de 32 combinaciones c/u --");
if (!coverageMissingNotes.length) lines.push("  (ninguna)");
for (const note of coverageMissingNotes) {
  const alive = stillMissing.get(note) ?? 0;
  lines.push(
    `  nota ${String(note).padStart(3)} : ${alive === 0 ? "confirmado 0 de 32 combinaciones existen" : `${alive} de 32 SÍ existen — MANIFIESTO INCOMPLETO`}`,
  );
}
lines.push("");
lines.push("-- fallos (status != 200) --");
if (!failures.length) lines.push("  (ninguno)");
for (const f of failures) lines.push(`  ${f.status}  ${f.url}`);

writeFileSync(out, jobs.map((j) => `${j.status}\t${j.cors ?? "-"}\t${j.url}`).join("\n") + "\n", "utf8");
writeFileSync(report, lines.join("\n") + "\n", "utf8");

console.log(lines.join("\n"));
console.log("");
console.log(`tsv    : ${out}`);
console.log(`informe: ${report}`);

if (failures.length || corsMissing.length || stillMissing.size) process.exitCode = 1;
