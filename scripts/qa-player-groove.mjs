// ============================================================
// qa-player-groove.mjs — la perilla Groove, medida en el REPRODUCTOR (1235).
//
// CRITERIO DE ACEPTACIÓN DEL DUEÑO: alguien que abre SÓLO http://localhost:1235
// tiene que poder subir la perilla y escuchar el efecto, sin abrir el piano.
//
// QUÉ MIDE (con números, no a ojo):
//   1. La perilla existe en la UI del reproductor, con su valor en % y el
//      subtítulo que explica qué hace (microtiming + dinámica).
//   2. Persiste en `localStorage` con la MISMA clave que el piano
//      (`piano_groove_amount`), así que el valor es el mismo en los dos.
//   3. Funciona con MOUSE (arrastre) y con TECLADO (flechas), y las flechas NO
//      buscan en la canción (el choque del atajo global con los `range`).
//   4. Al dar play con la perilla arriba, el plan agendado CAMBIA de verdad:
//      `window.__PLAYER_GROOVE__` publica el plan exacto que fue al Transport.
//      · A 0 %: los ticks de TODAS las notas son idénticos a la fórmula sin
//        perilla, y las velocities son las escritas (identidad exacta).
//      · A 100 %: hay desvío, se respetan los topes de `@engine/groove`
//        (|offset| ≤ 15 ms) y la media por pista NO deriva (re-anclado por compás).
//   5. Captura de la perilla en `.logs/qa/`.
//
// Uso: node scripts/qa-player-groove.mjs
// ============================================================
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:1235/";
const OUT = ".logs/qa/player-vs-piano";
const SONG = "El Osito Dormilón";
const GROOVE_KEY = "piano_groove_amount";

mkdirSync(OUT, { recursive: true });

const results = [];
function record(name, ok, evidence) {
  results.push({ name, ok, evidence });
  console.log(`  ${ok ? "OK  " : "FALLA"} ${name} — ${evidence}`);
}

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Sólo errores PROPIOS: los 404 del CDN de webaudiofont y los `blob:` del
  // MediaSession también los produce el piano (medido en qa-player-consola.mjs).
  const where = m.location()?.url ?? "";
  if (/webaudiofontdata|^blob:/.test(where) || /ERR_FILE_NOT_FOUND/.test(m.text())) {
    return;
  }
  errors.push(`${m.text().slice(0, 120)} ← ${where.slice(0, 60)}`);
});
page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 150)}`));

console.log("\n=== Groove en el reproductor (1235) ===");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(
  () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
  null,
  { timeout: 150000 },
);
await page.waitForTimeout(1500);

// ── 1. El control está en la UI del reproductor ─────────────────────────────
console.log("\n--- 1. el control existe en 1235, sin abrir el piano ---");
await page.locator('.rail-item[title="Ajustes — interpretación (Groove)"]').click();
await page.waitForTimeout(800);
const ui = await page.evaluate(() => {
  const input = document.querySelector("#player-groove");
  const group = input?.closest(".settings-group");
  const row = input?.closest(".settings-row");
  return {
    existe: Boolean(input),
    type: input?.getAttribute("type") ?? null,
    min: input?.getAttribute("min") ?? null,
    max: input?.getAttribute("max") ?? null,
    step: input?.getAttribute("step") ?? null,
    ariaLabel: input?.getAttribute("aria-label") ?? null,
    ariaValueText: input?.getAttribute("aria-valuetext") ?? null,
    // El % es el span que sigue al input (el subtítulo también es un span, pero
    // vive en la otra columna de la fila).
    valorVisible: input?.nextElementSibling?.textContent?.trim() ?? null,
    titulo: group?.querySelector("h3")?.textContent?.trim() ?? null,
    subtitulo: group?.querySelector(".settings-col span")?.textContent?.trim() ?? null,
    aria: group?.querySelector(".settings-col label")?.textContent?.trim() ?? null,
  };
});
record(
  "la perilla Groove está en la pantalla Ajustes del reproductor",
  ui.existe && ui.type === "range" && ui.min === "0" && ui.max === "1" && ui.step === "0.05",
  `input#player-groove type=${ui.type} min=${ui.min} max=${ui.max} step=${ui.step} · título "${ui.titulo}" · etiqueta "${ui.aria}"`,
);
record(
  "muestra el valor en % y el subtítulo de qué hace",
  /^\d+%$/.test(ui.valorVisible ?? "") &&
    /microtiming/i.test(ui.subtitulo ?? "") &&
    /dinámica/i.test(ui.subtitulo ?? ""),
  `valor "${ui.valorVisible}" · aria-valuetext "${ui.ariaValueText}" · subtítulo "${(ui.subtitulo ?? "").slice(0, 100)}…"`,
);
record(
  "la etiqueta accesible nombra el efecto",
  /groove/i.test(ui.ariaLabel ?? "") && /microtiming/i.test(ui.ariaLabel ?? ""),
  `aria-label "${ui.ariaLabel}"`,
);
await page.screenshot({ path: `${OUT}/groove-1235-ajustes.png` });

// ── 2. Persistencia con la MISMA clave del piano ────────────────────────────
console.log("\n--- 2. persistencia con la clave del piano ---");
const slider = page.locator("#player-groove");
// Arrastre real con el mouse hasta ~60 %.
const box = await slider.boundingBox();
await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
const afterDrag = await page.evaluate(
  ([key]) => {
    const input = document.querySelector("#player-groove");
    return {
      value: Number(input?.value),
      label: input?.nextElementSibling?.textContent?.trim(),
      stored: localStorage.getItem(key),
      hostGroove: window.__PLAYER__.grooveAmount(),
    };
  },
  [GROOVE_KEY],
);
record(
  "el arrastre con MOUSE mueve la perilla",
  afterDrag.value > 0.3 && afterDrag.value < 0.9 && afterDrag.label === `${Math.round(afterDrag.value * 100)}%`,
  `value=${afterDrag.value} · etiqueta "${afterDrag.label}"`,
);
record(
  "persiste en localStorage con la clave del piano",
  afterDrag.stored === String(afterDrag.value),
  `localStorage["${GROOVE_KEY}"] = ${afterDrag.stored} (esperado ${afterDrag.value})`,
);
record(
  "el valor llega al motor",
  Math.abs(afterDrag.hostGroove - afterDrag.value) < 0.001,
  `host.groove() = ${afterDrag.hostGroove}`,
);

// ── 3. Teclado: la flecha mueve la perilla y NO busca en la canción ─────────
console.log("\n--- 3. teclado: flechas en la perilla ---");
await slider.focus();
const beforeKeys = await page.evaluate(() => ({
  groove: Number(document.querySelector("#player-groove")?.value),
  position: window.__PLAYER__.position(),
}));
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(400);
const afterKeys = await page.evaluate(() => ({
  groove: Number(document.querySelector("#player-groove")?.value),
  position: window.__PLAYER__.position(),
}));
record(
  "las flechas mueven la perilla (no la canción)",
  afterKeys.groove < beforeKeys.groove - 0.05,
  `valor ${beforeKeys.groove} → ${afterKeys.groove} con 3 × ArrowLeft`,
);
record(
  "y NO buscan en la canción (sin choque con el atajo global)",
  Math.abs(afterKeys.position - beforeKeys.position) < 1.5,
  `posición ${beforeKeys.position.toFixed(2)} s → ${afterKeys.position.toFixed(2)} s (con el atajo global habría saltado −15 s)`,
);
for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
const afterKeysUp = await page.evaluate(() => {
  const input = document.querySelector("#player-groove");
  return {
    groove: Number(input?.value),
    label: input?.nextElementSibling?.textContent?.trim(),
  };
});
record(
  "el teclado también sube la perilla",
  afterKeysUp.groove > afterKeys.groove,
  `valor ${afterKeys.groove} → ${afterKeysUp.groove} ("${afterKeysUp.label}") con 12 × ArrowRight`,
);

// ── 4. El plan agendado cambia de verdad ────────────────────────────────────
console.log("\n--- 4. el plan agendado (medido, no estimado) ---");

/** Reproduce la canción y devuelve el plan que fue al Transport. */
async function planWith(groove) {
  await page.evaluate((value) => {
    // Se escribe el valor por el camino real (el input + su evento), no por el host.
    const input = document.querySelector("#player-groove");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, groove);
  await page.waitForTimeout(400);
  await page.locator('.rail-item[title="Música — tu reproductor"]').click();
  await page.waitForTimeout(600);
  await page
    .locator('.pm-shelf')
    .filter({ hasText: "Vallenato" })
    .locator(".pm-card__info")
    .filter({ hasText: SONG })
    .first()
    .click();
  await page.waitForFunction(() => Boolean(window.__PLAYER_GROOVE__), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  const plan = await page.evaluate(() => {
    const p = window.__PLAYER_GROOVE__;
    return { amount: p.amount, ppq: p.ppq, rows: p.rows, roleOffsets: p.roleOffsets };
  });
  await page.locator('.pm-bar__transport button[aria-label="Pausar"]').click().catch(() => {});
  await page.locator('.rail-item[title="Ajustes — interpretación (Groove)"]').click();
  await page.waitForTimeout(600);
  return plan;
}

const plan0 = await planWith(0);
const identityBreaks = plan0.rows.filter((r) => {
  const expected = Math.round((r.time / 60) * r.bpm * plan0.ppq);
  const expectedEnd = Math.round(
    ((r.time + Math.max(0.04, r.velocityIn > 0 ? 0 : 0)) / 60) * r.bpm * plan0.ppq,
  );
  void expectedEnd;
  return r.ticks !== expected || r.velocityOut !== r.velocityIn || r.offsetMs !== 0;
});
record(
  "a 0 % no cambia NADA: ticks y velocities idénticos a la fórmula sin perilla",
  identityBreaks.length === 0,
  `${plan0.rows.length} notas agendadas · ${identityBreaks.length} con algún cambio (ticks/velocity/offset) · amount=${plan0.amount}`,
);

const plan100 = await planWith(1);
const offsets = plan100.rows.map((r) => r.offsetMs);
const moved = offsets.filter((v) => v !== 0).length;
const maxAbs = Math.max(...offsets.map(Math.abs));
const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
const velocitiesChanged = plan100.rows.filter(
  (r) => r.velocityOut !== r.velocityIn,
).length;

/**
 * DERIVA ACUMULATIVA (R5). Lo que hay que medir NO es "la media del desvío es 0":
 * cada rol tiene un desvío propio a propósito (el bajo va 5 ms detrás, la melodía
 * 1 ms adelante) y encima ese desvío va **escalado por el peso métrico** (R3), así
 * que la media del conjunto es una fracción del offset del rol, no el offset.
 * Lo que R5 promete es que el desvío **no se corre a lo largo de la canción**: el
 * ruido 1/f se re-ancla por compás, así que la media del primer tramo y la del
 * último tienen que ser casi la misma.
 */
const byTrack = new Map();
for (const r of plan100.rows) {
  const list = byTrack.get(r.track) ?? [];
  list.push(r);
  byTrack.set(r.track, list);
}
const driftByTrack = [];
for (const [track, list] of byTrack) {
  const times = list.map((r) => r.time);
  const mid = (Math.min(...times) + Math.max(...times)) / 2;
  const first = list.filter((r) => r.time <= mid).map((r) => r.offsetMs);
  const second = list.filter((r) => r.time > mid).map((r) => r.offsetMs);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  driftByTrack.push({
    track,
    role: list[0].role,
    drift: avg(second) - avg(first),
    max: Math.max(...list.map((r) => Math.abs(r.offsetMs))),
  });
}
const worstDrift = Math.max(...driftByTrack.map((d) => Math.abs(d.drift)));
const worstCentre = Math.max(...driftByTrack.map((d) => Math.abs(d.drift)));

/** Máximo |desvío| por rol (para comprobar R6: la melodía se mueve menos). */
const maxByRole = new Map();
for (const r of plan100.rows) {
  const current = maxByRole.get(r.role) ?? 0;
  maxByRole.set(r.role, Math.max(current, Math.abs(r.offsetMs)));
}

record(
  "a 100 % el plan SÍ cambia: hay microtiming y dinámica",
  moved > 0 && velocitiesChanged > 0,
  `${moved}/${offsets.length} notas con desvío de tiempo · ${velocitiesChanged} con velocity distinta · amount=${plan100.amount}`,
);
record(
  "los topes del módulo se respetan (R4: |desvío| ≤ 15 ms)",
  maxAbs <= 15,
  `|desvío| máximo ${maxAbs.toFixed(2)} ms · medio ${mean.toFixed(3)} ms · tope del módulo 15 ms`,
);
record(
  "sin deriva acumulativa (R5: la primera mitad y la última desvían igual)",
  worstDrift < 1.5,
  `${driftByTrack.length} pistas · peor |segunda mitad − primera mitad| = ${worstDrift.toFixed(3)} ms (${driftByTrack.map((d) => `${d.track}:${d.drift.toFixed(2)}`).join(" ")})`,
);
record(
  "los desvíos están centrados, no sesgados (|media global| ≤ 2 ms)",
  Math.abs(mean) <= 2,
  `media global ${mean.toFixed(3)} ms sobre ${offsets.length} notas · peor |media| por mitad ${worstCentre.toFixed(2)} ms`,
);
record(
  "R6: la melodía se mueve menos que la armonía",
  (maxByRole.get("melody") ?? 0) <= (maxByRole.get("harmony") ?? 0) + 0.01,
  `|desvío| máximo por rol: ${[...maxByRole.entries()].map(([role, value]) => `${role}=${value.toFixed(2)} ms`).join(" · ")}`,
);
record(
  "el cambio es audible en magnitud (varios ms, no ruido de redondeo)",
  maxAbs > 3,
  `desvío máximo ${maxAbs.toFixed(2)} ms; el umbral perceptual de asincronía es ~10-20 ms y el peor caso de diseño 14,4 ms`,
);

// ── 5. Captura con la perilla arriba ────────────────────────────────────────
await page.evaluate((value) => {
  const input = document.querySelector("#player-groove");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, 0.75);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/groove-1235-ajustes-75.png` });

console.log(`\n=== ERRORES DE CONSOLA PROPIOS: ${errors.length} ===`);
for (const e of errors.slice(0, 5)) console.log("  " + e);

const failed = results.filter((r) => !r.ok);
console.log(`\n=== RESUMEN: ${results.length - failed.length}/${results.length} OK ===`);
for (const f of failed) console.log(`  FALLA: ${f.name} — ${f.evidence}`);

await browser.close();
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 2);
