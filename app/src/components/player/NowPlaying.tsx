// ============================================================
// components/player/NowPlaying — full-screen "now playing".
//
// Spotify's expanded player, adapted to this app's strengths: the karaoke
// lyrics that ship inside the .kar files, and one-click jumps into Studio /
// Partitura / Juego, which no music service can offer.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "../../music/PlayerContext";
import { getSessionSong } from "../../music/resolve";
import { formatTime } from "../../music/meta";
import { GENRE_META } from "../../types/song";
import type { LyricLine } from "../../types/song";
import type { TrackMeta } from "../../music/types";import {
  Cover,
  LikeButton,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./parts";
import { QueuePanel } from "./QueuePanel";

type Tab = "letra" | "cola";

export type NowPlayingProps = {
  open: boolean;
  onClose: () => void;
  onShare: (meta: TrackMeta) => void;
  onAddToPlaylist: (meta: TrackMeta) => void;
  onOpenStudio?: (meta: TrackMeta) => void;
  onOpenScore?: (meta: TrackMeta) => void;
  onOpenGame?: (meta: TrackMeta) => void;
};

export function NowPlaying({
  open,
  onClose,
  onShare,
  onAddToPlaylist,
  onOpenStudio,
  onOpenScore,
  onOpenGame,
}: NowPlayingProps) {
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>("letra");
  const [showVolume, setShowVolume] = useState(false);
  /** Playhead sampled at ~10 Hz — enough for lyrics and the scrub label. */
  const [position, setPosition] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);

  const {
    current,
    currentTrackId,
    isPlaying,
    duration,
    shuffle,
    repeat,
    volume,
    muted,
    play,
    pause,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleMute,
    getPosition,
  } = player;

  const playCount = currentTrackId ? player.playCounts[currentTrackId] ?? 0 : 0;

  // A 60 fps React state update here would be wasteful: lyrics only need to
  // know which line is active, and the scrubber only needs its fill width.
  // The loop paints the DOM directly and throttles the state to 10 Hz.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let lastCommit = 0;
    const tick = (now: number) => {
      const value = getPosition();
      const percent = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;
      if (timeRef.current) timeRef.current.textContent = formatTime(value);
      if (rangeRef.current) {
        rangeRef.current.style.setProperty("--pm-progress", `${percent}%`);
      }
      if (now - lastCommit > 100) {
        lastCommit = now;
        setPosition(value);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, getPosition, duration, isPlaying, currentTrackId]);

  // Lyrics live on the parsed song, which only exists in the resolver cache.
  // `resolvedIds` gates the read so we don't look up a track that is not
  // loaded yet.
  const lyrics = useMemo(() => {
    if (!currentTrackId || !player.resolvedIds.has(currentTrackId)) return [];
    // Import is static at module scope; the cache lookup is synchronous.
    return getSessionLyrics(currentTrackId);
  }, [currentTrackId, player.resolvedIds]);

  const activeLineIndex = useMemo(
    () => findActiveLine(lyrics, position),
    [lyrics, position],
  );

  // Auto-scroll the active line into view.
  useEffect(() => {
    if (tab !== "letra" || activeLineIndex < 0) return;
    const container = lyricsRef.current;
    const node = container?.querySelector<HTMLElement>(
      `[data-line="${activeLineIndex}"]`,
    );
    if (!container || !node) return;
    const target =
      node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeLineIndex, tab]);

  // Focus trap + Escape to close.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocus?.focus?.();
    };
  }, [open, onClose]);

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      seek(Number(event.target.value));
    },
    [seek],
  );

  const genreMeta = current?.genre ? GENRE_META[current.genre] : undefined;

  const palette = current
    ? { color: genreMeta?.color ?? "#8b5cf6", colorAlt: genreMeta?.colorAlt ?? "#d946ef" }
    : { color: "#8b5cf6", colorAlt: "#d946ef" };

  if (!open) return null;

  return createPortal(
    <div
      className="pm-np"
      role="dialog"
      aria-modal="true"
      aria-label="Reproducción actual"
      ref={dialogRef}
      tabIndex={-1}
      style={{
        ["--np-c" as string]: palette.color,
        ["--np-c-alt" as string]: palette.colorAlt,
      }}
    >
      <div className="pm-np__glow" aria-hidden="true" />

      <header className="pm-np__top">
        <button
          type="button"
          className="pm-np__close"
          onClick={onClose}
          aria-label="Cerrar la vista de reproducción"
          title="Cerrar (Esc)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className="pm-np__origin">
          <span className="pm-np__origin-label">
            {player.queueOrigin?.label || "Reproduciendo ahora"}
          </span>
          <span className="pm-np__origin-count">
            {player.queueIndex + 1} de {player.queue.length}
          </span>
        </div>
        <div className="pm-np__top-actions">
          {current && (
            <>
              <button
                type="button"
                className="pm-np__pill"
                onClick={() => onAddToPlaylist(current)}
              >
                + Playlist
              </button>
              <button
                type="button"
                className="pm-np__pill"
                onClick={() => onShare(current)}
              >
                Compartir
              </button>
              <LikeButton trackId={current.id} />
            </>
          )}
        </div>
      </header>

      <div className="pm-np__body">
        {/* ── left: art + transport ───────────────────────── */}
        <section className="pm-np__left" aria-label="Controles">
          {current ? (
            <>
              <Cover meta={current} size="hero" className="pm-np__cover" />
              <div className="pm-np__titles">
                <h2 className="pm-np__title">{current.title}</h2>
                <p className="pm-np__artist">{current.artist}</p>
                <div className="pm-np__chips">
                  {genreMeta && (
                    <span className="pm-np__chip">
                      {genreMeta.emoji} {genreMeta.label}
                    </span>
                  )}
                  <span className="pm-np__chip">{current.bpm} BPM</span>
                  <span className="pm-np__chip">{current.trackCount} pista{current.trackCount === 1 ? "" : "s"}</span>
                  {playCount > 0 && (
                    <span className="pm-np__chip">
                      ▶ {playCount} reproduccion{playCount === 1 ? "" : "es"}
                    </span>
                  )}
                </div>
              </div>

              <div className="pm-np__scrub">
                <span className="pm-np__time" ref={timeRef}>
                  0:00
                </span>
                <input
                  ref={rangeRef}
                  type="range"
                  className="pm-progress__input"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.1}
                  defaultValue={0}
                  onChange={handleSeek}
                  aria-label="Posición de reproducción"
                  style={{ ["--pm-progress" as string]: "0%" }}
                />
                <span className="pm-np__time">{formatTime(duration)}</span>
              </div>

              <div className="pm-np__transport">
                <button
                  type="button"
                  className={`pm-tbtn pm-tbtn--bare pm-tbtn--md ${shuffle ? "is-active" : ""}`}
                  onClick={toggleShuffle}
                  aria-pressed={shuffle}
                  aria-label="Aleatorio"
                  title="Aleatorio (S)"
                >
                  <ShuffleIcon />
                </button>
                <button
                  type="button"
                  className="pm-tbtn pm-tbtn--bare pm-tbtn--lg"
                  onClick={previous}
                  aria-label="Anterior"
                  title="Anterior (P)"
                >
                  <PrevIcon />
                </button>
                <button
                  type="button"
                  className="pm-tbtn pm-tbtn--solid pm-tbtn--xl"
                  onClick={isPlaying ? pause : play}
                  aria-label={isPlaying ? "Pausar" : "Reproducir"}
                  title="Espacio"
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  type="button"
                  className="pm-tbtn pm-tbtn--bare pm-tbtn--lg"
                  onClick={next}
                  aria-label="Siguiente"
                  title="Siguiente (N)"
                >
                  <NextIcon />
                </button>
                <button
                  type="button"
                  className={`pm-tbtn pm-tbtn--bare pm-tbtn--md pm-repeat ${repeat !== "off" ? "is-active" : ""}`}
                  onClick={cycleRepeat}
                  aria-pressed={repeat !== "off"}
                  aria-label="Repetir"
                  title={`Repetir (R) · ${repeat === "off" ? "no" : repeat === "all" ? "todo" : "una"}`}
                >
                  <RepeatIcon mode={repeat} />
                </button>
              </div>

              <div className="pm-np__volume">
                <button
                  type="button"
                  className="pm-tbtn pm-tbtn--bare pm-tbtn--sm"
                  onClick={() => setShowVolume((value) => !value)}
                  aria-expanded={showVolume}
                  aria-label="Volumen"
                >
                  <VolumeIcon level={muted ? 0 : volume} />
                </button>
                <input
                  type="range"
                  className={`pm-np__volume-range ${showVolume ? "is-open" : ""}`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  onDoubleClick={toggleMute}
                  aria-label="Volumen"
                  style={{ ["--pm-progress" as string]: `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>

              <div className="pm-np__jump">
                {onOpenStudio && (
                  <button type="button" className="pm-np__pill" onClick={() => onOpenStudio(current)}>
                    🎹 Practicar en Studio
                  </button>
                )}
                {onOpenScore && (
                  <button type="button" className="pm-np__pill" onClick={() => onOpenScore(current)}>
                    🎼 Ver partitura
                  </button>
                )}
                {onOpenGame && (
                  <button type="button" className="pm-np__pill" onClick={() => onOpenGame(current)}>
                    🎮 Jugar
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="pm-np__empty">
              <span aria-hidden="true">🎧</span>
              <h2>Nada en reproducción</h2>
              <p>Elegí una canción de la biblioteca y arrancá el viaje.</p>
            </div>
          )}
        </section>

        {/* ── right: lyrics / queue ────────────────────────── */}
        <section className="pm-np__right" aria-label="Letra y cola">
          <div className="pm-np__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "letra"}
              className={`pm-np__tab ${tab === "letra" ? "is-active" : ""}`}
              onClick={() => setTab("letra")}
            >
              Letra
              {lyrics.length > 0 && (
                <span className="pm-np__tab-badge">{lyrics.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cola"}
              className={`pm-np__tab ${tab === "cola" ? "is-active" : ""}`}
              onClick={() => setTab("cola")}
            >
              Cola
              <span className="pm-np__tab-badge">{player.queue.length}</span>
            </button>
          </div>

          {tab === "letra" ? (
            lyrics.length === 0 ? (
              <div className="pm-np__lyrics-empty">
                <span aria-hidden="true">🎼</span>
                <p className="pm-np__lyrics-title">
                  {current ? "Esta canción no trae letra" : "Sin canción cargada"}
                </p>
                <p className="pm-np__lyrics-sub">
                  Los archivos <strong>.kar</strong> (karaoke) incluyen la letra
                  sincronizada. Probá con un vallenato o un bolero del catálogo.
                </p>
              </div>
            ) : (
              <div className="pm-np__lyrics" ref={lyricsRef} tabIndex={0}>
                {lyrics.map((line, index) => (
                  <p
                    key={`${line.time}-${index}`}
                    data-line={index}
                    className={
                      "pm-np__lyric" +
                      (index === activeLineIndex ? " is-active" : "") +
                      (index < activeLineIndex ? " is-past" : "")
                    }
                    onClick={() => seek(line.time)}
                    role="button"
                    tabIndex={-1}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            )
          ) : (
            <QueuePanel
              compact
              onClose={() => setTab("letra")}
              showClose={false}
            />
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}

/** Reads the cached lyrics off the resolved song (a synchronous Map lookup). */
function getSessionLyrics(trackId: string): LyricLine[] {
  return getSessionSong(trackId)?.lyrics ?? [];
}

/**
 * Index of the line that should be highlighted: the last one whose time has
 * already passed. Returns -1 before the first line (karaoke intros are long).
 */
function findActiveLine(lines: LyricLine[], time: number): number {
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
