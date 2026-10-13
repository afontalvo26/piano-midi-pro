// ============================================================
// qa-player-consola.mjs — ruido de consola: 1234 vs 1235, en igualdad.
//
// El reproductor tiene que tener el MISMO ruido que el piano, no más. Se abre
// cada uno, se reproduce la misma canción y se listan los errores de consola con
// su ORIGEN (`location().url`) y los pedidos que fallan, para poder decidir si
// algo es nuevo o es el ruido conocido de recursos externos (docs/qa-reproductor.md §3.6).
//
// Uso: node scripts/qa-player-consola.mjs
// ============================================================
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

async function inspect(url, label, act) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  const failed = new Map();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const loc = m.location();
    consoleErrors.push({
      text: m.text().slice(0, 160),
      from: loc?.url ? loc.url.slice(0, 120) : "(sin origen)",
    });
  });
  page.on("pageerror", (e) => consoleErrors.push({ text: `pageerror ${String(e).slice(0, 140)}`, from: "-" }));
  page.on("requestfailed", (r) => {
    const key = `${r.failure()?.errorText ?? "?"}`;
    failed.set(key, (failed.get(key) ?? 0) + 1);
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const key = `HTTP ${r.status()}`;
    failed.set(key, (failed.get(key) ?? 0) + 1);
    failed.set(`HTTP ${r.status()} ${new URL(r.url()).host}`, 1);
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  if (act) await act(page);
  await page.waitForTimeout(6000);

  console.log(`\n=== ${label} (${url}) ===`);
  console.log(`  errores de consola: ${consoleErrors.length}`);
  const grouped = new Map();
  for (const e of consoleErrors) {
    const key = normalize(`${e.text} ← ${e.from}`);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  for (const [key, count] of grouped) console.log(`    ×${count} ${key}`);
  console.log("  pedidos fallidos / respuestas ≥400:");
  for (const [key, count] of failed) console.log(`    ×${count} ${key}`);

  await page.close();
  return { consoleErrors: grouped, failed };
}

/**
 * Normaliza lo que cambia por correr en puertos distintos: el puerto y el UUID de
 * los `blob:` (el artefacto del MediaSession se arma con un blob nuevo cada vez).
 * Sin esto la comparación reporta "distinto" donde el texto es el mismo.
 */
function normalize(text) {
  return text
    .replace(/blob:http:\/\/localhost:\d+\/[0-9a-f-]+/g, "blob:<media-session>")
    .replace(/http:\/\/localhost:\d+/g, "http://localhost:<puerto>");
}

/**
 * Flujo completo: canción A → canción B (el cambio de canción vuelve a armar el
 * artefacto del MediaSession con un `blob:`), más una vuelta por la pestaña Pistas.
 */
async function flow(page, withMixer) {
  await page.locator('.rail-item[title="Música — tu reproductor"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, {
    timeout: 120000,
  });
  // Catálogo completo: en el reproductor el aviso de progreso va limitado, pero
  // igual hay que esperar a que termine para que el click no caiga en un nodo que
  // React está por reemplazar.
  await page.waitForFunction(
    () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);
  await page
    .locator(".pm-shelf")
    .filter({ hasText: "Vallenato" })
    .locator(".pm-card__info")
    .filter({ hasText: "El Osito Dormilón" })
    .first()
    .click();
  await page.waitForTimeout(9000);
  // Cambio de canción: vuelve a armar el artefacto del MediaSession.
  await page
    .locator(".pm-shelf")
    .filter({ hasText: "Boleros" })
    .locator(".pm-card__info")
    .filter({ hasText: "Bésame Mucho" })
    .first()
    .click();
  await page.waitForTimeout(9000);
  if (!withMixer) return;
  await page.locator('.rail-item[title="Pistas"]').click();
  await page.waitForTimeout(1500);
  const select = page.locator(".track-instrument-select").first();
  if (await select.count()) {
    await select.selectOption({ index: 40 });
    await page.waitForTimeout(6000);
  }
}

const piano = await inspect("http://localhost:1234/", "PIANO", (page) => flow(page, true));
const player = await inspect("http://localhost:1235/", "REPRODUCTOR", (page) => flow(page, true));

console.log("\n=== COMPARACIÓN ===");
const pianoKeys = new Set(piano.consoleErrors.keys());
const playerKeys = new Set(player.consoleErrors.keys());
const onlyPlayer = [...playerKeys].filter((k) => !pianoKeys.has(k));
const onlyPiano = [...pianoKeys].filter((k) => !playerKeys.has(k));
console.log(`  errores que SÓLO tiene el reproductor: ${onlyPlayer.length}`);
for (const k of onlyPlayer) console.log("    " + k);
console.log(`  errores que SÓLO tiene el piano: ${onlyPiano.length}`);
for (const k of onlyPiano) console.log("    " + k);

await browser.close();
