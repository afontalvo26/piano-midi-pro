// ============================================================
// qa-profile.mjs — ¿en qué se va el hilo principal mientras suena la canción?
//
// Perfila la página con el CPU profiler de Chrome (CDP) durante N segundos de
// reproducción real y agrega el *self time* por función. Eso da archivo:línea,
// no sospechas.
//
// Uso: node scripts/qa-profile.mjs [archivo] [segundos-de-perfil] [etiqueta]
// ============================================================
import { chromium } from "playwright";

const fixture =
  process.argv[2] ?? "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";
const profileSeconds = Number(process.argv[3] ?? 10);
const label = process.argv[4] ?? "perfil";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(20000);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 25000 });

const titulo = fixture.split("/").pop().replace(/\.[^.]+$/, "");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(fixture);
await page.waitForFunction(
  (t) => (document.querySelector(".title-container p")?.textContent || "").includes(t),
  titulo,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
await page.locator(".pm-bar__transport .pm-tbtn--solid").click();
await page.waitForFunction(
  () => Number(document.querySelector(".pm-bar__range")?.value ?? 0) > 0.5,
  { timeout: 45000 },
);
// Que terminen de bajar los samples: se perfila la reproducción, no la carga.
await page.waitForTimeout(10000);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await page.waitForTimeout(profileSeconds * 1000);
const { profile } = await cdp.send("Profiler.stop");

// Agrega self time por función (hitCount × intervalo de muestreo). El perfil de
// CDP trae los nodos en un array plano; algunos (root/program) no tienen
// callFrame.
const INTERVAL_US = 200;
const selfByFrame = new Map();
let totalHits = 0;

for (const node of profile.nodes) {
  const frame = node.callFrame;
  if (!frame) continue;
  const url = (frame.url || "").replace(/^https?:\/\/localhost:1234\//, "");
  const isApp = url.includes("/src/") || url.startsWith("src/");
  const name = frame.functionName || "(anónima)";
  const key = `${isApp ? "APP " : ""}${name}  ${url}:${frame.lineNumber + 1}`;
  const hits = node.hitCount ?? 0;
  selfByFrame.set(key, (selfByFrame.get(key) ?? 0) + hits);
  totalHits += hits;
}

const rows = [...selfByFrame.entries()]
  .map(([key, hits]) => ({ key, ms: (hits * INTERVAL_US) / 1000 }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 25);

// ¿QUIÉN crea los elementos? El self time de `jsxDEV` es del framework, así que
// se atribuye al ancestro más cercano que viva en `src/` (el componente que
// llamó a jsx). Eso da el componente responsable, no el runtime.
const byOwner = new Map();
const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
// El perfil no siempre trae `parent`: se reconstruye desde `children`.
const parentOf = new Map();
for (const node of profile.nodes) {
  for (const child of node.children ?? []) parentOf.set(child, node.id);
}
const ownerCache = new Map();
const ownerOf = (node, seenIds = new Set()) => {
  if (ownerCache.has(node.id)) return ownerCache.get(node.id);
  if (seenIds.has(node.id)) return null;
  seenIds.add(node.id);
  const frame = node.callFrame;
  const url = (frame?.url || "").replace(/^https?:\/\/localhost:1234\//, "");
  if (frame && (url.includes("/src/") || url.startsWith("src/"))) {
    const owner = `${frame.functionName || "(anónima)"}  ${url}:${frame.lineNumber + 1}`;
    ownerCache.set(node.id, owner);
    return owner;
  }
  const parentId = parentOf.get(node.id);
  const parent = parentId !== undefined ? nodeById.get(parentId) : null;
  const resolved = parent ? ownerOf(parent, seenIds) : null;
  ownerCache.set(node.id, resolved);
  return resolved;
};

for (const node of profile.nodes) {
  const frame = node.callFrame;
  if (!frame || frame.functionName !== "jsxDEV" && frame.functionName !== "jsxDEVImpl") continue;
  const owner = ownerOf(node) ?? "(fuera de la app)";
  byOwner.set(owner, (byOwner.get(owner) ?? 0) + (node.hitCount ?? 0));
}
const ownerRows = [...byOwner.entries()]
  .map(([key, hits]) => ({ key, ms: (hits * INTERVAL_US) / 1000 }))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 15);

// También el total por script (archivo), que dice qué módulo domina.
const byUrl = new Map();
for (const [key, hits] of selfByFrame) {
  const url = key.slice(key.lastIndexOf("  ") + 2).replace(/:\d+$/, "") || "(nativo)";
  byUrl.set(url, (byUrl.get(url) ?? 0) + (hits * INTERVAL_US) / 1000);
}
const urlRows = [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

console.log(`\n============ PERFIL ${label} (${profileSeconds}s) ============`);
console.log(`archivo : ${fixture}`);
console.log(`muestras: ${totalHits} × 0,2 ms = ${((totalHits * INTERVAL_US) / 1000).toFixed(0)} ms de CPU`);
console.log(`\n-- top funciones por self time --`);
for (const row of rows) console.log(`  ${row.ms.toFixed(0).padStart(6)} ms  ${row.key}`);
console.log(`\n-- quién crea los elementos (self time de jsxDEV por componente) --`);
for (const row of ownerRows) console.log(`  ${row.ms.toFixed(0).padStart(6)} ms  ${row.key}`);
console.log(`\n-- top archivos --`);
for (const [url, ms] of urlRows) console.log(`  ${ms.toFixed(0).padStart(6)} ms  ${url}`);

await browser.close();
