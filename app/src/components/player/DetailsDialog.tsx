// ============================================================
// components/player/DetailsDialog — "ver detalles" for a track.
//
// Surfaces the MIDI facts the rest of the UI keeps implicit: track count,
// note count, BPM, whether it carries lyrics, and where the file came from.
// ============================================================

import { createPortal } from "react-dom";
import type { TrackMeta } from "../../music/types";
import { GENRE_META } from "../../types/song";
import { formatTime } from "../../music/meta";
import { useLibrary } from "../../music/useLibrary";
import { isDemoMeta } from "../../music/ids";
import { Cover } from "./parts";

export function DetailsDialog({
  meta,
  onClose,
}: {
  meta: TrackMeta | null;
  onClose: () => void;
}) {
  const library = useLibrary();
  if (!meta) return null;

  const genreMeta = meta.genre ? GENRE_META[meta.genre] : undefined;
  const plays = library.playCounts[meta.id] ?? 0;
  const lastPlayed = meta.lastPlayedAt
    ? new Date(meta.lastPlayedAt).toLocaleString("es-CO", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "nunca";

  const rows: [string, string][] = [
    ["Artista", meta.artist || "Desconocido"],
    ["Álbum", meta.album || "—"],
    ["Género", genreMeta ? `${genreMeta.emoji} ${genreMeta.label}` : "Sin clasificar"],
    ["Duración", formatTime(meta.duration)],
    ["Tempo", `${meta.bpm} BPM`],
    ["Pistas", String(meta.trackCount)],
    ["Notas", meta.noteCount.toLocaleString("es-CO")],
    ["Letra", meta.hasLyrics ? "Sí, sincronizada" : "No"],
    ["Reproducciones", plays.toLocaleString("es-CO")],
    ["Última vez", lastPlayed],
    ["Origen", isDemoMeta(meta) ? `Catálogo incluido (${meta.source.ref})` : meta.source.ref],
  ];

  return createPortal(
    <div className="pm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalles de ${meta.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pm-modal__head">
          <h2 className="pm-modal__title">Detalles</h2>
          <button
            type="button"
            className="pm-tbtn pm-tbtn--bare pm-tbtn--sm"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="pm-details__hero">
          <Cover meta={meta} size="lg" />
          <div>
            <h3 className="pm-details__title">{meta.title}</h3>
            <p className="pm-details__artist">{meta.artist}</p>
          </div>
        </div>

        <dl className="pm-details__list">
          {rows.map(([label, value]) => (
            <div key={label} className="pm-details__row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
