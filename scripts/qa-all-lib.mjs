// ============================================================
// qa-all-lib — utilidades compartidas por los scripts de QA del reproductor.
//
// NO es un script ejecutable por sí solo: lo importan qa-all-recon.mjs,
// qa-all-bar.mjs, qa-all-studio.mjs, qa-all-switch.mjs y qa-all-library.mjs.
//
// Provee:
//   • instrumentación de audio (tap sobre AudioNode.prototype.connect cuando
//     el destino es AudioDestinationNode → AnalyserNode → RMS en dBFS)
//   • inventario de controles del DOM (texto / aria-label / title / disabled)
//   • capturas antes/después homogéneas en .logs/qa/
//   • acumulador de resultados OK / FALLA / NO VERIFICABLE en JSON
// ============================================================

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

export const URL = "http://localhost:1234/";
export const OUT = ".logs/qa";

mkdirSync(OUT, { recursive: true });

// ── tap de audio: mide la señal que REALMENTE llega al destino ──────────────
export const AUDIO_TAP = `
(() => {
  let analyser = null, buf = null, taps = 0;
  const ensure = (ctx) => {
    if (analyser) return analyser;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    return analyser;
  };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try { orig.call(this, ensure(this.context)); taps++; } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  };
  window.__TAPS = () => taps;
  window.__HASANALYSER = () => !!analyser;
})();
`;

// ── instrumentación de fuentes: cuántas fuentes de audio siguen vivas ───────
export const SOURCE_TAP = `
(() => {
  window.__SRC = { started: 0, stopped: 0, live: new Set(), created: 0 };
  const oStart = AudioBufferSourceNode.prototype.start;
  const oStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__SRC.started++; window.__SRC.live.add(this);
    this.addEventListener("ended", () => window.__SRC.live.delete(this));
    return oStart.apply(this, a);
  };
  AudioBufferSourceNode.prototype.stop = function (...a) {
    window.__SRC.stopped++; window.__SRC.live.delete(this);
    return oStop.apply(this, a);
  };
})();
`;

/** Abre el navegador con todo instrumentado y devuelve el contexto de QA. */
export async function openQA({ record = true } = {}) {
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.setDefaultTimeout(15000);

  const consoleErrors = [];
  const failing = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text().replace(/\s+/g, " ").slice(0, 200);
      // Ruido conocido y ajeno al reproductor (favicon, HMR, WebMIDI ausente).
      if (/favicon|WebMIDI|hot-update|Download the React DevTools/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).replace(/\s+/g, " ").slice(0, 200)));
  // Los "Failed to load resource" de la consola no dicen QUÉ recurso: se
  // recoge la URL para poder citarla con nombre y apellido.
  page.on("response", (r) => {
    if (r.status() >= 400) failing.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => failing.push(`FAILED ${r.url()} (${r.failure()?.errorText ?? "?"})`));

  await page.addInitScript(AUDIO_TAP);
  await page.addInitScript(SOURCE_TAP);

  const qa = {
    browser,
    page,
    consoleErrors,
    failing,
    results: [],
    shots: [],
    record,
    shot: async (name) => {
      const file = `${OUT}/${name}.png`;
      if (record) await page.screenshot({ path: file }).catch(() => {});
      qa.shots.push(file);
      return file;
    },
    add: (row) => {
      qa.results.push(row);
      const mark = row.result === "OK" ? "OK  " : row.result === "FAIL" ? "FALLA" : "N/V ";
      console.log(`  [${mark}] ${row.control} — ${row.evidence}`);
      return row;
    },
    rms: async (samples = 6, gap = 110) => {
      let best = -Infinity;
      for (let i = 0; i < samples; i++) {
        const v = await page.evaluate(() => window.__RMS());
        if (v !== null && v > best) best = v;
        if (i < samples - 1) await page.waitForTimeout(gap);
      }
      return best;
    },
    src: () => page.evaluate(() => ({ started: __SRC.started, stopped: __SRC.stopped, live: __SRC.live.size })),
    save: (name) => {
      writeFileSync(`${OUT}/${name}.json`, JSON.stringify(qa.results, null, 2));
      return `${OUT}/${name}.json`;
    },
    close: () => browser.close(),
  };
  return qa;
}

/**
 * Inventario de controles del DOM, con el nombre accesible que ve el test.
 * Va como STRING: `page.evaluate(fn)` reenvía la función y cualquier clausura
 * que capture se evalúa en Node —`document is not defined`—, así que el cuerpo
 * tiene que viajar como texto autocontenido.
 */
export const INVENTORY = `(() => {
  const name = (el) =>
    (el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 44) ||
      "").trim();
  const rows = [];
  for (const el of document.querySelectorAll(
    "button, input, select, [role=slider], [role=tab], [role=button]",
  )) {
    const visible = el.offsetParent !== null;
    if (!visible && el.getAttribute("type") !== "file") continue;
    const n = name(el);
    if (!n) continue;
    rows.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      name: n,
      disabled: el.disabled === true,
      cls: (el.className || "").toString().split(" ").filter(Boolean).slice(0, 3).join("."),
      pressed: el.getAttribute("aria-pressed"),
    });
  }
  return rows;
})()`;

/** Estado observable de la barra inferior .pm-bar. */
export const BAR_STATE = `(() => {
  const bar = document.querySelector(".pm-bar");
  if (!bar) return { exists: false };
  const ranges = [...bar.querySelectorAll('input[type="range"]')];
  const seeker = ranges[0];
  const volume = ranges[1];
  const buttons = [...bar.querySelectorAll("button")].map((b) => ({
    label: b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "").trim(),
    disabled: b.disabled,
    pressed: b.getAttribute("aria-pressed"),
  }));
  return {
    exists: true,
    title: (bar.querySelector(".pm-bar__title")?.textContent || "").trim(),
    artist: (bar.querySelector(".pm-bar__artist")?.textContent || "").trim(),
    queueCount: (bar.querySelector(".pm-bar__queue-count")?.textContent || "").trim(),
    queueTotal: (bar.querySelector(".pm-bar__queue-label")?.textContent || "").trim(),
    seekerVal: seeker ? Number(seeker.value) : null,
    seekerMax: seeker ? Number(seeker.max) : null,
    seekerDisabled: seeker ? seeker.disabled : null,
    volume: volume ? Number(volume.value) : null,
    time: [...bar.querySelectorAll(".pm-bar__time")].map((s) => s.textContent.trim()),
    centralLabel: [...bar.querySelectorAll(".pm-bar__transport button")]
      .map((b) => b.getAttribute("aria-label"))
      .find((l) => /^(Pausar|Reproducir)$/.test(l || "")) || null,
    buttons,
  };
})()`;
