// ============================================================
// SongCard - presentational card for a SongData row.
// Two layouts: "grid" (default, vertical) and "list" (compact row).
// Pulls genre accent colors from GENRE_META and exposes them as
// CSS custom properties so SongLibrary.css can drive borders and
// hover halos with a single rule.
// ============================================================

import type { CSSProperties, KeyboardEvent } from "react";
import { useCallback } from "react";
import type { SongData } from "../../types/song";
import { GENRE_META } from "../../types/song";
import { formatDuration, formatCount } from "./format";

export interface SongCardProps {
  song: SongData;
  onSelect: (song: SongData) => void;
  layout?: "grid" | "list";
}

type GenreVars = CSSProperties & {
  "--genre-c"?: string;
  "--genre-c-alt"?: string;
};

const PLAY_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

function MetaIcon({ kind }: { kind: "bpm" | "time" | "notes" | "tracks" }) {
  // Inline SVGs keep the bundle small and avoid a new icon dep.
  switch (kind) {
    case "bpm":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "time":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 2v4M16 2v4M4 10h16" />
        </svg>
      );
    case "notes":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "tracks":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
  }
}

export function SongCard({ song, onSelect, layout = "grid" }: SongCardProps) {
  const meta = song.genre ? GENRE_META[song.genre] : undefined;
  const color = meta?.color ?? "var(--accent-primary)";
  const colorAlt = meta?.colorAlt ?? "var(--accent-secondary)";
  const style: GenreVars = {
    "--genre-c": color,
    "--genre-c-alt": colorAlt,
  };

  const handleClick = useCallback(() => onSelect(song), [onSelect, song]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(song);
      }
    },
    [onSelect, song],
  );

  const hasArtist = Boolean(song.artist && song.artist.trim().length > 0);
  // Demo songs keep `artist` set AND build `title` as `${artist} - ${title}`,
  // so appending the artist again made screen readers announce it twice
  // ("Tocar X - Y de X"). Only add it when the title doesn't already carry it.
  const artistAlreadyInTitle =
    hasArtist && song.title.includes(song.artist!.trim());
  const ariaLabel =
    hasArtist && !artistAlreadyInTitle
      ? `Tocar ${song.title} de ${song.artist}`
      : `Tocar ${song.title}`;

  const badge = meta ? (
    <span className="lib-card__badge" aria-hidden="true">
      <span className="lib-card__badge-emoji">{meta.emoji}</span>
      <span className="lib-card__badge-label">{meta.label}</span>
    </span>
  ) : (
    <span className="lib-card__badge lib-card__badge--neutral" aria-hidden="true">
      <span className="lib-card__badge-emoji">📥</span>
      <span className="lib-card__badge-label">Importado</span>
    </span>
  );

  const meta1 = (
    <span className="lib-card__meta-item" title="BPM">
      <MetaIcon kind="bpm" />
      <span className="lib-card__meta-value">{Math.round(song.bpm)}</span>
      <span className="lib-card__meta-unit">BPM</span>
    </span>
  );
  const meta2 = (
    <span className="lib-card__meta-item" title="Duración">
      <MetaIcon kind="time" />
      <span className="lib-card__meta-value">
        {formatDuration(song.duration)}
      </span>
    </span>
  );
  const meta3 = (
    <span className="lib-card__meta-item" title="Notas">
      <MetaIcon kind="notes" />
      <span className="lib-card__meta-value">
        {formatCount(song.notes.length)}
      </span>
      <span className="lib-card__meta-unit">notas</span>
    </span>
  );
  const meta4 = (
    <span className="lib-card__meta-item" title="Pistas">
      <MetaIcon kind="tracks" />
      <span className="lib-card__meta-value">{song.tracks.length}</span>
      <span className="lib-card__meta-unit">
        {song.tracks.length === 1 ? "pista" : "pistas"}
      </span>
    </span>
  );

  if (layout === "list") {
    return (
      <div
        className="lib-card lib-card--list"
        style={style}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <span className="lib-card__rail" aria-hidden="true" />
        <div className="lib-card__list-main">
          <div className="lib-card__list-titles">
            {hasArtist && (
              <span className="lib-card__artist">{song.artist}</span>
            )}
            <span className="lib-card__title">{song.title}</span>
          </div>
          <div className="lib-card__list-meta">
            {meta1}
            {meta2}
            {meta3}
            {meta4}
          </div>
        </div>
        <div className="lib-card__list-side">
          {badge}
          <button
            type="button"
            className="lib-card__play lib-card__play--compact"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(song);
            }}
            aria-label={ariaLabel}
          >
            {PLAY_ICON}
            <span>Tocar</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <article
      className="lib-card lib-card--grid"
      style={style}
      aria-label={ariaLabel}
    >
      <span className="lib-card__rail" aria-hidden="true" />
      <header className="lib-card__head">
        <div className="lib-card__titles">
          {hasArtist && <span className="lib-card__artist">{song.artist}</span>}
          <h3 className="lib-card__title">{song.title}</h3>
        </div>
        {badge}
      </header>

      <div className="lib-card__meta">
        {meta1}
        {meta2}
        {meta3}
        {meta4}
      </div>

      <button
        type="button"
        className="lib-card__play"
        onClick={handleClick}
        aria-label={ariaLabel}
      >
        {PLAY_ICON}
        <span>Tocar</span>
      </button>
    </article>
  );
}
