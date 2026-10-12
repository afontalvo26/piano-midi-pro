// ============================================================
// components/player/QueuePanel — "a continuación".
//
// Doubles as the right column of the full-screen player and as a slide-over
// drawer on desktop. Reordering uses the native HTML5 drag & drop API rather
// than a library: the rows are simple, and it keeps the bundle free of a DnD
// dependency for one screen.
// ============================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { usePlayer } from "../../music/PlayerContext";
import { libraryStore, type QueueEntry } from "../../music/libraryStore";
import type { TrackMeta } from "../../music/types";
import { formatTime } from "../../music/meta";
import { toast } from "../../music/toast";
import { Cover, NowPlayingBars } from "./parts";

export type QueuePanelProps = {
  /** Compact mode drops the header and constrains the height (now-playing tab). */
  compact?: boolean;
  onClose?: () => void;
  showClose?: boolean;
  /** Called when a row is activated (drawer closes, tab stays). */
  onNavigate?: () => void;
};

export function QueuePanel({
  compact = false,
  onClose,
  showClose = true,
  onNavigate,
}: QueuePanelProps) {
  const player = usePlayer();
  const { queue, queueIndex, isPlaying } = player;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);

  const entries = useMemo(
    () =>
      queue.map((entry, index) => ({
        entry,
        index,
        isCurrent: index === queueIndex,
        meta: queueMeta(entry.trackId),
      })),
    [queue, queueIndex],
  );

  const handleDrop = useCallback(
    (targetIndex: number) => {
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setOverIndex(null);
        return;
      }
      player.reorderQueue(dragIndex, targetIndex);
      setDragIndex(null);
      setOverIndex(null);
    },
    [dragIndex, player],
  );

  return (
    <div className={`pm-queue ${compact ? "pm-queue--compact" : ""}`}>
      {!compact && (
        <header className="pm-queue__head">
          <div>
            <h2 className="pm-queue__title">Cola de reproducción</h2>
            <p className="pm-queue__sub">
              {queue.length === 0
                ? "Vacía"
                : `${upcomingCount} por delante · ${queue.length} en total`}
            </p>
          </div>
          <div className="pm-queue__head-actions">
            {queue.length > 1 && (
              <button
                type="button"
                className="pm-queue__ghost"
                onClick={() => {
                  player.clearUpcoming();
                  toast.info("Se quitó todo lo que venía después");
                }}
                title="Dejar solo la canción actual"
              >
                Limpiar
              </button>
            )}
            {showClose && onClose && (
              <button
                type="button"
                className="pm-tbtn pm-tbtn--bare pm-tbtn--sm"
                onClick={onClose}
                aria-label="Cerrar la cola"
                title="Cerrar (Q)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        </header>
      )}

      {queue.length === 0 ? (
        <div className="pm-queue__empty">
          <span aria-hidden="true">📭</span>
          <p>La cola está vacía.</p>
          <p className="pm-queue__empty-hint">
            Elegí una canción o usá <strong>Agregar a la cola</strong> desde el
            menú de cualquier fila.
          </p>
        </div>
      ) : (
        <ul className="pm-queue__list" ref={listRef}>
          {entries.map(({ entry, index, isCurrent, meta }) => (
            <QueueRow
              key={entry.uid}
              entry={entry}
              index={index}
              meta={meta}
              isCurrent={isCurrent}
              isPlaying={isPlaying}
              isDragging={dragIndex === index}
              isDropTarget={overIndex === index && dragIndex !== index}
              onDragStart={() => setDragIndex(index)}
              onDragOver={() => setOverIndex(index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onPlay={() => {
                player.jumpToQueueIndex(index);
                onNavigate?.();
              }}
              onRemove={() => player.removeFromQueue(entry.uid)}
              onPlayNext={() => {
                player.addToQueue([entry.trackId], true);
                player.removeFromQueue(entry.uid);
                toast.success("Se reproduce a continuación");
              }}
            />
          ))}
        </ul>
      )}

      {!compact && queue.length > 0 && (
        <footer className="pm-queue__foot">
          <span className="pm-queue__hint">
            Arrastrá las filas para reordenar · <kbd>Q</kbd> para cerrar
          </span>
        </footer>
      )}
    </div>
  );
}

type QueueRowProps = {
  entry: QueueEntry;
  index: number;
  meta: TrackMeta | undefined;
  isCurrent: boolean;
  isPlaying: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onPlayNext: () => void;
};

function QueueRow({
  index,
  meta,
  isCurrent,
  isPlaying,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPlay,
  onRemove,
  onPlayNext,
}: QueueRowProps) {
  return (
    <li
      className={
        "pm-queue__row" +
        (isCurrent ? " is-current" : "") +
        (isDragging ? " is-dragging" : "") +
        (isDropTarget ? " is-drop-target" : "")
      }
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <span className="pm-queue__handle" aria-hidden="true" title="Arrastrar para reordenar">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </span>

      <span className="pm-queue__index" aria-hidden="true">
        {isCurrent ? <NowPlayingBars active={isPlaying} /> : index + 1}
      </span>

      <button
        type="button"
        className="pm-queue__main"
        onClick={onPlay}
        aria-label={`Reproducir ${meta?.title ?? "canción"}`}
        aria-current={isCurrent ? "true" : undefined}
      >
        <Cover meta={meta} size="xs" />
        <span className="pm-queue__meta">
          <span className="pm-queue__row-title">{meta?.title ?? "Cargando…"}</span>
          <span className="pm-queue__row-artist">{meta?.artist ?? ""}</span>
        </span>
        <span className="pm-queue__row-time">{formatTime(meta?.duration ?? 0)}</span>
      </button>

      <span className="pm-queue__row-actions">
        {!isCurrent && (
          <button
            type="button"
            className="pm-queue__icon-btn"
            onClick={onPlayNext}
            title="Reproducir a continuación"
            aria-label="Reproducir a continuación"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m0 0-5-5m5 5-5 5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="pm-queue__icon-btn pm-queue__icon-btn--danger"
          onClick={onRemove}
          title="Quitar de la cola"
          aria-label="Quitar de la cola"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </span>
    </li>
  );
}

/** Metadata lookup for a queue row. Synchronous — the store is authoritative. */
function queueMeta(trackId: string) {
  return libraryStore.getTrack(trackId);
}
