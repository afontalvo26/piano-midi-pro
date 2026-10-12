// ============================================================
// LyricsPanel — karaoke-style synchronised lyrics.
//
// Rendered in place of the right-hand metrics panel while lyrics mode is on,
// so the words get the full column with nothing competing behind them.
//
// Synchronisation is inherited, not computed: `currentTime` comes from
// App's requestAnimationFrame loop reading `Tone.Transport.ticks`. Notes are
// scheduled from the very same value, so the active line and the audible
// music cannot drift — including when the user changes BPM or playback rate,
// seeks, or pauses.
//
// Only a small window of lines is rendered (karaoke files routinely have 100+
// lines) so the panel stays cheap regardless of song length.
// ============================================================

import { useMemo } from "react";
import type { LyricLine } from "../../types/song";

export interface LyricsPanelProps {
  /** Lines in seconds, same time domain as the transport. */
  lines: LyricLine[];
  /** Current playback position in seconds. */
  currentTime: number;
  /** Song duration in seconds, used for the progress bar. */
  duration: number;
  /** Shown in the empty state so the user knows what to do. */
  songTitle?: string;
}

/** Lines rendered above / below the active one. */
const BEFORE = 6;
const AFTER = 6;

/**
 * Index of the line that should be highlighted: the last one whose time has
 * already passed. Returns -1 before the first line starts (intros are long in
 * karaoke files — La Gota Fría does not sing until 0:15).
 */
function findActiveIndex(lines: LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function LyricsPanel({
  lines,
  currentTime,
  duration,
  songTitle,
}: LyricsPanelProps) {
  const activeIndex = useMemo(
    () => findActiveIndex(lines, currentTime),
    [lines, currentTime],
  );

  const window = useMemo(() => {
    if (lines.length === 0) return [];
    const center = activeIndex < 0 ? 0 : activeIndex;
    const start = Math.max(0, center - BEFORE);
    const end = Math.min(lines.length, center + AFTER + 1);
    return lines.slice(start, end).map((line, i) => ({
      line,
      index: start + i,
    }));
  }, [lines, activeIndex]);

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <div className="lyrics-panel lyrics-panel--empty">
        <h2>Letra</h2>
        <div className="lyrics-empty">
          <span className="lyrics-empty__icon" aria-hidden="true">
            🎼
          </span>
          <p className="lyrics-empty__title">Esta canción no trae letra</p>
          <p className="lyrics-empty__sub">
            {songTitle ? <em>{songTitle}</em> : "El archivo"} es instrumental o
            su MIDI no incluye pista de letra.
          </p>
          <p className="lyrics-empty__hint">
            Los archivos <strong>.kar</strong> (karaoke) sí la traen, y también
            podés subir el tuyo desde <strong>Canciones</strong>.
          </p>
        </div>
      </div>
    );
  }

  // ── Lyrics ─────────────────────────────────────────────────────────────────
  return (
    <div className="lyrics-panel">
      <header className="lyrics-head">
        <h2>Letra</h2>
        {songTitle && <p className="lyrics-head__song">{songTitle}</p>}
      </header>

      <div
        className="lyrics-lines"
        role="log"
        aria-live="polite"
        aria-label="Letra sincronizada"
      >
        {window.map(({ line, index }) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <p
              key={`${line.time}-${index}`}
              className={
                "lyrics-line" +
                (isActive ? " lyrics-line--active" : "") +
                (isPast ? " lyrics-line--past" : "")
              }
              aria-current={isActive ? "true" : undefined}
            >
              {line.text}
            </p>
          );
        })}
      </div>

      <div className="lyrics-footer">
        <div
          className="lyrics-progress"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de la canción"
        >
          <div
            className="lyrics-progress__fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="lyrics-footer__count">
          {activeIndex >= 0 ? activeIndex + 1 : 0} / {lines.length}
        </span>
      </div>
    </div>
  );
}
