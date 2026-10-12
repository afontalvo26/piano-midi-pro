// Verifica las URLs de percusión de VSCO que vamos a sumar y parchea el mapa.
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/";
const VSCO1 = "VSCO%201%20Percussion/";

/** Nota GM → URLs de VSCO que van PRIMERO (mejores que lo que hay hoy). */
const ADDITIONS = {
  // Güiro: 4 raspados distintos (la guacharaca vallenata se aproxima con esto).
  73: [
    `${BASE}Percussion/Guiro-Fast_v1_Sum.wav`,
    `${BASE}Percussion/Guiro-M_v1_Sum.wav`,
    `${BASE}Percussion/Guiro-Hit_v1_rr1_Sum.wav`,
  ],
  74: [
    `${BASE}Percussion/Guiro-Slow_v1_Sum.wav`,
    `${BASE}Percussion/Guiro-M_v1_Sum.wav`,
    `${BASE}Percussion/Guiro-Fast_v1_Sum.wav`,
  ],
  // Claves: 3 capas de velocidad × 2 round-robin + las 4 dinámicas de VSCO 1.
  75: [
    ...["v1_rr1", "v1_rr2", "v2_rr1", "v2_rr2", "v3_rr1", "v3_rr2"].map(
      (v) => `${BASE}Percussion/Claves1_Hit_${v}_Sum.wav`,
    ),
    `${BASE}${VSCO1}varWood/claves_mf.wav`,
    `${BASE}${VSCO1}varWood/claves_ff.wav`,
  ],
  76: [
    `${BASE}Percussion/Claves1_Hit_v3_rr1_Sum.wav`,
    `${BASE}${VSCO1}varWood/claves_ff.wav`,
  ],
  77: [
    `${BASE}Percussion/Claves1_Hit_v1_rr1_Sum.wav`,
    `${BASE}${VSCO1}varWood/claves_pp1.wav`,
  ],
  // 37/38 side stick y redoblante: un parche real con baqueta.
  37: [
    `${BASE}${VSCO1}drums/snare/OldSnare/snare_mf.wav`,
    `${BASE}${VSCO1}varWood/claves_mp.wav`,
  ],
  38: [`${BASE}${VSCO1}drums/snare/OldSnare/snare_ff.wav`],
  // Cabasa: 6 variantes reales (antes iba al kit GM).
  69: [1, 2, 3, 4, 5, 6].map(
    (n) => `${BASE}${VSCO1}varMetal/various/cabasa_${n}.wav`,
  ),
};

const results = [];
for (const [note, urls] of Object.entries(ADDITIONS)) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      results.push({
        note: Number(note),
        url,
        status: res.status,
        cors: res.headers.get("access-control-allow-origin"),
      });
    } catch (e) {
      results.push({ note: Number(note), url, error: String(e).slice(0, 60) });
    }
  }
}

const bad = results.filter((r) => r.status !== 200);
console.log(`verificadas ${results.length} URLs: ${results.length - bad.length} OK, ${bad.length} con problema`);
bad.forEach((b) => console.log(`  ⚠️ ${b.status ?? b.error} ${b.url}`));
const corsOk = results.filter((r) => r.cors === "*").length;
console.log(`con CORS '*': ${corsOk}/${results.length}`);

if (bad.length > 0) {
  console.log("\nNo se parchea nada hasta que todas respondan 200.");
  process.exit(1);
}

// Parchear el mapa generado: las URLs de VSCO van AL FRENTE de cada nota.
const file = "app/src/engine/percussionSamples.ts";
let source = readFileSync(file, "utf8");
for (const [note, urls] of Object.entries(ADDITIONS)) {
  const re = new RegExp(`(\\n  "${note}": \\[)`);
  if (!re.test(source)) {
    console.log(`  (nota ${note} no está en el mapa: se agrega)`);
    source = source.replace(/\n};/, `,\n  "${note}": ${JSON.stringify(urls, null, 2).replace(/\n/g, "\n  ")}\n};`);
    continue;
  }
  const insertion = urls.map((u) => `\n    ${JSON.stringify(u)},`).join("");
  source = source.replace(re, `$1${insertion}`);
}
writeFileSync(file, source);
console.log(`\n✔ ${file} actualizado (VSCO al frente de las notas ${Object.keys(ADDITIONS).join(", ")})`);
