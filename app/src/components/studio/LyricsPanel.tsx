// ============================================================
// LyricsPanel — letra sincronizada estilo karaoke.
//
// QUÉ CAMBIÓ RESPECTO DE LA VERSIÓN ANTERIOR (y por qué)
//
// 1. Resaltado por PALABRA, con el tiempo real de cada sílaba. El `.kar` trae un
//    evento meta por sílaba, cada uno con su delta-time, y `extractLyrics` ahora
//    lo conserva (`LyricWord.syllables`). Antes sólo se guardaba el instante en
//    que ARRANCABA cada línea, así que la única sincronía posible era por línea.
//
// 2. Tocar una palabra salta a ESE punto. El salto va por `onSeek`, que es la
//    misma vía que usan el scrubber y la partitura (`seekTo` en App.tsx,
//    `player.seek` en el reproductor): no hay un segundo camino de seek que
//    pueda desincronizarse del transporte.
//
// 3. Se dibujan TODAS las líneas dentro de un contenedor con scroll, en vez de
//    una ventana de 13. Con ventana, el desplazamiento automático tenía que
//    reemplazar nodos justo cuando el usuario estaba leyendo, y eso es lo que se
//    veía como saltos bruscos. Con la lista completa el desplazamiento es un
//    `scrollTo` suave sobre nodos estables, y el usuario puede recorrer la letra
//    a mano. `content-visibility: auto` mantiene el costo de pintado igual al de
//    la ventana.
//
// 4. La caja del texto ya viene normalizada del extractor. Se vuelve a aplicar
//    acá a propósito: una canción guardada por una versión anterior de la app no
//    pasó por esa normalización, y la función es idempotente.
// ============================================================

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { LyricLine, LyricWord } from "../../types/song";
import { normaliseLyricLines, normaliseWordCases } from "../../utils/lyricText";
import "./lyrics.css";

export interface LyricsPanelProps {
  /** Líneas en segundos, mismo dominio de tiempo que el transporte. */
  lines: LyricLine[];
  /** Posición actual de reproducción, en segundos. */
  currentTime: number;
  /** Duración de la canción, para la barra de progreso. */
  duration: number;
  /** Título mostrado en la cabecera. */
  songTitle?: string;
  /**
   * Salta a un instante de la canción. Es la MISMA vía de seek que el resto de
   * la app. Sin esta prop el panel se dibuja igual, sólo que las palabras no son
   * clickeables.
   */
  onSeek?: (time: number) => void;
  /** Cierra el panel. Sólo se usa cuando vive dentro de un cajón. */
  onClose?: () => void;
}

/** Cuánto se ignora el autodesplazamiento después de que el usuario toca el scroll. */
const MANUAL_SCROLL_GRACE_MS = 5000;
/** Índice del último elemento cuyo tiempo ya pasó. -1 antes del primero. */
function findLastAtOrBefore(times: readonly number[], time: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** `m:ss` — el mismo formato que el resto de la barra. */
function stamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Reparte el texto ya normalizado de una palabra entre sus sílabas.
 *
 * Hay que normalizar las sílabas por su cuenta: el texto de la palabra viene en
 * la caja buena ("Nubarrón") y las sílabas tal como las escribió el `.kar`
 * ("NU","BA","RRÓN"), así que compararlas en crudo daría siempre distinto y se
 * perdería el avance por sílaba justo en las canciones que vienen gritadas.
 * `normaliseWordCases` con separador vacío reconstruye la palabra, la normaliza y
 * reparte por longitudes — y normalizar no cambia longitudes, así que los cortes
 * caen exactamente donde caían.
 *
 * Cuando falta el detalle por sílaba (letra vieja, o un `.mid` cuyo texto no
 * viene troceado) se devuelve la palabra entera como una sola pieza: se resalta
 * igual, sólo que sin avance interno.
 */
function syllableTexts(word: LyricWord): { time: number; text: string }[] {
  const whole = [{ time: word.time, text: word.text }];
  if (word.syllables.length <= 1) return whole;

  const cased = normaliseWordCases(
    word.syllables.map((syllable) => syllable.text),
    "",
  );
  // Red de seguridad: si el reparto no reconstruye la palabra, se muestra entera
  // antes que mostrar texto cortado o desordenado.
  if (cased.join("") !== word.text) return whole;

  return word.syllables.map((syllable, index) => ({
    time: syllable.time,
    text: cased[index],
  }));
}

type LineState = "past" | "active" | "future";

interface LineRowProps {
  line: LyricLine;
  index: number;
  state: LineState;
  /**
   * Sólo la línea activa recibe el reloj: así `memo` evita re-renderizar las
   * demás en cada tick (una canción puede tener 300 líneas).
   */
  currentTime: number;
  onSeek?: (time: number) => void;
}

const LineRow = memo(function LineRow({
  line,
  index,
  state,
  currentTime,
  onSeek,
}: LineRowProps) {
  const isActive = state === "active";

  // El detalle por palabra sólo se calcula para la línea activa: en las demás el
  // resaltado es de línea completa y calcular 300 índices por tick no aportaría
  // nada visible.
  const activeWordIndex = useMemo(() => {
    if (!isActive || !line.words?.length) return -1;
    return findLastAtOrBefore(
      line.words.map((word) => word.time),
      currentTime,
    );
  }, [isActive, line.words, currentTime]);

  const handleWordKey = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>, word: LyricWord) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSeek?.(word.time);
    },
    [onSeek],
  );

  return (
    <p
      className={`lyrics-line lyrics-line--${state}`}
      data-line={index}
      data-line-time={line.time.toFixed(3)}
      aria-current={isActive ? "true" : undefined}
    >
      {line.words?.length
        ? line.words.map((word, wordIndex) => {
            const wordState = !isActive
              ? ""
              : wordIndex === activeWordIndex
                ? " lyrics-word--active"
                : wordIndex < activeWordIndex
                  ? " lyrics-word--past"
                  : "";
            return (
              <span
                key={`${word.time}-${wordIndex}`}
                className={`lyrics-word${wordState}`}
                data-word={word.text}
                data-word-time={word.time.toFixed(3)}
                {...(onSeek
                  ? {
                      role: "button",
                      tabIndex: 0,
                      title: `Ir a ${stamp(word.time)}`,
                      onClick: () => onSeek(word.time),
                      onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) =>
                        handleWordKey(event, word),
                    }
                  : {})}
              >
                {syllableTexts(word).map((syllable, syllableIndex) => (
                  <span
                    key={syllableIndex}
                    className={
                      isActive && syllable.time <= currentTime
                        ? "lyrics-syl lyrics-syl--sung"
                        : "lyrics-syl"
                    }
                  >
                    {syllable.text}
                  </span>
                ))}
              </span>
            );
          })
        : line.text}
    </p>
  );
});

export function LyricsPanel({
  lines,
  currentTime,
  duration,
  songTitle,
  onSeek,
  onClose,
}: LyricsPanelProps) {
  // Idempotente: sólo reescribe si alguna línea venía gritada o sin arranque en
  // mayúscula (letra guardada por una versión anterior de la app).
  const normalised = useMemo(() => normaliseLyricLines(lines), [lines]);
  const times = useMemo(() => normalised.map((line) => line.time), [normalised]);

  const activeIndex = useMemo(
    () => findLastAtOrBefore(times, currentTime),
    [times, currentTime],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastCentredRef = useRef(-1);
  /** Hasta cuándo el usuario manda: mientras tanto no se le mueve la vista. */
  const manualUntilRef = useRef(0);

  const markManual = useCallback(() => {
    manualUntilRef.current = performance.now() + MANUAL_SCROLL_GRACE_MS;
  }, []);

  // Cambiar de canción invalida la memoria de centrado: aunque el índice activo
  // dé el mismo número, la línea es otra y hay que volver a centrarla. Va ANTES
  // del efecto de scroll para que éste ya vea la memoria limpia en el mismo
  // commit (los efectos corren en orden de declaración).
  useEffect(() => {
    lastCentredRef.current = -1;
  }, [normalised]);

  // Auto-scroll: centra la línea activa. Sólo cuando CAMBIA la línea, que es lo
  // que evita el goteo de `scrollTo` pelea tras pelea en cada tick del reloj.
  useEffect(() => {
    if (activeIndex < 0) return;
    if (activeIndex === lastCentredRef.current) return;
    lastCentredRef.current = activeIndex;
    if (performance.now() < manualUntilRef.current) return;

    const container = containerRef.current;
    const node = container?.querySelector<HTMLElement>(
      `[data-line="${activeIndex}"]`,
    );
    if (!container || !node) return;

    const target =
      node.offsetTop - container.clientHeight / 2 + node.offsetHeight / 2;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({
      top: Math.max(0, target),
      behavior: reduced ? "auto" : "smooth",
    });
  }, [activeIndex]);

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // ── Sin letra ──────────────────────────────────────────────────────────────
  if (normalised.length === 0) {
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

  // ── Letra ──────────────────────────────────────────────────────────────────
  return (
    <div className="lyrics-panel" data-current-time={currentTime.toFixed(3)}>
      <header className="lyrics-head">
        <div className="lyrics-head__row">
          <h2>Letra</h2>
          {onClose && (
            <button
              type="button"
              className="lyrics-head__close"
              onClick={onClose}
              aria-label="Cerrar la letra"
              title="Cerrar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12M18 6L6 18"
                />
              </svg>
            </button>
          )}
        </div>
        {songTitle && <p className="lyrics-head__song">{songTitle}</p>}
        {onSeek && (
          <p className="lyrics-hint">Tocá una palabra para ir a ese punto</p>
        )}
      </header>

      <div
        className="lyrics-lines"
        ref={containerRef}
        role="log"
        aria-live="polite"
        aria-label="Letra sincronizada"
        tabIndex={0}
        onWheel={markManual}
        onTouchStart={markManual}
        onPointerDown={markManual}
      >
        {normalised.map((line, index) => (
          <LineRow
            key={`${line.time}-${index}`}
            line={line}
            index={index}
            state={
              index === activeIndex
                ? "active"
                : index < activeIndex
                  ? "past"
                  : "future"
            }
            currentTime={index === activeIndex ? currentTime : 0}
            onSeek={onSeek}
          />
        ))}
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
          {activeIndex >= 0 ? activeIndex + 1 : 0} / {normalised.length}
        </span>
      </div>
    </div>
  );
}
