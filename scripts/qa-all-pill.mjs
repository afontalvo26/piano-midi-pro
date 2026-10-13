// ============================================================
// qa-all-pill — ¿qué TEXTO llega a pintarse en la píldora de estado?
//
// Por qué este script aparte: en qa-all-startup.mjs la píldora nunca mostró
// "Preparando el motor de audio…", pero esa cadena SÍ existe en el código
// (App.tsx:998, primera línea de `initializeAudio`). La duda es si React la
// pinta y se pierde entre dos muestras, o si nunca llega al DOM porque el
// `setAudioStatusMessage` siguiente cae en el mismo lote.
//
// Un `setInterval` de 50 ms puede perder un texto corto. Un MutationObserver
// sobre el nodo NO pierde nada: registra cada mutación real del DOM. Eso es lo
// que mide este script, que es la única forma de saber qué vio el usuario.
//
// Salida: .logs/qa/results-pill.json  +  .logs/qa/pill-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";

const FIXTURE = "app/public/demo/QA_Arranque_0s.mid";
const CANCION = "app/public/demo/Bolero_-_Besame_Mucho.kar";

const qa = await openQA();
const { page } = qa;

/**
 * Instala un MutationObserver sobre la píldora. Se instala ANTES de pulsar
 * Reproducir y se engancha al nodo real (la píldora se re-renderiza, así que se
 * observa el contenedor y se filtra por la clase).
 */
const instalarObservador = () =>
  page.evaluate(() => {
    const cont = document.querySelector(".status-pills") || document.body;
    window.__PILLMUT = [];
    const t0 = performance.now();
    const leer = () => {
      const p = document.querySelector(".status-pill:last-child");
      return (p?.textContent || "").trim();
    };
    const push = (motivo) => {
      const txt = leer();
      const prev = window.__PILLMUT[window.__PILLMUT.length - 1];
      if (!prev || prev.txt !== txt) {
        window.__PILLMUT.push({ ms: Math.round(performance.now() - t0), txt, motivo });
      }
    };
    push("inicio");
    const mo = new MutationObserver(() => push("mutacion"));
    mo.observe(cont, { subtree: true, childList: true, characterData: true, attributes: true });
    window.__PILLMO = mo;
    return true;
  });

const leerMutaciones = () => page.evaluate(() => window.__PILLMUT || []);

const medir = async (ruta, etiqueta) => {
  await page.goto(URL);
  await page.waitForSelector(".pm-bar", { timeout: 25000 });
  await page.waitForTimeout(3000);
  await page.locator('.rail-item[title="Studio"]').click();
  await page.waitForTimeout(1200);
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(ruta);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
    { timeout: 40000 },
  );
  await page.waitForTimeout(2000);
  await instalarObservador();
  const tClick = Date.now();
  await page.locator(".playback-bar .btn.primary").click();

  // Se muestrea el audio hasta 20 s para que la ventana cubra todo el arranque.
  let primerSonido = null;
  while (Date.now() - tClick < 20000) {
    const v = await page.evaluate(() => window.__RMS());
    const ms = Date.now() - tClick;
    if (primerSonido === null && v !== null && v > -70) {
      primerSonido = ms;
      await qa.shot(`pill-${etiqueta}-primer-sonido`);
      break;
    }
    await page.waitForTimeout(200);
  }
  // Y se sigue observando 12 s más para capturar los textos post-arranque.
  await page.waitForTimeout(12000);
  const muts = await leerMutaciones();
  await qa.shot(`pill-${etiqueta}-final`);
  console.log(`\n### ${etiqueta} (${ruta.split("/").pop()}) — primera señal a los ${primerSonido ?? "?"} ms`);
  console.log(`  ${muts.length} cambios de texto en la píldora, TODOS capturados por MutationObserver:`);
  muts.forEach((m) => console.log(`    +${String(m.ms).padStart(6)} ms  "${m.txt}"   [${m.motivo}]`));
  return { etiqueta, archivo: ruta.split("/").pop(), primerSonido, muts };
};

const r1 = await medir(FIXTURE, "fixture");
const r2 = await medir(CANCION, "cancion");

const todos = [...r1.muts, ...r2.muts];
const textos = [...new Set(todos.map((m) => m.txt))];
const preparando = todas(r1, r2).some((m) => /Preparando el motor de audio/i.test(m.txt));
const contador = todas(r1, r2).filter((m) => /Cargando instrumentos \d+\/\d+/i.test(m.txt));
const avanza = contador.length >= 2 && Number(/(\d+)\//.exec(contador[contador.length - 1].txt)[1]) > Number(/(\d+)\//.exec(contador[0].txt)[1]);

console.log(`\n### textos únicos que el usuario REALMENTE vio: ${textos.map((t) => `"${t}"`).join(", ")}`);
console.log(`  ¿"Preparando el motor de audio…"? ${preparando} · ¿"Cargando instrumentos N/M…"? ${contador.length > 0} (${contador.map((c) => c.txt).join(" → ")}) · ¿avanza? ${avanza}`);

qa.add({
  control: "D3 · Píldora de estado del audio: qué textos se pintan de verdad (MutationObserver, sin pérdidas)",
  selector: ".status-pill (última) — pinta `audioStatusMessage`",
  result: contador.length > 0 && avanza ? "OK" : "FAIL",
  evidence:
    `Observada con un MutationObserver sobre el contenedor de píldoras (no con muestreo periódico, que sí puede perder textos cortos), durante dos arranques en frío completos. ` +
    `Secuencia del arranque con el fixture: ${r1.muts.map((m) => `+${m.ms} ms "${m.txt}"`).join(" → ") || "(sin cambios)"}. ` +
    `Secuencia del arranque con la canción real: ${r2.muts.map((m) => `+${m.ms} ms "${m.txt}"`).join(" → ") || "(sin cambios)"}. ` +
    `¿Se pintó "Preparando el motor de audio…"? **${preparando}** · ¿se pintó "Cargando instrumentos N/M…"? **${contador.length > 0}** ` +
    `(${contador.map((c) => c.txt).join(" → ") || "no"}) · ¿el contador avanza? **${avanza}**`,
  shot: `${OUT}/pill-fixture-final.png · ${OUT}/pill-cancion-final.png`,
  extra: { r1, r2, textos, preparando, contador, avanza },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-pill");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-pill.json`);
await qa.close();

function todas(a, b) {
  return [...a.muts, ...b.muts];
}
