// ============================================================
// components/player/parts — small shared building blocks.
//
// Cover art, the animated "now playing" bars, the round play button and the
// like button appear in a dozen places across the player. Keeping them here
// guarantees the like button always reads the same store and a cover always
// derives its palette the same way.
// ============================================================

import { memo, useCallback } from "react";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import type { TrackMeta } from "../../music/types";
import { coverStyle, initialsFor, paletteForTrack } from "../../music/covers";
import { usePlayer } from "../../music/PlayerContext";
import { toast } from "../../music/toast";

const SIZES = {
  xs: 28,
  sm: 40,
  md: 56,
  lg: 88,
  xl: 160,
  hero: 240,
} as const;

export type CoverSize = keyof typeof SIZES;

export type CoverProps = {
  meta?: TrackMeta | null;
  /** Overrides the generated palette (used by playlists). */
  gradient?: { color: string; colorAlt: string };
  emoji?: string;
  size?: CoverSize;
  /** `square` = Spotify's card art, `circle` = artist avatar. */
  shape?: "square" | "circle";
  /** Renders a play overlay on hover. */
  interactive?: boolean;
  isPlaying?: boolean;
  onPlay?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  /** Custom label for the initials (e.g. a playlist name). */
  label?: string;
};

/**
 * Deterministic generated artwork: genre gradient + initials. No image files
 * ship with the app, so this *is* the art.
 */
export const Cover = memo(function Cover({
  meta,
  gradient,
  emoji,
  size = "md",
  shape = "square",
  interactive = false,
  isPlaying = false,
  onPlay,
  className = "",
  label,
}: CoverProps) {
  const palette = gradient
    ? { color: gradient.color, colorAlt: gradient.colorAlt, ink: "#ffffff" }
    : paletteForTrack(meta);
  const text = label ?? meta?.title ?? "♪";
  const pixels = SIZES[size];

  return (
    <div
      className={`pm-cover pm-cover--${size} pm-cover--${shape} ${className}`}
      style={{ ...coverStyle(palette), width: pixels, height: pixels }}
      data-playing={isPlaying || undefined}
    >
      {emoji ? (
        <span className="pm-cover__emoji" aria-hidden="true">
          {emoji}
        </span>
      ) : (
        <span className="pm-cover__initials" aria-hidden="true">
          {initialsFor(text)}
        </span>
      )}
      {meta?.hasLyrics && (
        <span className="pm-cover__lyrics" title="Trae letra" aria-hidden="true">
          ♪
        </span>
      )}
      {interactive && (
        <button
          type="button"
          className="pm-cover__play"
          onClick={onPlay}
          aria-label={isPlaying ? `Pausar ${text}` : `Reproducir ${text}`}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
});

/** The three bouncing bars Spotify shows next to the playing row. */
export const NowPlayingBars = memo(function NowPlayingBars({
  active = true,
  className = "",
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`pm-bars ${active ? "is-active" : ""} ${className}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
});

export type TransportButtonProps = {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Filled round button (play/pause) vs. bare icon button. */
  variant?: "bare" | "solid";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  title?: string;
};

export function TransportButton({
  label,
  onClick,
  active = false,
  disabled = false,
  variant = "bare",
  size = "md",
  children,
  title,
}: TransportButtonProps) {
  return (
    <button
      type="button"
      className={`pm-tbtn pm-tbtn--${variant} pm-tbtn--${size} ${active ? "is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={variant === "bare" ? active : undefined}
      title={title ?? label}
    >
      {children}
    </button>
  );
}

/** Heart toggle wired straight into the library store. */
export const LikeButton = memo(function LikeButton({
  trackId,
  size = "md",
  withToast = true,
}: {
  trackId: string;
  size?: "sm" | "md" | "lg";
  withToast?: boolean;
}) {
  const { toggleLike, isLiked, current } = usePlayer();
  const liked = isLiked(trackId);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const nowLiked = !liked;
      toggleLike(trackId);
      if (withToast) {
        toast.success(
          nowLiked
            ? `Agregada a Me gusta · ${current?.id === trackId ? current.title : ""}`.trim()
            : "Quitada de Me gusta",
        );
      }
    },
    [liked, toggleLike, trackId, withToast, current],
  );

  return (
    <button
      type="button"
      className={`pm-like pm-like--${size} ${liked ? "is-liked" : ""}`}
      onClick={handleClick}
      aria-pressed={liked}
      aria-label={liked ? "Quitar de Me gusta" : "Agregar a Me gusta"}
      title={liked ? "Quitar de Me gusta" : "Agregar a Me gusta"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill={liked ? "currentColor" : "none"}>
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.5 1.1-1a5.5 5.5 0 0 0 0-7.9Z"
        />
      </svg>
    </button>
  );
});

/** Shuffle / repeat / autoplay indicator row shared by both players. */
export function RepeatIcon({ mode }: { mode: "off" | "all" | "one" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m17 2 4 4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m7 22-4-4 4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v1a4 4 0 0 1-4 4H3" />
      {mode === "one" && (
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          1
        </text>
      )}
    </svg>
  );
}

export function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20 21 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 16v5h-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l5 5" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
    </svg>
  );
}

export function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
    </svg>
  );
}

export function VolumeIcon({ level }: { level: number }) {
  const muted = level <= 0;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5 6 9H2v6h4l5 4V5Z"
        fill="currentColor"
        fillOpacity={muted ? 0 : 0.15}
      />
      {muted ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m16 9 5 6M21 9l-5 6" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 0 1 0 7" />
          {level > 0.55 && (
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 6a9 9 0 0 1 0 12" />
          )}
        </>
      )}
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** Horizontal progress bar. Reads the playhead via the supplied values so it
 *  can also be used in a compact bar that throttles its own updates. */
export function ProgressBar({
  value,
  max,
  onSeek,
  label,
  className = "",
  disabled = false,
}: {
  value: number;
  max: number;
  onSeek: (seconds: number) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(event.target.value));
    },
    [onSeek],
  );

  return (
    <div className={`pm-progress ${className}`} data-disabled={disabled || undefined}>
      <input
        type="range"
        className="pm-progress__input"
        min={0}
        max={Math.max(0.1, max)}
        step={0.1}
        value={Math.min(value, max || 0)}
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
        style={{ ["--pm-progress" as string]: `${percent}%` }}
      />
    </div>
  );
}
