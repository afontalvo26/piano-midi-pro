#!/usr/bin/env node
// =============================================================================
//  migrate-to-shared.mjs — codemod de imports para la migración a `packages/`
// =============================================================================
//
//  POR QUÉ EXISTE
//  --------------
//  El código compartido (motor de audio, componentes, estado del reproductor,
//  utilidades) vivía DENTRO del piano (`app/src/**`) y el reproductor lo
//  importaba por alias (`@app/*`, `@engine/*`). Eso hacía que cada función
//  nueva naciera del lado equivocado. La migración mueve esos subárboles a
//  `packages/**` (hogar neutro) y este script reescribe los imports para que
//  nada quede apuntando a una ruta que ya no existe.
//
//  Mover 96 archivos a mano y arreglar ~200 imports a ojo es exactamente el
//  tipo de tarea en la que se cuela un `../` de menos y la app deja de
//  compilar. Esto lo hace de forma mecánica, revisable y con `--dry-run`.
//
//  CÓMO FUNCIONA (y por qué así)
//  -----------------------------
//  La clave es NO resolver contra el disco. Un import relativo dentro de un
//  archivo que se movió apunta a una ruta que ya no existe, así que
//  resolverlo "donde está ahora" da basura. En cambio:
//
//    1. Se toma el archivo en su ubicación PRE-movimiento (la tabla `MOVES`
//       sabe cuál era).
//    2. Se resuelve el especificador contra esa ubicación → ruta destino
//       PRE-movimiento. Esto vale tanto si el `git mv` ya se hizo como si no.
//    3. Se aplica la tabla a las DOS puntas (origen y destino) → ubicaciones
//       POST-movimiento.
//    4. Se emite el especificador canónico para el destino post-movimiento:
//         · bajo `packages/`  → `@shared/<resto>`
//         · bajo `app/src/`   → relativo si el origen también es de la app
//                               (estilo propio de la app, sin alias de más)
//                             → `@app/<resto>` si el origen es compartido
//                               (DEPENDENCIA INVERSA: se reporta)
//
//  Consecuencia práctica: el script se puede correr ANTES del `git mv` (para
//  ver el alcance real con `--dry-run`) o DESPUÉS (para aplicar), y da el
//  mismo resultado. El orden recomendado de aplicación es después del mv,
//  porque así el commit queda "movimiento + imports" y no hay ventana en la
//  que la app apunte a rutas inexistentes.
//
//  USO
//  ---
//    node scripts/migrate-to-shared.mjs --dry-run            # reporte, no escribe
//    node scripts/migrate-to-shared.mjs --dry-run --stage=2  # sólo la fase 2
//    node scripts/migrate-to-shared.mjs --apply --stage=2    # aplica (fase 2)
//    node scripts/migrate-to-shared.mjs --apply --stage=3    # aplica (fase 3)
//
//  BANDERAS
//  --------
//    --dry-run            No escribe nada. Lista cada cambio. (por defecto NO
//                         escribe: hay que pedir `--apply` explícitamente,
//                         porque un codemod que escribe por omisión es un
//                         codemod que alguien va a correr por accidente.)
//    --apply              Aplica los cambios en disco.
//    --stage=2|3|all      Qué movimientos se consideran hechos (por defecto all).
//    --only=<subárbol>    Limita a un subárbol (ej. `--only=engine`).
//    --verbose            Lista también los archivos sin cambios.
//    --no-color           Sin secuencias ANSI (para logs).
//    --workers-to-packages
//                         Además del listado autorizado, mueve `app/src/workers`
//                         → `packages/workers`. Ver "DECISIÓN PENDIENTE" abajo.
//
//  DECISIÓN PENDIENTE (una sola, y está medida)
//  --------------------------------------------
//  `app/src/utils/midiWorkerClient.ts` (que se mueve a `packages/utils/`)
//  crea su worker con:
//      new URL("../workers/midiParser.worker.ts", import.meta.url)
//  `app/src/workers/` NO está en la lista de movimientos del dueño, así que
//  tras la fase 2 esa ruta se rompe. El script la reescribe a
//  `../../../app/src/workers/midiParser.worker.ts` para que nada se rompa,
//  pero eso deja una DEPENDENCIA INVERSA (código compartido → código del
//  piano) que contradice el objetivo del encargo. La alternativa limpia es
//  `--workers-to-packages` (mover ese único archivo, que las dos apps usan).
//  La decisión es del dueño; el script avisa fuerte en los dos casos.
// =============================================================================

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── rutas base ───────────────────────────────────────────────────────────────
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Normaliza a separadores `/` (las rutas del repo siempre se comparan así). */
const posix = (p) => p.split(path.sep).join("/");

// ── tabla de movimientos: la ÚNICA fuente de verdad ──────────────────────────
//
// Refleja el diseño ya decidido. `stage` es la fase del encargo en la que se
// hace el movimiento, para poder migrar por etapas y commitear por separado.
//
// `kind: "file"` existe por `components/score/PartMixer.tsx`: el dueño pidió
// mover ESE archivo, no la carpeta `score/` entera (ScoreViewer,
// ScoreInfoBar, ImportPanel y scoreCache se quedan en el piano).
const MOVES = [
  // ── FASE 2 — motor y utilidades puras (bajo riesgo) ──
  { stage: 2, kind: "dir", from: "app/src/engine", to: "packages/engine" },
  { stage: 2, kind: "dir", from: "app/src/utils", to: "packages/utils" },
  { stage: 2, kind: "dir", from: "app/src/audio", to: "packages/audio" },
  { stage: 2, kind: "dir", from: "app/src/types", to: "packages/types" },
  { stage: 2, kind: "dir", from: "app/src/constants", to: "packages/constants" },
  { stage: 2, kind: "dir", from: "app/src/music", to: "packages/music" },

  // ── FASE 3 — componentes compartidos y su CSS ──
  { stage: 3, kind: "dir", from: "app/src/components/player", to: "packages/components/player" },
  { stage: 3, kind: "dir", from: "app/src/components/library", to: "packages/components/library" },
  { stage: 3, kind: "dir", from: "app/src/components/songs", to: "packages/components/songs" },
  { stage: 3, kind: "dir", from: "app/src/components/common", to: "packages/components/common" },
  {
    stage: 3,
    kind: "file",
    from: "app/src/components/score/PartMixer.tsx",
    to: "packages/components/score/PartMixer.tsx",
  },

  // ── Movimiento NO autorizado explícitamente; se activa con una bandera ──
  // (ver "DECISIÓN PENDIENTE" en la cabecera)
  {
    stage: 2,
    kind: "dir",
    from: "app/src/workers",
    to: "packages/workers",
    optIn: "workers-to-packages",
  },
];

/** Alias viejos que hay que traducir a ruta antes de decidir nada. */
const ALIASES = [
  { re: /^@engine\//, base: "app/src/engine" },
  { re: /^@app\//, base: "app/src" },
  { re: /^@shared\//, base: "packages" },
];

// ── argumentos ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const APPLY = has("--apply");
const VERBOSE = has("--verbose");
const COLOR = !has("--no-color");
const ONLY = valueOf("only", "");
const STAGE_RAW = valueOf("stage", "all");
const STAGE = STAGE_RAW === "all" ? 3 : Number(STAGE_RAW);
const OPT_INS = new Set(has("--workers-to-packages") ? ["workers-to-packages"] : []);

if (!Number.isInteger(STAGE) || STAGE < 2 || STAGE > 3) {
  console.error(`[codemod] --stage inválido: ${STAGE_RAW} (esperado 2, 3 o all)`);
  process.exit(125);
}

const c = {
  dim: (s) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  grn: (s) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  yel: (s) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (COLOR ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
};

// ── la tabla, ya filtrada por fase y por opt-in ──────────────────────────────
const activeMoves = MOVES.filter(
  (m) => m.stage <= STAGE && (!m.optIn || OPT_INS.has(m.optIn)),
);
const skippedMoves = MOVES.filter((m) => m.optIn && !OPT_INS.has(m.optIn));

/**
 * ¿`rel` cae dentro de `prefix`? Compara por segmentos: `app/src/types` NO
 * debe matchear `app/src/typesExtra`, y eso sólo se ve mirando la barra.
 */
function under(rel, prefix) {
  return rel === prefix || rel.startsWith(`${prefix}/`);
}

/**
 * Ubicación POST-movimiento de una ruta que hoy está en `rel`.
 *
 * Si `rel` está fuera de todo subárbol movido, se devuelve igual: la mayoría
 * de los archivos (App.tsx, los componentes exclusivos del piano) se quedan.
 */
function afterMove(rel) {
  for (const m of activeMoves) {
    if (m.kind === "file") {
      if (rel === m.from) return m.to;
      continue;
    }
    if (under(rel, m.from)) return m.to + rel.slice(m.from.length);
  }
  return rel;
}

/**
 * Ubicación PRE-movimiento de una ruta. Es la inversa de `afterMove` y sirve
 * para saber de dónde salió un archivo que ya está en `packages/`.
 */
function beforeMove(rel) {
  for (const m of activeMoves) {
    if (m.kind === "file") {
      if (rel === m.to) return m.from;
      continue;
    }
    if (under(rel, m.to)) return m.from + rel.slice(m.to.length);
  }
  return rel;
}

/** ¿La ruta (pre-movimiento) va a terminar bajo `packages/`? */
const movesToPackages = (preRel) => afterMove(preRel).startsWith("packages/");

// ── resolución de un especificador a ruta de repo (pre-movimiento) ───────────

/**
 * Devuelve la ruta destino PRE-movimiento, o `null` si el especificador es de
 * un paquete instalado (`react`, `tone`, `@tonejs/midi`…), que no se toca.
 *
 * `sourcePre` es la ruta del archivo que importa, también pre-movimiento: los
 * relativos se resuelven contra SU ubicación original, no contra la actual.
 */
function resolveSpecifier(sourcePre, spec) {
  if (spec.startsWith(".")) {
    const fromDir = posix(path.posix.dirname(sourcePre));
    return path.posix.normalize(path.posix.join(fromDir, spec));
  }
  for (const a of ALIASES) {
    if (a.re.test(spec)) {
      const rest = spec.replace(a.re, "");
      return path.posix.normalize(`${a.base}/${rest}`);
    }
  }
  return null;
}

/** ¿Existe algo en esa ruta? Prueba extensiones y `index`, como el bundler. */
const EXT_TRIES = ["", ".ts", ".tsx", ".css", ".json", "/index.ts", "/index.tsx"];
function existsAsModule(rel) {
  return EXT_TRIES.some((ext) => existsSync(path.join(REPO, rel + ext)));
}

/**
 * ¿El import es sólo de tipos (`import type` / `export type`)?
 *
 * Importa para clasificar las dependencias inversas: una que sólo trae tipos
 * se borra al compilar (`verbatimModuleSyntax` la elimina), así que acopla el
 * build pero NO el runtime. Es una diferencia que cambia la decisión.
 */
function isTypeOnly(text, specStart) {
  const stmtStart = Math.max(
    text.lastIndexOf("\n", specStart),
    text.lastIndexOf(";", specStart),
  );
  const head = text.slice(stmtStart + 1, specStart);
  return /^\s*(?:import|export)\s+type\b/.test(head);
}

// ── emisión del especificador canónico ──────────────────────────────────────

/**
 * Especificador nuevo para llegar de `sourceAfter` a `targetAfter`.
 *
 * `form` importa en un caso: `new URL("...", import.meta.url)` NO acepta
 * alias (Vite lo resuelve estáticamente como ruta de archivo), así que ahí
 * siempre se emite un relativo aunque el destino sea del piano.
 */
function canonicalSpecifier(sourceAfter, targetAfter, form) {
  const relFromSource = posix(
    path.posix.relative(posix(path.posix.dirname(sourceAfter)), targetAfter),
  );
  const relSpec = relFromSource.startsWith(".") ? relFromSource : `./${relFromSource}`;

  if (form === "url") return relSpec;

  // El destino vive en el hogar neutro → alias compartido, desde donde sea.
  if (under(targetAfter, "packages")) {
    return `@shared/${targetAfter.slice("packages/".length)}`;
  }

  // El destino se queda en el piano.
  if (under(targetAfter, "app/src")) {
    // Si el origen también es del piano, relativo: es el estilo que la app
    // ya usa en sus 6.500 líneas y no mete un alias nuevo donde no hace falta.
    if (under(sourceAfter, "app/src")) return relSpec;
    // Origen compartido o del reproductor → alias hacia la app (DEPENDENCIA
    // INVERSA; el reporte la marca).
    return `@app/${targetAfter.slice("app/src/".length)}`;
  }

  // Fuera de `app/src` (assets de `app/src/assets`, `app/public`, etc.):
  // relativo, que es lo único que el bundler resuelve sin alias.
  return relSpec;
}

// ── extracción de especificadores ───────────────────────────────────────────
//
// Cada matcher captura el especificador en el grupo 2 y expone su rango para
// poder reconstruir el archivo reemplazando de atrás hacia adelante. Es
// delimitado a propósito: un regex laxo tipo `(\w+\s*)?(["'])([^"']+)\2`
// también matchea `console.log("./raro")` y reescribiría un string que no es
// un import.
const MATCHERS = [
  // import ... from "X"   /   export ... from "X"
  {
    form: "module",
    re: /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*(["'])([^"'`\n]+)\1/gm,
  },
  // import "X"   (efecto de lado: los CSS entran por acá)
  { form: "module", re: /^[ \t]*import\s*(["'])([^"'`\n]+)\1/gm },
  // import("X")  — incluye el uso en posición de tipo: import("../types/score").FlatNote
  { form: "module", re: /\bimport\s*\(\s*(["'])([^"'`\n]+)\1\s*\)/g },
  // new URL("X", import.meta.url)  — el worker
  { form: "url", re: /\bnew\s+URL\s*\(\s*(["'])([^"'`\n]+)\1\s*,\s*import\.meta\.url\s*\)/g },
  // CSS: @import "X"
  { form: "css", re: /@import\s+(?:url\(\s*)?(["'])([^"')\n;]+)\1/g },
];

/** ¿Este especificador merece que lo miremos? */
function isCandidate(spec) {
  if (spec.startsWith("./") || spec.startsWith("../")) return true;
  return ALIASES.some((a) => a.re.test(spec));
}

/**
 * Analiza un archivo y devuelve `{ edits, stats }`.
 * `edits` = [{ line, from, to, form, inverse }] — sólo los que cambian.
 */
function analyzeFile(rel, text) {
  const sourcePre = beforeMove(rel);
  const sourceAfter = afterMove(sourcePre);
  const edits = [];
  const seen = new Set();

  for (const { form, re } of MATCHERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const spec = m[2];
      if (!isCandidate(spec)) continue;

      // Rango exacto del especificador dentro del archivo (sin las comillas).
      const specStart = m.index + m[0].lastIndexOf(spec);
      if (seen.has(specStart)) continue;
      seen.add(specStart);

      const targetPre = resolveSpecifier(sourcePre, spec);
      if (targetPre === null) continue;

      const targetAfter = afterMove(targetPre);
      const next = canonicalSpecifier(sourceAfter, targetAfter, form);
      if (next === spec) continue;

      const line = text.slice(0, specStart).split("\n").length;
      edits.push({
        start: specStart,
        end: specStart + spec.length,
        line,
        from: spec,
        to: next,
        form,
        // Heurística de reporte: el origen termina compartido y el destino no.
        inverse: under(sourceAfter, "packages") && !under(targetAfter, "packages"),
        typeOnly: isTypeOnly(text, specStart),
        // La verificación se hace contra la ruta PRE-movimiento: es la que
        // existe en disco ahora, y el movimiento es mecánico, así que si el
        // destino pre-movimiento existe, el post-movimiento también. Chequear
        // la ruta POST-movimiento daría "no existe" para todos los `@shared/*`
        // cuando el codemod corre en dry-run ANTES del `git mv`.
        broken: !existsAsModule(targetPre),
        targetPre,
        targetAfter,
      });
    }
  }

  edits.sort((a, b) => a.start - b.start);
  return edits;
}

/** Reemplaza de atrás hacia adelante para que los índices no se corran. */
function applyEdits(text, edits) {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.to + out.slice(e.end);
  }
  return out;
}

// ── recorrido de archivos ───────────────────────────────────────────────────
const SCAN_ROOTS = ["app/src", "player/src", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".logs", "test-results"]);
const EXT_OK = new Set([".ts", ".tsx", ".css"]);

async function walk(root, out = []) {
  const abs = path.join(REPO, root);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return out;
  const entries = await readdir(abs, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = `${root}/${e.name}`;
    if (e.isDirectory()) await walk(rel, out);
    else if (EXT_OK.has(path.extname(e.name))) out.push(rel);
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────
const files = (await Promise.all(SCAN_ROOTS.map((r) => walk(r)))).flat().sort();

const report = {
  files: files.length,
  changedFiles: 0,
  edits: 0,
  toShared: 0,
  inverse: 0,
  broken: 0,
  byFile: [],
};
const inverseList = [];
const brokenList = [];

for (const rel of files) {
  if (ONLY && !rel.includes(`/${ONLY}/`) && !rel.includes(ONLY)) continue;

  const text = readFileSync(path.join(REPO, rel), "utf8");
  const edits = analyzeFile(rel, text);
  if (edits.length === 0) {
    if (VERBOSE) console.log(c.dim(`  = ${rel} (sin cambios)`));
    continue;
  }

  report.changedFiles += 1;
  report.edits += edits.length;
  report.byFile.push({ rel, count: edits.length });

  for (const e of edits) {
    if (e.to.startsWith("@shared/")) report.toShared += 1;
    if (e.inverse) {
      report.inverse += 1;
      inverseList.push({ rel, ...e });
    }
    if (e.broken) {
      report.broken += 1;
      brokenList.push({ rel, ...e });
    }
  }

  if (!APPLY) {
    console.log(c.bold(rel));
    for (const e of edits) {
      const tag = e.inverse
        ? c.yel(e.typeOnly ? " [DEP. INVERSA · tipos]" : " [DEP. INVERSA · RUNTIME]")
        : e.broken
          ? c.red(" [DESTINO INEXISTENTE]")
          : "";
      console.log(`  ${c.dim(String(e.line).padStart(4))}  ${e.from} ${c.cyan("→")} ${e.to}${tag}`);
    }
  } else {
    writeFileSync(path.join(REPO, rel), applyEdits(text, edits), "utf8");
    console.log(`${c.grn("✓")} ${rel} ${c.dim(`(${edits.length} import(s)`)}`);
  }
}

// ── resumen ─────────────────────────────────────────────────────────────────
const mode = APPLY ? c.grn("APLICADO") : c.yel("DRY-RUN (no se escribió nada)");
console.log("");
console.log(c.bold("─".repeat(72)));
console.log(`[codemod] modo          : ${mode}`);
console.log(`[codemod] fase          : ${STAGE_RAW}${ONLY ? `  ·  only=${ONLY}` : ""}`);
console.log(`[codemod] movimientos   : ${activeMoves.length} subtítulos del repo`);
for (const m of activeMoves) {
  console.log(c.dim(`             · ${m.from} → ${m.to}`));
}
for (const m of skippedMoves) {
  console.log(c.yel(`             · OMITIDO (falta --${m.optIn}): ${m.from} → ${m.to}`));
}
console.log(`[codemod] archivos      : ${report.files} recorridos, ${report.changedFiles} con cambios`);
console.log(`[codemod] imports       : ${report.edits} reescritos (${report.toShared} → @shared/*)`);

if (report.inverse > 0) {
  const typeOnlyCount = inverseList.filter((e) => e.typeOnly).length;
  const runtimeCount = report.inverse - typeOnlyCount;
  console.log("");
  console.log(
    c.yel(`[codemod] ⚠ ${report.inverse} DEPENDENCIA(S) INVERSA(S):`) +
      c.dim(` ${runtimeCount} de runtime, ${typeOnlyCount} sólo de tipos`),
  );
  console.log(
    c.dim("          Código compartido que necesita código que se queda en el piano."),
  );
  console.log(
    c.dim("          El script las deja compilando (con `@app/*`), pero contradicen el encargo."),
  );
  for (const e of inverseList) {
    const kind = e.typeOnly ? c.dim("(tipos)") : c.red("(RUNTIME)");
    console.log(`            ${e.rel}:${e.line}  ${e.from} → ${e.to} ${kind}`);
  }
}

if (report.broken > 0) {
  console.log("");
  console.log(c.red(`[codemod] ✗ ${report.broken} destino(s) que NO existen como módulo:`));
  for (const e of brokenList) {
    console.log(`            ${e.rel}:${e.line}  ${e.from} → ${e.to}`);
  }
  console.log(c.dim("          Revisar: puede ser un asset (no es .ts/.css) o un error de la tabla."));
} else if (report.edits > 0) {
  console.log(c.grn("[codemod] ✓ todos los destinos reescritos resuelven a un módulo real"));
}

console.log(c.bold("─".repeat(72)));
if (!APPLY) {
  console.log(c.dim("[codemod] para aplicar: agregar --apply"));
}
process.exit(report.broken > 0 ? 1 : 0);
