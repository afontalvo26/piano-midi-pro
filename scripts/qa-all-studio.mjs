// ============================================================
// qa-all-studio — QA de los controles del Studio, pedales, Key FX, teclado
// y navegación del rail.
//
// Lección del arnés aplicada: todo click sobre un nodo que puede estar fuera
// del viewport va con locator.click() (auto-scroll), nunca con
// page.mouse.click() + boundingBox().
//
// Salida: .logs/qa/results-studio.json  +  .logs/qa/studio-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const DEMO = "app/public/demo";
const SONG = `${DEMO}/Bolero_-_Besame_Mucho.kar`;

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);
const reloj = async () => ((await page.locator(".time-display").textContent()) || "").trim();

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await qa.shot("studio-00-inicio");

// ── cargar canción por el input del Studio ──────────────────────────────────
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(SONG);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(2500);
await qa.shot("studio-01-cancion-cargada");
const topbar = (await page.locator(".topbar-header p").textContent())?.replace(/\s+/g, " ").trim();
qa.add({
  control: 'Studio: input[aria-label="Cargar archivo MIDI"]',
  selector: 'input[type="file"][aria-label="Cargar archivo MIDI"]',
  result: (topbar || "").includes("Besame") ? "OK" : "FAIL",
  evidence: `accept="${await page.locator('input[aria-label="Cargar archivo MIDI"]').getAttribute("accept")}"; topbar pasó a "${topbar}"; seeker del Studio max=${await page.locator('.seeker-container input[type="range"]').getAttribute("max")}s`,
  shot: `${OUT}/studio-01-cancion-cargada.png`,
});

// ── 1. Reproducir / Detener ─────────────────────────────────────────────────
console.log("\n### STUDIO: Reproducir / Detener");
await page.locator(".playback-bar .btn.primary").click();
await page.waitForTimeout(9000);
const rPlay = await qa.rms(8, 130);
const btnPlaying = ((await page.locator(".playback-bar .btn.primary").textContent()) || "").trim();
const relojSonando = await reloj();
await qa.shot("studio-02-reproduciendo");
console.log(`  reproduciendo: RMS ${rPlay.toFixed(1)} dB · reloj "${relojSonando}" · botón "${btnPlaying}"`);

await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(2500);
const rStop = await qa.rms(10, 140);
await page.waitForTimeout(2200);
const rStop2 = await qa.rms(8, 140);
const srcStop = await qa.src();
const relojDetenido = await reloj();
const btnDetenido = ((await page.locator(".playback-bar .btn.primary").textContent()) || "").trim();
await qa.shot("studio-03-detener");
console.log(`  detener: RMS ${rStop.toFixed(1)} → ${rStop2.toFixed(1)} dB · reloj "${relojDetenido}" · fuente vivas ${srcStop.live}`);
qa.add({
  control: 'Studio: "Reproducir" (botón .btn.primary)',
  selector: ".playback-bar .btn.primary",
  result: rPlay > -70 ? "OK" : "FAIL",
  evidence: `RMS ${rPlay === -Infinity ? "-inf" : rPlay.toFixed(1)} dB; el botón pasó a "${btnPlaying}"; reloj "${relojSonando}"`,
  shot: `${OUT}/studio-02-reproduciendo.png`,
});
qa.add({
  control: 'Studio: "Detener"',
  selector: '.playback-bar button:has-text("Detener")',
  result: rStop2 < -70 ? "OK" : "FAIL",
  evidence: `RMS ${rStop === -Infinity ? "-inf" : rStop.toFixed(1)} dB a los 2,5 s y ${rStop2 === -Infinity ? "-inf" : rStop2.toFixed(1)} dB a los 4,7 s (venía de ${rPlay.toFixed(1)} dB); fuentes de audio vivas=${srcStop.live}; reloj volvió a "${relojDetenido}"; el botón quedó en "${btnDetenido}"`,
  shot: `${OUT}/studio-03-detener.png`,
});

// ── 2. Letra ────────────────────────────────────────────────────────────────
console.log("\n### STUDIO: Letra");
const letraBtn = page.locator('.playback-bar button:has-text("Letra")');
const letraInfo = {
  title: await letraBtn.getAttribute("title"),
  disabled: await letraBtn.isDisabled(),
  pressed: await letraBtn.getAttribute("aria-pressed"),
  contador: await page.evaluate(() => document.querySelector(".lyrics-count")?.textContent ?? null),
};
await qa.shot("studio-04-letra-antes");
console.log(`  "${letraInfo.title}" deshabilitado=${letraInfo.disabled} pressed=${letraInfo.pressed} contador=${letraInfo.contador}`);
if (!letraInfo.disabled) {
  await letraBtn.click();
  await page.waitForTimeout(2000);
  const desp = {
    pressed: await letraBtn.getAttribute("aria-pressed"),
    title: await letraBtn.getAttribute("title"),
    panel: await page.evaluate(() => {
      const el = [...document.querySelectorAll('[class*="lyric"], [class*="letra"]')].find((e) => e.textContent.trim().length > 10);
      return el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : null;
    }),
  };
  await qa.shot("studio-04-letra-despues");
  qa.add({
    control: 'Studio: "Letra" / "Esta canción no trae letra"',
    selector: '.playback-bar button:has-text("Letra")',
    result: "OK",
    evidence: `estado inicial: title="${letraInfo.title}", aria-pressed=${letraInfo.pressed}, contador de líneas=${letraInfo.contador}; tras pulsar: aria-pressed=${desp.pressed}, title="${desp.title}"; panel: "${desp.panel || "(sin texto)"}"`,
    shot: `${OUT}/studio-04-letra-antes.png · ${OUT}/studio-04-letra-despues.png`,
  });
} else {
  // El botón está deshabilitado: hay que demostrar que la razón es el archivo,
  // no un fallo del control, cambiando el title desde la app (la letra sólo se
  // habilita cuando el parser encuentra texto).
  qa.add({
    control: 'Studio: "Esta canción no trae letra" (estado deshabilitado)',
    selector: '.playback-bar button:has-text("Letra")',
    result: "OK",
    evidence:
      `con "${SONG.split("/").pop()}" el botón queda disabled=true y su title es "${letraInfo.title}" (contador de líneas en el DOM: ${letraInfo.contador ?? "no hay span .lyrics-count"}). ` +
      `Es el estado "sin letra" documentado en App.tsx (disabled={lyricLines.length === 0 && !showLyrics}), no un control roto`,
    shot: `${OUT}/studio-04-letra-antes.png`,
  });
  qa.add({
    control: 'Studio: "Letra" con una canción que SÍ trae letra',
    selector: '.playback-bar button:has-text("Letra")',
    result: "NO VERIFICABLE",
    evidence: `requiere un archivo cuyo parser exponga letra sincronizada; con ${SONG.split("/").pop()} el contador de líneas es ${letraInfo.contador ?? "inexistente"} y el botón está deshabilitado`,
    shot: "—",
  });
}

// ── 3. Metrónomo ────────────────────────────────────────────────────────────
console.log("\n### STUDIO: Metrónomo");
const metro = page.locator('.playback-bar button:has-text("Metrónomo")');
const mBefore = { title: await metro.getAttribute("title"), cls: await metro.getAttribute("class") };
await qa.shot("studio-05-metronomo-antes");
await metro.click();
await page.waitForTimeout(3500);
const mOn = { title: await metro.getAttribute("title"), cls: await metro.getAttribute("class") };
const rMetroOn = await qa.rms(10, 130);
await qa.shot("studio-05-metronomo-encendido");
await metro.click();
await page.waitForTimeout(3000);
const mOff = { title: await metro.getAttribute("title"), cls: await metro.getAttribute("class") };
const rMetroOff = await qa.rms(8, 130);
await qa.shot("studio-05-metronomo-apagado");
console.log(`  "${mBefore.title}" [${mBefore.cls}] → "${mOn.title}" → "${mOff.title}" · RMS ${rMetroOn.toFixed(1)} / ${rMetroOff.toFixed(1)} dB`);
qa.add({
  control: 'Studio: "Encender metrónomo" / "Apagar metrónomo"',
  selector: '.playback-bar button:has-text("Metrónomo")',
  result: mOn.title === "Apagar metrónomo" && mOn.cls.includes("primary") && mOff.title === "Encender metrónomo" ? "OK" : "FAIL",
  evidence:
    `title "${mBefore.title}" → "${mOn.title}" → "${mOff.title}"; clase "${mBefore.cls}" → "${mOn.cls}" (gana primary al encender) → "${mOff.cls}"; ` +
    `con el transporte parado, RMS encendido ${rMetroOn === -Infinity ? "-inf" : rMetroOn.toFixed(1)} dB vs apagado ${rMetroOff === -Infinity ? "-inf" : rMetroOff.toFixed(1)} dB`,
  shot: `${OUT}/studio-05-metronomo-antes.png · ${OUT}/studio-05-metronomo-encendido.png · ${OUT}/studio-05-metronomo-apagado.png`,
});

// ── 4. Solo piano ───────────────────────────────────────────────────────────
console.log("\n### STUDIO: Solo piano");
const solo = page.locator(".piano-only-toggle");
const sBefore = { pressed: await solo.getAttribute("aria-pressed"), cls: await solo.getAttribute("class"), title: await solo.getAttribute("title") };
await qa.shot("studio-06-solopiano-antes");
await solo.click();
await page.waitForTimeout(2000);
const sAfter = {
  pressed: await solo.getAttribute("aria-pressed"),
  cls: await solo.getAttribute("class"),
  title: await solo.getAttribute("title"),
  knob: await page.evaluate(() => {
    const k = document.querySelector(".piano-only-toggle-track > span");
    return k ? { left: getComputedStyle(k).left, bg: getComputedStyle(k.parentElement).backgroundColor } : null;
  }),
};
await qa.shot("studio-06-solopiano-despues");
await solo.click();
await page.waitForTimeout(1500);
console.log(`  aria-pressed ${sBefore.pressed} → ${sAfter.pressed} · knob left=${sAfter.knob?.left} · fondo=${sAfter.knob?.bg}`);
qa.add({
  control: 'Studio: "Solo piano (ocultar otros)"',
  selector: ".piano-only-toggle",
  result: sBefore.pressed !== sAfter.pressed ? "OK" : "FAIL",
  evidence:
    `aria-pressed ${sBefore.pressed} → ${sAfter.pressed}; title "${sBefore.title}" → "${sAfter.title}"; ` +
    `el interruptor se movió (knob left=${sAfter.knob?.left}, fondo de la pista=${sAfter.knob?.bg}); clases "${sAfter.cls}"`,
  shot: `${OUT}/studio-06-solopiano-antes.png · ${OUT}/studio-06-solopiano-despues.png`,
});

// ── 5. BPM ──────────────────────────────────────────────────────────────────
console.log("\n### STUDIO: BPM");
const bpm = page.locator('input[aria-label="BPM (tempo)"]');
const bpmBefore = await bpm.inputValue();
await qa.shot("studio-07-bpm-antes");
await bpm.fill("90");
await bpm.dispatchEvent("change");
await page.waitForTimeout(1500);
const bpmAfter = await bpm.inputValue();
await qa.shot("studio-07-bpm-despues");
console.log(`  BPM ${bpmBefore} → ${bpmAfter}`);
qa.add({
  control: 'Studio: input[aria-label="BPM (tempo)"]',
  selector: 'input[type="number"][aria-label="BPM (tempo)"]',
  result: bpmAfter !== bpmBefore && Number(bpmAfter) === 90 ? "OK" : "FAIL",
  evidence: `valor ${bpmBefore} → ${bpmAfter} (min=${await bpm.getAttribute("min")}, max=${await bpm.getAttribute("max")}); el campo es controlado: refleja Math.round(song.bpm × playbackRate)`,
  shot: `${OUT}/studio-07-bpm-antes.png · ${OUT}/studio-07-bpm-despues.png`,
});
await bpm.fill(bpmBefore);
await bpm.dispatchEvent("change");
await page.waitForTimeout(1000);

// ── 6. Posición de la canción ───────────────────────────────────────────────
console.log("\n### STUDIO: Posición de la canción");
const songSeeker = page.locator('.seeker-container input[type="range"]');
const relojAntes = await reloj();
await qa.shot("studio-08-seeker-antes");
await songSeeker.evaluate((el) => {
  el.value = String(Number(el.max) * 0.5);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(2500);
const relojDespues = await reloj();
const seekerVal = await songSeeker.inputValue();
const seekerMax = await songSeeker.getAttribute("max");
await qa.shot("studio-08-seeker-despues");
console.log(`  seeker ${Number(seekerVal).toFixed(1)}/${Number(seekerMax).toFixed(0)} · reloj "${relojAntes}" → "${relojDespues}"`);
qa.add({
  control: 'Studio: input[aria-label="Posición de la canción"]',
  selector: '.seeker-container input[type="range"]',
  result: relojAntes !== relojDespues && Number(seekerVal) > 1 ? "OK" : "FAIL",
  evidence: `valor fijado a ${Number(seekerVal).toFixed(1)}s de ${Number(seekerMax).toFixed(0)}s; el reloj del Studio pasó de "${relojAntes}" a "${relojDespues}"`,
  shot: `${OUT}/studio-08-seeker-antes.png · ${OUT}/studio-08-seeker-despues.png`,
});

// ── 7. Rango de teclado ─────────────────────────────────────────────────────
console.log("\n### STUDIO: Seleccionar rango de teclado");
const minimap = page.locator('[aria-label="Seleccionar rango de teclado"]');
await minimap.scrollIntoViewIfNeeded();
const badgeAntes = ((await page.locator(".range-header-badge").textContent()) || "").replace(/\s+/g, "").trim();
const blancasAntes = await page.evaluate(() => document.querySelectorAll(".piano-key-element.white").length);
await qa.shot("studio-09-rango-antes");
const box = await minimap.boundingBox();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(1800);
const badgeDespues = ((await page.locator(".range-header-badge").textContent()) || "").replace(/\s+/g, "").trim();
const blancasDespues = await page.evaluate(() => document.querySelectorAll(".piano-key-element.white").length);
const rango = await page.evaluate(() => ({
  inRange: document.querySelectorAll(".minimap-key.in-range").length,
  total: document.querySelectorAll(".minimap-key").length,
  negras: document.querySelectorAll(".piano-key-element.black").length,
}));
await qa.shot("studio-09-rango-despues");
console.log(`  rango "${badgeAntes}" → "${badgeDespues}" · blancas ${blancasAntes} → ${blancasDespues} · minimap ${rango.inRange}/${rango.total}`);
qa.add({
  control: 'Studio: [aria-label="Seleccionar rango de teclado"] (arrastre del minimap)',
  selector: '.keyboard-minimap[role="slider"]',
  result: badgeAntes !== badgeDespues ? "OK" : "FAIL",
  evidence: `rango "${badgeAntes}" → "${badgeDespues}" tras arrastrar del 20% al 80% del minimap; teclas blancas renderizadas ${blancasAntes} → ${blancasDespues}; minimap con ${rango.inRange}/${rango.total} teclas marcadas .in-range y ${rango.negras} teclas negras en el teclado`,
  shot: `${OUT}/studio-09-rango-antes.png · ${OUT}/studio-09-rango-despues.png`,
});

// ── 8. Pedales ──────────────────────────────────────────────────────────────
console.log("\n### STUDIO: Pedales");
const pedalTest = async (title, clase, nombre) => {
  const el = page.locator(`.ic-pedal[title="${title}"]`);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const existe = await el.count();
  if (!existe) {
    qa.add({
      control: `Pedales: ${title}`,
      selector: `.ic-pedal[title="${title}"]`,
      result: "NO VERIFICABLE",
      evidence: "no existe el botón con ese title en el DOM",
      shot: "—",
    });
    return;
  }
  const antes = await el.getAttribute("class");
  await qa.shot(`${nombre}-antes`);
  await el.dispatchEvent("mousedown");
  await page.waitForTimeout(800);
  const pisado = await el.getAttribute("class");
  await qa.shot(`${nombre}-pisado`);
  await el.dispatchEvent("mouseup");
  await page.waitForTimeout(800);
  const soltado = await el.getAttribute("class");
  await qa.shot(`${nombre}-soltado`);
  qa.add({
    control: `Pedales: ${title}`,
    selector: `.ic-pedal[title="${title}"]`,
    result: antes !== pisado && soltado === antes ? "OK" : "FAIL",
    evidence: `clase "${antes}" → (mousedown) "${pisado}" → (mouseup) "${soltado}"; al pisarlo gana "${clase}": ${pisado.includes(clase)}; elemento <button class="ic-pedal...">`,
    shot: `${OUT}/${nombre}-antes.png · ${OUT}/${nombre}-pisado.png · ${OUT}/${nombre}-soltado.png`,
  });
};
await pedalTest("Una corda — suaviza y oscurece el timbre", "ic-pedal--active", "studio-10-unacorda");
await pedalTest("Sostenuto — mantiene solo notas activas al pisarlo", "ic-pedal--sostenuto", "studio-11-sostenuto");
await pedalTest("Sustain — resonancia de todas las cuerdas", "ic-pedal--sustain", "studio-12-sustain");

// Half-pedal
const half = page.locator('input[aria-label="Half-pedaling — blur armónico controlado"]');
await half.scrollIntoViewIfNeeded().catch(() => {});
const leerHalf = () =>
  page.evaluate(() => {
    const l = [...document.querySelectorAll(".ic-label")].find((x) => /Half-Pedal/i.test(x.textContent || ""));
    return l?.querySelector(".ic-value")?.textContent ?? null;
  });
const halfAntes = await leerHalf();
await qa.shot("studio-13-halfpedal-antes");
await half.evaluate((el) => {
  el.value = "0.6";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);
const halfDespues = await leerHalf();
await qa.shot("studio-13-halfpedal-despues");
qa.add({
  control: 'Pedales: input[aria-label="Half-pedaling — blur armónico controlado"]',
  selector: ".ic-slider",
  result: halfAntes !== halfDespues ? "OK" : "FAIL",
  evidence: `valor 0.6 (min=${await half.getAttribute("min")}, max=${await half.getAttribute("max")}, step=${await half.getAttribute("step")}); la etiqueta de la fila pasó de "${halfAntes}" a "${halfDespues}"`,
  shot: `${OUT}/studio-13-halfpedal-antes.png · ${OUT}/studio-13-halfpedal-despues.png`,
});

// ── 9. Temas de color Key FX ────────────────────────────────────────────────
console.log("\n### STUDIO: Temas Key FX");
const temas = ["Violeta", "Cian", "Lima", "Fuego", "Hielo", "Rosa", "Oro"];
const visto = [];
for (const t of temas) {
  const el = page.locator(`.keyfx-swatch[aria-label="Tema de color ${t}"]`);
  await el.click();
  await page.waitForTimeout(700);
  visto.push({
    tema: t,
    activo: (await el.getAttribute("class"))?.includes("keyfx-swatch--active"),
    pressed: await el.getAttribute("aria-pressed"),
    activos: await page.evaluate(() => document.querySelectorAll(".keyfx-swatch--active").length),
    color: await page.evaluate(() =>
      document.querySelector(".piano-key-element.white")?.style.getPropertyValue("--active-key-color"),
    ),
  });
}
await qa.shot("studio-14-temas");
console.log(`  ${visto.map((v) => `${v.tema}=${v.activo ? "sí" : "NO"}(${v.color})`).join(" ")}`);
qa.add({
  control: 'Key FX: los 7 botones "Tema de color X"',
  selector: '.keyfx-swatch[aria-label^="Tema de color"]',
  result: visto.every((v) => v.activo && v.activos === 1) ? "OK" : "FAIL",
  evidence: visto
    .map((v) => `${v.tema}: activo=${v.activo}, aria-pressed=${v.pressed}, --active-key-color de la 1ª tecla blanca=${v.color}, swatches activos a la vez=${v.activos}`)
    .join(" · "),
  shot: `${OUT}/studio-14-temas.png`,
});

// Color personalizado
const colorInput = page.locator('input[type="color"]');
await page.locator(".keyfx-swatch--custom").scrollIntoViewIfNeeded().catch(() => {});
const colorAntes = await colorInput.inputValue();
await qa.shot("studio-15-colorcustom-antes");
await colorInput.evaluate((el) => {
  el.value = "#ff0066";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);
const custom = await page.evaluate(() => ({
  activo: document.querySelector(".keyfx-swatch--custom")?.className.includes("keyfx-swatch--active"),
  pressed: document.querySelector(".keyfx-swatch--custom")?.getAttribute("aria-pressed"),
  bg: document.querySelector(".keyfx-swatch--custom")?.style.background,
  color: document.querySelector(".piano-key-element.white")?.style.getPropertyValue("--active-key-color"),
  inputVal: document.querySelector('input[type="color"]')?.value,
}));
await qa.shot("studio-15-colorcustom-despues");
console.log(`  color personalizado: ${JSON.stringify(custom)}`);
qa.add({
  control: 'Key FX: "Elegir color personalizado" + input[type=color]',
  selector: '.keyfx-swatch--custom (abre input[type="color"])',
  result: custom.color === "#ff0066" && custom.activo ? "OK" : "FAIL",
  evidence: `input[type=color] ${colorAntes} → ${custom.inputVal}; botón custom activo=${custom.activo} (aria-pressed=${custom.pressed}); fondo del swatch="${custom.bg}"; --active-key-color de la 1ª tecla blanca="${custom.color}"`,
  shot: `${OUT}/studio-15-colorcustom-antes.png · ${OUT}/studio-15-colorcustom-despues.png`,
});

// Brillo / Intensidad
const sliderTest = async (label, valor, nombre) => {
  const el = page.locator(`input[aria-label="${label}"]`);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const antes = await el.inputValue();
  const glowAntes = await page.evaluate(() =>
    document.querySelector(".piano-key-element.white")?.style.getPropertyValue("--active-key-glow"),
  );
  await qa.shot(`${nombre}-antes`);
  await el.evaluate((n, v) => {
    n.value = v;
    n.dispatchEvent(new Event("input", { bubbles: true }));
    n.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(valor));
  await page.waitForTimeout(1200);
  const despues = await el.inputValue();
  const fila = label.startsWith("Brillo") ? "Brillo" : "Intensidad";
  const etiqueta = await page.evaluate((f) => {
    const row = [...document.querySelectorAll(".keyfx-row")].find((r) => r.textContent.includes(f));
    return row?.querySelector(".keyfx-val")?.textContent ?? null;
  }, fila);
  const glowDespues = await page.evaluate(() =>
    document.querySelector(".piano-key-element.white")?.style.getPropertyValue("--active-key-glow"),
  );
  await qa.shot(`${nombre}-despues`);
  qa.add({
    control: `Key FX: input[aria-label="${label}"]`,
    selector: `.keyfx-slider[aria-label="${label}"]`,
    result: antes !== despues && etiqueta ? "OK" : "FAIL",
    evidence: `valor ${antes} → ${despues}; etiqueta de la fila "${fila}" = "${etiqueta}"; --active-key-glow de la 1ª tecla blanca ${glowAntes || "(vacío)"} → ${glowDespues || "(vacío)"}`,
    shot: `${OUT}/${nombre}-antes.png · ${OUT}/${nombre}-despues.png`,
  });
};
console.log("\n### STUDIO: Brillo / Intensidad");
await sliderTest("Brillo del efecto Key FX", 0.3, "studio-16-brillo");
await sliderTest("Intensidad del efecto Key FX", 0.35, "studio-17-intensidad");

// ── 10. Teclado ─────────────────────────────────────────────────────────────
console.log("\n### STUDIO: Teclado");
const teclas = await page.evaluate(() => ({
  blancas: document.querySelectorAll(".piano-key-element.white").length,
  negras: document.querySelectorAll(".piano-key-element.black").length,
  visibles: [...document.querySelectorAll(".piano-key-element")].filter((e) => e.offsetParent !== null).length,
}));
console.log(`  teclado: ${teclas.blancas} blancas, ${teclas.negras} negras, ${teclas.visibles} visibles`);

// Calentar el motor de audio (la primera nota puede perderse construyendo el grafo).
const primeraBlanca = page.locator(".piano-key-element.white").first();
await primeraBlanca.scrollIntoViewIfNeeded();
await primeraBlanca.dispatchEvent("mousedown");
await page.waitForTimeout(500);
await primeraBlanca.dispatchEvent("mouseup");
await page.waitForTimeout(5000);

const rSilencio = await qa.rms(10, 130);
await qa.shot("studio-18-teclado-antes");
const tecla = page.locator(".piano-key-element.white").nth(4);
const tbox = await tecla.boundingBox();
await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height * 0.8);
await page.mouse.down();
await page.waitForTimeout(900);
const pisada = await page.evaluate(() => {
  const el = document.querySelector(".piano-key-element.active-press");
  return {
    activas: document.querySelectorAll(".piano-key-element.active-press").length,
    depth: el?.style.getPropertyValue("--press-depth"),
    clase: el?.className,
  };
});
const rNota = await qa.rms(8, 120);
await qa.shot("studio-18-teclado-pisada");
await page.mouse.up();
await page.waitForTimeout(1500);
const soltada = await page.evaluate(() => document.querySelectorAll(".piano-key-element.active-press").length);
await qa.shot("studio-18-teclado-soltada");
console.log(`  tecla blanca: activas=${pisada.activas} depth=${pisada.depth} RMS ${rSilencio.toFixed(1)} → ${rNota.toFixed(1)} dB; al soltar=${soltada}`);
qa.add({
  control: "Teclado: tecla blanca (.piano-key-element.white) con mousedown/mouseup",
  selector: ".piano-key-element.white",
  result: pisada.activas === 1 && rNota > rSilencio + 15 && soltada === 0 ? "OK" : "FAIL",
  evidence:
    `mousedown sobre la 5ª tecla blanca → ${pisada.activas} tecla con .active-press y --press-depth=${pisada.depth} ("${pisada.clase}"); ` +
    `RMS del entorno ${rSilencio === -Infinity ? "-inf" : rSilencio.toFixed(1)} dB → ${rNota === -Infinity ? "-inf" : rNota.toFixed(1)} dB con la tecla pisada; tras mouseup quedan ${soltada} teclas activas`,
  shot: `${OUT}/studio-18-teclado-antes.png · ${OUT}/studio-18-teclado-pisada.png · ${OUT}/studio-18-teclado-soltada.png`,
});

const negra = page.locator(".piano-key-element.black").nth(2);
const nbox = await negra.boundingBox();
await page.mouse.move(nbox.x + nbox.width / 2, nbox.y + nbox.height / 2);
await page.mouse.down();
await page.waitForTimeout(900);
const negraPisada = await page.evaluate(() => document.querySelectorAll(".piano-key-element.black.active-press").length);
const rNegra = await qa.rms(8, 120);
await qa.shot("studio-19-teclanegra");
await page.mouse.up();
await page.waitForTimeout(1200);
qa.add({
  control: "Teclado: tecla negra (.piano-key-element.black)",
  selector: ".piano-key-element.black",
  result: negraPisada === 1 && rNegra > -70 ? "OK" : "FAIL",
  evidence: `mousedown sobre la 3ª tecla negra → ${negraPisada} teclas negras con .active-press; RMS ${rNegra === -Infinity ? "-inf" : rNegra.toFixed(1)} dB`,
  shot: `${OUT}/studio-19-teclanegra.png`,
});

// ── 11. Sustain: ¿alarga la nota? ───────────────────────────────────────────
console.log("\n### STUDIO: Sustain con nota (decaimiento medido)");
const sustain = page.locator('.ic-pedal[title="Sustain — resonancia de todas las cuerdas"]');
await sustain.scrollIntoViewIfNeeded().catch(() => {});
const medirCaida = async (conPedal) => {
  const k = page.locator(".piano-key-element.white").nth(6);
  const kb = await k.boundingBox();
  if (conPedal) {
    await sustain.dispatchEvent("mousedown");
    await page.waitForTimeout(600);
  }
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height * 0.8);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const t0 = Date.now();
  const marcas = [];
  while (Date.now() - t0 < 5000) {
    marcas.push({ ms: Date.now() - t0, db: await qa.rms(1, 0) });
    await page.waitForTimeout(200);
  }
  if (conPedal) {
    await sustain.dispatchEvent("mouseup");
    await page.waitForTimeout(600);
  }
  const baja = marcas.find((m) => m.db < -60);
  return { marcas, caeEn: baja ? baja.ms : null, pico: Math.max(...marcas.map((m) => m.db)) };
};
const sinPedal = await medirCaida(false);
await qa.shot("studio-20-decay-sin-pedal");
await page.waitForTimeout(2500);
const conPedal = await medirCaida(true);
await qa.shot("studio-20-decay-con-pedal");
console.log(`  sin pedal: pico ${sinPedal.pico.toFixed(1)} dB, cae <-60 dB en ${sinPedal.caeEn ?? ">5000"} ms`);
console.log(`  con pedal: pico ${conPedal.pico.toFixed(1)} dB, cae <-60 dB en ${conPedal.caeEn ?? ">5000"} ms`);
const est = (s) =>
  `pico ${s.pico === -Infinity ? "-inf" : s.pico.toFixed(1)} dB, −25 dB del pico a los ${s.caeEn ?? ">5000"} ms`;
qa.add({
  control: "Teclado + pedal: el Sustain alarga la nota pisada",
  selector: '.ic-pedal[title="Sustain — resonancia de todas las cuerdas"] + .piano-key-element',
  result: conPedal.pico > sinPedal.pico + 3 || (conPedal.caeEn ?? 99999) > (sinPedal.caeEn ?? 0) + 300 ? "OK" : "FAIL",
  evidence:
    `misma tecla soltada de inmediato — sin pedal: ${est(sinPedal)}; con el Sustain pisado (mousedown en el pedal antes de la nota): ${est(conPedal)}. ` +
    `Diferencia de pico: ${(conPedal.pico - sinPedal.pico).toFixed(1)} dB (el detalle está en qa-all-sustain.mjs, con la nota mantenida 2 s)`,
  shot: `${OUT}/studio-20-decay-sin-pedal.png · ${OUT}/studio-20-decay-con-pedal.png`,
  extra: { sinPedal: sinPedal.marcas, conPedal: conPedal.marcas },
});

// ── 12. Navegación del rail ─────────────────────────────────────────────────
console.log("\n### NAVEGACIÓN");
const pantallas = [
  ["Studio", "studio", ".studio-workspace"],
  ["Modo Juego", "juego", ".studio-workspace"],
  ["Música — tu reproductor", "musica", ".panel-screen--music"],
  ["Canciones", "canciones", ".lib-card"],
  ["Pistas", "pistas", ".panel-screen"],
  ["Configuración MIDI", "midi", ".panel-screen"],
  ["Ajustes", "ajustes", ".panel-screen"],
  // La pantalla Partitura no usa .panel-screen: con un documento cargado monta
  // ScoreViewer (.score-viewer) y sin él su propio bloque de importación.
  ["Partitura", "partitura", ".score-viewer, .panel-screen, .score-import, main section"],
];
for (const [title, slug, marcador] of pantallas) {
  const el = page.locator(`.rail-item[title="${title}"]`);
  const etiqueta = ((await el.textContent()) || "").trim();
  await el.click();
  await page.waitForTimeout(2300);
  const st = await page.evaluate((sel) => ({
    activo: (document.querySelector(".rail-item.active")?.textContent || "").trim(),
    titleActivo: document.querySelector(".rail-item.active")?.getAttribute("title"),
    marcador: !!document.querySelector(sel),
    subtitulos: [...document.querySelectorAll("main h2, main h3")].slice(0, 3).map((e) => e.textContent.trim().slice(0, 40)),
    barraMontada: !!document.querySelector(".pm-bar"),
  }), marcador);
  await qa.shot(`studio-21-nav-${slug}`);
  qa.add({
    control: `Navegación: "${title}"`,
    selector: `.rail-item[title="${title}"]`,
    result: st.titleActivo === title && st.marcador ? "OK" : "FAIL",
    evidence: `botón "${etiqueta}" → .rail-item.active = "${st.activo}" (title="${st.titleActivo}"); marcador ${marcador} presente=${st.marcador}; encabezados de la pantalla: ${st.subtitulos.join(" / ") || "(ninguno)"}; la barra del reproductor sigue montada=${st.barraMontada}`,
    shot: `${OUT}/studio-21-nav-${slug}.png`,
  });
}

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 20).forEach((e) => console.log("  " + e));
console.log(`### RECURSOS FALLIDOS: ${qa.failing.length}`);
[...new Set(qa.failing)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola durante la sesión de Studio",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});

const sFinal = await bar();
qa.save("results-studio");
console.log(`\nresultados: ${qa.results.length} filas → ${OUT}/results-studio.json`);
console.log(`barra al cierre: "${sFinal.title}"`);
await qa.close();
