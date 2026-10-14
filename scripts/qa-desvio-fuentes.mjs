/**
 * qa-desvio-fuentes.mjs — la tabla de desvíos de repitcheo, con el código REAL.
 *
 * ── QUÉ HACE ───────────────────────────────────────────────────────────────
 *
 * Para cada pista de un MIDI: instrumento, notas que toca, el banco que el motor
 * elige y el DESVÍO en semitonos entre esas notas y la grabación más cercana del
 * banco. Después, el reparto por registro que hace `resolveParts`.
 *
 * No replica la política: importa los módulos del motor desde el dev server
 * (`/src/engine/instrumentSources.ts`, `/src/utils/instrumentMapping.ts`), así
 * que lo que dice esta tabla es lo que hace el motor. Si el script y el motor
 * discreparan, el script estaría mintiendo.
 *
 * ── MODOS ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/qa-desvio-fuentes.mjs --file app/public/demo/X.kar [--port 1234]
 *   node scripts/qa-desvio-fuentes.mjs --biblioteca [--port 1234] [--limit N]
 *   node scripts/qa-desvio-fuentes.mjs --chain "Accordion" 40,41,42
 *
 * `--biblioteca` cuenta, sobre TODOS los MIDI de `app/public/demo`, cuántas
 * canciones y cuántas notas tienen notas que exceden el tope del banco ELEGIDO
 * (el primero de la cadena que declara su registro) y ordena las 10 peores.
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.resolve("app", "package.json"));
const { Midi } = require("@tonejs/midi");

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const PORT = flag("port", "1234");
const FILE = flag("file", null);
const CHAIN = flag("chain", null);
const CHAIN_NOTES = flag("notes", "60,64,67");
const LIMIT = Number(flag("limit", "0"));
const BIBLIOTECA = argv.includes("--biblioteca");
/** Parseo con `@tonejs/midi` (lento pero idéntico a la app). Por defecto: escáner. */
const LENTO = argv.includes("--lento");
const VALIDAR = Number(flag("validar", "0"));
/**
 * El escáner liviano se usa SÓLO donde hace falta velocidad (`--biblioteca` y
 * `--validar`). La tabla por archivo (`--file`) y el volcado de cadena
 * (`--chain`) usan el parser de la app: son pocos archivos y ahí la fidelidad
 * importa más que el tiempo.
 */
const FAST = !LENTO && (BIBLIOTECA || VALIDAR > 0);
const DEMO = path.join(process.cwd(), "app", "public", "demo");
const OUTDIR = path.join(process.cwd(), ".logs");
mkdirSync(OUTDIR, { recursive: true });

// ── Node: leer los MIDI del disco (rápido y sin red) ────────────────────────

/**
 * Escáner de notas liviano (sin `@tonejs/midi`).
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 *
 * El barrido de la biblioteca son 4.064 archivos. Con `@tonejs/midi` el parseo
 * pasó de **25 minutos de CPU sin terminar** (arma un objeto por nota Y por cada
 * evento CC, y en esta biblioteca hay archivos con 127 CC por nota), así que el
 * barrido no se podía correr. Acá sólo se extrae lo que el análisis necesita:
 * programa, nombre, canal y las notas. Con `--validar N` se comprueba contra el
 * parser real en N archivos: si los dos no coinciden, este escáner está mal y el
 * barrido no vale.
 */
function scanNotes(buf) {
  if (buf.length < 14 || buf.toString("latin1", 0, 4) !== "MThd") return null;
  // Se leen EXACTAMENTE las pistas que declara la cabecera, como hace
  // `midi-file`: hay archivos con basura después del último MTrk (medido:
  // `Bolero_-_Mix_Boleros_2.kar` tiene 19 pistas y después bytes sueltos que,
  // leídos como chunk, dan un "MTrk" de 83 MB y notas inventadas).
  const ntrks = buf.readUInt16BE(10);
  let pos = 8 + buf.readUInt32BE(4);
  const out = [];
  let leidas = 0;
  while (pos + 8 <= buf.length && leidas < ntrks) {
    const id = buf.toString("latin1", pos, pos + 4);
    const len = buf.readUInt32BE(pos + 4);
    const end = Math.min(buf.length, pos + 8 + len);
    if (id !== "MTrk") break;
    leidas++;
    let p = pos + 8;
    let running = 0;
    let nombre = "";
    /**
     * `@tonejs/midi` PARTE cada MTrk por (programa, canal) — `splitTracks()` —
     * antes de armar las pistas. Sin replicarlo, un archivo formato 0 (todo en
     * una sola pista, como `BinomioDeOro_-_Mix.kar`) daría UNA pista con los 16
     * canales mezclados en vez de una por canal, y el barrido mediría cualquier
     * cosa. El orden es el de primera aparición, igual que el Map de ellos.
     */
    const porClave = new Map();
    const programaActual = new Array(16).fill(0);
    let primeraClave = null;
    while (p < end) {
      // Delta time (variable length).
      for (;;) {
        const c = buf[p++];
        if (!(c & 0x80)) break;
        if (p >= end) break;
      }
      if (p >= end) break;
      let status = buf[p];
      if (status & 0x80) {
        p++;
        // OJO: el parser real (`midi-file`, vía `@tonejs/midi`) guarda como
        // running status SÓLO a los eventos de canal — nunca a los de
        // sistema/meta (0xf0–0xff). Guardarlos desincroniza la pista entera
        // (medido: 172 de 500 archivos con notas basura y programas en 0).
        if (status < 0xf0) running = status;
      } else if (running) {
        status = running;
      } else {
        break; // sin status ni running status: pista corrupta
      }
      const hi = status & 0xf0;
      if (hi === 0x90 || hi === 0x80) {
        const note = buf[p];
        const vel = buf[p + 1];
        p += 2;
        const canal = status & 0x0f;
        const clave = `${programaActual[canal]} ${canal}`;
        let t = porClave.get(clave);
        if (!t) {
          t = {
            program: programaActual[canal],
            channel: canal,
            notes: new Set(),
            noteCount: 0,
            name: "",
            /**
             * Notas atacadas y todavía sin soltar, DENTRO de esta sub-pista.
             * `@tonejs/midi` arma las notas apareando nota-on con nota-off: un
             * nota-on que nunca se suelta NO es una nota (medido: contar
             * nota-ons daba 108 notas donde el parser real ve 106). El
             * apareamiento es por sub-pista, así que un cambio de programa en el
             * medio deja el nota-on colgado en la anterior — igual que ellos.
             */
            sonando: new Set(),
          };
          porClave.set(clave, t);
          if (primeraClave === null) primeraClave = clave;
        }
        if (hi === 0x90 && vel > 0) {
          t.sonando.add(note);
        } else if (t.sonando.delete(note)) {
          t.notes.add(note);
          t.noteCount++;
        }
      } else if (hi === 0xc0) {
        programaActual[status & 0x0f] = buf[p++];
      } else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
        p += 2;
      } else if (hi === 0xd0) {
        p += 1;
      } else if (status === 0xff) {
        const type = buf[p++];
        let l = 0;
        for (;;) {
          const c = buf[p++];
          l = (l << 7) | (c & 0x7f);
          if (!(c & 0x80)) break;
        }
        if (type === 0x03) nombre = buf.toString("latin1", p, p + Math.min(l, 80));
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        let l = 0;
        for (;;) {
          const c = buf[p++];
          l = (l << 7) | (c & 0x7f);
          if (!(c & 0x80)) break;
        }
        p += l;
      } else {
        break; // meta/sysex raro: se corta la pista en vez de leer basura
      }
      if (p > end) break;
    }
    // El nombre de pista (evento sin canal) cae en la PRIMERA sub-pista, que es
    // lo que hace `splitTracks` con los eventos sin `channel`.
    for (const [clave, t] of porClave) {
      out.push({
        program: t.program,
        trackName: clave === primeraClave ? nombre : "",
        channel: t.channel,
        notes: [...t.notes].sort((a, b) => a - b),
        noteCount: t.noteCount,
      });
    }
    pos = end;
  }
  return out;
}

function parseSong(file) {
  const buf = readFileSync(file);
  if (buf.slice(0, 4).toString("latin1") !== "MThd") return null;
  const isDrum = (t) => t.channel === 9;
  const tracks = FAST
    ? scanNotes(buf)
    : new Midi(buf).tracks.map((t) => ({
        program: t.instrument?.number ?? 0,
        trackName: t.name ?? "",
        channel: t.channel,
        notes: [...new Set(t.notes.map((n) => n.midi))].sort((a, b) => a - b),
        noteCount: t.notes.length,
      }));
  if (!tracks) return null;
  return tracks.filter((t) => t.noteCount > 0 && !isDrum(t));
}

function midiFiles() {
  return readdirSync(DEMO)
    .filter((f) => /\.(mid|midi|kar)$/i.test(f))
    .map((f) => path.join(DEMO, f));
}

// ── Navegador: los módulos reales del motor ────────────────────────────────
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".studio-workspace", { timeout: 30000 });

// Los módulos quedan cargados en la página para todas las evaluaciones.
await page.evaluate(async () => {
  const [sources, mapping, routing] = await Promise.all([
    import(/* @vite-ignore */ "/src/engine/instrumentSources.ts"),
    import(/* @vite-ignore */ "/src/utils/instrumentMapping.ts"),
    import(/* @vite-ignore */ "/src/utils/playbackRouting.ts"),
  ]);
  window.__DIAG = { sources, mapping, routing };
  window.__TOPE = sources.MAX_PITCH_SHIFT_SEMITONES;
});

const tope = await page.evaluate(() => window.__TOPE);
console.log(`tope de repitcheo (MAX_PITCH_SHIFT_SEMITONES) = ${tope} semitonos`);

/**
 * Reparte las notas igual que `resolveParts`: el primer banco con registro
 * declarado se queda con las notas que su grabación más cercana alcanza dentro
 * del tope, y el resto sigue la cadena. Devuelve las partes y, por nota, con qué
 * fuente y con qué desvío terminó.
 */
const FOLD_FN = ([ns, chainRows]) => {
  const tope = window.__TOPE;
  let rest = [...ns];
  const partes = [];
  const assignment = [];
  for (const row of chainRows) {
    if (rest.length === 0) break;
    if (!row.recorded) continue; // WAF: su registro vive en el archivo
    const within = [], beyond = [];
    let worst = 0;
    for (const n of rest) {
      let best = Infinity;
      for (const r of row.recorded) {
        const d = Math.abs(r - n);
        if (d < best) best = d;
      }
      if (best <= tope) {
        within.push(n);
        if (best > worst) worst = best;
      } else beyond.push(n);
    }
    if (within.length === 0) continue;
    for (const n of within) assignment.push([n, row.label, worst]);
    partes.push({ source: row.label, notes: within, worst });
    rest = beyond;
  }
  return { partes, sinFuente: rest, assignment };
};

/** Peor desvío de un conjunto de notas contra un registro grabado. */
const WORST_FN = ([notes, recorded]) => {
  let peor = 0;
  for (const n of notes) {
    let best = Infinity;
    for (const r of recorded) {
      const d = Math.abs(r - n);
      if (d < best) best = d;
    }
    if (best > peor) peor = best;
  }
  return peor;
};

const RANGE = (notes) =>
  notes.length === 0
    ? "—"
    : Math.min(...notes) === Math.max(...notes)
      ? String(Math.min(...notes))
      : `${Math.min(...notes)}–${Math.max(...notes)}`;

async function chainFor(instrument, notes) {
  return page.evaluate(
    async ([inst, ns]) => {
      const { sources } = window.__DIAG;
      const chain = await sources.explainSourcesFor(inst, ns);
      const chosen = sources.candidatesFor(inst).map((c) => ({
        kind: c.kind,
        label: c.label,
        recorded: c.recorded,
      }));
      return { chain, chosen };
    },
    [instrument, notes],
  );
}

// ── Modo --chain: volcar la cadena de un instrumento ───────────────────────
if (CHAIN) {
  const notes = CHAIN_NOTES.split(",").map(Number).filter(Number.isFinite);
  const { chain, chosen } = await chainFor(CHAIN, notes);
  console.log(`\ninstrumento "${CHAIN}" · notas pedidas ${RANGE(notes)} (${notes.length})`);
  for (const [i, row] of chain.entries()) {
    console.log(
      `  [${i}] ${row.label} (${row.kind})\n` +
      `      registro declarado: ${row.recorded ? RANGE(row.recorded) + ` (${row.recorded.length} notas)` : "n/d (vive en el archivo)"}\n` +
      `      dentro del tope: ${RANGE(row.within)} (${row.within.length}) · afuera: ${RANGE(row.beyond)} (${row.beyond.length})\n` +
      `      peor desvío: dentro ${row.worstWithin} · afuera ${row.worstBeyond === Infinity ? "∞" : row.worstBeyond}`,
    );
  }
  console.log(`\ncandidatos (orden de la cadena): ${chosen.map((c) => c.label).join(" → ")}`);
  await browser.close();
  process.exit(0);
}

// ── Modo --validar: el escáner contra el parser real (@tonejs/midi) ─────────
if (VALIDAR > 0) {
  const files = midiFiles().slice(0, VALIDAR);
  let iguales = 0;
  const fallas = [];
  for (const file of files) {
    const strict = (() => {
      try {
        return new Midi(readFileSync(file)).tracks.map((t) => ({
          program: t.instrument?.number ?? 0,
          channel: t.channel,
          notes: [...new Set(t.notes.map((n) => n.midi))].sort((a, b) => a - b),
          noteCount: t.notes.length,
          isDrum: t.channel === 9 || t.instrument?.percussion === true,
        }));
      } catch {
        return null;
      }
    })();
    const rapido = (() => {
      try {
        return scanNotes(readFileSync(file))?.map((t) => ({
          program: t.program,
          channel: t.channel,
          notes: t.notes,
          noteCount: t.noteCount,
          isDrum: t.channel === 9,
        }));
      } catch {
        return null;
      }
    })();
    if (!strict || !rapido) continue;
    // Sólo importan las pistas que el motor usa: con notas y sin percusión, y el
    // conjunto de notas + programa + canal (que es lo que decide la fuente). El
    // CONTEO de notas puede diferir sin que importe: `@tonejs/midi` cuenta pares
    // nota-on/nota-off y acá se cuentan nota-ons con velocity > 0, así que un
    // archivo con nota-ons repetidas sin soltar da un par de más allá.
    const a = strict.filter((t) => t.noteCount > 0 && !t.isDrum);
    const b = rapido.filter((t) => t.noteCount > 0 && !t.isDrum);
    // El ORDEN de las pistas no tiene por qué coincidir (el parser real parte
    // cada MTrk por (programa, canal) y las vacías ocupan lugar); lo que importa
    // es que el conjunto de pistas sea el mismo, porque el barrido agrupa por
    // instrumento.
    const orden = (list) =>
      [...list].sort((x, y) =>
        x.program - y.program || x.channel - y.channel || x.notes.join(",").localeCompare(y.notes.join(",")),
      );
    const a2 = orden(a);
    const b2 = orden(b);
    const mismo =
      a2.length === b2.length &&
      a2.every((t, i) =>
        t.program === b2[i].program &&
        t.channel === b2[i].channel &&
        t.notes.join(",") === b2[i].notes.join(","),
      );
    if (mismo) iguales++;
    else fallas.push({ file: path.basename(file), strict: a2, rapido: b2 });
  }
  console.log(`=== VALIDACIÓN DEL ESCÁNER (${files.length} archivos) ===`);
  console.log(`coinciden: ${iguales} · distintos: ${fallas.length}`);
  for (const f of fallas.slice(0, 5)) {
    console.log(`  ${f.file}\n    parser real : ${JSON.stringify(f.strict)}`);
    console.log(`    escáner     : ${JSON.stringify(f.rapido)}`);
  }
  await browser.close();
  process.exit(fallas.length === 0 ? 0 : 1);
}

// ── Modo --file: tabla por pista ───────────────────────────────────────────
if (FILE) {
  const songPath = path.isAbsolute(FILE) ? FILE : path.join(process.cwd(), FILE);
  const tracks = parseSong(songPath);
  if (!tracks) {
    console.error(`no es un MIDI: ${songPath}`);
    process.exit(2);
  }

  // La app resuelve el NOMBRE del instrumento desde el programa: se usa el mismo
  // mapeo para no inventar nombres.
  const named = await page.evaluate(
    ([rows]) =>
      rows.map((r) => ({
        ...r,
        instrument: window.__DIAG.mapping.gmProgramToInstrument(r.program, r.trackName),
      })),
    [tracks],
  );

  // El sampler es UNO por nombre de instrumento: la app le pide la UNIÓN de las
  // notas de todas las pistas que lo usan. La tabla se calcula sobre esa unión y
  // después se recorta por pista, que es lo que realmente suena.
  const porInstrumento = new Map();
  for (const t of named) {
    const set = porInstrumento.get(t.instrument) ?? new Set();
    t.notes.forEach((n) => set.add(n));
    porInstrumento.set(t.instrument, set);
  }

  console.log(`\narchivo: ${path.relative(process.cwd(), songPath)}`);
  const filas = [];
  for (const [instrument, set] of porInstrumento) {
    const notes = [...set].sort((a, b) => a - b);
    const { chain } = await chainFor(instrument, notes);
    const choose = await page.evaluate(FOLD_FN, [notes, chain]);
    filas.push({ instrument, notes, chain, ...choose });
  }

  // ── ANTES: el banco "elegido" era el primer candidato que se construía, sin
  //    mirar el registro. Se reporta su desvío para las mismas notas.
  console.log("\n=== TABLA DE DESVÍOS ===");
  console.log(
    "canal\tprog\tinstrumento\tnotas\trango MIDI\tANTES: banco (registro)\tANTES: peor desvío\tDESPUÉS: reparto",
  );
  for (const t of named) {
    const fila = filas.find((f) => f.instrument === t.instrument);
    const primero = fila.chain.find((r) => r.recorded);
    const antesBanco = primero ? primero.label : "waf (registro en el archivo)";
    const antesRegistro = primero ? RANGE(primero.recorded) : "n/d";
    // Peor desvío ANTES: el banco elegido tocaba TODAS las notas, repitcheando.
    const antesPeor = primero
      ? await page.evaluate(WORST_FN, [t.notes, primero.recorded])
      : "n/d";
    const despues = fila.partes
      .filter((p) => p.notes.some((n) => t.notes.includes(n)))
      .map((p) => {
        const propias = p.notes.filter((n) => t.notes.includes(n));
        return `${p.source} ${RANGE(propias)} (≤${p.worst})`;
      })
      .join(" + ");
    console.log(
      `${t.channel ?? "?"}\t${t.program}\t${t.instrument}\t${t.noteCount}\t${RANGE(t.notes)}\t` +
      `${antesBanco} (${antesRegistro})\t${antesPeor}\t${despues || "—"}`,
    );
  }

  console.log("\n=== CADENA COMPLETA POR INSTRUMENTO ===");
  for (const f of filas) {
    console.log(
      `\n"${f.instrument}" · notas de la canción ${RANGE(f.notes)} (${f.notes.length} distintas)`,
    );
    for (const row of f.chain) {
      console.log(
        `   ${row.label.padEnd(34)} registro ${(row.recorded ? RANGE(row.recorded) : "n/d (archivo)").padEnd(12)}` +
        ` dentro ${RANGE(row.within).padEnd(9)} afuera ${RANGE(row.beyond).padEnd(9)} peor ${row.worstBeyond === Infinity ? "∞" : row.worstBeyond}`,
      );
    }
    console.log(
      `   → reparto: ${f.partes.map((p) => `${p.source} cubre ${RANGE(p.notes)} (desvío ≤${p.worst})`).join(" | ") || "—"}` +
      (f.sinFuente.length ? ` · SIN FUENTE ${RANGE(f.sinFuente)}` : ""),
    );
  }
  writeFileSync(
    path.join(OUTDIR, "desvio-fuentes.json"),
    JSON.stringify({ archivo: songPath, tope, filas }, null, 2),
  );
  await browser.close();
  process.exit(0);
}

// ── Modo --biblioteca: barrido completo ────────────────────────────────────
if (!BIBLIOTECA) {
  console.error("uso: --file <midi> | --biblioteca | --chain <instrumento> [--notes a,b,c]");
  await browser.close();
  process.exit(125);
}

const files = midiFiles();
console.log(`barriendo ${files.length} archivos de app/public/demo…`);

// Se agrupa por (instrumento → conjuntos de notas distintos) para no mandar la
// biblioteca entera al navegador: las notas repetidas se resuelven una vez.
const songs = [];
const porInstrumento = new Map();
let parseados = 0;
let ilegibles = 0;
for (const file of files) {
  if (LIMIT && parseados >= LIMIT) break;
  let tracks;
  try {
    tracks = parseSong(file);
  } catch {
    ilegibles++;
    continue;
  }
  if (!tracks || tracks.length === 0) {
    ilegibles++;
    continue;
  }
  parseados++;
  songs.push({ file: path.basename(file), tracks });
}
console.log(`parseados ${parseados} · ilegibles/vacíos ${ilegibles}`);

const named = await page.evaluate(
  ([rows]) =>
    rows.map((r) => ({
      file: r.file,
      tracks: r.tracks
        .map((t) => ({
          ...t,
          instrument: window.__DIAG.mapping.gmProgramToInstrument(t.program, t.trackName),
        }))
        // Igual que el motor: el piano acústico lo toca el sampler Salamander, así
        // que la capa de fuentes no carga nada para él. Medirlo como "afectado"
        // sería contar pistas que nunca pasan por acá.
        .filter((t) => !window.__DIAG.routing.usesSalamanderPiano(t.instrument)),
    })),
  [songs],
);

for (const song of named) {
  for (const t of song.tracks) {
    const entry = porInstrumento.get(t.instrument) ?? new Map();
    const key = t.notes.join(",");
    const grupo = entry.get(key) ?? { notes: t.notes, songs: [] };
    grupo.songs.push(song.file);
    entry.set(key, grupo);
    porInstrumento.set(t.instrument, entry);
  }
}

console.log(`instrumentos distintos: ${porInstrumento.size}`);

/**
 * Un viaje al navegador por instrumento. Se usa `candidatesFor` (la cadena real,
 * sin bajar nada): los bancos que declaran su registro en el repo son el
 * acordeón de botones, VSCO, tonejs y gleitz. Los candidatos de WebAudioFont
 * traen `recorded: null` porque su registro vive DENTRO del archivo, así que un
 * instrumento cuya cadena EMPIEZA por WAF queda como "n/d" y se cuenta aparte:
 * inventarle un registro sería peor que no medirlo.
 */
const resultado = { porCancion: new Map(), grupos: [], wafPrimeroCanciones: new Set(), wafPrimeroNotas: 0 };
const instrumentos = [...porInstrumento.keys()].sort();
for (const instrument of instrumentos) {
  const grupos = [...porInstrumento.get(instrument).values()];
  const res = await page.evaluate(
    ([inst, gs]) => {
      const { sources } = window.__DIAG;
      const tope = window.__TOPE;
      const cadena = sources.candidatesFor(inst).map((c) => ({
        label: c.label,
        kind: c.kind,
        recorded: c.recorded,
      }));
      const primero = cadena[0];
      const shift = (n, recorded) => {
        let best = Infinity;
        for (const r of recorded) {
          const d = Math.abs(r - n);
          if (d < best) best = d;
        }
        return best;
      };
      return {
        cadena: cadena.map((c) => ({ label: c.label, kind: c.kind, notas: c.recorded ? c.recorded.length : null })),
        primeroDeclara: Boolean(primero?.recorded),
        grupos: gs.map((g) => {
          if (!primero?.recorded) {
            return { songs: g.songs, notes: g.notes.length, nd: true };
          }
          let peor = 0;
          const fuera = [];
          for (const n of g.notes) {
            const d = shift(n, primero.recorded);
            if (d > peor) peor = d;
            if (d > tope) fuera.push(n);
          }
          // ¿Alguna fuente POSTERIOR con registro declarado cubre esas notas
          // dentro del tope? (la cadena de respaldo: VSCO/tonejs/gleitz)
          const restantes = [];
          for (const n of fuera) {
            const cubierta = cadena
              .slice(1)
              .some((c) => c.recorded && shift(n, c.recorded) <= tope);
            if (!cubierta) restantes.push(n);
          }
          // Reparto por registro: muchas notas "fuera del tope" de un archivo son
          // MIDI 0–20 o 109–127, o sea datos fuera de todo instrumento real (el
          // piano llega a A0–C8 = 21–108). Se cuentan aparte para no inflar el
          // número que justifica la regla.
          const buckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-108": 0, "109-127": 0 };
          for (const n of fuera) {
            if (n <= 20) buckets["0-20"]++;
            else if (n <= 40) buckets["21-40"]++;
            else if (n <= 60) buckets["41-60"]++;
            else if (n <= 80) buckets["61-80"]++;
            else if (n <= 108) buckets["81-108"]++;
            else buckets["109-127"]++;
          }
          return {
            songs: g.songs,
            notes: g.notes.length,
            nd: false,
            elegido: primero.label,
            peor,
            exceden: fuera.length,
            fueraDeRango: buckets["0-20"] + buckets["109-127"],
            sinRespaldo: restantes.length,
            buckets,
            muestra: fuera.slice(0, 12),
          };
        }),
      };
    },
    [instrument, grupos],
  );

  for (const row of res.grupos) {
    if (row.nd) {
      for (const file of row.songs) resultado.wafPrimeroCanciones.add(file);
      resultado.wafPrimeroNotas += row.notes * row.songs.length;
      continue;
    }
    if (row.exceden === 0) continue;
    resultado.grupos.push({ instrument, cadena: res.cadena, ...row });
    for (const file of row.songs) {
      const acc = resultado.porCancion.get(file) ?? {
        notas: 0,
        sinRespaldo: 0,
        fueraDeRango: 0,
        instrumentos: new Set(),
      };
      acc.notas += row.exceden;
      acc.sinRespaldo += row.sinRespaldo;
      acc.fueraDeRango += row.fueraDeRango;
      acc.instrumentos.add(instrument);
      resultado.porCancion.set(file, acc);
    }
  }
}

const cancionesAfectadas = [...resultado.porCancion.entries()].map(([file, v]) => ({
  file,
  notas: v.notas,
  sinRespaldo: v.sinRespaldo,
  fueraDeRango: v.fueraDeRango,
  instrumentos: [...v.instrumentos],
}));
const notasTotales = cancionesAfectadas.reduce((a, c) => a + c.notas, 0);
const notasSinRespaldo = cancionesAfectadas.reduce((a, c) => a + c.sinRespaldo, 0);
const notasFueraDeRango = cancionesAfectadas.reduce((a, c) => a + c.fueraDeRango, 0);

console.log("\n=== BARRIDO DE LA BIBLIOTECA (notas que exceden el tope del banco elegido) ===");
console.log(`canciones analizadas : ${named.length}`);
console.log(`canciones afectadas  : ${cancionesAfectadas.length} (${((cancionesAfectadas.length / Math.max(1, named.length)) * 100).toFixed(1)} %)`);
console.log(`notas afectadas      : ${notasTotales}`);
console.log(`  · en registro de piano (MIDI 21–108): ${notasTotales - notasFueraDeRango}`);
console.log(`  · FUERA de todo instrumento real (MIDI 0–20 o 109–127, dato basura del archivo): ${notasFueraDeRango}`);
console.log(`  · sin fuente de respaldo con registro declarado: ${notasSinRespaldo}`);
console.log(`pares (canción, instrumento) afectados: ${resultado.grupos.length}`);
console.log(`canciones cuyo PRIMER banco es WebAudioFont (registro dentro del archivo, no medible acá): ${resultado.wafPrimeroCanciones.size}`);

console.log("\n=== TOP 10 PEORES CANCIONES ===");
cancionesAfectadas
  .sort((a, b) => b.notas - a.notas)
  .slice(0, 10)
  .forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. ${String(c.notas).padStart(6)} notas ` +
      `(${c.notas - c.fueraDeRango} en registro 21–108, ${c.fueraDeRango} basura 0–20/109–127; ${c.sinRespaldo} sin respaldo) · ` +
      `${c.instrumentos.join(", ")} · ${c.file}`,
    );
  });

console.log("\n=== TOP 15 (instrumento) POR NOTAS AFECTADAS ===");
resultado.grupos
  .sort((a, b) => b.exceden * b.songs.length - a.exceden * a.songs.length)
  .slice(0, 15)
  .forEach((g, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. ${g.instrument} · ${g.songs.length} canción(es) · ${g.exceden} notas de ${g.notes} fuera de ${g.elegido} ` +
      `(peor desvío ${g.peor}; ${g.fueraDeRango} basura) · sin respaldo declarado ${g.sinRespaldo} · muestra ${g.muestra.join(",")}`,
    );
  });

writeFileSync(
  path.join(OUTDIR, "barrido-desvio-biblioteca.json"),
  JSON.stringify(
    {
      tope,
      archivos: files.length,
      parseados: named.length,
      cancionesAfectadas: cancionesAfectadas.length,
      notasAfectadas: notasTotales,
      notasSinRespaldo,
      cancionesWafPrimero: resultado.wafPrimeroCanciones.size,
      grupos: resultado.grupos,
      canciones: cancionesAfectadas,
    },
    null,
    2,
  ),
);
console.log(`\nresultado: .logs/barrido-desvio-biblioteca.json`);
await browser.close();
