// QA en vivo del reproductor: inventario de controles + capturas + regresión de
// cambio de canción (el bug reportado).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = ".logs/qa";
mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

const errors = [];
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));

// Instrumentación: fuentes de audio vivas y notas disparadas.
await page.addInitScript(() => {
  window.__QA = { started: 0, stopped: 0, live: new Set() };
  const origStart = AudioBufferSourceNode.prototype.start;
  const origStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__QA.started++;
    window.__QA.live.add(this);
    this.addEventListener("ended", () => window.__QA.live.delete(this));
    return origStart.apply(this, a);
  };
  AudioBufferSourceNode.prototype.stop = function (...a) {
    window.__QA.stopped++;
    window.__QA.live.delete(this);
    return origStop.apply(this, a);
  };
});

await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace, .pm-bar", { timeout: 25000 });
await page.waitForTimeout(2500);
await shot(page, "01-inicio");

// ── INVENTARIO DE CONTROLES ────────────────────────────────────────────────
const inventory = await page.evaluate(() => {
  const describe = (el) => {
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34);
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      label,
      cls: (el.className || "").toString().split(" ").slice(0, 2).join("."),
    };
  };
  const seen = new Set();
  const items = [];
  for (const el of document.querySelectorAll(
    "button, input, select, [role=button], [role=slider], [role=tab]",
  )) {
    if (el.offsetParent === null && el.getAttribute("type") !== "file") continue;
    const d = describe(el);
    const key = `${d.tag}|${d.type}|${d.label}`;
    if (seen.has(key) || !d.label) continue;
    seen.add(key);
    items.push(d);
  }
  return items;
});

console.log(`=== CONTROLES VISIBLES AL INICIO (${inventory.length}) ===`);
inventory.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. [${c.tag}${c.type ? ":" + c.type : ""}] ${c.label}`));

// ── CARGAR CANCIÓN A ───────────────────────────────────────────────────────
console.log("\n=== CARGAR CANCIÓN A ===");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles("app/public/demo/Bolero_-_Besame_Mucho.kar");
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range], .pm-bar input[type=range]")?.max ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
await shot(page, "02-cancion-A-cargada");

const startBtn = page.locator('.pm-bar button[aria-label="Reproducir"], .playback-bar .btn.primary').first();
await startBtn.click();
await page.waitForTimeout(9000);
await shot(page, "03-cancion-A-sonando");
const afterA = await page.evaluate(() => ({
  started: window.__QA.started,
  live: window.__QA.live.size,
  pos: Number(document.querySelector(".pm-bar input[type=range], .seeker-container input[type=range]")?.value ?? 0),
}));
console.log(`A sonando: fuentes disparadas=${afterA.started}, vivas=${afterA.live}, posición=${afterA.pos.toFixed(1)}s`);

// ── CAMBIO DE CANCIÓN (el bug reportado) ───────────────────────────────────
console.log("\n=== CAMBIO A CANCIÓN B (regresión reportada) ===");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles("app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar");
await page.waitForTimeout(3000);
await shot(page, "04-cancion-B-recien-cargada");
const afterSwitch = await page.evaluate(() => ({
  started: window.__QA.started,
  stopped: window.__QA.stopped,
  live: window.__QA.live.size,
  pos: Number(document.querySelector(".pm-bar input[type=range], .seeker-container input[type=range]")?.value ?? 0),
  max: Number(document.querySelector(".pm-bar input[type=range], .seeker-container input[type=range]")?.max ?? 0),
}));
console.log(
  `tras cambiar: fuentes vivas=${afterSwitch.live} (detenidas=${afterSwitch.stopped}), posición=${afterSwitch.pos.toFixed(1)} de ${afterSwitch.max.toFixed(0)}s`,
);
console.log(
  afterSwitch.live > 6
    ? `⚠️  quedaron ${afterSwitch.live} fuentes sonando de la canción anterior`
    : "✓ ninguna fuente de la canción anterior quedó sonando",
);

// ── BARRA DE REPRODUCCIÓN ──────────────────────────────────────────────────
console.log("\n=== BARRA DE REPRODUCCIÓN ===");
const playB = await page.locator('.pm-bar button[aria-label="Reproducir"]').count();
if (playB) {
  await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click();
  await page.waitForTimeout(4000);
  await shot(page, "05-cancion-B-sonando");
  const paused = await page.locator('.pm-bar button[aria-label="Pausar"]').count();
  console.log(`reproducir → ${paused ? "✓ pasó a estado Pausar" : "✗ no cambió de estado"}`);
  if (paused) {
    await page.locator('.pm-bar button[aria-label="Pausar"]').first().click();
    await page.waitForTimeout(1200);
    await shot(page, "06-pausado");
    console.log("pausar → capturado");
  }
}
// Siguiente / anterior dentro de la cola
for (const [label, file] of [["Canción siguiente", "07-siguiente"], ["Canción anterior", "08-anterior"]]) {
  const btn = page.locator(`.pm-bar button[aria-label="${label}"]`);
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(2500);
    await shot(page, file);
    console.log(`${label} → capturado`);
  }
}
for (const [label, file] of [["Reproducción aleatoria", "09-aleatorio"], ["Activar repetición", "10-repeticion"]]) {
  const btn = page.locator(`.pm-bar button[aria-label="${label}"]`);
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(900);
    await shot(page, file);
    await btn.first().click();
    console.log(`${label} → ✓ responde`);
  }
}

console.log(`\n=== ERRORES DE CONSOLA: ${errors.length} ===`);
[...new Set(errors)].slice(0, 12).forEach((e) => console.log("  " + e));

await browser.close();
