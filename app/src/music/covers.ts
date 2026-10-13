// ============================================================
// music/covers — deterministic generated artwork.
//
// This is the FALLBACK, not the only option any more: the shipped catalogue now
// resolves real Spotify artwork per track through `music/coverStore`, and
// `Cover` prefers it. What still lands here is everything with no cover of its
// own — user uploads, playlists, artist and genre tiles — where a genre
// gradient + initials beats a placeholder JPG: the same song always renders the
// same cover, and the grid looks intentional.
// ============================================================

import { GENRE_META } from "../types/song";
import type { TrackMeta } from "./types";

export type CoverPalette = {
  color: string;
  colorAlt: string;
  /** Ink colour for the initials — white reads best on all these palettes. */
  ink: string;
};

const NEUTRAL: CoverPalette = {
  color: "#8b5cf6",
  colorAlt: "#d946ef",
  ink: "#ffffff",
};

/** Strips diacritics so "Für Elise" → "FE" and "Beethoven" → "B". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
}

/**
 * Up to two initials. Titles like "La Gota Fría" → "LG", single words → "GO".
 * Articles are skipped so the cover reflects the distinctive word.
 */
const LEADING_ARTICLES = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "the",
  "a",
  "an",
  "de",
  "del",
]);

export function initialsFor(title: string): string {
  const words = normalize(title)
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !LEADING_ARTICLES.has(word.toLowerCase()));

  if (words.length === 0) {
    const fallback = normalize(title).replace(/\s+/g, "");
    return fallback.slice(0, 2).toUpperCase() || "♪";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Genre first (so a shelf of vallenatos reads as one family), then a small
 * hue rotation per track so neighbouring cards are not identical.
 */
export function paletteForTrack(meta: TrackMeta | null | undefined): CoverPalette {
  if (!meta) return NEUTRAL;

  const genreMeta = meta.genre ? GENRE_META[meta.genre] : undefined;
  if (!genreMeta) return NEUTRAL;

  // Rotate the gradient angle by swapping the two colours for every other
  // track, which is enough variation without leaving the genre's palette.
  let hash = 0;
  for (let i = 0; i < meta.id.length; i++) {
    hash = (hash * 31 + meta.id.charCodeAt(i)) | 0;
  }
  const swap = Math.abs(hash) % 2 === 0;
  return {
    color: swap ? genreMeta.color : genreMeta.colorAlt,
    colorAlt: swap ? genreMeta.colorAlt : genreMeta.color,
    ink: "#ffffff",
  };
}

/** CSS custom properties consumed by `.pm-cover` in player.css. */
export function coverStyle(
  palette: CoverPalette,
): Record<string, string> & { background: string } {
  return {
    background: `linear-gradient(135deg, ${palette.color} 0%, ${palette.colorAlt} 100%)`,
    "--cover-ink": palette.ink,
    "--cover-c": palette.color,
    "--cover-c-alt": palette.colorAlt,
  };
}

/** Same idea for playlists, which store their own colours. */
export function playlistCoverStyle(color: string, colorAlt: string): Record<string, string> {
  return {
    background: `linear-gradient(135deg, ${color} 0%, ${colorAlt} 100%)`,
    "--cover-ink": "#ffffff",
    "--cover-c": color,
    "--cover-c-alt": colorAlt,
  };
}
