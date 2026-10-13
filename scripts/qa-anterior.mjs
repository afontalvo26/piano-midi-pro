// ============================================================
// qa-anterior.mjs — "Canción anterior" con la posición baja.
//
// Reproduce el caso que reportó el QA (BUG 3): con la posición en 0-3 s el
// botón a veces no retrocede. Registra, en cada intento, lo que el usuario ve
// (título y posición de la barra) y lo que el reproductor tiene de verdad
// (cola e índice, vía el handle dev `__PMP_PLAYER__`), más la posición que
// decide el umbral (`RESTART_THRESHOLD = 3 s`).
//
// Uso: node scripts/qa-anterior.mjs [intentos]
// ============================================================
import { chromium } from "playwright";

const intentos = Number(process.argv[2] ?? 6);
const A = "app/public/demo/Bolero_-_Besame_Mucho.kar";
const B = "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";
const C = "app/public/demo/Salsa_-_Ruben_Blades_Pedro_Navaja.kar";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(25000);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 25000 });

const upload = async (file) => {
  const titulo = file.split("/").pop().replace(/\.[^.]+$/, "");
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(file);
  await page.waitForFunction(
    (t) => (document.querySelector(".title-container p")?.textContent || "").includes(t),
    titulo,
    { timeout: 30000 },
  );
  return titulo;
};

const estado = () =>
  page.evaluate(() => {
    const player = window.__PMP_PLAYER__;
    const snap = player ? player.getSnapshot() : null;
    const bar = document.querySelector(".pm-bar");
    return {
      barra: (bar?.querySelector(".pm-bar__title")?.textContent || "").trim(),
      posicion: Number(bar?.querySelector(".pm-bar__range")?.value ?? -1),
      etiqueta: bar?.querySelector(".pm-bar__transport .pm-tbtn--solid")?.getAttribute("aria-label"),
      index: snap ? snap.index : null,
      cola: snap ? snap.queue.length : null,
      repeat: snap ? snap.settings.repeat : null,
      actual: player ? player.getCurrentTrackId() : null,
    };
  });

// Tres canciones al catálogo y a la cola de la biblioteca.
const tA = await upload(A);
const tB = await upload(B);
const tC = await upload(C);
console.log(`importadas: ${tA} | ${tB} | ${tC}`);

await page.locator(".rail-item", { hasText: "Música" }).click();
await page.locator(".pm-nav__item", { hasText: "Canciones" }).click();
await page.waitForSelector(".pm-row", { timeout: 90000 });
const filas = await page.locator(".pm-row__main").count();
console.log(`filas en Canciones: ${filas}`);

for (let intento = 1; intento <= intentos; intento++) {
  // Alternar la fila elegida para variar el índice de la cola (1ª = índice 0).
  const fila = intento % 2 === 0 ? 0 : Math.min(2, filas - 1);
  try {
    await page.locator(".pm-row__main").nth(fila).click();
    await page.waitForFunction(
      () => document.querySelector('.pm-bar__transport .pm-tbtn--solid')?.getAttribute("aria-label") === "Pausar",
      { timeout: 60000 },
    );
    // Posición baja pero > 0: el caso reportado.
    await page.waitForFunction(
      () => Number(document.querySelector(".pm-bar__range")?.value ?? 0) > 0.6,
      { timeout: 60000 },
    );
  } catch (err) {
    const st = await estado();
    console.log(
      `\nintento ${intento} (fila ${fila + 1}): no llegó a sonar (${String(err).slice(0, 50)}) — barra "${st.barra}" ${st.etiqueta} índice ${st.index}/${st.cola}`,
    );
    await page.locator(".rail-item", { hasText: "Música" }).click();
    await page.locator(".pm-nav__item", { hasText: "Canciones" }).click();
    continue;
  }
  const antes = await estado();
  if (antes.posicion > 2.9) {
    // Se pasó del umbral: no sirve para el caso "posición baja".
    await page.locator('.pm-bar__transport button[aria-label="Canción anterior"]').click();
    continue;
  }

  await page.locator('.pm-bar__transport button[aria-label="Canción anterior"]').click();
  await page.waitForTimeout(1200);
  const despues = await estado();

  const retrocedio = despues.barra !== antes.barra || despues.index !== antes.index;
  const reinicio = despues.posicion < antes.posicion + 0.6 && despues.barra === antes.barra;
  console.log(
    `\nintento ${intento} (fila ${fila + 1}): pos ${antes.posicion.toFixed(2)}s | índice ${antes.index}/${antes.cola} repeat=${antes.repeat}` +
      `\n  antes : "${antes.barra}" (${antes.actual})` +
      `\n  después: "${despues.barra}" índice ${despues.index} pos ${despues.posicion.toFixed(2)}s` +
      `\n  → ${retrocedio ? "RETROCEDIÓ" : reinicio ? "reinició la misma (no había ninguna anterior)" : "NO HIZO NADA"}`,
  );
}

await browser.close();
