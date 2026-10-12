// QA del flujo de biblioteca: Canciones → elegir canción → cambiar de canción.
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar", { timeout: 25000 });

const bar = async (etiqueta) => {
  const s = await page.evaluate(() => {
    const b = document.querySelector(".pm-bar");
    const range = b?.querySelector('input[type="range"]');
    return {
      texto: (b?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      max: range ? Number(range.max) : null,
      val: range ? Number(range.value) : null,
      botones: [...(b?.querySelectorAll("button") || [])]
        .filter((x) => ["Reproducir", "Pausar"].includes(x.getAttribute("aria-label") || ""))
        .map((x) => x.getAttribute("aria-label")),
    };
  });
  console.log(`--- ${etiqueta}: "${s.texto}" | seeker ${s.val}/${s.max} | ${s.botones.join(",") || "sin botón play"}`);
  return s;
};

await bar("inicio");
// Ir a la pestaña Canciones
const tab = page.locator('button:has-text("Canciones")').first();
if (await tab.count()) {
  await tab.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: ".logs/qa/13-biblioteca.png" });
  const cards = page.locator(".song-card, .track-card, [class*=card]").filter({ hasText: /\w/ });
  console.log(`tarjetas encontradas: ${await cards.count()}`);
  if (await cards.count()) {
    await cards.first().click();
    await page.waitForTimeout(3000);
    await bar("tras elegir canción 1");
    await page.screenshot({ path: ".logs/qa/14-cancion-elegida.png" });
    // Cambiar a otra canción
    if ((await cards.count()) > 1) {
      await cards.nth(1).click();
      await page.waitForTimeout(4000);
      await bar("tras cambiar a canción 2");
      await page.screenshot({ path: ".logs/qa/15-cancion-cambiada.png" });
    }
  }
}
await browser.close();
