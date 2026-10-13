// ============================================================
// components/player/PlayerBar — the persistent bottom bar.
//
// Rendered once at the app shell level, outside the screen switch, so it
// keeps playing (and keeps its controls) while the user moves between
// Studio, Juego, Partitura and the library.
//
// This component owns its own requestAnimationFrame loop and paints the
// playhead straight into the DOM. Routing 60 fps updates through React state
// would re-render the whole app shell on every frame — this is the single
// hottest path in the player.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, PointerEvent } from "react";
import { usePlayer } from "../../music/PlayerContext";
import { formatTime } from "../../music/meta";
import { toast } from "../../music/toast";
import {
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

export type PlayerBarProps = {
  /** Opens the full-screen now-playing view. */
  onExpand: () => void;
  /** Opens the queue drawer. */
  onToggleQueue: () => void;
  queueOpen: boolean;
  /** Jump to the Studio screen with the current song loaded. */
  onOpenStudio?: () => void;
  /** Jump to the sheet-music screen. */
  onOpenScore?: () => void;
  /** Jump to the rhythm-game screen. */
  onOpenGame?: () => void;
  /** True while the sheet music for the current track is available. */
  hasScore?: boolean;
  /** Called on every animation frame with the current playhead, seconds. */
  onPositionTick?: (position: number, duration: number) => void;
};

export function PlayerBar({
  onExpand,
  onToggleQueue,
  queueOpen,
  onOpenStudio,
  onOpenScore,
  onOpenGame,
  hasScore = false,
  onPositionTick,
}: PlayerBarProps) {
  const player = usePlayer();
  const {
    current,
    currentTrackId,
    isPlaying,
    isLoading,
    duration,
    shuffle,
    repeat,
    autoplay,
    volume,
    muted,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    setAutoplay,
    getPosition,
    queue,
    queueIndex,
    idle,
  } = player;

  const [scrubbing, setScrubbing] = useState(false);
  /**
   * The clock as a string, for the slider's accessible value. Updated only
   * when the displayed second changes, so the 60 fps playhead costs ~1 render
   * per second instead of one per frame.
   */
  const [ariaClock, setAriaClock] = useState("0:00");
  const ariaClockRef = useRef("0:00");

  // Keep the DOM in sync with the playhead without re-rendering. The scrub
  // preview writes to the same nodes, so no state is needed for its value.
  const fillRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const scrubbingRef = useRef(false);

  // Latest values for the rAF loop, which must not restart on every change.
  const liveRef = useRef({ duration, getPosition, onPositionTick });

  // Ref writes belong in an effect, not in the render body. The rAF loop runs
  // between commits, so a one-commit lag in these mirrors is invisible.
  useEffect(() => {
    scrubbingRef.current = scrubbing;
    liveRef.current = { duration, getPosition, onPositionTick };
    ariaClockRef.current = ariaClock;
  });

  const paint = useCallback((position: number) => {
    const total = liveRef.current.duration;
    const percent = total > 0 ? Math.min(100, (position / total) * 100) : 0;
    if (fillRef.current) fillRef.current.style.width = `${percent}%`;
    const label = formatTime(position);
    if (timeRef.current) timeRef.current.textContent = label;
    if (rangeRef.current && !scrubbingRef.current) {
      rangeRef.current.value = String(Math.min(position, total || 0));
      rangeRef.current.style.setProperty("--pm-progress", `${percent}%`);
    }
    // Only wake React when the rendered second actually changes. The state
    // setter runs from the rAF loop rather than an effect, so the update is
    // already outside the commit it was scheduled in.
    const current = ariaClockRef.current;
    if (current !== label) {
      ariaClockRef.current = label;
      setAriaClock(label);
    }
  }, []);

  // Just repaint when a seek or a new track changes the position while paused.
  useEffect(() => {
    if (isPlaying) return;
    paint(getPosition());
  }, [isPlaying, getPosition, paint, currentTrackId]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      const position = liveRef.current.getPosition();
      paint(position);
      liveRef.current.onPositionTick?.(position, liveRef.current.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, paint]);

  const handleScrubStart = useCallback(() => {
    setScrubbing(true);
  }, []);

  const handleScrubChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      if (fillRef.current && duration > 0) {
        const percent = Math.min(100, (value / duration) * 100);
        fillRef.current.style.width = `${percent}%`;
        event.target.style.setProperty("--pm-progress", `${percent}%`);
      }
      if (timeRef.current) timeRef.current.textContent = formatTime(value);
    },
    [duration],
  );

  const handleScrubCommit = useCallback(
    (event: PointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => {
      setScrubbing(false);
      seek(Number((event.target as HTMLInputElement).value));
    },
    [seek],
  );

  const displayTitle = current?.title ?? (idle ? "Nada en reproducción" : "Cargando…");
  const displayArtist = current?.artist ?? "Elegí una canción para empezar";
  const upcoming = queueIndex >= 0 ? queue.length - queueIndex - 1 : 0;
  /**
   * ¿Hay algo por delante? Con la canción cargada sola (un archivo del Studio no
   * arma contexto) o al final de la cola no lo hay, y el botón se muestra
   * deshabilitado en vez de ofrecer un salto a material que nadie encoló. Con
   * repeat en "all"/"one" sí hay siguiente (da la vuelta).
   */
  const hasNext = upcoming > 0 || repeat !== "off";

  const handleRepeat = useCallback(() => {
    const mode = cycleRepeat();
    toast.info(
      mode === "off"
        ? "Repetición desactivada"
        : mode === "all"
          ? "Repetir toda la cola"
          : "Repetir esta canción",
    );
    // cycleRepeat mutates the store; the toast reflects the new value which
    // the store returns synchronously.
    return mode;
  }, [cycleRepeat]);

  return (
    <footer className="pm-bar" aria-label="Reproductor">
      {/* ── progress ─────────────────────────────────────────── */}
      <div className="pm-bar__progress">
        <span className="pm-bar__time" ref={timeRef}>
          0:00
        </span>
        <div className="pm-bar__track">
          <div className="pm-bar__fill" ref={fillRef} />
          <input
            ref={rangeRef}
            type="range"
            className="pm-bar__range"
            min={0}
            max={Math.max(0.1, duration)}
            step={0.1}
            defaultValue={0}
            onPointerDown={handleScrubStart}
            onChange={handleScrubChange}
            onPointerUp={handleScrubCommit}
            onKeyUp={handleScrubCommit}
            disabled={idle || duration <= 0}
            aria-label="Posición de reproducción"
            aria-valuetext={`${ariaClock} de ${formatTime(duration)}`}
          />
        </div>
        <span className="pm-bar__time">{formatTime(duration)}</span>
      </div>

      <div className="pm-bar__row">
        {/* ── now playing ────────────────────────────────────── */}
        <div className="pm-bar__now-group">
          <button
            type="button"
            className="pm-bar__now"
            onClick={onExpand}
            title="Abrir la vista de reproducción"
            aria-label={`Abrir ${displayTitle}`}
          >
            <Cover
              meta={current}
              size="sm"
              isPlaying={isPlaying}
              className="pm-bar__cover"
            />
            <span className="pm-bar__meta">
              <span className="pm-bar__title">{displayTitle}</span>
              <span className="pm-bar__artist">{displayArtist}</span>
            </span>
            {isLoading && <span className="pm-bar__spinner" aria-label="Cargando" />}
          </button>

          {currentTrackId && <LikeButton trackId={currentTrackId} size="sm" />}
        </div>

        {/* ── transport ──────────────────────────────────────── */}
        <div className="pm-bar__transport">
          <button
            type="button"
            className={`pm-tbtn pm-tbtn--bare pm-tbtn--sm ${shuffle ? "is-active" : ""}`}
            onClick={() => {
              toggleShuffle();
              toast.info(shuffle ? "Aleatorio desactivado" : "Aleatorio activado");
            }}
            aria-pressed={shuffle}
            aria-label="Reproducción aleatoria"
            title="Aleatorio (S)"
          >
            <ShuffleIcon />
          </button>
          <button
            type="button"
            className="pm-tbtn pm-tbtn--bare pm-tbtn--md"
            onClick={previous}
            disabled={idle}
            aria-label="Canción anterior"
            title="Anterior (P)"
          >
            <PrevIcon />
          </button>
          <button
            type="button"
            className="pm-tbtn pm-tbtn--solid pm-tbtn--md"
            onClick={toggle}
            disabled={isLoading}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            title={isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="pm-tbtn pm-tbtn--bare pm-tbtn--md"
            onClick={next}
            disabled={idle || !hasNext}
            aria-label="Canción siguiente"
            title={hasNext ? "Siguiente (N)" : "No hay ninguna canción después de esta"}
          >
            <NextIcon />
          </button>
          <button
            type="button"
            className={`pm-tbtn pm-tbtn--bare pm-tbtn--sm pm-repeat ${repeat !== "off" ? "is-active" : ""}`}
            onClick={handleRepeat}
            aria-pressed={repeat !== "off"}
            aria-label={
              repeat === "off"
                ? "Activar repetición"
                : repeat === "all"
                  ? "Repetir una canción"
                  : "Desactivar repetición"
            }
            title={`Repetir (R) · ${repeat === "off" ? "no" : repeat === "all" ? "todo" : "una"}`}
          >
            <RepeatIcon mode={repeat} />
          </button>
        </div>

        {/* ── secondary ──────────────────────────────────────── */}
        <div className="pm-bar__extras">
          <button
            type="button"
            className={`pm-bar__chip ${autoplay ? "is-on" : ""}`}
            onClick={() => {
              setAutoplay(!autoplay);
              toast.info(
                autoplay
                  ? "Reproducción automática desactivada"
                  : "Reproducción automática activada",
              );
            }}
            aria-pressed={autoplay}
            title="Al terminar la cola, seguir con radio del artista"
          >
            Auto
          </button>

          {onOpenStudio && (
            <button
              type="button"
              className="pm-bar__chip"
              onClick={onOpenStudio}
              disabled={!current}
              title="Practicar esta canción en el Studio"
            >
              Studio
            </button>
          )}
          {onOpenScore && hasScore && (
            <button
              type="button"
              className="pm-bar__chip"
              onClick={onOpenScore}
              title="Ver la partitura de esta canción"
            >
              Partitura
            </button>
          )}
          {onOpenGame && (
            <button
              type="button"
              className="pm-bar__chip"
              onClick={onOpenGame}
              disabled={!current}
              title="Jugar esta canción en modo ritmo"
            >
              Juego
            </button>
          )}

          <button
            type="button"
            className={`pm-bar__queue-btn ${queueOpen ? "is-open" : ""}`}
            onClick={onToggleQueue}
            aria-expanded={queueOpen}
            title="Ver la cola (Q)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            </svg>
            <span className="pm-bar__queue-count">{upcoming}</span>
            <span className="pm-bar__queue-label">Cola</span>
          </button>

          <div className="pm-bar__volume">
            <button
              type="button"
              className="pm-tbtn pm-tbtn--bare pm-tbtn--sm"
              onClick={toggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              title={muted ? "Activar sonido (M)" : "Silenciar (M)"}
            >
              <VolumeIcon level={muted ? 0 : volume} />
            </button>
            <input
              type="range"
              className="pm-bar__volume-range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volumen"
              style={{ ["--pm-progress" as string]: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
