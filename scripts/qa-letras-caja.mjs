// ============================================================
// qa-letras-caja — antes/después de la capitalización, sobre archivos reales.
//
// El "antes" NO es una paráfrasis: se leen los eventos meta de letra del `.kar`
// tal como están en el archivo, se arman las líneas con los mismos marcadores de
// fin de línea que usa el extractor (`\`, `/`) y se muestra ese texto crudo. El
// "después" es lo que devuelve `extractLyrics`, o sea lo que ve el usuario.
//
// Sirve para dos cosas: demostrar la normalización de caja con datos reales, y
// comprobar que la normalización no toca acentos ni signos.
//
// Uso: node scripts/qa-letras-caja.mjs [archivo.kar ...]
// Salida: imprime la tabla y escribe .logs/qa/letras/capitalizacion.json
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const DIR = ".logs/qa/letras";
mkdirSync(DIR, { recursive: true });

const DEMO = "app/public/demo";
const COMPILADO = process.argv[2]?.endsWith(".js")
  ? process.argv[2]
  : join(process.env.TEMP, "lyricprobe-cjs", "utils", "midiLyrics.js");
if (!existsSync(COMPILADO)) {
  console.error(
    `Falta el módulo compilado en ${COMPILADO}. Compilalo con:\n` +
      `  cd app && npx tsc src/utils/midiLyrics.ts --ignoreConfig --outDir %TEMP%\\lyricprobe-cjs ` +
      `--module commonjs --target es2022 --moduleResolution node --lib es2022,dom --skipLibCheck --esModuleInterop`,
  );
  process.exit(125);
}
const require = createRequire(import.meta.url);
const { extractLyrics } = require(COMPILADO);
// `normaliseLyricCase` es LA función que hace la normalización; se prueba contra
// el texto crudo del archivo, así no hay ningún emparejamiento heurístico de por
// medio que pueda disfrazar el resultado.
const rutaLyricText = join(COMPILADO, "..", "lyricText.js");
const { normaliseLyricCase } = require(rutaLyricText);

const decoder = new TextDecoder("windows-1252");

/** Convierte ticks a segundos con el mapa de tempo (idéntico a @tonejs/midi). */
function conversor(buffer) {
  const buf = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ppq = view.getUint16(12) & 0x7fff;
  const nPistas = view.getUint16(10);
  let pos = 14;
  const tempos = [];
  const varLen = () => {
    let v = 0;
    for (let i = 0; i < 4 && pos < buf.length; i++) {
      const b = buf[pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };
  for (let p = 0; p < nPistas && pos + 8 <= buf.length; p++) {
    if (!(buf[pos] === 0x4d && buf[pos + 1] === 0x54 && buf[pos + 2] === 0x72 && buf[pos + 3] === 0x6b)) break;
    const len = view.getUint32(pos + 4);
    const fin = Math.min(pos + 8 + len, buf.length);
    pos += 8;
    let tick = 0;
    let running = 0;
    while (pos < fin) {
      tick += varLen();
      if (pos >= fin) break;
      let status = buf[pos];
      if (status & 0x80) { pos++; running = status; } else { status = running; }
      if (status === 0xff) {
        const tipo = buf[pos++];
        const n = varLen();
        const desde = pos;
        pos += n;
        if (tipo === 0x51 && n === 3) {
          tempos.push({ tick, us: (buf[desde] << 16) | (buf[desde + 1] << 8) | buf[desde + 2] });
        }
        if (tipo === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) { pos += varLen(); }
      else { const hi = status & 0xf0; pos += hi === 0xc0 || hi === 0xd0 ? 1 : 2; }
    }
    pos = fin;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  return (objetivo) => {
    let s = 0;
    let prev = tempos[0];
    for (const t of tempos) {
      if (t.tick >= objetivo) break;
      s += ((t.tick - prev.tick) / ppq) * (prev.us / 1e6);
      prev = t;
    }
    return s + ((objetivo - prev.tick) / ppq) * (prev.us / 1e6);
  };
}

/** Líneas CRUDAS del archivo, con los mismos marcadores de fin de línea. */
function lineasCrudas(buffer) {
  const buf = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const nPistas = view.getUint16(10);
  let pos = 14;
  const porPista = [];
  const varLen = () => {
    let v = 0;
    for (let i = 0; i < 4 && pos < buf.length; i++) {
      const b = buf[pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };
  for (let p = 0; p < nPistas && pos + 8 <= buf.length; p++) {
    if (!(buf[pos] === 0x4d && buf[pos + 1] === 0x54 && buf[pos + 2] === 0x72 && buf[pos + 3] === 0x6b)) break;
    const len = view.getUint32(pos + 4);
    const fin = Math.min(pos + 8 + len, buf.length);
    pos += 8;
    let running = 0;
    const eventos = [];
    while (pos < fin) {
      varLen();
      if (pos >= fin) break;
      let status = buf[pos];
      if (status & 0x80) { pos++; running = status; } else { status = running; }
      if (status === 0xff) {
        const tipo = buf[pos++];
        const n = varLen();
        const desde = pos;
        pos += n;
        if (tipo === 0x05 || tipo === 0x01) {
          eventos.push(decoder.decode(buf.subarray(desde, desde + n)));
        }
        if (tipo === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) { pos += varLen(); }
      else { const hi = status & 0xf0; pos += hi === 0xc0 || hi === 0xd0 ? 1 : 2; }
    }
    pos = fin;
    porPista.push(eventos);
  }
  const mejor = porPista.reduce((a, b) => (b.length > a.length ? b : a), []);
  // Se arman las líneas con la MISMA convención del extractor.
  const lineas = [];
  let actual = "";
  for (const ev of mejor) {
    const txt = ev.replace(/\r\n?/g, "\n").replace(/(^|\s)\//g, "$1\n");
    const partes = txt.split(/\\|\n/);
    partes.forEach((parte, i) => {
      if (i > 0) {
        if (actual.trim()) lineas.push(actual.replace(/\s+/g, " ").trim());
        actual = "";
      }
      actual += parte;
    });
  }
  if (actual.trim()) lineas.push(actual.replace(/\s+/g, " ").trim());
  return lineas;
}

const archivos = process.argv.slice(2).filter((a) => a.endsWith(".kar"));
const lista = archivos.length
  ? archivos
  : [
      "BinomioDeOro_-_La_Creciente.kar",
      "BinomioDeOro_-_El_Osito_Dormilon.kar",
      "Salsa_-_Celia_Cruz_Quimbara.kar",
      "Bolero_-_Adoro.kar",
    ];

const salida = [];
for (const archivo of lista) {
  const bytes = readFileSync(join(DEMO, archivo));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const crudas = lineasCrudas(buffer);
  const extraidas = extractLyrics(buffer, conversor(buffer));

  // El antes/después se hace sobre el TEXTO CRUDO del archivo aplicándole la
  // función real: sin emparejar líneas, sin heurísticas. Es la transformación pura.
  const pares = crudas.map((antes) => ({ antes, despues: normaliseLyricCase(antes) }));
  const cambiados = pares.filter((p) => p.antes !== p.despues);
  salida.push({
    archivo,
    lineasCrudas: crudas.length,
    lineasExtraidas: extraidas.length,
    pares: pares.length,
    cambiados,
    // Muestra de lo que termina viendo el usuario (ya pasó por todo el pipeline).
    extraidasMuestra: extraidas.slice(0, 6).map((l) => l.text),
  });
}

console.log("CAPITALIZACIÓN — antes (crudo del .kar) → después (normaliseLyricCase)\n");
for (const r of salida) {
  console.log(
    `=== ${r.archivo}  (${r.lineasCrudas} líneas crudas, ${r.cambiados.length} con la caja cambiada)`,
  );
  r.cambiados.slice(0, 5).forEach((p) => {
    console.log(`     antes:   ${JSON.stringify(p.antes)}`);
    console.log(`     después: ${JSON.stringify(p.despues)}`);
  });
  if (r.cambiados.length === 0) console.log("   (ninguna línea venía gritada o sin arranque en mayúscula)");
  console.log(`   primeras líneas que ve el usuario: ${JSON.stringify(r.extraidasMuestra.slice(0, 4))}`);
  console.log("");
}

// Comprobación de que no se rompió nada más: sin acentos perdidos ni signos comidos.
const todos = salida.flatMap((r) => r.cambiados);
const problemas = [];
for (const p of todos) {
  const soloLetras = (s) => s.replace(/[^\p{L}]/gu, "");
  if (soloLetras(p.antes).toLocaleLowerCase("es-ES") !== soloLetras(p.despues).toLocaleLowerCase("es-ES")) {
    problemas.push(`letras distintas: ${JSON.stringify(p)}`);
  }
  const signos = (s) => (s.match(/[^\p{L}\p{N}\s]/gu) ?? []).join("");
  if (signos(p.antes) !== signos(p.despues)) {
    problemas.push(`signos distintos: ${JSON.stringify(p)}`);
  }
}
console.log(
  `### comprobación: ${todos.length} líneas comparadas · ${problemas.length} con letras o signos alterados`,
);
problemas.slice(0, 6).forEach((p) => console.log("   " + p));

writeFileSync(join(DIR, "capitalizacion.json"), JSON.stringify({ salida, problemas }, null, 2));
console.log(`→ ${DIR}/capitalizacion.json`);
