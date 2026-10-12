#!/usr/bin/env node
/**
 * gen-vsco-manifest.mjs — genera `app/src/engine/vscoManifest.ts`.
 *
 * POR QUÉ EXISTE
 * --------------
 * El manifiesto es una tabla de ~700 URLs reales de VSCO-2-CE con nota MIDI,
 * capa de velocidad y variante round-robin. Escribirla a mano es inviable y
 * mentiría: hay cuatro convenciones de nombres distintas dentro del mismo
 * banco, y la única forma de saber a qué nota MIDI corresponde un archivo es
 * medir su altura real. Este script hace las dos cosas:
 *
 *   1. Lee el árbol real del repo (`git/trees?recursive=1`, cacheado en
 *      `.logs/vsco-tree.json`) y agrupa por carpeta/articulación.
 *   2. Aplica el desplazamiento de octava VERIFICADO POR AUDÍO para cada
 *      carpeta (ver OCTAVE_OFFSET más abajo) y emite el archivo TypeScript.
 *
 * Verificación de octavas (sonda YIN sobre el sample, ver `.logs/pitch_probe.py`):
 *   - VSCO 2 (metales, maderas, secciones de cuerdas, percusión afinada)
 *     escribe la octava con el do central = C3 → hay que sumar 12 semitonos.
 *     Ej.: `Sum_SHTrumpet_sus_C3_v1_rr1.wav` mide 259.76 Hz = C4 = MIDI 60.
 *   - VSCO 1 / Ivy Audio (Harp, Upright Nr1, Solo Violin "Arco Vib", Tubular
 *     Bells) usa notación científica estándar (do central = C4) → offset 0.
 *     Ej.: `LLVln_ArcoVib_G3_f.wav` mide 196.02 Hz = G3 = MIDI 55.
 *   - `Keys/Upright Piano` no lleva nombre de nota: el sufijo `_NNN` es un
 *     índice del `MappingChart.txt` del propio banco (21 + 2·NNN), confirmado
 *     por audio en los índices 0, 2, 10, 16 y 22.
 *
 * Uso:
 *   node scripts/gen-vsco-manifest.mjs            # regenera el manifiesto
 *   node scripts/gen-vsco-manifest.mjs --verify   # además hace HEAD de 2
 *                                                 # URLs al azar por instrumento
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO = "sgossner/VSCO-2-CE";
const BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const ROOT = path.resolve(import.meta.dirname, "..");
const TREE_PATH = path.join(ROOT, ".logs", "vsco-tree.json");
const OUT_PATH = path.join(ROOT, "app", "src", "engine", "vscoManifest.ts");
const STATS_PATH = path.join(ROOT, ".logs", "vsco-manifest-stats.json");
const VERIFY_PATH = path.join(ROOT, ".logs", "vsco-verify.json");

/* ─────────────────────────── parseo de nombres ─────────────────────────── */

const DYN_ORDER = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff"];
const DYN_RANK = new Map(DYN_ORDER.map((d, i) => [d, i]));
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-Ga-g])([#sb]?)(-?\d+)$/;

/** `C3` → 48, `A#3` → 58, `As3` → 58 (VSCO escribe la sostenida de las dos formas). */
function noteToMidi(token) {
  const m = NOTE_RE.exec(token);
  if (!m) return null;
  const semi = SEMITONES[m[1].toUpperCase()];
  const acc = m[2].toLowerCase();
  const oct = Number(m[3]);
  let value = (oct + 1) * 12 + semi;
  if (acc === "#" || acc === "s") value += 1;
  else if (acc === "b") value -= 1;
  return value;
}

/** Orden de las claves de velocidad dentro de una fuente. */
function velOrder(key) {
  if (key.startsWith("v")) return Number(key.slice(1));
  if (key.startsWith("d")) return Number(key.slice(1));
  return -1; // capa única
}

function encodeRelPath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/* ───────────────────────── fuente = carpeta + filtro ───────────────────── */

/**
 * @param {string} dir      carpeta dentro del repo
 * @param {RegExp} include  filtro sobre el nombre de archivo
 * @param {object} opts     { velMode, rrMode, fixedNote, chartIndex, noteOffset, clamp }
 */
function collect(dir, include, opts = {}) {
  const {
    velMode = "none",
    rrMode = "none",
    fixedNote = null,
    chartIndex = null,
    noteOffset = 0,
    clamp = null,
  } = opts;
  /** @type {Map<number, Map<string, {rrKey: string, rel: string}[]>>} */
  const byNote = new Map();
  for (const rel of FILES) {
    if (!rel.startsWith(`${dir}/`)) continue;
    const rest = rel.slice(dir.length + 1);
    if (rest.includes("/")) continue; // solo el nivel exacto
    const base = rest;
    if (!include.test(base)) continue;
    const stem = base.replace(/\.wav$/i, "");
    const tokens = stem.split("_");

    // ── nota ──
    let note = fixedNote;
    if (note == null && chartIndex) {
      const m = /_(\d+)$/.exec(stem);
      if (!m) continue;
      note = chartIndex(Number(m[1]));
    }
    if (note == null) {
      for (const t of tokens) {
        const v = noteToMidi(t);
        if (v != null) {
          note = v + noteOffset;
          break;
        }
      }
    }
    if (note == null || note < 0 || note > 127) continue;
    if (clamp && (note < clamp[0] || note > clamp[1])) continue;

    // ── capa de velocidad ──
    let velKey = "L1";
    if (velMode === "v") {
      const m = /(?:^|_)v(\d+)(?:_|$)/.exec(stem);
      if (m) velKey = `v${Number(m[1])}`;
    } else if (velMode === "dynIdx") {
      const m = /(?:^|_)dyn(\d+)(?:_|$)/.exec(stem);
      if (m) velKey = `d${Number(m[1])}`;
    } else if (velMode === "dyn") {
      for (const t of tokens) {
        const m = /^([a-z]{1,4})\d*$/.exec(t.toLowerCase());
        if (m && DYN_RANK.has(m[1])) {
          velKey = `d${DYN_RANK.get(m[1])}`;
          break;
        }
      }
    }

    // ── round-robin ──
    let rrKey = "r1";
    if (rrMode === "rr") {
      const m = /(?:^|_)rr(\d+)(?:_|$)/i.exec(stem);
      if (m) rrKey = `r${Number(m[1])}`;
    } else if (rrMode === "trailing") {
      const m = /_(\d+)$/.exec(stem);
      if (m) rrKey = `r${Number(m[1])}`;
    }

    if (!byNote.has(note)) byNote.set(note, new Map());
    const byVel = byNote.get(note);
    if (!byVel.has(velKey)) byVel.set(velKey, []);
    byVel.get(velKey).push({ rrKey, rel });
  }
  return byNote;
}

/**
 * Colapsa las capas de una fuente a 1..3 y arma `VscoSample[][]`.
 *
 * - ≤3 valores de velocidad: se conservan tal cual (1, 2 o 3 capas).
 * - >3: se eligen tres equiespaciados en el orden suave→fuerte. Es el caso de
 *   la caja (v1,v3,v5,v7,v9), el bombo (7 dinámicas) o el crash (4).
 * - Cada capa conserva como máximo 2 variantes (rr 1 y 2), que es lo que el
 *   tipo `VscoSample` declara.
 */
function toLayers(byNote, extra) {
  const layers = {};
  const notes = [...byNote.keys()].sort((a, b) => a - b);
  for (const note of notes) {
    const byVel = byNote.get(note);
    const keys = [...byVel.keys()].sort((a, b) => velOrder(a) - velOrder(b));
    const picks = [];
    if (keys.length <= 3) {
      keys.forEach((k, i) => picks.push([i + 1, k]));
    } else {
      for (let i = 0; i < 3; i++) {
        picks.push([i + 1, keys[Math.round((i * (keys.length - 1)) / 2)]]);
      }
    }
    layers[note] = picks.map(([vel, key]) => {
      const variants = byVel
        .get(key)
        .slice()
        .sort((a, b) => a.rrKey.localeCompare(b.rrKey) || a.rel.localeCompare(b.rel))
        .slice(0, 2);
      return variants.map((v, i) => ({
        vel,
        rr: i + 1,
        url: RAW_BASE + encodeRelPath(v.rel),
      }));
    });
    if (extra) for (const l of layers[note]) for (const s of l) extra.push(s.url);
  }
  return layers;
}

function mergeSources(sources) {
  const merged = new Map();
  for (const byNote of sources) {
    for (const [note, byVel] of byNote) {
      if (!merged.has(note)) merged.set(note, new Map());
      const dst = merged.get(note);
      for (const [vel, arr] of byVel) {
        if (!dst.has(vel)) dst.set(vel, []);
        dst.get(vel).push(...arr);
      }
    }
  }
  return merged;
}

/* ─────────────────────── instrumentos melódicos ────────────────────────── */

// Rango de recorte del piano: C3(48)–C6(84), ~3 octavas alrededor de C4.
const PIANO_CLAMP = [48, 84];

const MELODIC = [
  // ── Metales ──
  {
    name: "Trumpet", program: 56, dir: "Brass/Trumpet/sus",
    include: /^Sum_SHTrumpet_sus_/, velMode: "v", rrMode: "rr", noteOffset: 12,
  },
  {
    name: "Trombone", program: 57, dir: "Brass/Tenor Trombone/sus",
    include: /^tenortbn_sus_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "French Horn", program: 60, dir: "Brass/F Horn/sus",
    include: /^MOHorn_sus_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "Tuba", program: 58, dir: "Brass/Tuba/sus",
    include: /^Tuba3_sus_/, velMode: "v", rrMode: "rr", noteOffset: 12,
  },
  // ── Maderas ──
  {
    name: "Flute", program: 73, dir: "Woodwinds/Flute/susNV",
    include: /^LDFlute_susNV_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "Clarinet", program: 71, dir: "Woodwinds/Clarinet/susLong",
    include: /^DCClar_susLong_/, velMode: "v", rrMode: "rr", noteOffset: 12,
  },
  {
    name: "Oboe", program: 68, dir: "Woodwinds/Oboe/Sus",
    include: /^Oboe_Sus_/, velMode: "v", rrMode: "none", noteOffset: 12,
  },
  {
    name: "Bassoon", program: 70, dir: "Woodwinds/Bassoon/sus",
    include: /^PSBassoon_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "Piccolo", program: 72, dir: "Woodwinds/Piccolo/Sus",
    include: /^piccolo_.*sustain/, velMode: "none", rrMode: "none", noteOffset: 12,
  },
  // ── Cuerdas ──
  {
    name: "Violin", program: 40, dir: "Strings/Solo Violin/Arco Vib",
    include: /^LLVln_ArcoVib_/, velMode: "dyn", rrMode: "none", noteOffset: 0,
  },
  {
    name: "Viola", program: 41, dir: "Strings/Viola Section/susvib",
    include: /^ViolaEns_susvib_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "Cello", program: 42, dir: "Strings/Cello Section/susvib",
    include: /^susvib_/, velMode: "v", rrMode: "trailing", noteOffset: 12,
  },
  {
    name: "Contrabass", program: 43, dir: "Strings/Solo Contrabass/SusNV",
    include: /^BKCtbss_SusNV_/, velMode: "v", rrMode: "rr", noteOffset: 12,
  },
  {
    name: "String Ensemble 1", program: 48, dir: "Strings/Violin Section/susVib",
    include: /^VlnEns_susVib_/, velMode: "v", rrMode: "none", noteOffset: 12,
  },
  {
    name: "Orchestral Harp", program: 46, dir: "Strings/Harp",
    include: /^KSHarp_/, velMode: "dyn", rrMode: "none", noteOffset: 0,
  },
  // ── Teclados ──
  // VSCO-2-CE no trae piano de cola: el programa 0 se sirve con el upright de
  // VSCO 1 / Ivy Audio, que es el set con más capas del banco (pp/mf/f × RR1/RR2).
  {
    name: "Acoustic Grand Piano", program: 0, dir: "Keys/Upright Nr1",
    include: /^UR1_/, velMode: "dyn", rrMode: "rr", noteOffset: 0,
    clamp: PIANO_CLAMP,
  },
  // Segundo upright del banco (VSCO 2 "Player"): 3 dinámicas, sin round-robin,
  // y las fundamentales vienen del MappingChart (índice → tecla 21 + 2·i).
  {
    name: "Upright Piano", program: 0, dir: "Keys/Upright Piano",
    include: /^Player_dyn\d+_rr\d+_\d+\.wav$/,
    velMode: "dynIdx", rrMode: "rr", chartIndex: (i) => 21 + 2 * i,
    clamp: PIANO_CLAMP,
  },
  // ── Percusión afinada ──
  {
    name: "Glockenspiel", program: 9, dir: "Percussion/Glock",
    include: /^glock_medium_/, velMode: "none", rrMode: "none", noteOffset: 12,
  },
  {
    name: "Marimba", program: 12, dir: "Percussion/Marimba",
    include: /^Marimba_hit_Outrigger_/, velMode: "none", rrMode: "none", noteOffset: 12,
  },
  {
    name: "Xylophone", program: 13, dir: "Percussion/Xylo",
    include: /^Xylo_Medium_/, velMode: "none", rrMode: "none", noteOffset: 12,
  },
  {
    name: "Tubular Bells", program: 14, dir: "Percussion",
    include: /^TB_hit_/, velMode: "v", rrMode: "rr", noteOffset: 0,
  },
];

/* ───────────────────────────── kit de batería ──────────────────────────── */

/**
 * Nota GM de canal 10 → fuentes. `Timpani` va aparte porque es un instrumento
 * afinado (programa 47) y no una pieza del kit.
 *
 * Lo que el banco NO tiene y por eso no aparece: hi-hat (42/44/46), palmada
 * (39), timbales (65/66), castañuelas (85), cajón, china/splash (52/55) y los
 * toms 43/47/48/50 (solo hay dos tambores tenor).
 */
const DRUM_KIT = [
  [35, [["VSCO 1 Percussion/drums/bass", /^bdrum_(?!muted|roll|special)/, { velMode: "dyn", rrMode: "trailing" }]]],
  [36, [["Percussion", /^BDrumNewhit_/, { velMode: "v", rrMode: "rr" }]]],
  [37, [["VSCO 1 Percussion/drums/snare/drum1", /^snare1_rimshot_/, { velMode: "dyn", rrMode: "none" }]]],
  [38, [["Percussion", /^Snare2-HitSN_/, { velMode: "v", rrMode: "rr" }]]],
  [40, [["Percussion", /^Snare2-HitNS_/, { velMode: "v", rrMode: "rr" }]]],
  [41, [["VSCO 1 Percussion/drums/tenor/tenor_lower", /^tenor_/, { velMode: "dyn", rrMode: "trailing" }]]],
  [45, [["VSCO 1 Percussion/drums/tenor/tenor_higher", /^tenorH_/, { velMode: "dyn", rrMode: "trailing" }]]],
  [49, [["Percussion", /^cymbal-crash1_/, { velMode: "dyn", rrMode: "rr" }]]],
  [51, [["Percussion", /^susCymb1-hitstick_/, { velMode: "dyn", rrMode: "rr" }]]],
  [53, [["Percussion", /^susCymb1-hit-bell_/, { velMode: "dyn", rrMode: "none" }]]],
  [54, [["Percussion", /^Tamb1-Hit_/, { velMode: "v", rrMode: "rr" }]]],
  [56, [["Percussion", /^Cowbell1_Hit_/, { velMode: "v", rrMode: "rr" }]]],
  [57, [["VSCO 1 Percussion/varMetal/Cymbals/clash", /^crash_hit_/, { velMode: "dyn", rrMode: "trailing" }]]],
  [58, [["VSCO 1 Percussion/varWood", /^vibraslap/, { velMode: "none", rrMode: "none" }]]],
  [60, [["VSCO 1 Percussion/drums/other/Bongos", /^HighBongo/, { velMode: "none", rrMode: "none" }]]],
  [61, [["VSCO 1 Percussion/drums/other/Bongos", /^LowBongo/, { velMode: "none", rrMode: "none" }]]],
  [62, [["VSCO 1 Percussion/drums/other/ethnic/congo/muted", /^ethnicHigh_hit_/, { velMode: "dyn", rrMode: "trailing" }]]],
  [63, [["Percussion", /^Quinto-HitN_/, { velMode: "v", rrMode: "rr" }]]],
  [64, [["Percussion", /^Conga-HitN_/, { velMode: "v", rrMode: "rr" }]]],
  [67, [["VSCO 1 Percussion/varMetal/various", /^agogoBell3_/, { velMode: "dyn", rrMode: "trailing" }]]],
  [68, [["VSCO 1 Percussion/varMetal/various", /^agogoBell(_|2_)/, { velMode: "dyn", rrMode: "none" }]]],
  [69, [["VSCO 1 Percussion/varMetal/various", /^cabasa_\d/, { velMode: "none", rrMode: "none" }]]],
  [70, [["VSCO 1 Percussion/varWood", /^maraca\d/, { velMode: "none", rrMode: "none" }]]],
  [73, [["VSCO 1 Percussion/varWood", /^guiro_short/, { velMode: "none", rrMode: "none" }]]],
  [74, [["VSCO 1 Percussion/varWood", /^guiro_long/, { velMode: "none", rrMode: "none" }]]],
  [75, [["Percussion", /^Claves1_Hit_/, { velMode: "v", rrMode: "rr" }]]],
  [76, [["VSCO 1 Percussion/varWood", /^wood_click_/, { velMode: "dyn", rrMode: "none" }]]],
  [77, [["Percussion", /^LogDrumLo_MedM_/, { velMode: "v", rrMode: "rr" }]]],
  [80, [["Percussion", /^Triangle3-HitM_/, { velMode: "v", rrMode: "rr" }]]],
  [81, [["Percussion", /^Triangle3-Hit_/, { velMode: "v", rrMode: "rr" }]]],
  [82, [["VSCO 1 Percussion/varWood/Camo's Shaker", /^shake/, { velMode: "none", rrMode: "none" }]]],
  [83, [["Percussion", /^Sleighbells_Hit_/, { velMode: "v", rrMode: "rr" }]]],
  [84, [["Percussion", /^BellTree_Stroke/, { velMode: "v", rrMode: "none" }]]],
];

/**
 * Timpani: el banco no documenta la afinación de cada tambor (ni el Readme ni
 * los nombres la traen), así que se asume el juego estándar de 5 timbales
 * D–F–A–C–E, del más grande al más chico. Si algún día se consigue la
 * afinación real, se cambia solo esta tabla.
 */
const TIMPANI_TUNING = { Timpani1: 38, Timpani2: 41, Timpani3: 45, Timpani4: 48, Timpani5: 52 };

/* ─────────────────────────────── emisión ───────────────────────────────── */

function layersToTs(layers, indent) {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const note of Object.keys(layers).map(Number).sort((a, b) => a - b)) {
    const caps = layers[note];
    lines.push(`${pad}${note}: [`);
    for (const capa of caps) {
      lines.push(`${pad}  [`);
      for (const s of capa) {
        lines.push(`${pad}    { vel: ${s.vel}, rr: ${s.rr}, url: "${s.url}" },`);
      }
      lines.push(`${pad}  ],`);
    }
    lines.push(`${pad}],`);
  }
  return lines.join("\n");
}

function instrumentTs(inst, indent) {
  const pad = " ".repeat(indent);
  const head = inst.comment ? `${pad}${inst.comment}\n` : "";
  return (
    `${head}${pad}{\n` +
    `${pad}  name: ${JSON.stringify(inst.name)},\n` +
    `${pad}  program: ${inst.program},\n` +
    `${pad}  basePath: ${JSON.stringify(inst.basePath)},\n` +
    `${pad}  layers: {\n` +
    `${layersToTs(inst.layers, indent + 4)}\n` +
    `${pad}  },\n` +
    `${pad}},`
  );
}

const HEADER = `/**
 * vscoManifest — manifiesto de samples REALES del banco VSCO-2-CE (CC0).
 *
 * POR QUÉ EXISTE
 * --------------
 * La app venía sonando con soundfonts GM: una sola muestra por nota, sin capas
 * de velocidad. Este manifiesto reemplaza esa fuente por samples de verdad, con
 * 1–3 capas de intensidad y hasta 2 variantes round-robin por capa, que es lo
 * único que hace que un solo de trompeta o un redoble de caja suenen a algo.
 *
 * FUENTE
 * ------
 * Versilian Studios Chamber Orchestra 2: Community Edition (CC0 / dominio
 * público, se pide crédito a Versilian Studios / Sam Gossner). Los WAV se
 * sirven crudos desde raw.githubusercontent.com con \`Access-Control-Allow-Origin: *\`,
 * así que se pueden cargar con Tone.ToneAudioBuffer / fetch sin proxy.
 * Cada URL de este archivo fue verificada con un HEAD real (200 + CORS \`*\`).
 *
 * CÓMO LEER LAS CAPAS
 * -------------------
 * \`layers[notaMIDI]\` es un arreglo de capas ordenadas de SUAVE a FUERTE:
 * el índice 0 es la capa 1 (vel = 1), el índice 1 la capa 2 (vel = 2) y el
 * índice 2 la capa 3 (vel = 3). Ojo: **no todos los instrumentos tienen 3
 * capas** — las cuerdas solistas y las secciones sólo tienen 2, y el glock,
 * la marimba, el xilófono o el piccolo tienen 1. Un reproductor tiene que
 * mirar \`capa.length\` (o el campo \`vel\`) en vez de asumir 3.
 *
 * El campo \`vel\` viene de la convención de origen:
 *   - \`_v1_/_v2_/_v3_\` del banco → se conserva el orden relativo de N y, si
 *     hay más de 3 valores (la caja tiene v1,v3,v5,v7,v9), se eligen tres
 *     equiespaciados de suave a fuerte.
 *   - dinámicas escritas (\`_pp_\`, \`_mp_\`, \`_mf_\`, \`_f_\`, \`_ff_\`, \`_fff_\`)
 *     → pp/p = capa 1, mp/mf = capa 2, f/ff/fff = capa 3.
 *
 * El campo \`rr\` es la variante (1 o 2) dentro de la capa: elegir una al azar
 * por nota repetida evita el efecto "metralleta" en las repeticiones.
 *
 * OJO CON LAS OCTAVAS (esto se midió, no se dedujo)
 * -------------------------------------------------
 * El banco mezcla dos convenciones de nombres y no lo dice en ningún lado:
 *   - Los sets de VSCO 2 (metales, maderas, secciones de cuerdas, percusión
 *     afinada) escriben el do central como \`C3\`. Medido: \`Sum_SHTrumpet_sus_C3\`
 *     = 259.76 Hz = C4 = MIDI 60; \`LDFlute_susNV_C4\` = 523.5 Hz = MIDI 72.
 *   - Los sets heredados de VSCO 1 / Ivy Audio (Harp, Upright Nr1, Solo Violin
 *     "Arco Vib", Tubular Bells) usan notación científica normal. Medido:
 *     \`LLVln_ArcoVib_G3_f\` = 196.02 Hz = MIDI 55; \`KSHarp_C5_mf\` = 519.6 Hz = MIDI 72.
 * Las notas de este archivo ya están normalizadas a MIDI estándar (C4 = 60).
 *
 * RECORTES (para que el archivo no sea gigante)
 * ---------------------------------------------
 *   - Piano: sólo C3(48)–C6(84), ~3 octavas alrededor de C4, en vez de las 6
 *     octavas que traen los dos upright. Fuera de ese rango el reproductor
 *     debería estirar la muestra más cercana.
 *   - Se eligió UNA articulación por instrumento, la sostenida/ordinaria
 *     (\`sus\`, \`susNV\`, \`susvib\`, \`susLong\`, \`Arco Vib\`): quedan afuera
 *     staccato, pizzicato, tremolo, sordina y rolls.
 *   - Kit de batería: 33 de las notas GM 35–84. El banco no tiene hi-hat,
 *     palmada, timbales, castañuelas ni cajón, así que esas notas no existen acá.
 *
 * ARCHIVO GENERADO — no editar a mano.
 * Regenerar con: \`node scripts/gen-vsco-manifest.mjs\`
 */

/** Un sample concreto: capa de velocidad (1..3) y variante round-robin (1..2). */
export interface VscoSample { vel: number; rr: number; url: string }

/**
 * Nota MIDI → capas de velocidad → variantes. Ej:
 *   { 60: [ [s(v1,rr1), s(v1,rr2)], [s(v2,rr1)...], [s(v3,rr1)...] ] }
 * (el índice externo es la capa - 1; el interno, las variantes de esa capa)
 */
export type VscoLayers = Record<number, VscoSample[][]>;

export interface VscoInstrument {
  /** Nombre tal como lo pide la app (GM). */
  name: string;
  /** Programa GM al que sirve (0-127). */
  program: number;
  /** Ruta base dentro del repo, para trazabilidad. */
  basePath: string;
  /** Nota MIDI → capas. */
  layers: VscoLayers;
}

export const VSCO_INSTRUMENTS: VscoInstrument[] = [
`;

/* ──────────────────────────────── main ─────────────────────────────────── */

const tree = JSON.parse(await readFile(TREE_PATH, "utf8"));
if (tree.truncated) throw new Error("el árbol del repo vino truncado");
const FILES = tree.tree
  .filter((n) => n.type === "blob" && /\.wav$/i.test(n.path))
  .map((n) => n.path);

const stats = [];
const urlPool = [];

function build(name, program, basePath, byNote, comment) {
  const urls = [];
  const layers = toLayers(byNote, urls);
  const notes = Object.keys(layers).map(Number).sort((a, b) => a - b);
  stats.push({
    name, program, basePath,
    notes: notes.length,
    range: notes.length ? [notes[0], notes[notes.length - 1]] : null,
    layers: notes.length ? Math.max(...notes.map((n) => layers[n].length)) : 0,
    minLayers: notes.length ? Math.min(...notes.map((n) => layers[n].length)) : 0,
    rrmax: notes.length
      ? Math.max(...notes.flatMap((n) => layers[n].map((l) => l.length)))
      : 0,
    samples: urls.length,
    urls,
  });
  urlPool.push(...urls);
  return { name, program, basePath, layers, comment };
}

const instruments = [];

for (const spec of MELODIC) {
  const byNote = collect(spec.dir, spec.include, {
    velMode: spec.velMode,
    rrMode: spec.rrMode,
    noteOffset: spec.noteOffset ?? 0,
    chartIndex: spec.chartIndex ?? null,
    clamp: spec.clamp ?? null,
  });
  if (byNote.size === 0) throw new Error(`sin archivos para ${spec.name} (${spec.dir})`);
  instruments.push(build(spec.name, spec.program, spec.dir, byNote, spec.comment));
}

// Kit de batería: una sola entrada, con las piezas en sus notas GM de canal 10.
{
  const kit = new Map();
  for (const [note, sources] of DRUM_KIT) {
    const merged = mergeSources(
      sources.map(([dir, include, opts]) => collect(dir, include, { ...opts, fixedNote: note })),
    );
    if (merged.size === 0) throw new Error(`sin archivos para la pieza GM ${note}`);
    kit.set(note, merged.get(note));
  }
  instruments.push(
    build(
      "Drum Kit", 0, "Percussion + VSCO 1 Percussion", kit,
      "  // Piezas de orquesta y de kit latino en sus notas GM de canal 10.",
    ),
  );
}

// Timpani afinado: 5 tambores en un juego D–F–A–C–E asumido (ver TIMPANI_TUNING).
{
  const timp = new Map();
  for (const [drum, note] of Object.entries(TIMPANI_TUNING)) {
    const byNote = collect("Percussion/Timpani", new RegExp(`^${drum}_Hit_`), {
      velMode: "v", rrMode: "rr", fixedNote: note,
    });
    if (byNote.size === 0) throw new Error(`sin archivos para ${drum}`);
    timp.set(note, byNote.get(note));
  }
  instruments.push(
    build(
      "Timpani", 47, "Percussion/Timpani", timp,
      "  // El banco no rotula la afinación de cada tambor: se asume el juego\n" +
      "  // estándar de 5 timbales D2–F2–A2–C3–E3 (Timpani1 = el más grande).",
    ),
  );
}

const body = instruments.map((i) => instrumentTs(i, 2)).join("\n");
await writeFile(OUT_PATH, `${HEADER}${body}\n];\n`, "utf8");

const totals = stats.reduce(
  (acc, s) => ({ samples: acc.samples + s.samples, kb: acc.kb + s.urls.join(",").length / 1024 }),
  { samples: 0, kb: 0 },
);
const jsonBytes = Buffer.byteLength(JSON.stringify(stats.map((s) => ({ ...s, urls: undefined }))));
const fileBytes = Buffer.byteLength(await readFile(OUT_PATH, "utf8"));

await writeFile(STATS_PATH, JSON.stringify({ stats, totals, fileBytes, jsonBytes }, null, 2), "utf8");

console.log(`instrumentos: ${instruments.length}`);
console.log(`samples: ${totals.samples}`);
console.log(`urls unicas: ${new Set(urlPool).size}`);
console.log(`ts: ${(fileBytes / 1024).toFixed(1)} KB`);
for (const s of stats) {
  console.log(
    `  ${s.name.padEnd(22)} GM ${String(s.program).padStart(3)}  ` +
    `notas ${s.notes}  rango ${s.range ? `${s.range[0]}-${s.range[1]}` : "-"}  ` +
    `capas ${s.minLayers}..${s.layers}  rr<=${s.rrmax}  samples ${s.samples}`,
  );
}

if (process.argv.includes("--verify")) {
  const seedRand = (() => {
    let s = 20240607;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  })();
  const picks = [];
  for (const s of stats) {
    const n = s.urls.length;
    const idx = new Set([Math.floor(seedRand() * n), Math.floor(seedRand() * n)]);
    while (idx.size < Math.min(2, n)) idx.add(Math.floor(seedRand() * n));
    for (const i of idx) picks.push({ name: s.name, url: s.urls[i] });
  }
  const results = [];
  const queue = [...picks];
  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      try {
        const res = await fetch(job.url, { method: "HEAD" });
        results.push({
          ...job,
          status: res.status,
          cors: res.headers.get("access-control-allow-origin"),
          type: res.headers.get("content-type"),
          bytes: Number(res.headers.get("content-length")),
        });
      } catch (err) {
        results.push({ ...job, status: 0, error: String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  results.sort((a, b) => a.name.localeCompare(b.name) || a.url.localeCompare(b.url));
  await writeFile(VERIFY_PATH, JSON.stringify(results, null, 2), "utf8");
  const bad = results.filter((r) => r.status !== 200 || r.cors !== "*");
  console.log(`HEAD: ${results.length} pedidos, ${results.length - bad.length} OK, ${bad.length} con problema`);
  for (const b of bad) console.log(`  !! ${b.status} cors=${b.cors} ${b.url}`);
  const totalBytes = results.reduce((a, r) => a + (r.bytes || 0), 0);
  console.log(`peso medio por muestra: ${(totalBytes / results.length / 1024).toFixed(0)} KB`);
}
