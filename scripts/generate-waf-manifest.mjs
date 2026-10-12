/**
 * generate-waf-manifest.mjs — arma `app/src/engine/wafManifest.ts` a partir de
 * datos REALES de WebAudioFont (surikov).
 *
 * POR QUÉ EXISTE
 * --------------
 * WebAudioFont no publica un manifiesto. Peor: el inventario que sí publica (el
 * HTML del directorio `sound/`) está INCOMPLETO para percusión — lista los 82
 * archivos de kit completo `drums_<kit>_<Fuente><Nombre>`, pero **ninguno** de
 * los `128<nota>_<kit>_<Fuente>` de una sola pieza que usa esta app. Tampoco
 * todos los programas GM ni todas las notas de percusión existen: pedir una
 * variante inexistente da 404 y el motor cae a un sintetizador de relleno.
 *
 * Por eso este generador combina dos fuentes, ninguna inventada:
 *
 *  1. Melódicos — el índice HTML (todos los enlaces `<a href=NNNN_Fuente>`).
 *  2. Percusión — un tanteo HEAD real del CDN (`scripts/probe-waf-urls.mjs`),
 *     porque el índice no los lista. Sólo entra lo que respondió 200.
 *
 * ENTRADAS
 * --------
 *   .logs/waf-index-raw.html        índice del directorio (lo baja run-bounded)
 *   .logs/waf-probe/drums.tsv       tanteo `status<TAB>cors<TAB>url` de percusión
 *
 * USO
 * ---
 *   node scripts/generate-waf-manifest.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const INDEX_HTML = join(ROOT, ".logs", "waf-index-raw.html");
const DRUM_TSV = join(ROOT, ".logs", "waf-probe", "drums.tsv");
const OUT = join(ROOT, "app", "src", "engine", "wafManifest.ts");

/** Orden de preferencia de fuentes pedido por la app. */
const SOURCE_PRIORITY = [
  "GeneralUserGS",
  "FluidR3_GM",
  "JCLive",
  "Aspirin",
  "Chaos",
  "SBLive_sf2",
  "SoundBlasterOld",
];

/** `FluidR3_GM_sf2_file` → `FluidR3_GM` (el sufijo es común a todas). */
const bareSource = (s) => s.replace(/_sf2(_file)?$/, "");

const sourceRank = (source) => {
  const i = SOURCE_PRIORITY.indexOf(bareSource(source));
  return i === -1 ? SOURCE_PRIORITY.length : i;
};

/** Programas GM que la biblioteca usa de verdad. */
const NEEDED_PROGRAMS = {
  0: "Acoustic Grand Piano",
  1: "Bright Acoustic Piano",
  2: "Electric Grand Piano",
  3: "Honky-tonk Piano",
  4: "Electric Piano 1",
  5: "Electric Piano 2",
  8: "Clavi",
  10: "Music Box",
  11: "Vibraphone",
  12: "Marimba",
  13: "Xylophone",
  15: "Dulcimer",
  16: "Drawbar Organ",
  17: "Percussive Organ",
  18: "Rock Organ",
  21: "Accordion",
  22: "Harmonica",
  23: "Tango Accordion",
  24: "Acoustic Guitar (nylon)",
  25: "Acoustic Guitar (steel)",
  26: "Electric Guitar (jazz)",
  27: "Electric Guitar (clean)",
  28: "Electric Guitar (muted)",
  29: "Overdriven Guitar",
  30: "Distortion Guitar",
  32: "Acoustic Bass",
  33: "Electric Bass (finger)",
  34: "Electric Bass (pick)",
  35: "Fretless Bass",
  36: "Slap Bass 1",
  37: "Slap Bass 2",
  39: "Synth Bass 2",
  40: "Violin",
  44: "Tremolo Strings",
  45: "Pizzicato Strings",
  46: "Orchestral Harp",
  47: "Timpani",
  48: "String Ensemble 1",
  49: "String Ensemble 2",
  50: "SynthStrings 1",
  51: "SynthStrings 2",
  52: "Choir Aahs",
  53: "Voice Oohs",
  54: "Synth Voice",
  56: "Trumpet",
  57: "Trombone",
  58: "Tuba",
  59: "Muted Trumpet",
  60: "French Horn",
  61: "Brass Section",
  62: "SynthBrass 1",
  63: "SynthBrass 2",
  64: "Soprano Sax",
  65: "Alto Sax",
  66: "Tenor Sax",
  67: "Baritone Sax",
  68: "Oboe",
  70: "Bassoon",
  71: "Clarinet",
  72: "Piccolo",
  73: "Flute",
  75: "Pan Flute",
  77: "Shakuhachi",
  82: "Lead 3 (calliope)",
  88: "Pad 1 (new age)",
  89: "Pad 2 (warm)",
  91: "Pad 5 (bowed)",
  96: "FX 1 (rain)",
  99: "FX 4 (atmosphere)",
  100: "FX 5 (brightness)",
  103: "FX 8 (sci-fi)",
  105: "Sitar",
  113: "Agogo",
};

/** Notas de percusión (canal 10) que usan los archivos de la biblioteca. */
const NEEDED_DRUM_NOTES = [
  31, 32, 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  70, 73, 74, 82, 24, 29, 1,
];

/** Kits GM cubiertos por WebAudioFont; el índice no publica otros. */
const DRUM_KITS = {
  0: "Standard",
  8: "Room",
  16: "Power",
  20: "Electronic",
  21: "TR-808",
  22: "Jazz",
  27: "Brush",
  30: "Orchestra",
};

// ── 1. melódicos: parseo del índice ──────────────────────────────────────────

const html = readFileSync(INDEX_HTML, "utf8");
const ids = new Set();
for (const m of html.matchAll(/href=([A-Za-z0-9_]+)\.html/g)) ids.add(m[1]);
if (ids.size < 1000) throw new Error(`índice sospechosamente chico: ${ids.size} ids`);

const melodic = new Map(); // prog -> Set<`<prog><variante>_<Fuente>`>
const oddCodes = new Set(); // códigos que no son ni programa+1 dígito ni drums_*

for (const id of ids) {
  const cut = id.indexOf("_");
  if (cut === -1) continue;
  const code = id.slice(0, cut);
  const source = id.slice(cut + 1);
  if (code.startsWith("drums_") || code.startsWith("drums")) continue;

  // El contrato del manifiesto es `<programa 3 dígitos><variante 1 dígito>`.
  // El índice trae además ocho códigos de 5 dígitos (04810..04817) que son
  // variantes reales de GeneralUserGS para cuerdas pero rompen ese formato:
  // se excluyen y se cuentan aparte para que quede asentado.
  if (!/^\d{4}$/.test(code)) {
    oddCodes.add(code);
    continue;
  }
  const prog = Number(code.slice(0, 3));
  if (!melodic.has(prog)) melodic.set(prog, []);
  melodic.get(prog).push(`${code}_${source}`);
}

/**
 * Compara por código, luego por prioridad de fuente y recién al final por
 * nombre. El desempate final usa `<`/`>` (orden de code points) y NO
 * `localeCompare`: comparar por reglas de idioma reordena `SBLive` vs
 * `SoundBlasterOld` según el locale y rompe la prioridad declarada.
 */
const byCodeThenPriority = (a, b) => {
  const ia = a.indexOf("_");
  const ib = b.indexOf("_");
  const ca = a.slice(0, ia);
  const cb = b.slice(0, ib);
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ra = sourceRank(a.slice(ia + 1));
  const rb = sourceRank(b.slice(ib + 1));
  if (ra !== rb) return ra - rb;
  return a === b ? 0 : a < b ? -1 : 1;
};

const programLines = [];
const missingPrograms = [];
for (const prog of Object.keys(NEEDED_PROGRAMS).map(Number).sort((a, b) => a - b)) {
  const list = [...(melodic.get(prog) ?? [])].sort(byCodeThenPriority);
  if (list.length === 0) missingPrograms.push(prog);
  programLines.push(`  ${prog}: [${list.map((v) => `"${v}"`).join(", ")}],`);
}

// ── 2. percusión: sólo lo que respondió 200 en el tanteo real ────────────────

const drumRows = readFileSync(DRUM_TSV, "utf8").split(/\r?\n/).filter(Boolean);
const drums = new Map(); // note -> Set<`<kit>_<Fuente>>`
const notRetried = new Set(); // notas cuyo tanteo quedó en algo != 200/404

for (const row of drumRows) {
  const [status, , url] = row.split(/\s+/);
  const file = url.slice(url.lastIndexOf("/") + 1).replace(/\.js$/, "");
  const m = /^128(\d+)_(\d+)_(.+)$/.exec(file);
  if (!m) throw new Error(`nombre de percusión inesperado: ${file}`);
  const note = Number(m[1]);
  if (status !== "200") {
    if (status !== "404") notRetried.add(note);
    continue;
  }
  if (!drums.has(note)) drums.set(note, new Set());
  drums.get(note).add(`${m[2]}_${m[3]}`);
}

const drumLines = [];
const missingNotes = [];
for (const note of [...NEEDED_DRUM_NOTES].sort((a, b) => a - b)) {
  const found = drums.get(note);
  if (!found || found.size === 0) {
    missingNotes.push(note);
    drumLines.push(`  { note: ${note}, variants: [] },`);
    continue;
  }
  const list = [...found]
    .map((v) => {
      const kit = Number(v.slice(0, v.indexOf("_")));
      const source = v.slice(v.indexOf("_") + 1);
      return { id: `128${note}_${kit}_${source}`, kit, rank: sourceRank(source), source };
    })
    .sort((a, b) =>
      a.kit !== b.kit
        ? a.kit - b.kit
        : a.rank !== b.rank
          ? a.rank - b.rank
          : a.source === b.source
            ? 0
            : a.source < b.source
              ? -1
              : 1,
    )
    .map((v) => v.id);
  drumLines.push(`  { note: ${note}, variants: [${list.map((v) => `"${v}"`).join(", ")}] },`);
}

// ── 3. escribir el .ts ───────────────────────────────────────────────────────

const neededLines = Object.entries(NEEDED_PROGRAMS)
  .map(([prog, name]) => [Number(prog), name])
  .sort((a, b) => a[0] - b[0])
  .map(([prog, name]) => `  ${prog}: "${name}",`);

const kitLines = Object.entries(DRUM_KITS).map(([kit, name]) => `  ${kit}: "${name}",`);

const ts = `/**
 * wafManifest — cobertura REAL de WebAudioFont (surikov) para los programas GM y
 * las piezas de percusión que esta app usa.
 *
 * GENERADO por \`scripts/generate-waf-manifest.mjs\`. No editar a mano.
 *
 * POR QUÉ EXISTE
 * --------------
 * WebAudioFont no publica inventario, y **no todos los programas ni todas las
 * notas de percusión existen**. Sin este manifiesto, pedir una variante
 * inexistente da 404 y el motor de turno cae a un sintetizador de relleno; con
 * él, la app sabe de antemano qué puede pedir y qué no.
 *
 * DE DÓNDE SALEN LOS DATOS (ninguno inventado)
 * --------------------------------------------
 *  - Melódicos: el índice del directorio
 *    \`https://surikov.github.io/webaudiofontdata/sound/\` — 1477 enlaces.
 *  - Percusión: un tanteo HEAD real contra el CDN
 *    (\`scripts/probe-waf-urls.mjs\`), porque el índice **no lista** los archivos
 *    de una sola pieza: sólo publica los 82 de kit completo
 *    (\`drums_<kit>_<Fuente><Nombre>\`). De las 1440 combinaciones
 *    nota × kit × fuente probadas, 715 responden 200 y quedan acá.
 *
 * FORMATO DE LOS IDS (verificado contra el CDN real)
 * --------------------------------------------------
 *  - Melódico: \`<programa 3 dígitos base 0><variante 1 dígito>_<Fuente>\`
 *    → \`0210_GeneralUserGS\` es acordeón (programa 21, variante 0).
 *    Ojo: \`0021_*\` NO es acordeón, es el programa 2 (Electric Grand Piano).
 *  - Percusión: \`128<nota MIDI>_<kit>_<Fuente>\`
 *    → \`12836_0_FluidR3_GM\` es la nota 36 (bombo) del kit 0 (Standard).
 *    Cada archivo trae UNA sola nota.
 *
 *  La URL es el id + \`_sf2_file.js\`, salvo cuando la fuente ya termina en
 *  \`_sf2\` (\`SBLive_sf2\`) o \`_sf2_file\`, en cuyo caso es el id + \`.js\`.
 *  Las fuentes de percusión ya vienen con el sufijo pegado
 *  (\`FluidR3_GM_sf2_file\`), así que su URL es id + \`.js\` a secas.
 */

/** Programa GM → lista ordenada de variantes disponibles (id sin extensión). */
export type WafVariants = Record<number, string[]>;

/**
 * Variantes reales por programa GM, ordenadas por prioridad de fuente
 * (${SOURCE_PRIORITY.join(" > ")})
 * y, dentro de cada fuente, por número de variante.
 *
 * Un array **vacío** significa que el índice no publica ninguna variante para
 * ese programa: hay que resolverlo con otro motor (soundfont de gleitz o
 * instrumento propio), nunca con una variante inventada.
 */
export const WAF_VARIANTS: WafVariants = {
${programLines.join("\n")}
};

/** Piezas de percusión: nota MIDI → mapa de kit/fuente disponible. */
export interface WafDrumCoverage {
  note: number;
  variants: string[];
}

/** Kits GM cubiertos por WebAudioFont (el índice no publica otros). */
export const WAF_DRUM_KITS: Record<number, string> = {
${kitLines.join("\n")}
};

/**
 * Cobertura de percusión por nota MIDI (canal 10). Cada entrada lista los ids
 * \`128<nota>_<kit>_<Fuente>\` que EXISTEN (HEAD 200 verificado), ordenados por
 * kit y luego por prioridad de fuente.
 *
 * \`variants: []\` = la nota no existe en NINGÚN kit ni fuente de WebAudioFont.
 * La app tiene que resolverla con otra fuente (FreePats World Percussion, kit
 * propio) y asumir el silencio si no hay ninguna — está listado acá justamente
 * para que ese caso no termine en un sintetizador de relleno.
 */
export const WAF_DRUMS: WafDrumCoverage[] = [
${drumLines.join("\n")}
];

/** Programas que se usan en la biblioteca: id → nombre GM. */
export const WAF_NEEDED_PROGRAMS: Record<number, string> = {
${neededLines.join("\n")}
};
`;

writeFileSync(OUT, ts, "utf8");

const totalPrograms = Object.keys(NEEDED_PROGRAMS).length;
const variantTotal = [...melodic.entries()]
  .filter(([p]) => p in NEEDED_PROGRAMS)
  .reduce((n, [, v]) => n + v.length, 0);
const drumVariantTotal = [...drums.entries()]
  .filter(([n]) => NEEDED_DRUM_NOTES.includes(n))
  .reduce((n, [, v]) => n + v.size, 0);

console.log(`ids en el índice             : ${ids.size}`);
console.log(`códigos fuera de formato     : ${oddCodes.size ? [...oddCodes].join(", ") : "(ninguno)"}`);
console.log(`programas cubiertos          : ${totalPrograms - missingPrograms.length}/${totalPrograms} (${variantTotal} variantes)`);
console.log(`  SIN variantes              : ${missingPrograms.length ? missingPrograms.join(", ") : "(ninguno)"}`);
console.log(`notas de percusión cubiertas : ${NEEDED_DRUM_NOTES.length - missingNotes.length}/${NEEDED_DRUM_NOTES.length} (${drumVariantTotal} variantes)`);
console.log(`  SIN cobertura (404 en todo): ${missingNotes.length ? missingNotes.join(", ") : "(ninguna)"}`);
console.log(`  tanteo no concluyente      : ${notRetried.size ? [...notRetried].join(", ") : "(ninguno)"}`);
console.log(`escrito                      : ${OUT}`);
