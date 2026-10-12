// ============================================================
// components/library/MusicScreen — the Spotify-style section.
//
// Layout: a frozen nav column on the left (Inicio / Buscar / Canciones /
// Me gusta / Playlists / Artistas / Álbumes / Géneros / Historial) and a
// scrolling content area whose shape depends on the active `view`.
//
// The view lives in App state, not here, so leaving the tab and coming back
// lands the user where they were.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { usePlayer } from "../../music/PlayerContext";
import { useLibrary } from "../../music/useLibrary";
import { formatTotalDuration } from "../../music/meta";
import { GENRE_META, GENRE_ORDER } from "../../types/song";
import type { TrackMeta } from "../../music/types";
import { NAV_ITEMS, viewMatchesTab, type MusicTab, type MusicView } from "../../music/views";
import { paletteForTrack } from "../../music/covers";
import { usePlayerUi } from "../player/PlayerSection";
import { Cover } from "../player/parts";
import { TrackRow } from "./TrackRow";
import { TrackCard } from "./TrackCard";
import "./music.css";

export type MusicScreenProps = {
  view: MusicView;
  onViewChange: (view: MusicView) => void;
  onOpenMenu: (meta: TrackMeta, event: MouseEvent<HTMLElement>) => void;
  onAddToPlaylist: (meta: TrackMeta) => void;
  onSharePlaylist: (playlistId: string) => void;
  onEditPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
  /** Loads the track in the Studio so the user can play along. */
  onPracticeTrack?: (meta: TrackMeta) => void;
  onImportFile: (file: File) => void;
  importLoading?: boolean;
  importError?: string | null;
  importLastFile?: string | null;
};

const SHELF_LIMIT = 12;

export function MusicScreen({
  view,
  onViewChange,
  onOpenMenu,
  onAddToPlaylist,
  onSharePlaylist,
  onEditPlaylist,
  onCreatePlaylist,
  onPracticeTrack,
  onImportFile,
  importLoading = false,
  importError = null,
  importLastFile = null,
}: MusicScreenProps) {
  const player = usePlayer();
  const library = useLibrary();
  const playerUi = usePlayerUi();
  const [localQuery, setLocalQuery] = useState(view.tab === "search" ? view.q : "");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Focusing the field when the user lands on the search tab saves a click.
  useEffect(() => {
    if (view.tab === "search") searchRef.current?.focus();
  }, [view.tab]);

  const tracks = library.tracks;

  const goToTab = useCallback(
    (tab: MusicTab) => {
      if (tab === "search") {
        onViewChange({ tab: "search", q: localQuery });
        return;
      }
      onViewChange({ tab } as MusicView);
    },
    [onViewChange, localQuery],
  );

  // ── search index ──────────────────────────────────────────────
  const query = view.tab === "search" ? view.q.trim().toLowerCase() : "";
  const searchResults = useMemo(() => {
    if (!query) return { tracks: [] as TrackMeta[], playlists: [], artists: [] as string[] };
    const match = (value: string) => value.toLowerCase().includes(query);
    return {
      tracks: tracks.filter(
        (meta) =>
          match(meta.title) ||
          match(meta.artist) ||
          match(meta.album) ||
          (meta.genre ? match(GENRE_META[meta.genre].label) : false),
      ),
      playlists: [...library.playlists, ...library.autoPlaylists].filter((playlist) =>
        match(playlist.name),
      ),
      artists: library.artists.filter(match),
    };
  }, [query, tracks, library.playlists, library.autoPlaylists, library.artists]);

  // ── helpers ───────────────────────────────────────────────────

  const playList = useCallback(
    (ids: string[], label: string, startAt?: string) => {
      player.playCollection(ids, {
        startAt,
        origin: { kind: "library", label },
      });
    },
    [player],
  );

  const shuffleList = useCallback(
    (ids: string[], label: string) => {
      if (ids.length === 0) return;
      if (!player.shuffle) player.toggleShuffle();
      const random = ids[Math.floor(Math.random() * ids.length)];
      player.playCollection(ids, { startAt: random, origin: { kind: "library", label } });
    },
    [player],
  );

  const renderRows = (
    ids: string[],
    originLabel: string,
    options: { showAlbum?: boolean; playlistId?: string } = {},
  ) => {
    const metas = library.resolveMany(ids);
    if (metas.length === 0) return <EmptyBlock label="Acá no hay nada todavía." />;
    return (
      <ol className="pm-rows">
        {metas.map((meta, index) => (
          <TrackRow
            key={`${meta.id}-${index}`}
            meta={meta}
            index={index}
            contextIds={ids}
            originLabel={originLabel}
            isActive={player.currentTrackId === meta.id}
            onOpenMenu={onOpenMenu}
            onAddToPlaylist={onAddToPlaylist}
            showAlbum={options.showAlbum ?? true}
            playlistId={options.playlistId}
            trailing={
              onPracticeTrack && playerUi.canPractice ? (
                <button
                  type="button"
                  className="pm-row__icon-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPracticeTrack(meta);
                  }}
                  aria-label={`Practicar ${meta.title} en el Studio`}
                  title="Practicar en el Studio"
                >
                  🎹
                </button>
              ) : undefined
            }
          />
        ))}
      </ol>
    );
  };

  const renderShelf = (title: string, ids: string[], label: string, action?: () => void) => {
    const metas = library.resolveMany(ids).slice(0, SHELF_LIMIT);
    if (metas.length === 0) return null;
    return (
      <section className="pm-shelf" key={title}>
        <header className="pm-shelf__head">
          <h2 className="pm-shelf__title">{title}</h2>
          {action && (
            <button type="button" className="pm-shelf__more" onClick={action}>
              Ver todo
            </button>
          )}
        </header>
        <div className="pm-shelf__rail">
          {metas.map((meta) => (
            <TrackCard
              key={meta.id}
              meta={meta}
              size="sm"
              contextIds={ids}
              originLabel={label}
              onOpenMenu={onOpenMenu}
            />
          ))}
        </div>
      </section>
    );
  };

  // ── view: home ────────────────────────────────────────────────
  const renderHome = () => {
    const greeting = (() => {
      const hour = new Date().getHours();
      if (hour < 12) return "Buenos días";
      if (hour < 19) return "Buenas tardes";
      return "Buenas noches";
    })();

    const shelves = [
      renderShelf("Recién escuchadas", library.recentlyPlayedIds, "Recién escuchadas", () =>
        onViewChange({ tab: "history" }),
      ),
      renderShelf("Tus me gusta", library.likedIds, "Me gusta", () =>
        onViewChange({ tab: "liked" }),
      ),
      renderShelf("Más escuchadas", library.mostPlayedIds, "Más escuchadas"),
      renderShelf(
        "Vallenato",
        tracks.filter((meta) => meta.genre === "vallenato").map((meta) => meta.id),
        "Vallenato",
        () => onViewChange({ tab: "genre", id: "vallenato" }),
      ),
      renderShelf(
        "Boleros",
        tracks.filter((meta) => meta.genre === "bolero").map((meta) => meta.id),
        "Boleros",
        () => onViewChange({ tab: "genre", id: "bolero" }),
      ),
      renderShelf(
        "Clásica para piano",
        tracks.filter((meta) => meta.genre === "classical").map((meta) => meta.id),
        "Clásica",
        () => onViewChange({ tab: "genre", id: "classical" }),
      ),
      renderShelf(
        "Pop & Rock",
        tracks.filter((meta) => meta.genre === "pop").map((meta) => meta.id),
        "Pop & Rock",
        () => onViewChange({ tab: "genre", id: "pop" }),
      ),
    ].filter(Boolean);

    const quickPicks = [
      ...library.autoPlaylists.filter((playlist) => playlist.trackIds.length > 0),
      ...library.playlists.slice(0, 4),
    ].slice(0, 6);

    return (
      <>
        <header className="pm-hero">
          <p className="pm-hero__eyebrow">Tu música</p>
          <h1 className="pm-hero__title">{greeting}</h1>
          <p className="pm-hero__sub">
            {tracks.length} canciones en la biblioteca ·{" "}
            {formatTotalDuration(
              tracks.reduce((sum, meta) => sum + meta.duration, 0),
            )}{" "}
            de música
          </p>
          <div className="pm-hero__actions">
            <button
              type="button"
              className="pm-btn pm-btn--primary pm-btn--lg"
              onClick={() => playList(tracks.map((meta) => meta.id), "Toda la biblioteca")}
              disabled={tracks.length === 0}
            >
              ▶ Reproducir todo
            </button>
            <button
              type="button"
              className="pm-btn pm-btn--lg"
              onClick={() =>
                shuffleList(tracks.map((meta) => meta.id), "Aleatorio de la biblioteca")
              }
              disabled={tracks.length === 0}
            >
              🔀 Aleatorio
            </button>
          </div>
        </header>

        {quickPicks.length > 0 && (
          <div className="pm-quick">
            {quickPicks.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="pm-quick__tile"
                onClick={() => onViewChange({ tab: "playlist", id: playlist.id })}
              >
                <span
                  className="pm-quick__art"
                  style={{
                    background: `linear-gradient(135deg, ${playlist.color}, ${playlist.colorAlt})`,
                  }}
                  aria-hidden="true"
                >
                  {playlist.emoji}
                </span>
                <span className="pm-quick__meta">
                  <span className="pm-quick__name">{playlist.name}</span>
                  <span className="pm-quick__count">
                    {playlist.trackIds.length} canciones
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {shelves.length > 0 ? (
          shelves
        ) : (
          <EmptyBlock
            label="Todavía no hay canciones en la biblioteca"
            hint="Importá un MIDI o una partitura para arrancar."
          />
        )}
      </>
    );
  };

  // ── view: search ──────────────────────────────────────────────
  const renderSearch = () => (
    <>
      <header className="pm-page-head">
        <h1 className="pm-page-title">Buscar</h1>
        <label className="pm-search">
          <span className="pm-search__icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={searchRef}
            type="search"
            className="pm-search__input"
            placeholder="Canciones, artistas, álbumes, playlists…"
            value={localQuery}
            onChange={(event) => {
              setLocalQuery(event.target.value);
              onViewChange({ tab: "search", q: event.target.value });
            }}
            aria-label="Buscar en la biblioteca"
          />
          {localQuery && (
            <button
              type="button"
              className="pm-search__clear"
              onClick={() => {
                setLocalQuery("");
                onViewChange({ tab: "search", q: "" });
                searchRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </label>
      </header>

      {!query ? (
        <div className="pm-genre-tiles">
          {GENRE_ORDER.filter((genre) => (library.genreCounts.get(genre) ?? 0) > 0).map(
            (genre) => {
              const meta = GENRE_META[genre];
              return (
                <button
                  key={genre}
                  type="button"
                  className="pm-genre-tile"
                  style={{
                    background: `linear-gradient(135deg, ${meta.color}, ${meta.colorAlt})`,
                  }}
                  onClick={() => onViewChange({ tab: "genre", id: genre })}
                >
                  <span className="pm-genre-tile__emoji" aria-hidden="true">
                    {meta.emoji}
                  </span>
                  <span className="pm-genre-tile__label">{meta.label}</span>
                  <span className="pm-genre-tile__count">
                    {library.genreCounts.get(genre)} canciones
                  </span>
                </button>
              );
            },
          )}
        </div>
      ) : searchResults.tracks.length === 0 &&
        searchResults.playlists.length === 0 &&
        searchResults.artists.length === 0 ? (
        <EmptyBlock
          label={`Sin resultados para "${view.tab === "search" ? view.q : ""}"`}
          hint="Probá con el nombre del artista, el género o parte del título."
        />
      ) : (
        <div className="pm-search-results">
          {searchResults.artists.length > 0 && (
            <section className="pm-block">
              <h2 className="pm-block__title">Artistas</h2>
              <div className="pm-chip-row">
                {searchResults.artists.slice(0, 8).map((artist) => (
                  <button
                    key={artist}
                    type="button"
                    className="pm-chip pm-chip--lg"
                    onClick={() => onViewChange({ tab: "artist", name: artist })}
                  >
                    🎤 {artist}
                  </button>
                ))}
              </div>
            </section>
          )}

          {searchResults.playlists.length > 0 && (
            <section className="pm-block">
              <h2 className="pm-block__title">Playlists</h2>
              <div className="pm-tile-grid">
                {searchResults.playlists.slice(0, 6).map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    id={playlist.id}
                    onOpen={(id) => onViewChange({ tab: "playlist", id })}
                  />
                ))}
              </div>
            </section>
          )}

          {searchResults.tracks.length > 0 && (
            <section className="pm-block">
              <h2 className="pm-block__title">
                Canciones
                <span className="pm-block__count">{searchResults.tracks.length}</span>
              </h2>
              {renderRows(
                searchResults.tracks.map((meta) => meta.id),
                `Resultados: ${view.tab === "search" ? view.q : ""}`,
              )}
            </section>
          )}
        </div>
      )}
    </>
  );

  // ── view: a list of tracks with a header ──────────────────────
  const renderTrackList = (
    ids: string[],
    options: {
      eyebrow?: string;
      title: string;
      description?: string;
      emoji?: string;
      gradient?: { color: string; colorAlt: string };
      playlistId?: string;
      emptyLabel?: string;
      onEdit?: () => void;
      onShare?: () => void;
      playlistTrackIds?: boolean;
    },
  ) => {
    const total = library.totalDuration(ids);
    return (
      <>
        <header
          className="pm-list-head"
          style={
            options.gradient
              ? ({
                  "--lh-c": options.gradient.color,
                  "--lh-c-alt": options.gradient.colorAlt,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="pm-list-head__art">
            {options.emoji ? (
              <span
                className="pm-list-head__emoji"
                style={
                  options.gradient
                    ? {
                        background: `linear-gradient(135deg, ${options.gradient.color}, ${options.gradient.colorAlt})`,
                      }
                    : undefined
                }
                aria-hidden="true"
              >
                {options.emoji}
              </span>
            ) : (
              <Cover meta={library.getTrack(ids[0])} size="xl" />
            )}
          </div>
          <div className="pm-list-head__body">
            {options.eyebrow && (
              <p className="pm-list-head__eyebrow">{options.eyebrow}</p>
            )}
            <h1 className="pm-list-head__title">{options.title}</h1>
            {options.description && (
              <p className="pm-list-head__desc">{options.description}</p>
            )}
            <p className="pm-list-head__stats">
              {ids.length} cancion{ids.length === 1 ? "" : "es"} ·{" "}
              {formatTotalDuration(total)}
            </p>
            <div className="pm-list-head__actions">
              <button
                type="button"
                className="pm-btn pm-btn--primary pm-btn--lg"
                onClick={() => playList(ids, options.title)}
                disabled={ids.length === 0}
              >
                ▶ Reproducir
              </button>
              <button
                type="button"
                className="pm-btn pm-btn--lg"
                onClick={() => shuffleList(ids, options.title)}
                disabled={ids.length === 0}
              >
                🔀 Aleatorio
              </button>
              {options.onShare && (
                <button type="button" className="pm-btn" onClick={options.onShare}>
                  🔗 Compartir
                </button>
              )}
              {options.onEdit && (
                <button type="button" className="pm-btn" onClick={options.onEdit}>
                  ✏️ Editar
                </button>
              )}
            </div>
          </div>
        </header>

        {ids.length === 0 ? (
          <EmptyBlock label={options.emptyLabel ?? "Esta lista está vacía."} />
        ) : (
          renderRows(ids, options.title, {
            playlistId: options.playlistId,
            showAlbum: !options.playlistTrackIds,
          })
        )}
      </>
    );
  };

  // ── view: playlists index ─────────────────────────────────────
  const renderPlaylists = () => (
    <>
      <header className="pm-page-head pm-page-head--row">
        <div>
          <h1 className="pm-page-title">Playlists</h1>
          <p className="pm-page-sub">
            {library.playlists.length} tuyas · {library.autoPlaylists.length} automáticas
          </p>
        </div>
        <button type="button" className="pm-btn pm-btn--primary" onClick={onCreatePlaylist}>
          + Nueva playlist
        </button>
      </header>

      <section className="pm-block">
        <h2 className="pm-block__title">Automáticas</h2>
        <div className="pm-tile-grid">
          {library.autoPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              id={playlist.id}
              onOpen={(id) => onViewChange({ tab: "playlist", id })}
            />
          ))}
        </div>
      </section>

      <section className="pm-block">
        <h2 className="pm-block__title">
          Tuyas
          <span className="pm-block__count">{library.playlists.length}</span>
        </h2>
        {library.playlists.length === 0 ? (
          <EmptyBlock
            label="Todavía no creaste playlists"
            hint="Armá una y arrastrá las canciones al orden que quieras."
            action={{ label: "+ Crear la primera", run: onCreatePlaylist }}
          />
        ) : (
          <div className="pm-tile-grid">
            {library.playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                id={playlist.id}
                onOpen={(id) => onViewChange({ tab: "playlist", id })}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );

  // ── view: artists / albums index ──────────────────────────────
  const renderArtists = () => (
    <>
      <header className="pm-page-head">
        <h1 className="pm-page-title">Artistas</h1>
        <p className="pm-page-sub">{library.artists.length} en tu biblioteca</p>
      </header>
      <div className="pm-tile-grid">
        {library.artists.map((artist) => {
          const count = tracks.filter((meta) => meta.artist === artist).length;
          const sample = tracks.find((meta) => meta.artist === artist);
          return (
            <button
              key={artist}
              type="button"
              className="pm-card pm-card--artist"
              onClick={() => onViewChange({ tab: "artist", name: artist })}
            >
              <Cover
                meta={sample}
                size="xl"
                shape="circle"
                label={artist}
                className="pm-card__circle"
              />
              <span className="pm-card__title">{artist}</span>
              <span className="pm-card__sub">
                {count} cancion{count === 1 ? "" : "es"}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const renderAlbums = () => (
    <>
      <header className="pm-page-head">
        <h1 className="pm-page-title">Álbumes</h1>
        <p className="pm-page-sub">
          Cada artista del catálogo agrupa sus canciones como un álbum
        </p>
      </header>
      <div className="pm-tile-grid">
        {library.albums.map((album) => {
          const albumTracks = tracks.filter((meta) => meta.album === album);
          return (
            <button
              key={album}
              type="button"
              className="pm-card"
              onClick={() => onViewChange({ tab: "album", name: album })}
            >
              <Cover meta={albumTracks[0]} size="xl" label={album} />
              <span className="pm-card__title">{album}</span>
              <span className="pm-card__sub">
                {albumTracks.length} cancion{albumTracks.length === 1 ? "" : "es"}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const renderGenres = () => (
    <>
      <header className="pm-page-head">
        <h1 className="pm-page-title">Géneros</h1>
        <p className="pm-page-sub">Los ritmos que trae tu biblioteca</p>
      </header>
      <div className="pm-genre-tiles">
        {GENRE_ORDER.filter((genre) => (library.genreCounts.get(genre) ?? 0) > 0).map(
          (genre) => {
            const meta = GENRE_META[genre];
            return (
              <button
                key={genre}
                type="button"
                className="pm-genre-tile"
                style={{
                  background: `linear-gradient(135deg, ${meta.color}, ${meta.colorAlt})`,
                }}
                onClick={() => onViewChange({ tab: "genre", id: genre })}
              >
                <span className="pm-genre-tile__emoji" aria-hidden="true">
                  {meta.emoji}
                </span>
                <span className="pm-genre-tile__label">{meta.label}</span>
                <span className="pm-genre-tile__count">
                  {library.genreCounts.get(genre)} canciones
                </span>
                <span className="pm-genre-tile__desc">{meta.description}</span>
              </button>
            );
          },
        )}
      </div>
    </>
  );

  // ── main switch ───────────────────────────────────────────────
  const content = (() => {
    switch (view.tab) {
      case "home":
        return renderHome();
      case "search":
        return renderSearch();
      case "tracks":
        return renderTrackList(
          tracks.map((meta) => meta.id),
          {
            eyebrow: "Biblioteca",
            title: "Todas las canciones",
            description: "Todo lo que tenés disponible, incluido lo que subiste",
            emoji: "🎵",
            gradient: { color: "#8b5cf6", colorAlt: "#d946ef" },
          },
        );
      case "liked":
        return renderTrackList(library.likedIds, {
          eyebrow: "Colección",
          title: "Me gusta",
          description: "Las canciones que marcaste con el corazón",
          emoji: "❤️",
          gradient: { color: "#f43f5e", colorAlt: "#a855f7" },
          emptyLabel:
            "Todavía no le diste corazón a ninguna canción. Usá el ❤️ de cualquier fila.",
        });
      case "history":
        return renderTrackList(library.historyIds, {
          eyebrow: "Tu actividad",
          title: "Historial",
          description: "Lo último que pasó por el reproductor",
          emoji: "🕰️",
          gradient: { color: "#0ea5e9", colorAlt: "#6366f1" },
          emptyLabel: "Todavía no escuchaste nada.",
        });
      case "playlists":
        return renderPlaylists();
      case "playlist": {
        const playlist = library.getPlaylist(view.id);
        if (!playlist) {
          return (
            <EmptyBlock
              label="Esta playlist ya no existe"
              hint="Puede que la hayas eliminado."
              action={{ label: "Ver playlists", run: () => onViewChange({ tab: "playlists" }) }}
            />
          );
        }
        return renderTrackList(playlist.trackIds, {
          eyebrow: playlist.auto ? "Automática" : "Playlist",
          title: playlist.name,
          description: playlist.description,
          emoji: playlist.emoji,
          gradient: { color: playlist.color, colorAlt: playlist.colorAlt },
          playlistId: playlist.system ? undefined : playlist.id,
          playlistTrackIds: true,
          emptyLabel: "Esta playlist está vacía. Agregá canciones desde el menú ⋯.",
          onShare: () => onSharePlaylist(playlist.id),
          onEdit: playlist.system ? undefined : () => onEditPlaylist(playlist.id),
        });
      }
      case "artists":
        return renderArtists();
      case "artist": {
        const ids = tracks
          .filter((meta) => meta.artist === view.name)
          .map((meta) => meta.id);
        const sample = tracks.find((meta) => meta.artist === view.name);
        const palette = paletteForTrack(sample);
        return renderTrackList(ids, {
          eyebrow: "Artista",
          title: view.name,
          description: sample?.album ? `Álbum: ${sample.album}` : undefined,
          emoji: "🎤",
          gradient: palette,
        });
      }
      case "albums":
        return renderAlbums();
      case "album": {
        const ids = tracks
          .filter((meta) => meta.album === view.name)
          .map((meta) => meta.id);
        return renderTrackList(ids, {
          eyebrow: "Álbum",
          title: view.name,
          description: "Agrupado automáticamente por artista",
          emoji: "💿",
          gradient: paletteForTrack(library.getTrack(ids[0])),
        });
      }
      case "genres":
        return renderGenres();
      case "genre": {
        const meta = GENRE_META[view.id as keyof typeof GENRE_META];
        if (!meta) return <EmptyBlock label="Género desconocido" />;
        const ids = tracks
          .filter((track) => track.genre === view.id)
          .map((track) => track.id);
        return renderTrackList(ids, {
          eyebrow: "Género",
          title: `${meta.emoji} ${meta.label}`,
          description: meta.description,
          emoji: meta.emoji,
          gradient: { color: meta.color, colorAlt: meta.colorAlt },
        });
      }
      default:
        return null;
    }
  })();

  const activeTab: MusicTab = view.tab;

  return (
    <div className="pm-screen">
      <nav className="pm-nav" aria-label="Navegación de música">
        <div className="pm-nav__brand">
          <span className="pm-nav__brand-icon" aria-hidden="true">
            🎧
          </span>
          <span className="pm-nav__brand-text">Mi música</span>
        </div>

        <ul className="pm-nav__list">
          {NAV_ITEMS.map((item) => {
            const count =
              item.tab === "liked"
                ? library.likedIds.length
                : item.tab === "playlists"
                  ? library.playlists.length
                  : item.tab === "tracks"
                    ? tracks.length
                    : undefined;
            return (
              <li key={item.tab}>
                <button
                  type="button"
                  className={`pm-nav__item ${
                    viewMatchesTab(view, item.tab) && activeTab !== "home" ? "is-active" : ""
                  } ${activeTab === "home" && item.tab === "home" ? "is-active" : ""}`}
                  onClick={() => goToTab(item.tab)}
                >
                  <span className="pm-nav__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="pm-nav__label">{item.label}</span>
                  {count !== undefined && <span className="pm-nav__count">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="pm-nav__divider" role="presentation" />

        <div className="pm-nav__section">
          <span className="pm-nav__section-title">Tus playlists</span>
          {library.playlists.length === 0 ? (
            <button type="button" className="pm-nav__empty" onClick={onCreatePlaylist}>
              + Crear tu primera playlist
            </button>
          ) : (
            <ul className="pm-nav__playlists">
              {library.playlists.slice(0, 8).map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className={`pm-nav__playlist ${
                      view.tab === "playlist" && view.id === playlist.id ? "is-active" : ""
                    }`}
                    onClick={() => onViewChange({ tab: "playlist", id: playlist.id })}
                  >
                    <span
                      className="pm-nav__playlist-dot"
                      style={{
                        background: `linear-gradient(135deg, ${playlist.color}, ${playlist.colorAlt})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="pm-nav__playlist-name">{playlist.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="pm-nav__new" onClick={onCreatePlaylist}>
            + Nueva playlist
          </button>
        </div>

        <ImportPanelLite
          onImportFile={onImportFile}
          loading={importLoading}
          error={importError}
          lastFile={importLastFile}
        />
      </nav>

      <div className="pm-content">{content}</div>
    </div>
  );
}

// ── small local components ─────────────────────────────────────

function EmptyBlock({
  label,
  hint,
  action,
}: {
  label: string;
  hint?: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div className="pm-empty">
      <span className="pm-empty__icon" aria-hidden="true">
        🎵
      </span>
      <p className="pm-empty__label">{label}</p>
      {hint && <p className="pm-empty__hint">{hint}</p>}
      {action && (
        <button type="button" className="pm-btn pm-btn--primary" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function PlaylistCard({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const library = useLibrary();
  const player = usePlayer();
  const playlist = library.getPlaylist(id);
  if (!playlist) return null;

  const count = playlist.trackIds.length;

  return (
    <article className="pm-card">
      <button
        type="button"
        className="pm-card__art"
        onClick={() => onOpen(playlist.id)}
        aria-label={`Abrir ${playlist.name}`}
      >
        <span
          className="pm-cover pm-cover--xl pm-cover--square"
          style={{
            background: `linear-gradient(135deg, ${playlist.color}, ${playlist.colorAlt})`,
            width: 160,
            height: 160,
          }}
        >
          <span className="pm-cover__emoji" aria-hidden="true">
            {playlist.emoji}
          </span>
        </span>
        {count > 0 && (
          <span
            className="pm-cover__play"
            role="button"
            tabIndex={0}
            aria-label={`Reproducir ${playlist.name}`}
            onClick={(event) => {
              event.stopPropagation();
              player.playCollection(playlist.trackIds, {
                origin: { kind: "playlist", label: playlist.name, id: playlist.id },
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              player.playCollection(playlist.trackIds, {
                origin: { kind: "playlist", label: playlist.name, id: playlist.id },
              });
            }}
          >
            ▶
          </span>
        )}
      </button>
      <button type="button" className="pm-card__info" onClick={() => onOpen(playlist.id)}>
        <span className="pm-card__title">{playlist.name}</span>
        <span className="pm-card__sub">
          {count} cancion{count === 1 ? "" : "es"}
          {playlist.auto ? " · automática" : ""}
        </span>
        {playlist.description && (
          <span className="pm-card__meta">{playlist.description}</span>
        )}
      </button>
    </article>
  );
}

/**
 * Compact importer in the nav column. The full editor lives in
 * components/score/ImportPanel — this is the entry point so the music section
 * is self-sufficient.
 */
function ImportPanelLite({
  onImportFile,
  loading,
  error,
  lastFile,
}: {
  onImportFile: (file: File) => void;
  loading: boolean;
  error: string | null;
  lastFile: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onImportFile(file);
    },
    [onImportFile],
  );

  return (
    <div
      className={`pm-import ${dragOver ? "is-dragover" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <span className="pm-import__title">Importar</span>
      <button
        type="button"
        className="pm-import__btn"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? "Procesando…" : "Subir MIDI o partitura"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,.xml,.mxl,.kar"
        className="pm-import__input"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
        aria-label="Subir archivo MIDI o partitura"
      />
      <span className="pm-import__hint">Arrastrá el archivo acá también</span>
      {lastFile && !error && (
        <span className="pm-import__ok">✓ {lastFile}</span>
      )}
      {error && <span className="pm-import__error">{error}</span>}
    </div>
  );
}
