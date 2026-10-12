#!/usr/bin/env node
/**
 * gen-tonejs-manifest.mjs — genera `app/src/engine/tonejsManifest.ts`.
 *
 * POR QUÉ EXISTE
 * --------------
 * El banco nbrosowsky/tonejs-instruments trae grabaciones REALES servidas como
 * mp3 sueltos por nota (`Access-Control-Allow-Origin: *` en GitHub Pages), pero
 * no publica un manifiesto: hay que derivar la lista de archivos del árbol del
 * repo y convertir el nombre de cada archivo (`C4`, `As3`, `Ds2`…) a nota MIDI.
 * Este script hace esa conversión de forma reproducible en vez de a mano.
 *
 * FUENTE DE VERDAD
 * ----------------
 * `https://api.github.com/repos/nbrosowsky/tonejs-instruments/git/trees/master?recursive=1`
 * (fallback: el mismo árbol vía jsDelivr). Los `size` de los blobs son los bytes
 * reales de cada mp3, así que el peso estimado sale del árbol sin bajar audio.
 *
 * NOTACIÓN
 * --------
 * El banco usa sostenidos con `s` (`As3` = A#3, `Ds2` = D#2) y notación
 * científica con C4 = MIDI 60. Los nombres con espacios o sufijos (`F2 v2.mp3`)
 * se descartan: son tomas alternativas, no notas distintas.
 *
 * USO
 * ---
 *   node scripts/gen-tonejs-manifest.mjs            # escribe el .ts
 *   node scripts/gen-tonejs-manifest.mjs --dry-run  # solo imprime el informe
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TREE_URL =
  "https://api.github.com/repos/nbrosowsky/tonejs-instruments/git/trees/master?recursive=1";

/**
 * Base de las URLs. Es el espejo con CORS confirmado (`Access-Control-Allow-Origin: *`).
 * Alternativas verificadas: `https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples`
 * y `https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples`
 * (esta última no sirve como base de `Tone.Sampler` por su rate limit).
 */
const BASE_URL = "https://nbrosowsky.github.io/tonejs-instruments/samples";

/** Carpetas del banco que la app usa, con el programa GM al que sirven. */
const INSTRUMENTS = [
  { folder: "bass-electric", program: 33 },
  { folder: "bassoon", program: 70 },
  { folder: "cello", program: 42 },
  { folder: "clarinet", program: 71 },
  { folder: "contrabass", program: 43 },
  { folder: "flute", program: 73 },
  { folder: "french-horn", program: 60 },
  { folder: "guitar-acoustic", program: 25 },
  { folder: "guitar-electric", program: 27 },
  { folder: "guitar-nylon", program: 24 },
  { folder: "harmonium", program: 20 },
  { folder: "harp", program: 46 },
  { folder: "organ", program: 19 },
  { folder: "piano", program: 0 },
  { folder: "saxophone", program: 65 },
  { folder: "trombone", program: 57 },
  { folder: "trumpet", program: 56 },
  { folder: "tuba", program: 58 },
  { folder: "violin", program: 40 },
  { folder: "xylophone", program: 13 },
];

/** Nombres GM exactos que usa la app (`app/src/utils/instrumentMapping.ts`). */
const GM_NAMES = {
  0: "Acoustic Grand Piano",
  13: "Xylophone",
  19: "Church Organ",
  20: "Reed Organ",
  24: "Acoustic Guitar (nylon)",
  25: "Acoustic Guitar (steel)",
  27: "Electric Guitar (clean)",
  33: "Electric Bass (finger)",
  40: "Violin",
  42: "Cello",
  43: "Contrabass",
  46: "Orchestral Harp",
  56: "Trumpet",
  57: "Trombone",
  58: "Tuba",
  60: "French Horn",
  65: "Alto Sax",
  70: "Bassoon",
  71: "Clarinet",
  73: "Flute",
};

const NAME_RE = /^([A-G])([#sb]?)(-?\d+)$/;
const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `As3` → 58. Devuelve null si el nombre no es una nota válida. */
function noteToMidi(stem) {
  const m = NAME_RE.exec(stem);
  if (!m) return null;
  const [, letter, accidental, octaveText] = m;
  let semitone = PITCH_CLASS[letter];
  if (accidental === "s" || accidental === "#") semitone += 1;
  else if (accidental === "b") semitone -= 1;
  const midi = 12 * (Number(octaveText) + 1) + semitone;
  return midi >= 0 && midi <= 127 ? midi : null;
}

async function fetchTree() {
  const res = await fetch(TREE_URL, {
    headers: { "User-Agent": "dsh", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!Array.isArray(json.tree)) throw new Error("respuesta sin `tree`");
  return json.tree;
}

function build(tree) {
  /** @type {Map<string, Map<number, {file: string, size: number}>>} */
  const byFolder = new Map();
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const parts = entry.path.split("/");
    if (parts.length !== 3 || parts[0] !== "samples" || !parts[2].endsWith(".mp3")) continue;
    const [, folder, file] = parts;
    const midi = noteToMidi(file.slice(0, -4));
    if (midi === null) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, new Map());
    byFolder.get(folder).set(midi, { file, size: entry.size ?? 0 });
  }

  const missing = [];
  const instruments = [];
  for (const { folder, program } of INSTRUMENTS) {
    const notes = byFolder.get(folder);
    if (!notes || notes.size === 0) {
      missing.push(folder);
      continue;
    }
    instruments.push({
      name: GM_NAMES[program],
      program,
      folder,
      notes: new Map([...notes].sort((a, b) => a[0] - b[0])),
    });
  }
  return { instruments, missing, allFolders: [...byFolder.keys()].sort() };
}

function render(instruments) {
  const head = `/**
 * tonejsManifest — samples REALES del banco nbrosowsky/tonejs-instruments.
 *
 * GENERADO por \`scripts/gen-tonejs-manifest.mjs\` — no editar a mano.
 *
 * Cada instrumento trae una grabación por nota (el banco NO tiene capas de
 * velocity): un \`Tone.Sampler\` interpola las notas que faltan estirando el
 * sample más cercano, así que las listas son dispersas a propósito.
 *
 * Espejo servido con \`Access-Control-Allow-Origin: *\` (verificado con HEAD
 * real, 200 + CORS en las 20 carpetas). Alternativas: jsDelivr
 * (\`cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples\`).
 * Los archivos con sufijo tipo \`F2 v2.mp3\` (tomas alternativas) se descartan.
 */

/** Base de las URLs de samples del banco. */
export const TONEJS_BASE_URL = "${BASE_URL}";

/** Nota MIDI → URL del mp3 (un solo sample por nota; el banco no tiene capas). */
export interface TonejsInstrument {
  /** Nombre tal como lo pide la app (GM). */
  name: string;
  /** Programa GM al que sirve (0-127). */
  program: number;
  /** Carpeta dentro del banco. */
  folder: string;
  /** Nota MIDI → url. */
  notes: Record<number, string>;
}

export const TONEJS_INSTRUMENTS: TonejsInstrument[] = [
`;

  const body = instruments
    .map((inst) => {
      const lines = [...inst.notes]
        .map(([midi, { file }]) => `    ${midi}: \`\${TONEJS_BASE_URL}/${inst.folder}/${file}\`,`)
        .join("\n");
      const range = `${[...inst.notes.keys()][0]}–${[...inst.notes.keys()].at(-1)}`;
      return (
        `  // ${range} · ${inst.notes.size} mp3\n` +
        `  {\n` +
        `    name: ${JSON.stringify(inst.name)},\n` +
        `    program: ${inst.program},\n` +
        `    folder: ${JSON.stringify(inst.folder)},\n` +
        `    notes: {\n${lines}\n    },\n` +
        `  },`
      );
    })
    .join("\n");

  return `${head}${body}\n];\n`;
}

const tree = await fetchTree();
const { instruments, missing, allFolders } = build(tree);

if (missing.length > 0) {
  console.error(`CARPETAS AUSENTES EN EL BANCO: ${missing.join(", ")}`);
}

let totalNotes = 0;
let totalBytes = 0;
for (const inst of instruments) {
  const midis = [...inst.notes.keys()];
  const bytes = [...inst.notes.values()].reduce((sum, n) => sum + n.size, 0);
  totalNotes += inst.notes.size;
  totalBytes += bytes;
  console.log(
    `${inst.folder.padEnd(17)} prog=${String(inst.program).padStart(3)}  ` +
      `${String(inst.notes.size).padStart(3)} mp3  midi ${midis[0]}–${midis.at(-1)}  ` +
      `${(bytes / 1024).toFixed(0).padStart(5)} KB`,
  );
}
console.log(
  `TOTAL: ${instruments.length} instrumentos, ${totalNotes} mp3, ` +
    `${(totalBytes / 1048576).toFixed(2)} MB (${allFolders.length} carpetas en el banco)`,
);

if (process.argv.includes("--dry-run")) process.exit(0);

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "src",
  "engine",
  "tonejsManifest.ts",
);
await writeFile(outPath, render(instruments), "utf8");
console.log(`escrito: ${outPath}`);
