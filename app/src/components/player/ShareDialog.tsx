// ============================================================
// components/player/ShareDialog — share a track or a playlist.
//
// Desktop browsers have no share sheet, so the dialog always offers the link
// itself: copy it, open the usual messaging targets, or grab the QR-free
// plain-text version. On phones the native sheet is one tap away.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackMeta } from "../../music/types";
import { toast } from "../../music/toast";
import {
  buildCollectionShareUrl,
  buildTrackShareUrl,
  collectionAsText,
  copyText,
  isShareable,
  shareTargets,
  shareTrack,
  trackAsText,
} from "../../music/share";
import { formatTime } from "../../music/meta";
import { Cover } from "./parts";

export type SharePayload =
  | { kind: "track"; meta: TrackMeta }
  | {
      kind: "collection";
      name: string;
      description?: string;
      emoji?: string;
      color?: string;
      colorAlt?: string;
      tracks: TrackMeta[];
    };

export type ShareDialogProps = {
  payload: SharePayload | null;
  onClose: () => void;
};

export function ShareDialog({ payload, onClose }: ShareDialogProps) {
  /**
   * The url that was last copied. Storing the url rather than a boolean means
   * opening a different track resets the label for free, with no state
   * synchronisation inside an effect.
   */
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const url = useMemo(() => {
    if (!payload) return "";
    if (payload.kind === "track") {
      return isShareable(payload.meta) ? buildTrackShareUrl(payload.meta) : "";
    }
    return buildCollectionShareUrl({
      kind: "playlist",
      name: payload.name,
      description: payload.description,
      emoji: payload.emoji,
      color: payload.color,
      colorAlt: payload.colorAlt,
      tracks: payload.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
      })),
    });
  }, [payload]);

  const text = useMemo(() => {
    if (!payload) return "";
    return payload.kind === "track"
      ? trackAsText(payload.meta)
      : collectionAsText({
          kind: "playlist",
          name: payload.name,
          description: payload.description,
          emoji: payload.emoji,
          color: payload.color,
          colorAlt: payload.colorAlt,
          tracks: payload.tracks.map((track) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
          })),
        });
  }, [payload]);

  const canShare = payload?.kind === "track" ? isShareable(payload.meta) : Boolean(url);

  useEffect(() => {
    if (!payload) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    // Focus after the portal has painted — focusing inside the effect body
    // would run before the dialog exists in the document.
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [payload, onClose]);

  const copied = copiedUrl !== null && copiedUrl === url;

  const handleCopy = useCallback(async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (!ok) {
      toast.error("No se pudo copiar. Copialo a mano desde el campo.");
      return;
    }
    setCopiedUrl(url);
    toast.success("Link copiado");
    // Only clear the label if this same url is still the one on screen.
    window.setTimeout(() => {
      setCopiedUrl((prev) => (prev === url ? null : prev));
    }, 2400);
  }, [url]);

  const handleNativeShare = useCallback(async () => {
    if (!payload || payload.kind !== "track") return;
    const outcome = await shareTrack(payload.meta, { url });
    if (outcome === "shared") toast.success("Compartido");
    else if (outcome === "copied") toast.success("Link copiado");
    else if (outcome === "failed") toast.error("No se pudo compartir");
  }, [payload, url]);

  if (!payload) return null;

  const title = payload.kind === "track" ? payload.meta.title : payload.name;
  const subtitle =
    payload.kind === "track"
      ? `${payload.meta.artist} · ${formatTime(payload.meta.duration)}`
      : `${payload.tracks.length} canciones`;

  return createPortal(
    <div className="pm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pm-modal pm-modal--share"
        role="dialog"
        aria-modal="true"
        aria-label={`Compartir ${title}`}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pm-modal__head">
          <h2 className="pm-modal__title">Compartir</h2>
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

        <div className="pm-share__preview">
          <Cover
            meta={payload.kind === "track" ? payload.meta : payload.tracks[0]}
            emoji={payload.kind === "collection" ? payload.emoji : undefined}
            gradient={
              payload.kind === "collection" && payload.color && payload.colorAlt
                ? { color: payload.color, colorAlt: payload.colorAlt }
                : undefined
            }
            size="lg"
          />
          <div className="pm-share__preview-meta">
            <span className="pm-share__preview-title">{title}</span>
            <span className="pm-share__preview-sub">{subtitle}</span>
            {payload.kind === "collection" && (
              <span className="pm-share__preview-list">
                {payload.tracks
                  .slice(0, 3)
                  .map((track) => track.title)
                  .join(" · ")}
                {payload.tracks.length > 3 ? " · …" : ""}
              </span>
            )}
          </div>
        </div>

        {canShare ? (
          <>
            <label className="pm-share__field">
              <span className="pm-share__field-label">Link</span>
              <input
                type="text"
                className="pm-share__input"
                value={url}
                readOnly
                onFocus={(event) => event.target.select()}
                aria-label="Link para compartir"
              />
            </label>

            <div className="pm-share__actions">
              <button type="button" className="pm-btn pm-btn--primary" onClick={handleCopy}>
                {copied ? "✓ Copiado" : "Copiar link"}
              </button>
              {payload.kind === "track" && typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  type="button"
                  className="pm-btn"
                  onClick={() => void handleNativeShare()}
                >
                  Compartir…
                </button>
              )}
              <button
                type="button"
                className="pm-btn"
                onClick={() => {
                  void copyText(text).then((ok) =>
                    ok ? toast.success("Copiado como texto") : toast.error("No se pudo copiar"),
                  );
                }}
              >
                Copiar como texto
              </button>
            </div>

            <div className="pm-share__targets">
              {shareTargets(url, title).map((target) => (
                <a
                  key={target.id}
                  className="pm-share__target"
                  href={target.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {target.label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="pm-share__unavailable">
            <span aria-hidden="true">🔒</span>
            <p>
              Las canciones que subís viven solo en tu navegador: el link no
              tendría el archivo detrás.
            </p>
            <p className="pm-share__unavailable-hint">
              Podés compartir igual el nombre, o copiar el texto para mandarlo a
              mano.
            </p>
            <button
              type="button"
              className="pm-btn pm-btn--primary"
              onClick={() => {
                void copyText(text).then((ok) =>
                  ok ? toast.success("Copiado como texto") : toast.error("No se pudo copiar"),
                );
              }}
            >
              Copiar como texto
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
