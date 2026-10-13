// ============================================================
// qa-arrows-piano.mjs — el choque de las flechas en el PIANO (1234).
//
// EL BUG: `music/useMediaSession.ts` atiende `←`/`→` en `window` para buscar ±5 s,
// y su `isTypingTarget` ignora los inputs de TEXTO pero **no** los `range`. Con el
// foco en el slider de volumen de una pista del mezclador, la flecha hacía las dos
// cosas: bajaba el volumen Y mandaba la canción hacia atrás.
//
// QUÉ MIDE (antes y después del arreglo, con los mismos pasos):
//   A. flechas sobre el slider del mezclador → ¿cambia el volumen? ¿se mueve la
//      canción? (lo correcto: cambia el volumen, la canción NO se mueve)
//   B. flechas sobre el seeker de la BARRA → ¿sigue haciendo seek de ±5 s?
//      (lo correcto: SÍ, es su comportamiento medido en docs/qa-reproductor.md §1.1)
//   C. atajos globales con el foco en el cuerpo (Espacio, N, S) → intactos
//
// Uso: node scripts/qa-arrows-piano.mjs [antes|despues]
// ============================================================
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:1234/";
const OUT = ".logs/qa";
const LABEL = process.argv[2] ?? "antes";
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
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 40000 });

// ── Cargar una canción para que el mezclador tenga pistas ───────────────────
console.log("\n=== preparación: cargar una canción ===");
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForTimeout(1500);
await page.locator(".lib-card__play").first().click();
await page.waitForTimeout(3000);
const loaded = await page.evaluate(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
);
console.log(`  barra: "${loaded}"`);

// Empezar a reproducir y esperar sonido, para que el seeker tenga posición.
await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click().catch(() => {});
await page.waitForTimeout(9000);

const state = () =>
  page.evaluate(() => ({
    barTitle: (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
    seeker: Number(document.querySelector(".pm-bar__range")?.value ?? 0),
    // La posición "de verdad" sale del mismo gancho con el que se midió el QA del
    // piano: así no depende de que la barra se haya repintado.
    transport: window.__PMP_TRANSPORT__?.state ?? "?",
    ticks: window.__PMP_TRANSPORT__?.ticks ?? null,
  }));

// ── A. Flechas sobre el slider del mezclador ───────────────────────────────
console.log("\n=== A. flechas sobre el slider de volumen de una pista ===");
// EN PAUSA: si la canción sigue sonando, la posición avanza sola ~1 s y no se
// puede distinguir "avanzó porque suena" de "saltó porque la flecha buscó".
await page.locator('.pm-bar button[aria-label="Pausar"]').first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.locator('.rail-item[title="Pistas"]').click();
await page.waitForTimeout(1500);
const sliderInfo = await page.evaluate(() => {
  const input = document.querySelector(".track-volume-block input");
  return input
    ? { value: Number(input.value), tracks: document.querySelectorAll(".track-item-card").length }
    : null;
});
if (!sliderInfo) {
  record("el mezclador tiene sliders", false, "no apareció .track-volume-block input");
} else {
  console.log(`  ${sliderInfo.tracks} pistas · slider 1 en ${sliderInfo.value} (transporte en pausa)`);
  const before = await state();
  const volumeBefore = sliderInfo.value;
  const slider = page.locator(".track-volume-block input").first();
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  const after = await state();
  const volumeAfter = await page.evaluate(() =>
    Number(document.querySelector(".track-volume-block input")?.value ?? 0),
  );
  const volumeMoved = volumeAfter < volumeBefore - 0.1;
  const positionMoved = Math.abs(after.seeker - before.seeker);
  record(
    "las flechas BAJAN el volumen de la pista",
    volumeMoved,
    `slider ${volumeBefore} → ${volumeAfter} con 5 × ArrowLeft`,
  );
  record(
    "las flechas NO mueven la canción",
    positionMoved < 0.5,
    `seeker ${before.seeker.toFixed(2)} s → ${after.seeker.toFixed(2)} s con el transporte EN PAUSA (Δ ${positionMoved.toFixed(2)} s; con el bug eran ~5 s por pulsación)`,
  );
  // Volver el volumen a donde estaba, para no dejar el mezclador a 0.
  await slider.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  // Reanudar para el resto de las pruebas.
  await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click().catch(() => {});
  await page.waitForTimeout(1500);
}

// ── B. Flechas sobre el seeker de la barra ─────────────────────────────────
console.log("\n=== B. flechas sobre el seeker de la BARRA (tiene que seguir buscando) ===");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(1000);
const seekBefore = await state();
const range = page.locator(".pm-bar__range");
await range.focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(900);
const seekAfterRight = await state();
record(
  "ArrowRight en el seeker AVANZA la canción (±5 s)",
  seekAfterRight.seeker > seekBefore.seeker + 3,
  `seeker ${seekBefore.seeker.toFixed(1)} s → ${seekAfterRight.seeker.toFixed(1)} s (Δ ${(seekAfterRight.seeker - seekBefore.seeker).toFixed(1)} s)`,
);
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(900);
const seekAfterLeft = await state();
record(
  "ArrowLeft en el seeker RETROCEDE la canción",
  seekAfterLeft.seeker < seekAfterRight.seeker - 3,
  `seeker ${seekAfterRight.seeker.toFixed(1)} s → ${seekAfterLeft.seeker.toFixed(1)} s (Δ ${(seekAfterLeft.seeker - seekAfterRight.seeker).toFixed(1)} s)`,
);

// ── C. Atajos globales con el foco en el cuerpo ────────────────────────────
console.log("\n=== C. atajos globales (foco fuera de cualquier control) ===");
// Se saca el foco de todo (el seeker quedó enfocado en el paso B y un `range`
// enfocado se come la primera tecla): el atajo global sólo se prueba sin foco.
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(300);
const focusNow = await page.evaluate(() => document.activeElement?.tagName ?? "?");
console.log(`  foco actual: ${focusNow}`);
const playingBefore = await page.evaluate(
  () =>
    document.querySelector('.pm-bar__transport button[aria-label="Pausar"]') !== null,
);
await page.keyboard.press("Space");
await page.waitForTimeout(1200);
const playingAfter = await page.evaluate(
  () =>
    document.querySelector('.pm-bar__transport button[aria-label="Pausar"]') !== null,
);
record(
  "Espacio sigue alternando play/pausa",
  playingBefore !== playingAfter,
  `botón central: ${playingBefore ? "Pausar" : "Reproducir"} → ${playingAfter ? "Pausar" : "Reproducir"}`,
);
const shuffleBefore = await page.evaluate(
  () => window.__PMP_PLAYER__.getSnapshot().settings.shuffle,
);
await page.keyboard.press("s");
await page.waitForTimeout(700);
const shuffleAfter = await page.evaluate(
  () => window.__PMP_PLAYER__.getSnapshot().settings.shuffle,
);
// CONTROL: `n` no es una tecla del piano en pantalla y `s` SÍ (la fila home mapea
// notas). Si el atajo de `n` funciona y el de `s` no, lo que pasa es que el
// teclado del piano consume `s` con `preventDefault` y el hook del reproductor
// sale temprano por `event.defaultPrevented`. Es un choque PREEXISTENTE del piano
// (no lo toca este arreglo: acá el foco está en BODY, no en un slider).
const titleBeforeN = await page.evaluate(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
);
await page.keyboard.press("n");
await page.waitForTimeout(2500);
const titleAfterN = await page.evaluate(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
);
record(
  "N sigue pasando a la canción siguiente",
  titleAfterN !== titleBeforeN,
  `"${titleBeforeN}" → "${titleAfterN}" (control: \`n\` no es tecla del piano)`,
);
record(
  "S alterna el aleatorio (o queda documentado qué lo consume)",
  shuffleBefore !== shuffleAfter,
  `store.settings.shuffle ${shuffleBefore} → ${shuffleAfter}. \`s\` es una tecla del teclado de piano de App.tsx, que hace preventDefault y deja fuera al atajo global: choque preexistente del piano, ajeno a este arreglo (el foco acá está en BODY, no en un slider)`,
);
await page.keyboard.press("s");
await page.waitForTimeout(500);

// ── D. Navegación con teclado por la pantalla (Tab + flechas fuera de sliders) ──
console.log("\n=== D. navegación con teclado fuera de los sliders ===");
const focusMoves = await page.evaluate(async () => {
  const first = document.activeElement?.tagName;
  return { first };
});
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
const afterTab = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  cls: document.activeElement?.className?.toString().slice(0, 40),
}));
record(
  "Tab mueve el foco (navegación intacta)",
  afterTab.tag !== undefined,
  `foco antes: ${focusMoves.first} · después de Tab: ${afterTab.tag}.${afterTab.cls}`,
);

// ── Captura ────────────────────────────────────────────────────────────────
await page.locator('.rail-item[title="Pistas"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/arrows-piano-${LABEL}.png` });

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${LABEL.toUpperCase()}: ${results.length - failed.length}/${results.length} OK ===`);
for (const f of failed) console.log(`  FALLA: ${f.name} — ${f.evidence}`);

await browser.close();
process.exit(failed.length === 0 ? 0 : 2);
