// ============================================================
// qa-player-atajos.mjs — atajos de teclado del reproductor (1235).
//
// CONTEXTO: en el piano (1234) los atajos de LETRA no funcionan: su teclado de
// computadora mapea `s`=C#3, `n`=A3, `p`=E5… y hace `preventDefault`, así que el
// hook compartido (`music/useMediaSession`) sale temprano por
// `event.defaultPrevented`. El reproductor NO tiene teclado de piano, así que ahí
// los atajos tienen que funcionar. Esto lo mide.
//
// Uso: node scripts/qa-player-atajos.mjs
// ============================================================
import { chromium } from "playwright";

const BASE = "http://localhost:1235/";
const results = [];
const record = (name, ok, evidence) => {
  results.push({ name, ok });
  console.log(`  ${ok ? "OK  " : "FALLA"} ${name} — ${evidence}`);
};

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(
  () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
  null,
  { timeout: 150000 },
);
await page.waitForTimeout(1500);

// Una canción cargada y sonando, con el foco fuera de todo.
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(700);
await page
  .locator(".pm-shelf")
  .filter({ hasText: "Vallenato" })
  .locator(".pm-card__info")
  .filter({ hasText: "El Osito Dormilón" })
  .first()
  .click();
await page.waitForTimeout(9000);
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(300);

const store = () =>
  page.evaluate(() => ({
    shuffle: window.__PMP_PLAYER__.getSnapshot().settings.shuffle,
    repeat: window.__PMP_PLAYER__.getSnapshot().settings.repeat,
    volume: window.__PMP_PLAYER__.getSnapshot().settings.volume,
    muted: window.__PMP_PLAYER__.getSnapshot().settings.muted,
    title: (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
    paused: window.__PMP_PLAYER__.getSnapshot().paused,
  }));

console.log("\n=== atajos de teclado en el reproductor (foco fuera de todo) ===");
const focus = await page.evaluate(() => document.activeElement?.tagName ?? "?");
console.log(`  foco: ${focus}`);

// N = siguiente
const beforeN = await store();
await page.keyboard.press("n");
await page.waitForTimeout(3000);
const afterN = await store();
record(
  "N pasa a la canción siguiente",
  afterN.title !== beforeN.title,
  `"${beforeN.title}" → "${afterN.title}"`,
);

// Espacio = play/pausa
const beforeSpace = await store();
await page.keyboard.press("Space");
await page.waitForTimeout(1200);
const afterSpace = await store();
record(
  "Espacio alterna play/pausa",
  beforeSpace.paused !== afterSpace.paused,
  `paused ${beforeSpace.paused} → ${afterSpace.paused}`,
);

// S = aleatorio
const beforeS = await store();
await page.keyboard.press("s");
await page.waitForTimeout(700);
const afterS = await store();
record("S alterna el aleatorio", beforeS.shuffle !== afterS.shuffle, `shuffle ${beforeS.shuffle} → ${afterS.shuffle}`);

// R = repetir (cicla)
const beforeR = await store();
await page.keyboard.press("r");
await page.waitForTimeout(700);
const afterR = await store();
record("R cicla el repetir", beforeR.repeat !== afterR.repeat, `repeat ${beforeR.repeat} → ${afterR.repeat}`);

// M = silenciar
const beforeM = await store();
await page.keyboard.press("m");
await page.waitForTimeout(700);
const afterM = await store();
record("M silencia", beforeM.muted !== afterM.muted, `muted ${beforeM.muted} → ${afterM.muted}`);
await page.keyboard.press("m");
await page.waitForTimeout(500);

// Arriba/abajo = volumen maestro
const beforeVol = await store();
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(700);
const afterVol = await store();
record(
  "Flechas arriba/abajo mueven el volumen maestro",
  afterVol.volume < beforeVol.volume - 0.05,
  `volume ${beforeVol.volume} → ${afterVol.volume}`,
);

// P = anterior
const beforeP = await store();
await page.keyboard.press("p");
await page.waitForTimeout(3000);
const afterP = await store();
record("P vuelve a la canción anterior", afterP.title !== beforeP.title, `"${beforeP.title}" → "${afterP.title}"`);

const failed = results.filter((r) => !r.ok);
console.log(`\n=== RESUMEN: ${results.length - failed.length}/${results.length} OK ===`);
for (const f of failed) console.log(`  FALLA: ${f.name}`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 2);
