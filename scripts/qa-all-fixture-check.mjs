// ============================================================
// qa-all-fixture-check — valida el .mid del fixture contra el MISMO parser que
// usa la app (@tonejs/midi), para no medir el arranque con un archivo que el
// parser interpreta mal.
//
// Uso: node scripts/qa-all-fixture-check.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("file://" + process.cwd() + "/app/");
const { Midi } = require("@tonejs/midi");

const RUTA = "app/public/demo/QA_Arranque_0s.mid";
const bytes = readFileSync(RUTA);
const midi = new Midi(bytes);

console.log(`### ${RUTA} — ${bytes.length} bytes`);
console.log(`  ppq: ${midi.header.ppq} · bpm: ${midi.header.tempos[0]?.bpm} · duración: ${midi.duration.toFixed(2)} s`);

let totalNotas = 0;
midi.tracks.forEach((t, i) => {
  const primera = t.notes.length ? Math.min(...t.notes.map((n) => n.time)) : null;
  console.log(
    `  pista ${i}: "${t.name || "(sin nombre)"}" · canal ${t.channel} · ${t.notes.length} notas · ` +
      `primera en ${primera === null ? "-" : primera.toFixed(3)} s · instrumento ${t.instrument?.name ?? "?"}` +
      `${t.instrument?.percussion ? " (PERCUSIÓN)" : ""}`,
  );
  totalNotas += t.notes.length;
});

const todos = midi.tracks.flatMap((t) => t.notes);
const primeraGlobal = Math.min(...todos.map((n) => n.time));
const melódicas = midi.tracks.filter((t) => !t.instrument?.percussion && t.channel !== 9).flatMap((t) => t.notes);
const primeraMelodica = melódicas.length ? Math.min(...melódicas.map((n) => n.time)) : null;
const percusion = midi.tracks.filter((t) => t.instrument?.percussion || t.channel === 9).flatMap((t) => t.notes);

console.log(`\n  notas totales: ${totalNotas}`);
console.log(`  primera nota global: ${primeraGlobal.toFixed(3)} s`);
console.log(`  primera nota melódica: ${primeraMelodica === null ? "-" : primeraMelodica.toFixed(3)} s`);
console.log(`  notas de percusión: ${percusion.length}${percusion.length ? ` (primera en ${Math.min(...percusion.map((n) => n.time)).toFixed(3)} s)` : ""}`);

const ok = totalNotas === 8 && primeraGlobal === 0 && percusion.length === 0;
console.log(`\n${ok ? "✅" : "❌"} fixture ${ok ? "válido" : "INVÁLIDO"}: 8 notas, primera en t=0, sin percusión → ${ok}`);
process.exit(ok ? 0 : 1);
