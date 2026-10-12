// ============================================================
// components/library/TrackCard — grid tile used by shelves and search.
// ============================================================

import { memo, useCallback } from "react";
import type { MouseEvent } from "react";
import { usePlayer } from "../../music/PlayerContext";
import type { TrackMeta } from "../../music/types";
import { formatTime } from "../../music/meta";
import { GENRE_META } from "../../types/song";
import { Cover, LikeButton, MoreIcon } from "../player/parts";

export type TrackCardProps = {
  meta: TrackMeta;
  contextIds: string[];
  originLabel: string;
  onOpenMenu: (meta: TrackMeta, event: MouseEvent<HTMLElement>) => void;
  /** Compact tiles for horizontal shelves. */
  size?: "sm" | "md";
  subtitle?: string;
};

export const TrackCard = memo(function TrackCard({
  meta,
  contextIds,
  originLabel,
  onOpenMenu,
  size = "md",
  subtitle,
}: TrackCardProps) {
  const player = usePlayer();
  const isActive = player.currentTrackId === meta.id;
  const playing = isActive && player.isPlaying;

  const handlePlay = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      if (isActive) {
        player.toggle();
        return;
      }
      player.playCollection(contextIds, {
        startAt: meta.id,
        origin: { kind: "library", label: originLabel },
      });
    },
    [isActive, player, contextIds, meta.id, originLabel],
  );

  const handleMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenMenu(meta, event);
    },
    [meta, onOpenMenu],
  );

  const genreMeta = meta.genre ? GENRE_META[meta.genre] : undefined;

  return (
    <article
      className={`pm-card pm-card--${size} ${isActive ? "is-active" : ""}`}
      onContextMenu={handleMenu}
    >
      <div className="pm-card__art">
        <Cover
          meta={meta}
          size={size === "sm" ? "md" : "xl"}
          interactive
          isPlaying={playing}
          onPlay={handlePlay}
        />
        <div className="pm-card__overlay">
          <LikeButton trackId={meta.id} size="sm" withToast={false} />
          <button
            type="button"
            className="pm-card__more"
            onClick={handleMenu}
            aria-label={`Más opciones de ${meta.title}`}
          >
            <MoreIcon />
          </button>
        </div>
      </div>

      <button type="button" className="pm-card__info" onClick={handlePlay}>
        <span className="pm-card__title">{meta.title}</span>
        <span className="pm-card__sub">{subtitle ?? meta.artist}</span>
        <span className="pm-card__meta">
          {genreMeta && <span>{genreMeta.emoji}</span>}
          <span>{formatTime(meta.duration)}</span>
          <span>{meta.bpm} BPM</span>
          {meta.hasLyrics && <span className="pm-card__tag">Letra</span>}
        </span>
      </button>
    </article>
  );
});
