// ============================================================
// components/player/TrackMenu — right-click / "⋯" context menu.
//
// One component serves every surface (library rows, cards, queue, now
// playing) so the actions and their labels can never drift apart.
// ============================================================

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "../../music/PlayerContext";
import { useLibrary } from "../../music/useLibrary";
import { libraryStore } from "../../music/libraryStore";
import type { TrackMeta } from "../../music/types";
import { GENRE_META } from "../../types/song";
import { toast } from "../../music/toast";
import { copyText, isShareable, shareTrack, trackAsText } from "../../music/share";

export type TrackMenuProps = {
  meta: TrackMeta;
  /** Screen position of the click that opened the menu. */
  x: number;
  y: number;
  onClose: () => void;
  /** Which playlist to offer "quitar de esta playlist" for. */
  playlistId?: string;
  onRemoveFromPlaylist?: (trackId: string) => void;
  onShare?: (meta: TrackMeta) => void;
  onShowDetails?: (meta: TrackMeta) => void;
  onOpenStudio?: (meta: TrackMeta) => void;
  onOpenScore?: (meta: TrackMeta) => void;
  onOpenGame?: (meta: TrackMeta) => void;
};

type MenuItem =
  | { kind: "item"; id: string; label: string; icon: string; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "submenu"; id: string; label: string; icon: string; items: { id: string; label: string; emoji: string; onSelect: () => void }[] }
  | { kind: "separator"; id: string }
  | { kind: "header"; id: string; label: string };

export function TrackMenu({
  meta,
  x,
  y,
  onClose,
  playlistId,
  onRemoveFromPlaylist,
  onShare,
  onShowDetails,
  onOpenStudio,
  onOpenScore,
  onOpenGame,
}: TrackMenuProps) {
  const player = usePlayer();
  const library = useLibrary();
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const userPlaylists = useMemo(
    () => library.playlists.filter((playlist) => !playlist.system),
    [library.playlists],
  );

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPosition({ left, top });
  }, [x, y, openSubmenu]);

  // Close on outside click, Escape, scroll or resize.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const liked = library.likedIds.includes(meta.id);
  const shareable = isShareable(meta);
  const genreLabel = meta.genre ? GENRE_META[meta.genre]?.label : undefined;

  const run = useCallback(
    (action: () => void) => () => {
      action();
      onClose();
    },
    [onClose],
  );

  const items = useMemo<MenuItem[]>(() => {
    const list: MenuItem[] = [
      {
        kind: "item",
        id: "play",
        label: "Reproducir",
        icon: "▶",
        onSelect: run(() => player.playTrack(meta.id)),
      },
      {
        kind: "item",
        id: "next",
        label: "Reproducir siguiente",
        icon: "⏭",
        onSelect: run(() => {
          player.addToQueue([meta.id], true);
          toast.success(`"${meta.title}" suena a continuación`);
        }),
      },
      {
        kind: "item",
        id: "queue",
        label: "Agregar a la cola",
        icon: "➕",
        onSelect: run(() => {
          player.addToQueue([meta.id], false);
          toast.success(`"${meta.title}" agregada a la cola`);
        }),
      },
      { kind: "separator", id: "s1" },
      {
        kind: "item",
        id: "like",
        label: liked ? "Quitar de Me gusta" : "Agregar a Me gusta",
        icon: liked ? "💔" : "❤️",
        onSelect: run(() => player.toggleLike(meta.id)),
      },
      {
        kind: "item",
        id: "radio",
        label: "Ir a la radio de esta canción",
        icon: "📻",
        onSelect: run(() => {
          player.startRadio(meta.id);
          toast.success(`Radio de ${meta.artist || meta.title}`);
        }),
      },
    ];

    if (playlistId && onRemoveFromPlaylist) {
      list.push({
        kind: "item",
        id: "remove",
        label: "Quitar de esta playlist",
        icon: "🗑️",
        danger: true,
        onSelect: run(() => onRemoveFromPlaylist(meta.id)),
      });
    }

    list.push({ kind: "separator", id: "s2" });

    const submenuItems = userPlaylists.map((playlist) => ({
      id: playlist.id,
      label: playlist.name,
      emoji: playlist.emoji,
      onSelect: run(() => {
        const added = libraryStore.addToPlaylist(playlist.id, [meta.id]);
        if (added > 0) toast.success(`Agregada a "${playlist.name}"`);
        else toast.info(`Ya estaba en "${playlist.name}"`);
      }),
    }));

    list.push({
      kind: "submenu",
      id: "add-to",
      label: "Agregar a playlist",
      icon: "🎧",
      items: submenuItems,
    });

    list.push({ kind: "separator", id: "s3" });

    if (onShare) {
      list.push({
        kind: "item",
        id: "share",
        label: "Compartir…",
        icon: "🔗",
        disabled: !shareable,
        onSelect: run(() => onShare(meta)),
      });
    } else {
      list.push({
        kind: "item",
        id: "share",
        label: shareable ? "Copiar link para compartir" : "Esta canción no se puede compartir",
        icon: "🔗",
        disabled: !shareable,
        onSelect: run(() => {
          void shareTrack(meta).then((outcome) => {
            if (outcome === "copied") toast.success("Link copiado al portapapeles");
            else if (outcome === "failed") toast.error("No se pudo copiar el link");
          });
        }),
      });
    }

    list.push({
      kind: "item",
      id: "copy-text",
      label: "Copiar como texto",
      icon: "📋",
      onSelect: run(() => {
        void copyText(trackAsText(meta)).then((ok) =>
          ok ? toast.success("Copiado") : toast.error("No se pudo copiar"),
        );
      }),
    });

    list.push({ kind: "separator", id: "s4" });
    list.push({ kind: "header", id: "h1", label: "Abrir en" });

    if (onOpenStudio) {
      list.push({
        kind: "item",
        id: "studio",
        label: "Studio (practicar)",
        icon: "🎹",
        onSelect: run(() => onOpenStudio(meta)),
      });
    }
    if (onOpenScore) {
      list.push({
        kind: "item",
        id: "score",
        label: "Partitura",
        icon: "🎼",
        onSelect: run(() => onOpenScore(meta)),
      });
    }
    if (onOpenGame) {
      list.push({
        kind: "item",
        id: "game",
        label: "Modo Juego",
        icon: "🎮",
        onSelect: run(() => onOpenGame(meta)),
      });
    }

    if (onShowDetails) {
      list.push({ kind: "separator", id: "s5" });
      list.push({
        kind: "item",
        id: "details",
        label: "Ver detalles",
        icon: "ℹ️",
        onSelect: run(() => onShowDetails(meta)),
      });
    }

    return list;
  }, [
    meta,
    liked,
    player,
    run,
    userPlaylists,
    playlistId,
    onRemoveFromPlaylist,
    onShare,
    onOpenStudio,
    onOpenScore,
    onOpenGame,
    onShowDetails,
    shareable,
  ]);

  return createPortal(
    <div
      ref={ref}
      className="pm-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label={`Opciones de ${meta.title}`}
    >
      <div className="pm-menu__head">
        <span className="pm-menu__head-title">{meta.title}</span>
        <span className="pm-menu__head-sub">
          {meta.artist}
          {genreLabel ? ` · ${genreLabel}` : ""}
        </span>
      </div>

      {items.map((item) => {
        if (item.kind === "separator") {
          return <div key={item.id} className="pm-menu__sep" role="separator" />;
        }
        if (item.kind === "header") {
          return (
            <div key={item.id} className="pm-menu__header">
              {item.label}
            </div>
          );
        }
        if (item.kind === "submenu") {
          const open = openSubmenu === item.id;
          return (
            <div key={item.id} className="pm-menu__submenu-wrap">
              <button
                type="button"
                className={`pm-menu__item ${open ? "is-open" : ""}`}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                onMouseEnter={() => setOpenSubmenu(item.id)}
                onClick={() => setOpenSubmenu(open ? null : item.id)}
              >
                <span className="pm-menu__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="pm-menu__label">{item.label}</span>
                <span className="pm-menu__chevron" aria-hidden="true">
                  ›
                </span>
              </button>
              {open && (
                <div className="pm-menu__submenu" role="menu">
                  {item.items.length === 0 ? (
                    <div className="pm-menu__empty">
                      Todavía no tenés playlists. Creá una abajo.
                    </div>
                  ) : (
                    item.items.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className="pm-menu__item"
                        role="menuitem"
                        onClick={sub.onSelect}
                      >
                        <span className="pm-menu__icon" aria-hidden="true">
                          {sub.emoji}
                        </span>
                        <span className="pm-menu__label">{sub.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={`pm-menu__item ${item.danger ? "is-danger" : ""}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            <span className="pm-menu__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="pm-menu__label">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
