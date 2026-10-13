// ============================================================
// qa-all-sustain — ¿el pedal de Sustain alarga de verdad una nota del teclado?
//
// La primera medición (qa-all-studio.mjs) dio que la nota decaía ANTES con el
// pedal pisado (228 ms) que sin él (406 ms). Para descartar que fuera ruido del
// muestreo se repite con una nota mantenida 2 s y una curva de decaimiento
// medida en 25 puntos (5 lecturas por punto, se guarda el pico).
//
// Salida: .logs/qa/results-sustain.json  +  .logs/qa/sustain-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";
import { writeFileSync } from "node:fs";

const qa = await openQA();
const { page } = qa;

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);

const tecla = page.locator(".piano-key-element.white").nth(4);
const sustain = page.locator('.ic-pedal[title="Sustain — resonancia de todas las cuerdas"]');
const voz = () =>
  page.evaluate(() => {
    const l = [...document.querySelectorAll(".ic-label")].find((x) => /Half-Pedal/i.test(x.textContent || ""));
    return {
      pedal: document.querySelector('.ic-pedal[title="Sustain — resonancia de todas las cuerdas"]')?.className,
      half: l?.querySelector(".ic-value")?.textContent ?? null,
      vestigios: !!document.querySelector(".playback-bar .spinner"),
    };
  });

// Calentar el motor y dejar constancia de que la tecla suena.
await tecla.scrollIntoViewIfNeeded();
await tecla.dispatchEvent("mousedown");
await page.waitForTimeout(400);
await tecla.dispatchEvent("mouseup");
await page.waitForTimeout(4000);
const calentamiento = await qa.rms(6, 120);
console.log(`### calentamiento: RMS ${calentamiento === -Infinity ? "-inf" : calentamiento.toFixed(1)} dB · ${JSON.stringify(await voz())}`);

const medir = async (conPedal, etiqueta) => {
  if (conPedal) {
    await sustain.dispatchEvent("mousedown");
    await page.waitForTimeout(700);
  }
  const clasePisado = (await sustain.getAttribute("class")) || "";
  const box = await tecla.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.waitForTimeout(2000);
  const sostenida = await qa.rms(5, 90);
  await page.mouse.up();
  const t0 = Date.now();
  const curva = [];
  for (let i = 0; i < 26; i++) {
    const db = await qa.rms(5, 70);
    curva.push({ ms: Date.now() - t0, db });
    await page.waitForTimeout(150);
  }
  if (conPedal) {
    await sustain.dispatchEvent("mouseup");
    await page.waitForTimeout(600);
  }
  const pico = Math.max(sostenida, ...curva.map((c) => c.db));
  const baja = curva.find((c) => c.db < pico - 25);
  const silencio = curva.find((c) => c.db < -75);
  console.log(
    `\n--- ${etiqueta} ---\n` +
      `    pedal pisado durante la nota: ${clasePisado.includes("ic-pedal--sustain")}\n` +
      `    RMS con la tecla sostenida 2 s: ${sostenida === -Infinity ? "-inf" : sostenida.toFixed(1)} dB (pico global ${pico === -Infinity ? "-inf" : pico.toFixed(1)} dB)\n` +
      `    −25 dB respecto al pico a los ${baja ? baja.ms : ">4000"} ms · por debajo de −75 dB a los ${silencio ? silencio.ms : ">4000"} ms\n` +
      `    curva: ${curva.filter((_, i) => i % 5 === 0).map((c) => `${(c.ms / 1000).toFixed(1)}s:${c.db === -Infinity ? "-inf" : c.db.toFixed(1)}`).join(" ")}`,
  );
  return { curva, pico, baja25: baja?.ms ?? null, silencio: silencio?.ms ?? null, sostenida, clasePisado };
};

const sinPedal = await medir(false, "1. SIN pedal");
await qa.shot("sustain-01-sin-pedal");
await page.waitForTimeout(3000);
const conPedal = await medir(true, "2. CON pedal de Sustain pisado");
await qa.shot("sustain-02-con-pedal");
await page.waitForTimeout(3000);

const gana = conPedal.pico > sinPedal.pico + 3 || (conPedal.baja25 ?? 99999) > (sinPedal.baja25 ?? 0) + 300;
console.log(`\n### veredicto: ${gana ? "el pedal ALARGA/REFUERZA la nota" : "el pedal NO cambia el decaimiento medible"}`);
qa.add({
  control: "Pedales: Sustain — ¿alarga de verdad la nota del teclado?",
  selector: '.ic-pedal[title="Sustain — resonancia de todas las cuerdas"]',
  result: gana ? "OK" : "FAIL",
  evidence:
    `nota mantenida 2 s y luego soltada, curva de 26 puntos (pico de 5 lecturas cada ~150 ms). ` +
    `SIN pedal: pico ${sinPedal.pico === -Infinity ? "-inf" : sinPedal.pico.toFixed(1)} dB, −25 dB respecto al pico a los ${sinPedal.baja25 ?? ">4000"} ms, silencio (<−75 dB) a los ${sinPedal.silencio ?? ">4000"} ms. ` +
    `CON el pedal pisado (clase ic-pedal--sustain activa: ${conPedal.clasePisado.includes("ic-pedal--sustain")}): pico ${conPedal.pico === -Infinity ? "-inf" : conPedal.pico.toFixed(1)} dB, −25 dB a los ${conPedal.baja25 ?? ">4000"} ms, silencio a los ${conPedal.silencio ?? ">4000"} ms. ` +
    `Diferencia de pico: ${(conPedal.pico - sinPedal.pico).toFixed(1)} dB`,
  shot: `${OUT}/sustain-01-sin-pedal.png · ${OUT}/sustain-02-con-pedal.png`,
  extra: { sinPedal, conPedal },
});

writeFileSync(`${OUT}/sustain-curvas.json`, JSON.stringify({ sinPedal, conPedal }, null, 2));
console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-sustain");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-sustain.json`);
await qa.close();
