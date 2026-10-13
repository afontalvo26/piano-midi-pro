import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
p.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 120)));
try {
  await p.goto("http://localhost:1234/", { waitUntil: "domcontentloaded", timeout: 25000 });
  await p.waitForSelector(".studio-workspace, .pm-bar", { timeout: 25000 });
  const info = await p.evaluate(() => ({
    titulo: document.title,
    raiz: (document.querySelector("#root")?.textContent || "").length,
    barra: !!document.querySelector(".pm-bar"),
    studio: !!document.querySelector(".studio-workspace"),
  }));
  console.log("RENDER OK:", JSON.stringify(info));
} catch (e) {
  console.log("FALLÓ EL RENDER:", String(e).slice(0, 160));
}
await p.screenshot({ path: ".logs/qa/estado-actual.png" });
console.log("errores de consola:", errs.length);
[...new Set(errs)].slice(0, 6).forEach((e) => console.log("  " + e));
await b.close();
