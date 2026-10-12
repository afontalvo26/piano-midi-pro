// ¿Qué pasa en la barra del reproductor después de cambiar de canción?
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [error]", m.text().slice(0, 140));
});
await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 25000 });

const dumpBar = async (etiqueta) => {
  const state = await page.evaluate(() => {
    const bar = document.querySelector(".pm-bar");
    if (!bar) return { exists: false };
    const buttons = [...bar.querySelectorAll("button")].map((b) => ({
      label: b.getAttribute("aria-label") || (b.textContent || "").trim().slice(0, 22),
      disabled: b.disabled,
    }));
    const seeker = bar.querySelector('input[type="range"]');
    return {
      exists: true,
      title: (bar.querySelector(".pm-bar__title, .pm-bar__meta, strong")?.textContent || "").trim().slice(0, 50),
      text: (bar.textContent || "").replace(/\s+/g, " ").trim().slice(0, 110),
      buttons,
      seekerMax: seeker ? Number(seeker.max) : null,
    };
  });
  console.log(`\n--- ${etiqueta} ---`);
  if (!state.exists) {
    console.log("  ⚠️  NO existe .pm-bar");
    return state;
  }
  console.log(`  texto: ${state.text}`);
  console.log(`  seeker max: ${state.seekerMax}`);
  console.log(`  botones: ${state.buttons.map((b) => `${b.label}${b.disabled ? "(deshabilitado)" : ""}`).join(" | ")}`);
  return state;
};

await dumpBar("inicio");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles("app/public/demo/Bolero_-_Besame_Mucho.kar");
await page.waitForTimeout(4000);
await dumpBar("canción A cargada");
await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click().catch(() => console.log("  (no había botón Reproducir)"));
await page.waitForTimeout(6000);
await dumpBar("A sonando");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles("app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar");
await page.waitForTimeout(4000);
await dumpBar("B recién cargada");
await page.waitForTimeout(8000);
await dumpBar("B +8s");
await page.screenshot({ path: ".logs/qa/12-estado-tras-cambio.png" });

// Probar el botón de reproducir del Studio (fuera de la barra)
const studioPlay = page.locator('button:has-text("Reproducir")').first();
console.log(`\nbotones "Reproducir" en la página: ${await page.locator('button:has-text("Reproducir")').count()}`);
if (await studioPlay.count()) {
  await studioPlay.click();
  await page.waitForTimeout(5000);
  await dumpBar("tras pulsar Reproducir del Studio");
}

await browser.close();
