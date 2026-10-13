// ============================================================
// covers-verify.mjs — prove the real artwork actually renders in the app.
//
//   node scripts/covers-verify.mjs [url]
//
// A manifest full of URLs proves nothing if the <img> tags 404, so this loads
// the running app in a live browser and counts the covers that resolved to real
// pixels. Prints the ones that failed.
//
// Default url is the dev server from AGENTS.md (port 1234).
// ============================================================

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.argv[2] ?? "http://127.0.0.1:1234/";
const endpoint = process.env.SPOTIFY_CDP;

// Reuse the covers browser when it is already up, otherwise launch our own.
const browser = endpoint
  ? await chromium.connectOverCDP(endpoint, { timeout: 30000 })
  : await chromium.launch({ headless: true });

const context = browser.contexts()[0] ?? (await browser.newContext({ locale: "es-CO" }));
const page = await context.newPage();
page.setDefaultTimeout(20000);

const failedRequests = [];
page.on("response", (response) => {
  const target = response.url();
  if (target.includes("/covers/") && response.status() >= 400) {
    failedRequests.push(`${response.status()} ${target}`);
  }
});

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3000);

await page
  .waitForSelector(".pm-card, .pm-list-row, .pm-cover", { timeout: 25000 })
  .catch(() => console.log("  (no card selector appeared — is the library empty?)"));
await page.waitForTimeout(2500);

const report = await page.evaluate(async () => {
  const manifest = await fetch("/covers/manifest.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const imgs = [...document.querySelectorAll("img.pm-cover__img")];
  // `complete` is false for anything still in flight, so settle the lazy ones.
  await Promise.all(
    imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))),
  );

  const loaded = imgs.filter((img) => img.complete && img.naturalWidth > 0);
  const broken = imgs
    .filter((img) => img.complete && img.naturalWidth === 0)
    .map((img) => img.getAttribute("src"));

  return {
    manifestCount: manifest?.count ?? null,
    manifestSize: manifest?.size ?? null,
    manifestSource: manifest?.source ?? null,
    coversOnPage: imgs.length,
    loaded: loaded.length,
    broken: broken.slice(0, 10),
    naturalWidths: [...new Set(loaded.map((img) => img.naturalWidth))].sort((a, b) => b - a),
    // Any cover still showing initials is one the lookup did not reach.
    initialsStillShown: document.querySelectorAll(".pm-cover__initials").length,
    sampleSrcs: [...new Set(loaded.map((img) => img.getAttribute("src")))].slice(0, 6),
  };
});

console.log("\n════════ cover verification ════════");
console.log(`manifest: ${report.manifestCount} entries (${report.manifestSize})`);
console.log(`source:   ${report.manifestSource}`);
console.log(`<img class="pm-cover__img"> on page: ${report.coversOnPage}`);
console.log(`  loaded with real pixels: ${report.loaded}`);
console.log(
  `  broken: ${report.broken.length}${report.broken.length ? ` → ${report.broken.join(", ")}` : ""}`,
);
console.log(`  natural widths seen: ${report.naturalWidths.join(", ") || "-"}px`);
console.log(`  sample: ${report.sampleSrcs.join(", ") || "-"}`);
console.log(`covers still showing generated initials: ${report.initialsStillShown}`);
console.log(`failed /covers/ requests: ${failedRequests.length}`);
for (const failure of failedRequests.slice(0, 10)) console.log(`  ${failure}`);

mkdirSync("screenshots", { recursive: true });
const shot = "screenshots/covers-verification.png";
await page.screenshot({ path: shot });
writeFileSync(
  "scripts/covers-verify.json",
  `${JSON.stringify({ url, report, failedRequests, at: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`\nscreenshot: ${shot}`);

await page.close();
if (!endpoint) await browser.close();
