// ============================================================
// covers-catalog.mjs — the demo catalogue, as the cover tooling sees it.
//
// The catalogues are hand-authored TypeScript (inline objects in demoSongs.ts
// plus the compact `{ title, artist, bpm, file }` rows of the two packs), so
// this mirrors those two literal shapes instead of trying to import TS.
//
// `readCatalog()` is the single source of truth for every script in the cover
// pipeline: if it ever disagrees with the app about which songs exist, the
// covers land on the wrong rows.
// ============================================================

import { readFileSync, readdirSync } from "node:fs";

export const CONSTANTS_DIR = "app/src/constants";
export const DEMO_DIR = "app/public/demo";

/** `d.<percent-encoded public path>` — mirrors music/ids.ts exactly. */
export function demoTrackId(path) {
  return `d.${path.replace(/[#?&=%\s]/g, (c) => encodeURIComponent(c))}`;
}

/** Parses one `{ title, artist, bpm, file }` row per line (demoBoleros/demoSalsa). */
function parseCompactPack(source, genre) {
  const rows = [];
  const re =
    /\{\s*title:\s*"((?:[^"\\]|\\.)*)",\s*artist:\s*"((?:[^"\\]|\\.)*)",\s*bpm:\s*([\d.]+),\s*file:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    rows.push({
      title: JSON.parse(`"${m[1]}"`),
      artist: JSON.parse(`"${m[2]}"`),
      bpm: Number(m[3]),
      file: JSON.parse(`"${m[4]}"`),
      genre,
    });
  }
  return rows;
}

/** Parses the multi-line inline catalogue in demoSongs.ts (no `file:` field). */
function parseInlineCatalogue(source) {
  const start = source.indexOf("const CATALOGUE");
  const body = source.slice(start, source.indexOf("];", start));
  const rows = [];
  const re =
    /\{\s*path:\s*"((?:[^"\\]|\\.)*)",\s*title:\s*"((?:[^"\\]|\\.)*)",\s*artist:\s*"((?:[^"\\]|\\.)*)",\s*bpm:\s*([\d.]+),\s*genre:\s*"([a-z]+)",\s*\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    rows.push({
      path: JSON.parse(`"${m[1]}"`),
      title: JSON.parse(`"${m[2]}"`),
      artist: JSON.parse(`"${m[3]}"`),
      bpm: Number(m[4]),
      genre: m[5],
    });
  }
  return rows;
}

/**
 * Every shipped song, in catalogue order, with its stable player id.
 *
 * Returns `{ songs, problems, byGenre }` rather than throwing: a partial parse
 * is still useful for a resumable harvest, but it must be loud about it.
 */
export function readCatalog() {
  const read = (name) => readFileSync(`${CONSTANTS_DIR}/${name}`, "utf8");

  const inline = parseInlineCatalogue(read("demoSongs.ts"));
  const packs = [
    ...parseCompactPack(read("demoBoleros.ts"), "bolero"),
    ...parseCompactPack(read("demoSalsa.ts"), "salsa"),
  ].map((row) => ({ ...row, path: `/demo/${row.file}` }));

  // demoSongs.ts spreads the packs in after its inline rows, so this is the
  // order the library shows.
  const all = [...inline, ...packs];

  const songs = all.map((row, index) => ({
    n: index + 1,
    trackId: demoTrackId(row.path),
    file: row.path.replace("/demo/", ""),
    path: row.path,
    title: row.title,
    artist: row.artist,
    genre: row.genre,
    bpm: row.bpm,
  }));

  const problems = [];
  if (inline.length === 0) problems.push("inline catalogue parsed to 0 rows");
  if (packs.length === 0) problems.push("the packs parsed to 0 rows");

  const ids = new Set(songs.map((s) => s.trackId));
  if (ids.size !== songs.length) {
    problems.push(`duplicate trackIds: ${songs.length - ids.size}`);
  }

  const missing = songs.filter((s) => !existsInDemoDir(s.file)).map((s) => s.file);
  if (missing.length) problems.push(`${missing.length} catalogue rows have no file on disk`);

  const byGenre = {};
  for (const song of songs) byGenre[song.genre] = (byGenre[song.genre] ?? 0) + 1;

  return { songs, problems, byGenre, missing };
}

let demoListing = null;
function existsInDemoDir(file) {
  if (!demoListing) {
    demoListing = new Set(
      readdirSync(DEMO_DIR).filter((f) => /\.(mid|midi|kar)$/i.test(f)),
    );
  }
  return demoListing.has(file);
}
