// ============================================================
// components/player/PlaylistDialog — create / edit / add-to-playlist.
//
// Three modes share one form because they ask for the same fields; only the
// heading, the submit label and whether deleting is offered change.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { libraryStore } from "../../music/libraryStore";
import { useLibrary } from "../../music/useLibrary";
import { PLAYLIST_EMOJIS, PLAYLIST_PALETTES } from "../../music/meta";
import { toast } from "../../music/toast";

export type PlaylistDialogProps =
  | {
      mode: "create";
      /** Track ids to drop in right after creating. */
      seedTrackIds?: string[];
      onClose: () => void;
      onCreated?: (playlistId: string) => void;
    }
  | {
      mode: "edit";
      playlistId: string;
      onClose: () => void;
      onDeleted?: () => void;
    }
  | {
      mode: "addTo";
      trackIds: string[];
      onClose: () => void;
    };

export function PlaylistDialog(props: PlaylistDialogProps) {
  const library = useLibrary();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const editing =
    props.mode === "edit"
      ? library.playlists.find((playlist) => playlist.id === props.playlistId)
      : undefined;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [emoji, setEmoji] = useState(editing?.emoji ?? PLAYLIST_EMOJIS[0]);
  const [paletteIndex, setPaletteIndex] = useState(() => {
    if (editing) {
      const index = PLAYLIST_PALETTES.findIndex(
        (palette) => palette.color === editing.color,
      );
      return index === -1 ? 0 : index;
    }
    return library.playlists.length % PLAYLIST_PALETTES.length;
  });

  const header =
    props.mode === "create"
      ? "Nueva playlist"
      : props.mode === "edit"
        ? "Editar playlist"
        : "Agregar a playlist";

  const userPlaylists = useMemo(
    () => library.playlists.filter((playlist) => !playlist.system),
    [library.playlists],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props]);

  const handleSubmit = useCallback(() => {
    if (props.mode === "addTo") return;

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Poné un nombre a la playlist");
      inputRef.current?.focus();
      return;
    }

    const palette = PLAYLIST_PALETTES[paletteIndex];

    if (props.mode === "create") {
      const playlist = libraryStore.createPlaylist({
        name: trimmed,
        description,
        emoji,
        color: palette.color,
        colorAlt: palette.colorAlt,
        trackIds: props.seedTrackIds ?? [],
      });
      toast.success(`Playlist "${playlist.name}" creada`);
      props.onCreated?.(playlist.id);
    } else {
      libraryStore.updatePlaylist(props.playlistId, {
        name: trimmed,
        description,
        emoji,
        color: palette.color,
        colorAlt: palette.colorAlt,
      });
      toast.success("Playlist actualizada");
    }
    props.onClose();
  }, [props, name, description, emoji, paletteIndex]);

  const handleDelete = useCallback(() => {
    if (props.mode !== "edit") return;
    libraryStore.deletePlaylist(props.playlistId);
    toast.success("Playlist eliminada");
    props.onDeleted?.();
    props.onClose();
  }, [props]);

  const handleAddTo = useCallback(
    (playlistId: string) => {
      if (props.mode !== "addTo") return;
      const added = libraryStore.addToPlaylist(playlistId, props.trackIds);
      const playlist = library.playlists.find((entry) => entry.id === playlistId);
      if (added > 0) {
        toast.success(
          added === 1
            ? `Agregada a "${playlist?.name ?? "playlist"}"`
            : `${added} canciones agregadas a "${playlist?.name ?? "playlist"}"`,
        );
      } else {
        toast.info(`Ya estaba en "${playlist?.name ?? "playlist"}"`);
      }
      props.onClose();
    },
    [props, library.playlists],
  );

  return createPortal(
    <div className="pm-modal-backdrop" onClick={props.onClose} role="presentation">
      <div
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={header}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pm-modal__head">
          <h2 className="pm-modal__title">{header}</h2>
          <button
            type="button"
            className="pm-tbtn pm-tbtn--bare pm-tbtn--sm"
            onClick={props.onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {props.mode === "addTo" ? (
          userPlaylists.length === 0 ? (
            <p className="pm-modal__note">
              Todavía no tenés playlists. Creá una desde “Nueva playlist”.
            </p>
          ) : (
            <ul className="pm-playlist-picker">
              {userPlaylists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className="pm-playlist-picker__row"
                    onClick={() => handleAddTo(playlist.id)}
                  >
                    <span
                      className="pm-playlist-picker__cover"
                      style={{
                        background: `linear-gradient(135deg, ${playlist.color}, ${playlist.colorAlt})`,
                      }}
                      aria-hidden="true"
                    >
                      {playlist.emoji}
                    </span>
                    <span className="pm-playlist-picker__meta">
                      <span className="pm-playlist-picker__name">{playlist.name}</span>
                      <span className="pm-playlist-picker__count">
                        {playlist.trackIds.length} canciones
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <form
            className="pm-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <div className="pm-form__cover-row">
              <span
                className="pm-form__cover"
                style={{
                  background: `linear-gradient(135deg, ${PLAYLIST_PALETTES[paletteIndex].color}, ${PLAYLIST_PALETTES[paletteIndex].colorAlt})`,
                }}
                aria-hidden="true"
              >
                {emoji}
              </span>
              <div className="pm-form__emoji-grid" role="group" aria-label="Elegir icono">
                {PLAYLIST_EMOJIS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`pm-form__emoji ${option === emoji ? "is-active" : ""}`}
                    onClick={() => setEmoji(option)}
                    aria-pressed={option === emoji}
                    aria-label={`Icono ${option}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="pm-field">
              <span className="pm-field__label">Nombre</span>
              <input
                ref={inputRef}
                type="text"
                className="pm-field__input"
                value={name}
                maxLength={80}
                placeholder="Vallenatos para el carro"
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>

            <label className="pm-field">
              <span className="pm-field__label">Descripción (opcional)</span>
              <input
                type="text"
                className="pm-field__input"
                value={description}
                maxLength={200}
                placeholder="Lo mejor para arrancar el día"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="pm-field">
              <span className="pm-field__label">Color</span>
              <div className="pm-form__palettes" role="group" aria-label="Elegir color">
                {PLAYLIST_PALETTES.map((palette, index) => (
                  <button
                    key={`${palette.color}-${palette.colorAlt}`}
                    type="button"
                    className={`pm-form__palette ${index === paletteIndex ? "is-active" : ""}`}
                    style={{
                      background: `linear-gradient(135deg, ${palette.color}, ${palette.colorAlt})`,
                    }}
                    onClick={() => setPaletteIndex(index)}
                    aria-pressed={index === paletteIndex}
                    aria-label={`Color ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            <footer className="pm-form__actions">
              {props.mode === "edit" && (
                <button
                  type="button"
                  className="pm-btn pm-btn--danger"
                  onClick={handleDelete}
                >
                  Eliminar
                </button>
              )}
              <span className="pm-form__spacer" />
              <button type="button" className="pm-btn" onClick={props.onClose}>
                Cancelar
              </button>
              <button type="submit" className="pm-btn pm-btn--primary">
                {props.mode === "create" ? "Crear" : "Guardar"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
