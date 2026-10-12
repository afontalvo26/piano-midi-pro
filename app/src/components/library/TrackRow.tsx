// ============================================================
// components/library/TrackRow — the workhorse list row.
//
// Matches Spotify's anatomy: index / playing bars, art, title + artist,
// album, BPM, duration, then the hover actions (like, add, ⋯). The whole row
// is a button so keyboard users get one stop per track.
// ============================================================

import { memo, useCallback } from "react";
import type { MouseEvent } from "react";
import { usePlayer } from "../../music/PlayerContext";
import { useLibrary } from "../../music/useLibrary";
import type { TrackMeta } from "../../music/types";
import { formatTime } from "../../music/meta";
import { GENRE_META } from "../../types/song";
import { Cover, LikeButton, MoreIcon, NowPlayingBars } from "../player/parts";

export type TrackRowProps = {
  meta: TrackMeta;
  index: number;
  /** Queue this row belongs to when activated (usually the visible list). */
  contextIds: string[];
  originLabel: string;
  /** Hides the album column in dense layouts. */
  showAlbum?: boolean;
  /** Hides the BPM column on narrow screens. */
  showBpm?: boolean;
  isActive?: boolean;
  onOpenMenu: (meta: TrackMeta, event: MouseEvent<HTMLElement>) => void;
  onAddToPlaylist?: (meta: TrackMeta) => void;
  /** Optional trailing slot (e.g. "quitar" in a playlist). */
  trailing?: React.ReactNode;
  playlistId?: string;
};

export const TrackRow = memo(function TrackRow({
  meta,
  index,
  contextIds,
  originLabel,
  showAlbum = true,
  showBpm = true,
  isActive = false,
  onOpenMenu,
  onAddToPlaylist,
  trailing,
  playlistId,
}: TrackRowProps) {
  const player = usePlayer();
  const library = useLibrary();
  const playing = isActive && player.isPlaying;

  const genreMeta = meta.genre ? GENRE_META[meta.genre] : undefined;

  const handlePlay = useCallback(() => {
    if (isActive) {
      player.toggle();
      return;
    }
    player.playCollection(contextIds, {
      startAt: meta.id,
      origin: { kind: "library", label: originLabel, id: playlistId },
    });
  }, [isActive, player, contextIds, meta.id, originLabel, playlistId]);

  const handleMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      onOpenMenu(meta, event);
    },
    [meta, onOpenMenu],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      onOpenMenu(meta, event);
    },
    [meta, onOpenMenu],
  );

  const count = library.playCounts[meta.id] ?? 0;

  return (
    <li
      className={`pm-row ${isActive ? "is-active" : ""}`}
      onContextMenu={handleContextMenu}
      data-track-id={meta.id}
    >
      <span className="pm-row__index" aria-hidden="true">
        {isActive ? <NowPlayingBars active={playing} /> : index + 1}
      </span>

      <button
        type="button"
        className="pm-row__main"
        onClick={handlePlay}
        aria-label={
          isActive
            ? `${playing ? "Pausar" : "Reproducir"} ${meta.title}`
            : `Reproducir ${meta.title} de ${meta.artist}`
        }
        title={playing ? "Pausar" : "Reproducir"}
      >
        <Cover meta={meta} size="sm" />
        <span className="pm-row__titles">
          <span className="pm-row__title">{meta.title}</span>
          <span className="pm-row__artist">
            {genreMeta && (
              <span className="pm-row__genre" aria-hidden="true">
                {genreMeta.emoji}
              </span>
            )}
            {meta.artist}
            {meta.hasLyrics && (
              <span className="pm-row__badge" title="Trae letra sincronizada">
                Letra
              </span>
            )}
          </span>
        </span>

        {showAlbum && <span className="pm-row__album">{meta.album}</span>}
        {showBpm && <span className="pm-row__bpm">{meta.bpm} BPM</span>}
        {count > 0 && (
          <span className="pm-row__plays" title={`${count} reproducciones`}>
            ▶ {count}
          </span>
        )}
        <span className="pm-row__time">{formatTime(meta.duration)}</span>
      </button>

      <span className="pm-row__actions">
        <LikeButton trackId={meta.id} size="sm" withToast={false} />
        {onAddToPlaylist && (
          <button
            type="button"
            className="pm-row__icon-btn"
            onClick={(event) => {
              event.stopPropagation();
              onAddToPlaylist(meta);
            }}
            aria-label={`Agregar ${meta.title} a una playlist`}
            title="Agregar a playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
        {trailing}
        <button
          type="button"
          className="pm-row__icon-btn"
          onClick={handleMenu}
          aria-label={`Más opciones de ${meta.title}`}
          title="Más opciones"
        >
          <MoreIcon />
        </button>
      </span>
    </li>
  );
});
