// ============================================================
// covers-discover.mjs — find HD cover art for every song, from Spotify, in a
// real browser.
//
//   node scripts/covers-discover.mjs [--limit N] [--only d.<id>] [--refresh]
//
// Requires a Chromium with the DevTools protocol open (see the header of
// scripts/covers-chrome.ps1) exported as SPOTIFY_CDP, e.g.
//   $env:SPOTIFY_CDP = "http://127.0.0.1:9222"
//
// Why a live browser and not the Web API: the API needs OAuth credentials this
// project does not have, and public oEmbed only accepts *known* track ids. The
// search page renders exactly what a person sees, so a browser is the honest
// source — and it needs no account.
//
// Output: scripts/covers-found.json
//   per track: the Spotify track id, the canonical title/artist it matched, a
//   confidence score and the 640px cover URL. Nothing is downloaded here; that
//   is covers-fetch.mjs.
//
// Resumable: a track that already has a coverUrl is skipped unless --refresh.
// ============================================================

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { readCatalog } from "./covers-catalog.mjs";

const OUT = "scripts/covers-found.json";
const LOG_EVERY = 10;

// ── args ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argValue = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const limit = Number(argValue("--limit") ?? 0) || Infinity;
const only = argValue("--only");
const refresh = argv.includes("--refresh");

// ── catalogue ──────────────────────────────────────────────────────
const catalog = readCatalog();
if (catalog.problems.length) {
  console.error(`catalogue problems: ${catalog.problems.join(" | ")}`);
  process.exit(1);
}
let songs = catalog.songs;
if (only) songs = songs.filter((s) => s.trackId === only || s.file === only);
songs = songs.slice(0, limit === Infinity ? songs.length : limit);

// ── resume ─────────────────────────────────────────────────────────
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { results: {} };
const results = previous.results ?? {};
const pending = songs.filter((s) => refresh || !results[s.trackId]?.coverUrl);
console.log(
  `catalogue ${catalog.songs.length} | in scope ${songs.length} | already done ${
    songs.length - pending.length
  } | to fetch ${pending.length}`,
);

if (pending.length === 0) {
  console.log("nothing to do");
  process.exit(0);
}

// ── matching ───────────────────────────────────────────────────────

/** Case/diacritic-insensitive, punctuation-free, parentheticals dropped. */
const fold = (value) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Token overlap (0..1) — tolerant of "Ruben Blades & Willie Colon". */
function similarity(a, b) {
  const A = new Set(fold(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(fold(b).split(" ").filter((w) => w.length > 2));
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.max(A.size, B.size);
}

/**
 * How well a row's artist line credits the wanted performer.
 *
 * Spotify credits every performer ("Jorge Celedón, Jimmy Zambrano") while the
 * catalogue names one, so comparing against the joined string would cap a
 * perfectly correct match at 0.5. The best single credit is the honest answer:
 * the track *is* by the artist we asked for.
 */
function artistAgreement(wanted, credited) {
  const names = (credited ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return 0;
  return Math.max(...names.map((name) => similarity(wanted, name)));
}

/**
 * Artist names the catalogue uses as a bucket rather than a performer. A few
 * bolero/vallenato rows credit "Bolero Clásico" / "Vallenato Clásico" / "Varios"
 * (they are folk standards with no single canonical interpreter), and no
 * Spotify result can ever agree with those. Scored normally they would drag a
 * correct title match down to the 0.5 threshold, so the artist term is dropped
 * for them and the title decides alone.
 */
const GENERIC_ARTISTS = new Set([
  "varios",
  "vallenato clasico",
  "bolero clasico",
  "artistas varios",
  "varios artistas",
  "desconocido",
  "anonimo",
]);

function isGenericArtist(artist) {
  return GENERIC_ARTISTS.has(fold(artist));
}

/**
 * Searching "Ay Hombre Jorge Celedón" surfaces "Ay Hombre (In the Style of
 * Jorge Celedon) [Karaoke Version]" by a karaoke label, which scores well on
 * both sides and would put a karaoke sleeve on the track. These are the
 * marketing phrases those releases use, so they are demoted hard — never
 * excluded, because for an obscure song a karaoke edition may be the only art
 * that exists at all.
 */
const KARAOKE_MARKERS = [
  "karaoke",
  "in the style of",
  "originally performed",
  "tribute",
  "cover version",
  "made famous by",
  "as made famous",
  "backing track",
  "playback",
  "instrumental version",
];

function karaokePenalty(title, artists) {
  const haystack = fold(`${title} ${artists}`);
  return KARAOKE_MARKERS.some((marker) => haystack.includes(marker)) ? 0.35 : 1;
}

/**
 * Spotify serves one square master behind fixed size slots. Measured against
 * the live CDN: `…00004851…`=64px, `…00001e02…`=300px, `…0000b273…`=640px,
 * and anything larger (9000/8000/…) 404s. So 640px IS the HD master, and this
 * rewrites whatever slot the page handed us to that one.
 */
const HD_SLOT = "0000b273";

/**
 * Pulls the stable parts out of any i.scdn.co size variant.
 * Layout: `<master:8>` + `<size slot:8>` + `<image hash:24>`. Only the master
 * and the hash identify the asset; the slot is what we get to choose.
 */
function imageParts(url) {
  const match = url?.match(/\/image\/([0-9a-f]{8})[0-9a-f]{8}([0-9a-f]{24})/i);
  return match ? { master: match[1], hash: match[2] } : null;
}

/** The same asset at Spotify's HD slot. */
function hdUrl(url) {
  const parts = imageParts(url);
  return parts ? `https://i.scdn.co/image/${parts.master}${HD_SLOT}${parts.hash}` : null;
}

function slugify(value, max = 60) {
  return fold(value).replace(/\s+/g, "-").slice(0, max).replace(/-+$/, "");
}

/**
 * Spotify's public oEmbed. Credential-free, and it confirms that a track id
 * really resolves (and to what title). It carries no artist field, so the
 * artist always comes from the search row itself.
 */
async function oembed(trackId) {
  const target = `https://open.spotify.com/track/${trackId}`;
  const res = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(target)}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return { title: (data.title ?? "").trim(), thumbnail: data.thumbnail_url ?? null };
}

// ── browser ────────────────────────────────────────────────────────
const cdp = process.env.SPOTIFY_CDP;
if (!cdp) {
  console.error(
    "SPOTIFY_CDP is not set.\n" +
      "  1. pwsh -File scripts/covers-chrome.ps1\n" +
      "  2. $env:SPOTIFY_CDP = (Get-Content $env:TEMP\\pm-cdp.txt -Raw).Trim()",
  );
  process.exit(125);
}

const browser = await chromium.connectOverCDP(cdp, { timeout: 120000 });
const context = browser.contexts()[0] ?? (await browser.newContext({ locale: "es-CO" }));
const page = await context.newPage();
await page.route("**/*", (route) => {
  const type = route.request().resourceType();
  // A cover search needs neither fonts nor media, and dropping them roughly
  // halves the load time of each of the ~157 searches.
  if (type === "font" || type === "media") return route.abort();
  return route.continue();
});
page.setDefaultTimeout(30000);

/** Reads the ranked result rows of the current search page. */
async function readResults() {
  // Result art is lazy-loaded, and for rows below the fold it is not in the DOM
  // at all until they scroll into view.
  await page.evaluate(async () => {
    for (let y = 0; y < 1400; y += 350) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });

  return page.evaluate(() => {
    const rows = [];
    const seen = new Set();

    for (const link of document.querySelectorAll('a[href*="/track/"]')) {
      const href = link.getAttribute("href") ?? "";
      // Spotify localises hrefs ("/intl-es/track/<id>"), so split on the LAST
      // "/track/" rather than assuming a leading slash.
      const trackId = href.split("/track/").pop()?.split("?")[0];
      if (!trackId || seen.has(trackId)) continue;

      // Climb until the subtree also carries the artist credit; that node is
      // the whole result row (art + title + artists).
      let node = link;
      for (let i = 0; i < 6 && node.parentElement; i++) {
        node = node.parentElement;
        if (node.querySelector('a[href*="/artist/"]')) break;
      }

      const artistLinks = [...node.querySelectorAll('a[href*="/artist/"]')].map((a) =>
        (a.innerText ?? "").replace(/\s+/g, " ").trim(),
      );
      if (artistLinks.length === 0) continue;
      seen.add(trackId);

      const img = node.querySelector("img") ?? link.querySelector("img");
      rows.push({
        trackId,
        title: (link.innerText ?? "").replace(/\s+/g, " ").trim(),
        artists: [...new Set(artistLinks.filter(Boolean))].join(", "),
        cover: img?.currentSrc || img?.src || null,
      });
    }
    return rows.slice(0, 12);
  });
}

/**
 * Runs one search and ranks what came back.
 *
 * The catalogue's artist is a good filter for the vallenato/salsa packs, but
 * several bolero rows carry a placeholder ("Bolero Clásico") that matches
 * nothing on Spotify. So the caller searches with and without it and keeps
 * whichever answer agrees better with what we actually know.
 */
async function search(song, query) {
  const url = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  // The grid is client-rendered; wait for the first card rather than a fixed
  // sleep, then give the lazy images a moment to resolve their src.
  await page.waitForSelector('a[href*="/track/"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const rows = await readResults();
  if (rows.length === 0) return null;

  const scored = rows
    .map((row) => {
      const titleScore = similarity(song.title, row.title);
      const artistScore = isGenericArtist(song.artist)
        ? 0
        : artistAgreement(song.artist, row.artists);
      const penalty = karaokePenalty(row.title, row.artists);
      return {
        row,
        titleScore,
        artistScore,
        penalty,
        // The TITLE dominates and the artist breaks ties. Weighting them
        // equally made a different-but-plausible interpreter outrank the right
        // song ("Gema" credited to Los Dandys instead of Los Panchos), and it
        // parked every correct title with an unmatched artist exactly on the
        // 0.5 threshold, where the accept/reject decision became a coin flip.
        //
        // Normalised back to 0..1 (the artist term can only add 0.3), so the
        // confidence written to the manifest keeps meaning "how much of a
        // perfect match this is" and the 0.5 cut-off stays interpretable.
        score: ((titleScore + 0.3 * artistScore) * penalty) / 1.3,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Among rows that match the title EQUALLY well — every "Gema" is a perfect
  // title match — the credited artist is the only thing separating them, and a
  // plain score sort silently kept whichever Spotify happened to rank last
  // (Los Dandys over Los Panchos). So the best title agreement is locked first,
  // and only then does the artist decide.
  const topTitle = scored[0].titleScore;
  const titleMatched = scored.filter((c) => Math.abs(c.titleScore - topTitle) < 1e-9);
  titleMatched.sort((a, b) => b.score - a.score);

  const rest = scored
    .filter((c) => Math.abs(c.titleScore - topTitle) >= 1e-9)
    .slice(0, 2);

  return { query, candidates: rows.length, best: titleMatched[0], runnersUp: [...titleMatched.slice(1), ...rest].slice(0, 3) };
}

const save = () => {
  mkdirSync("scripts", { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "open.spotify.com — live browser (Playwright over CDP)",
        results,
      },
      null,
      2,
    )}\n`,
  );
};

// ── the sweep ──────────────────────────────────────────────────────
let done = 0;
let failed = 0;

for (const song of pending) {
  const record = {
    n: song.n,
    trackId: song.trackId,
    file: song.file,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    status: "pending",
    coverUrl: null,
    spotifyTrackId: null,
    spotifyTitle: null,
    spotifyArtists: null,
    confidence: 0,
    candidates: 0,
    queriesTried: [],
    slug: null,
    fetchedAt: new Date().toISOString(),
  };

  try {
    // Pass 1 is the precise query. Pass 2 runs only when pass 1 did not find a
    // convincing title, which is the "artist is a bucket name" case (or an
    // artist Spotify spells differently): a title-only search then surfaces a
    // canonical recording the artist filter was hiding.
    const attempts = [await search(song, `${song.title} ${song.artist}`)];
    if (!attempts[0] || attempts[0].best.titleScore < 0.7) {
      attempts.push(await search(song, song.title));
    }

    const usable = attempts.filter(Boolean);
    record.candidates = usable.reduce((max, a) => Math.max(max, a.candidates), 0);

    if (usable.length === 0) {
      record.status = "no-results";
    } else {
      const winner = usable.reduce((a, b) => (b.best.score > a.best.score ? b : a));
      const best = winner.best;
      const embed = await oembed(best.row.trackId);
      // Prefer the row's own art (it is the album the song was found on); fall
      // back to the embed's thumbnail when the lazy image never resolved.
      const coverUrl = hdUrl(best.row.cover) ?? hdUrl(embed?.thumbnail);

      record.coverUrl = coverUrl;
      record.spotifyTrackId = best.row.trackId;
      record.spotifyTitle = embed?.title ?? best.row.title;
      record.spotifyArtists = best.row.artists;
      record.titleScore = Number(best.titleScore.toFixed(3));
      record.artistScore = Number(best.artistScore.toFixed(3));
      record.penalty = best.penalty;
      record.confidence = Number(best.score.toFixed(3));
      record.queriesTried = usable.map((a) => a.query);
      record.slug = slugify(`${song.title}-${song.artist}`);
      record.runnersUp = winner.runnersUp.map((c) => ({
        title: c.row.title,
        artists: c.row.artists,
        score: Number(c.score.toFixed(3)),
      }));
      record.status = coverUrl ? "ok" : "no-cover";
    }
  } catch (error) {
    record.status = "error";
    record.error = String(error.message ?? error).slice(0, 200);
  }

  results[song.trackId] = record;
  done++;
  if (record.status !== "ok") failed++;
  if (record.status !== "ok" || done % LOG_EVERY === 0 || done === pending.length) save();

  console.log(
    `[${done}/${pending.length}] ${record.status.padEnd(10)} conf=${record.confidence} ` +
      `${song.title} — ${song.artist}`,
  );
  if (record.spotifyArtists) {
    console.log(`        spotify: ${record.spotifyTitle} — ${record.spotifyArtists}`);
  }
  if (record.coverUrl) console.log(`        ${record.coverUrl}`);

  // Deliberately unhurried: this is someone else's site, and a burst of ~160
  // searches looks exactly like what it is.
  await page.waitForTimeout(700 + Math.random() * 600);
}

save();

// ── summary ────────────────────────────────────────────────────────
const all = Object.values(results);
const okCount = all.filter((r) => r.status === "ok").length;
const weak = all.filter((r) => r.status !== "ok" || r.confidence < 0.6);
console.log("\n════════ summary ════════");
console.log(`with a cover: ${okCount}/${all.length} | failed this run: ${failed}`);
console.log(`needs review (<0.6 or not ok): ${weak.length}`);
for (const r of weak.slice(0, 40)) {
  console.log(
    `  ${String(r.confidence).padEnd(5)} ${r.title} — ${r.artist}  →  ` +
      `${r.spotifyTitle ?? r.status} (${r.spotifyArtists ?? "-"})`,
  );
}
console.log("\nnext: node scripts/covers-fetch.mjs");

await page.close();
await browser.close();
