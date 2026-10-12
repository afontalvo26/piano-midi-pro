// ============================================================
// Small formatting helpers for the song library UI.
// Kept as a separate module so SongCard / SongLibrary stay focused
// on rendering, and so unit-style consumers can import without
// pulling React in.
// ============================================================

/** Format a duration in seconds as `m:ss` (e.g. 3:24). Negative or
 *  non-finite inputs collapse to "0:00". Hours roll into minutes
 *  intentionally — songs longer than an hour are vanishingly rare
 *  here, and it keeps the badge a single tabular line. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Compact integer formatter for badges ("1.2k" style). Avoids the
 *  full Intl machinery for hot lists of cards. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return n.toString();
  const k = n / 1000;
  return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
}
