// Sonda numérica: imprime RGB de puntos concretos de dos PNG (para saber si una
// diferencia de píxeles es real o es ruido de sub-píxel / animación).
// Uso: node scripts/qa-pixel-probe.mjs <a.png> <b.png> [x,y ...]
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [fileA, fileB, ...points] = process.argv.slice(2);
const coords = (points.length ? points : ["10,10", "300,80", "670,84", "1200,84", "1000,150"]).map(
  (p) => p.split(",").map(Number),
);

const browser = await chromium.launch();
const page = await browser.newPage();
const dataA = `data:image/png;base64,${readFileSync(fileA).toString("base64")}`;
const dataB = `data:image/png;base64,${readFileSync(fileB).toString("base64")}`;

const out = await page.evaluate(
  async ([a, b, pts]) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const grab = (img) => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const da = grab(ia);
    const db = grab(ib);
    const rows = pts.map(([x, y]) => {
      const i = (y * ia.width + x) * 4;
      return {
        at: `${x},${y}`,
        a: [da[i], da[i + 1], da[i + 2]],
        b: [db[i], db[i + 1], db[i + 2]],
        delta: [da[i] - db[i], da[i + 1] - db[i + 1], da[i + 2] - db[i + 2]],
      };
    });
    // Máxima diferencia por canal en toda la imagen, y en qué píxel está.
    let max = 0;
    let maxAt = null;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(
        Math.abs(da[i] - db[i]),
        Math.abs(da[i + 1] - db[i + 1]),
        Math.abs(da[i + 2] - db[i + 2]),
      );
      if (d > max) {
        max = d;
        const p = i / 4;
        maxAt = { x: p % ia.width, y: Math.floor(p / ia.width) };
      }
    }
    return { size: `${ia.width}x${ia.height}`, rows, maxChannelDelta: max, maxAt };
  },
  [dataA, dataB, coords],
);

console.log(JSON.stringify(out, null, 2));
await browser.close();
