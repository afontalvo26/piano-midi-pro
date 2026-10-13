// ============================================================
// qa-all-switch — CASO ESPECIAL 1 y 2: cambio de canción y barra "Nada en
// reproducción".
//
// Mide la SALIDA DE AUDIO REAL con un tap sobre AudioNode.prototype.connect
// cuando el destino es AudioDestinationNode (AnalyserNode → RMS en dBFS), y
// contrasta las dos vías de carga que existen en la app:
//
//   (a) input del Studio  → App.parseMidiFile()  → setSong + stopPlayback
//   (b) tarjeta de la pantalla "Música" → player.playCollection → cola
//
// Salida: .logs/qa/results-switch.json  +  .logs/qa/switch-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";
import { writeFileSync } from "node:fs";

const DEMO = "app/public/demo";
const A = `${DEMO}/Bolero_-_Besame_Mucho.kar`;
const B = `${DEMO}/BinomioDeOro_-_El_Osito_Dormilon.kar`;
const C2 = `${DEMO}/Salsa_-_Ruben_Blades_Pedro_Navaja.kar`;

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);
const snap = async (etiqueta) => {
  const b = await bar();
  const audio = await qa.rms(8, 120);
  const src = await qa.src();
  const studio = await page.evaluate(() => ({
    playBtn: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
    time: (document.querySelector(".time-display")?.textContent || "").trim(),
    seekerSong: Number(document.querySelector('.seeker-container input[type="range"]')?.value ?? -1),
    seekerSongMax: Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? -1),
    topbar: (document.querySelector(".topbar-header p")?.textContent || "").replace(/\s+/g, " ").trim(),
  }));
  const row = {
    etiqueta,
    barTitle: b.title,
    barSeeker: `${b.seekerVal}/${b.seekerMax}`,
    barSeekerDisabled: b.seekerDisabled,
    queue: b.queueCount,
    rms: audio,
    src,
    studio,
  };
  console.log(
    `\n--- ${etiqueta} ---\n` +
      `    barra: "${b.title}" | artista "${b.artist}" | cola ${b.queueCount} | seeker ${row.barSeeker}${b.seekerDisabled ? " (deshabilitado)" : ""}\n` +
      `    audio: RMS ${audio === -Infinity ? "-inf" : audio.toFixed(1)} dB | fuentes vivas ${src.live} (start ${src.started} / stop ${src.stopped})\n` +
      `    studio: botón "${studio.playBtn}" | reloj ${studio.time} | seeker canción ${studio.seekerSong}/${studio.seekerSongMax}\n` +
      `    topbar: ${studio.topbar}`,
  );
  return row;
};

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await qa.shot("switch-00-inicio");
const r0 = await snap("0. inicio");

// ═══ VÍA (a): input del Studio ═════════════════════════════════════════════
console.log("\n\n################ VÍA (a): input del Studio ################");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(A);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(2000);
const ra1 = await snap("a1. canción A cargada por el input del Studio");
await qa.shot("switch-a1-A-por-studio");
qa.add({
  control: "(2) Barra tras cargar por el input del Studio",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: ra1.barTitle === "Nada en reproducción" ? "FAIL" : "OK",
  evidence:
    `cargado "${A.split("/").pop()}" → barra dice "${ra1.barTitle}" / artista "${ra1.barTitle === "Nada en reproducción" ? "Elegí una canción para empezar" : ""}", ` +
    `cola=${ra1.queue}, botón "Practicar esta canción en el Studio" deshabilitado=${(await page.locator('.pm-bar button[title="Practicar esta canción en el Studio"]').isDisabled())}, ` +
    `seeker de barra deshabilitado=${ra1.barSeekerDisabled}; el Studio SÍ cargó (topbar="${ra1.studio.topbar}")`,
  shot: `${OUT}/switch-a1-A-por-studio.png`,
  extra: ra1,
});

// Reproducir desde el Studio y medir audio
await page.locator(".playback-bar .btn.primary").click();
await page.waitForTimeout(7000);
const ra2 = await snap("a2. reproduciendo A desde el botón del Studio");
await qa.shot("switch-a2-A-sonando-studio");
qa.add({
  control: "Studio: reproducir una canción cargada por el input",
  selector: ".playback-bar .btn.primary",
  result: ra2.rms > -70 ? "OK" : "FAIL",
  evidence: `RMS ${ra2.rms === -Infinity ? "-inf" : ra2.rms.toFixed(1)} dB con fuentes vivas=${ra2.src.live}; la barra sigue en "${ra2.barTitle}"`,
  shot: `${OUT}/switch-a2-A-sonando-studio.png`,
  extra: ra2,
});

// ¿La barra se actualiza sola en algún momento?
let barChanged = false;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1500);
  const b = await bar();
  if (b.title !== "Nada en reproducción") {
    barChanged = true;
    console.log(`    ¡la barra cambió en la iteración ${i}!: "${b.title}"`);
    break;
  }
}
qa.add({
  control: "(2) ¿La barra se sincroniza sola con el Studio?",
  selector: ".pm-bar__title",
  result: barChanged ? "OK" : "FAIL",
  evidence: `durante 15 s reproduciendo desde el Studio, 10 muestras: la barra ${barChanged ? "SÍ" : "NUNCA"} dejó de decir "Nada en reproducción"`,
  shot: `${OUT}/switch-a2-A-sonando-studio.png`,
  extra: { barChanged },
});

// Cambio a la canción B sin detener A
console.log("\n>>> cambio a B por el input del Studio, SIN detener A");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(B);
await page.waitForFunction(
  () => /Osito|Dormilon/i.test(document.querySelector(".topbar-header p")?.textContent || ""),
  { timeout: 30000 },
).catch(() => console.log("    (no apareció el título de B en el topbar)"));
await page.waitForTimeout(2500);
const rb1 = await snap("b1. B recién cargada por el input del Studio");
await qa.shot("switch-b1-B-por-studio");
qa.add({
  control: "(1) Cambio A→B por el input del Studio: ¿queda audio de A?",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: rb1.rms < -70 && rb1.src.live === 0 ? "OK" : "FAIL",
  evidence:
    `tras cargar B: RMS ${rb1.rms === -Infinity ? "-inf" : rb1.rms.toFixed(1)} dB, fuentes de audio vivas=${rb1.src.live} ` +
    `(arrancadas ${rb1.src.started}, detenidas ${rb1.src.stopped}); barra="${rb1.barTitle}" · seeker barra=${rb1.barSeeker} · seeker Studio=${rb1.studio.seekerSong.toFixed(1)}/${rb1.studio.seekerSongMax.toFixed(0)} · reloj=${rb1.studio.time}`,
  shot: `${OUT}/switch-b1-B-por-studio.png`,
  extra: rb1,
});

// Esperar 8 s por si el audio de A reaparece
await page.waitForTimeout(8000);
const rb2 = await snap("b2. B +8 s sin tocar nada");
qa.add({
  control: "(1) Cambio A→B: ¿reaparece el audio de A más tarde?",
  selector: "(audio)",
  result: rb2.rms < -70 && rb2.src.live === 0 ? "OK" : "FAIL",
  evidence: `8 s después: RMS ${rb2.rms === -Infinity ? "-inf" : rb2.rms.toFixed(1)} dB, fuentes vivas=${rb2.src.live}, seeker Studio=${rb2.studio.seekerSong.toFixed(1)}s (el tiempo volvió a 0: ${rb2.studio.seekerSong < 1})`,
  shot: `${OUT}/switch-b2-B-8s.png`,
  extra: rb2,
});

// Reproducir B desde el Studio
await page.locator(".playback-bar .btn.primary").click();
await page.waitForTimeout(7000);
const rb3 = await snap("b3. B sonando desde el Studio");
await qa.shot("switch-b3-B-sonando");
qa.add({
  control: "(1) Cambio A→B: B suena después del cambio",
  selector: ".playback-bar .btn.primary",
  result: rb3.rms > -70 ? "OK" : "FAIL",
  evidence: `B desde cero: RMS ${rb3.rms === -Infinity ? "-inf" : rb3.rms.toFixed(1)} dB, fuentes vivas=${rb3.src.live}; barra="${rb3.barTitle}"`,
  shot: `${OUT}/switch-b3-B-sonando.png`,
  extra: rb3,
});

// ═══ VÍA (b): tarjeta de la pantalla Música (cola real) ════════════════════
console.log("\n\n################ VÍA (b): tarjeta de la pantalla Música ################");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 20000 });
await page.waitForTimeout(2500);
await qa.shot("switch-c0-musica");
const c0 = await page.locator(".pm-card__info").nth(0).textContent();
const c1 = await page.locator(".pm-card__info").nth(1).textContent();
await page.locator(".pm-card__info").nth(0).click();
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
await page.waitForTimeout(12000);
const rc1 = await snap(`c1. tarjeta 1 encolada: "${(c0 || "").replace(/\s+/g, " ").trim().slice(0, 40)}"`);
await qa.shot("switch-c1-tarjeta1");
qa.add({
  control: "(3) Biblioteca: elegir una tarjeta de la pantalla Música",
  selector: ".pm-card__info",
  result: rc1.barTitle !== "Nada en reproducción" && rc1.rms > -70 ? "OK" : "FAIL",
  evidence: `barra="${rc1.barTitle}" (cola ${rc1.queue} temas), RMS ${rc1.rms === -Infinity ? "-inf" : rc1.rms.toFixed(1)} dB`,
  shot: `${OUT}/switch-c1-tarjeta1.png`,
  extra: rc1,
});

console.log("\n>>> cambio a la tarjeta 2 desde la biblioteca, SIN detener la 1");
await page.locator(".pm-card__info").nth(1).click();
await page.waitForTimeout(3000);
const rc2 = await snap(`c2. tarjeta 2: "${(c1 || "").replace(/\s+/g, " ").trim().slice(0, 40)}"`);
await qa.shot("switch-c2-tarjeta2");
await page.waitForTimeout(9000);
const rc3 = await snap("c3. tarjeta 2 +9 s");
qa.add({
  control: "(3) Biblioteca: cambiar de canción con una segunda tarjeta",
  selector: ".pm-card__info",
  result: rc2.barTitle !== rc1.barTitle && rc3.rms > -70 && rc3.src.live < 40 ? "OK" : "FAIL",
  evidence:
    `barra "${rc1.barTitle}" → "${rc2.barTitle}"; RMS a los 3 s = ${rc2.rms === -Infinity ? "-inf" : rc2.rms.toFixed(1)} dB y a los 12 s = ${rc3.rms === -Infinity ? "-inf" : rc3.rms.toFixed(1)} dB; ` +
    `fuentes vivas ${rc1.src.live} → ${rc2.src.live} → ${rc3.src.live} (start ${rc3.src.started} / stop ${rc3.src.stopped})`,
  shot: `${OUT}/switch-c2-tarjeta2.png`,
  extra: { rc1, rc2, rc3 },
});

// ── CASO 4: ¿siguen respondiendo los controles de la barra tras el cambio? ─
console.log("\n\n################ CASO 4: controles de la barra tras el cambio ################");
const seeker = page.locator(".pm-bar__range").first();

// 4a. seeker
const before4 = await bar();
await seeker.evaluate((el) => {
  el.value = String(Number(el.max) * 0.5);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.waitForTimeout(2500);
const after4 = await bar();
await qa.shot("switch-d1-seeker-tras-cambio");
qa.add({
  control: "(4) Seeker de la barra después de un cambio de canción",
  selector: ".pm-bar__range",
  result: after4.seekerVal > before4.seekerVal + 5 ? "OK" : "FAIL",
  evidence: `valor ${before4.seekerVal.toFixed(1)}s → ${after4.seekerVal.toFixed(1)}s (max ${after4.seekerMax.toFixed(0)}s)`,
  shot: `${OUT}/switch-d1-seeker-tras-cambio.png`,
  extra: { before4, after4 },
});

// 4b. siguiente
const t0 = await bar();
await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForTimeout(6000);
const t1 = await bar();
await qa.shot("switch-d2-siguiente-tras-cambio");
qa.add({
  control: "(4) \"Canción siguiente\" después de un cambio",
  selector: '.pm-bar button[aria-label="Canción siguiente"]',
  result: t1.title !== t0.title ? "OK" : "FAIL",
  evidence: `título "${t0.title}" → "${t1.title}"; seeker ${t1.seekerVal.toFixed(1)}/${t1.seekerMax.toFixed(0)}; cola ${t1.queueCount}`,
  shot: `${OUT}/switch-d2-siguiente-tras-cambio.png`,
  extra: { t0, t1 },
});

// 4c. anterior (con la posición por debajo del umbral de reinicio)
await seeker.evaluate((el) => {
  el.value = "1.5";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.waitForTimeout(1500);
await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
await page.waitForTimeout(7000);
const t2 = await bar();
await qa.shot("switch-d3-anterior-tras-cambio");
qa.add({
  control: "(4) \"Canción anterior\" después de un cambio",
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: t2.title !== t1.title ? "OK" : "FAIL",
  evidence: `título "${t1.title}" → "${t2.title}" (¿vuelve a "${t0.title}"? ${t2.title === t0.title ? "sí" : "NO"})`,
  shot: `${OUT}/switch-d3-anterior-tras-cambio.png`,
  extra: { t2 },
});

// 4d. cola
const qbtn = page.locator('.pm-bar button[title="Ver la cola (Q)"]');
const qBefore = await qbtn.getAttribute("aria-expanded");
await qbtn.click();
await page.waitForTimeout(1500);
const qAfter = await qbtn.getAttribute("aria-expanded");
const qPanel = await page.evaluate(() => {
  const el = document.querySelector('[class*="queue-panel"], [class*="pm-queue"], [class*="QueuePanel"]');
  return el ? (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220) : null;
});
await qa.shot("switch-d4-cola-tras-cambio");
qa.add({
  control: "(4) \"Ver la cola (Q)\" después de un cambio",
  selector: '.pm-bar button[title="Ver la cola (Q)"]',
  result: qBefore !== qAfter ? "OK" : "FAIL",
  evidence: `aria-expanded ${qBefore} → ${qAfter}; contenido del panel: "${qPanel || "(no se encontró el panel)"}"`,
  shot: `${OUT}/switch-d4-cola-tras-cambio.png`,
  extra: { qPanel },
}

);

// 4e. El chip "Studio" de la barra tras un cambio
const chipDisabled = await page.locator('.pm-bar button[title="Practicar esta canción en el Studio"]').isDisabled();
qa.add({
  control: "(4) Chip \"Studio\" de la barra después de un cambio",
  selector: '.pm-bar button[title="Practicar esta canción en el Studio"]',
  result: chipDisabled ? "FAIL" : "OK",
  evidence: `deshabilitado=${chipDisabled} (la barra tiene "${t2.title}", así que debería estar habilitado)`,
  shot: `${OUT}/switch-d4-cola-tras-cambio.png`,
  extra: { chipDisabled },
});

// ── Prueba adicional: archivo .mid (no .kar) para descartar el formato ─────
console.log("\n\n################ EXTRA: archivo .mid por el input del Studio ################");
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(`${DEMO}/Beethoven_-_Moonlight_Sonata_1st.mid`);
await page.waitForTimeout(5000);
const rmid = await snap("mid. Beethoven .mid cargado por el input del Studio");
await qa.shot("switch-e1-mid");
qa.add({
  control: "(2) Barra tras cargar un .mid (no .kar) por el input del Studio",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: rmid.barTitle === "Nada en reproducción" ? "FAIL" : "OK",
  evidence: `barra="${rmid.barTitle}", cola=${rmid.queue}, topbar="${rmid.studio.topbar}", seeker Studio=${rmid.studio.seekerSongMax.toFixed(0)}s`,
  shot: `${OUT}/switch-e1-mid.png`,
  extra: rmid,
});

// ── Prueba adicional: ¿el input del Studio SÍ encola si ya había una cola? ─
console.log("\n>>> con una cola activa, cargar por el input del Studio");
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1500);
const pre = await bar();
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(C2);
await page.waitForTimeout(6000);
const post = await bar();
await qa.shot("switch-f1-studio-con-cola");
qa.add({
  control: "(2) Input del Studio con una cola ya activa en la barra",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: post.title === pre.title ? "OK" : "FAIL",
  evidence:
    `la barra dice "${pre.title}" (cola ${pre.queueCount}, seeker max ${pre.seekerMax?.toFixed(0)}s) y tras cargar "${C2.split("/").pop()}" por el input del Studio sigue diciendo "${post.title}" ` +
    `(cola ${post.queueCount}, seeker max ${post.seekerMax?.toFixed(0)}s). La barra NO borra la cola, pero tampoco refleja la canción que el Studio acaba de cargar: son dos reproductores independientes`,
  shot: `${OUT}/switch-f1-studio-con-cola.png`,
  extra: { pre, post },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 20).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola durante la sesión de cambio de canción",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});

writeFileSync(
  `${OUT}/switch-timeline.json`,
  JSON.stringify({ r0, ra1, ra2, rb1, rb2, rb3, rc1, rc2, rc3, rmid }, null, 2),
);
qa.save("results-switch");
console.log(`\nresultados: ${qa.results.length} filas → ${OUT}/results-switch.json`);
await qa.close();
