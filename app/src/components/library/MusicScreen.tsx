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
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { usePlayer } from "../../music/PlayerContext";
import { useLibrary } from "../../music/useLibrary";
import { formatTotalDuration } from "../../music/meta";
import { GENRE_META, GENRE_ORDER } from "../../types/song";
import { GENRE_FAMILIES } from "../../constants/genreFamilies";
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

/**
 * Cuánto se espera desde la última tecla antes de filtrar.
 *
 * ── POR QUÉ CON RETARDO ────────────────────────────────────────────────────
 *
 * Filtrar y montar una página de resultados cuesta ~200 ms de hilo principal
 * (medido: 99 ms de JS por tecla y tareas largas de hasta 261 ms en el build de
 * producción). Sin retardo eso se paga en CADA tecla, así que escribir "corazon"
 * congela la pantalla siete veces. El valor del input sigue siendo instantáneo
 * (vive en `localQuery`): lo que espera es el filtrado, no el teclado.
 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Normaliza texto para buscar: sin tildes, sin mayúsculas, sin puntuación.
 *
 * ── POR QUÉ HACE FALTA NORMALIZAR ──────────────────────────────────────────
 *
 * Es la misma regla que la biblioteca de Canciones (ver `SongLibrary.tsx`), y
 * por la misma razón: el usuario escribe "corazon" y espera encontrar "Corazón".
 * Acá había un `includes` crudo, así que el caso se veía al revés de lo
 * esperado: **"corazon" encontraba 58 canciones y "corazón" ninguna**.
 *
 * `NFD` descompone cada letra acentuada en letra + marca, y el rango
 * `\u0300-\u036f` son las marcas: sacarlas deja "corazon" de "Corazón".
 */
function normaliseSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cada palabra de la consulta, ya normalizada. */
function searchTokens(query: string): string[] {
  return normaliseSearchText(query).split(" ").filter(Boolean);
}

/**
 * Índice de búsqueda por canción: título + artista + álbum + género,
 * normalizados UNA sola vez.
 *
 * ── POR QUÉ SE PRECALCULA ──────────────────────────────────────────────────
 *
 * Sin índice, cada tecla recorría las 3.977 canciones llamando `toLowerCase()`
 * hasta cuatro veces por canción —y cada llamada asigna una cadena nueva—, más
 * `includes`. El `WeakMap` paga esa normalización una vez por canción y después
 * sólo recorre texto ya listo.
 *
 * Va en un `WeakMap` y no en un campo de `TrackMeta` para no contaminar el tipo
 * compartido: el índice se libera solo cuando la canción se libera.
 */
const searchIndex = new WeakMap<TrackMeta, string>();

function indexedText(meta: TrackMeta): string {
  let text = searchIndex.get(meta);
  if (text === undefined) {
    const genero = meta.genre ? (GENRE_META[meta.genre]?.label ?? "") : "";
    text = normaliseSearchText(
      `${meta.title} ${meta.artist ?? ""} ${meta.album ?? ""} ${genero}`,
    );
    searchIndex.set(meta, text);
  }
  return text;
}

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

  // ── input del buscador: retardo ───────────────────────────────
  //
  // El valor del input se refleja al instante (`localQuery`), pero la vista —y
  // con ella el filtrado y el montaje de filas— se actualiza recién cuando el
  // usuario deja de teclear. Sin esto, cada tecla paga el costo completo.
  const debounceRef = useRef<number | null>(null);
  const tabRef = useRef(view.tab);
  useEffect(() => {
    tabRef.current = view.tab;
  }, [view.tab]);
  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  /** Aplica la consulta ya mismo, sin esperar el retardo (Enter, limpiar). */
  const flushQuery = useCallback(
    (value: string) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      onViewChange({ tab: "search", q: value });
    },
    [onViewChange],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        // Si mientras tanto el usuario se fue de la vista, el retardo no puede
        // traerlo de vuelta a Buscar por su cuenta.
        if (tabRef.current !== "search") return;
        onViewChange({ tab: "search", q: value });
      }, SEARCH_DEBOUNCE_MS);
    },
    [onViewChange],
  );

  const handleClearQuery = useCallback(() => {
    setLocalQuery("");
    flushQuery("");
    searchRef.current?.focus();
  }, [flushQuery]);

  /**
   * Enter busca ya: el retardo es para no filtrar en cada tecla, no para hacer
   * esperar a quien ya terminó de escribir.
   */
  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") flushQuery(localQuery);
    },
    [flushQuery, localQuery],
  );

  // ── búsqueda ──────────────────────────────────────────────────
  //
  // `query` es el texto crudo (para mostrarlo); el filtrado usa `tokens`, que ya
  // viene sin tildes, sin mayúsculas y sin puntuación, y el índice precalculado.
  const query = view.tab === "search" ? view.q.trim() : "";
  const tokens = useMemo(() => searchTokens(query), [query]);

  /** Nombres que no viven en una canción, normalizados una vez por catálogo. */
  const playlistsIndex = useMemo(
    () =>
      [...library.playlists, ...library.autoPlaylists].map((playlist) => ({
        playlist,
        text: normaliseSearchText(playlist.name),
      })),
    [library.playlists, library.autoPlaylists],
  );

  const artistsIndex = useMemo(
    () => library.artists.map((name) => ({ name, text: normaliseSearchText(name) })),
    [library.artists],
  );

  const searchResults = useMemo(() => {
    if (tokens.length === 0) {
      return { tracks: [] as TrackMeta[], playlists: [], artists: [] as string[] };
    }
    // Todas las palabras, en cualquier orden y en cualquier campo: "mucho
    // besame" tiene que encontrar "Bésame Mucho" igual que al revés.
    const coincide = (text: string) => tokens.every((token) => text.includes(token));
    return {
      tracks: tracks.filter((meta) => coincide(indexedText(meta))),
      playlists: playlistsIndex
        .filter((entry) => coincide(entry.text))
        .map((entry) => entry.playlist),
      artists: artistsIndex
        .filter((entry) => coincide(entry.text))
        .map((entry) => entry.name),
    };
  }, [tokens, tracks, playlistsIndex, artistsIndex]);

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

  /** Cuántas filas se montan por página en las listas de canciones. */
  const ROW_PAGE_SIZE = 100;

  /**
   * Las filas de una lista, PAGINADAS.
   *
   * ── POR QUÉ PAGINA ────────────────────────────────────────────────────────
   *
   * Antes montaba todas: una familia como Romántica tiene 1.794 canciones, y a
   * ~24 nodos por fila son **~43.000 nodos del DOM** de una sola vez. El
   * navegador lo pinta, pero tarda, y cualquier interacción después va lenta.
   *
   * Con 100 por página el DOM tiene techo fijo y la lista abre igual de rápido
   * con 50 canciones que con 1.800. Los botones ◀ ▶ quedan pegados al final para
   * no tener que scrollear 100 filas para pasar de página.
   */
  /**
   * Página actual de las listas de canciones, junto con la vista a la que
   * pertenece.
   *
   * ── POR QUÉ GUARDA LA VISTA AL LADO ───────────────────────────────────────
   *
   * Hay que volver a la página 1 al cambiar de vista: si no, entrar a un género
   * desde la página 5 de otro deja al usuario en una página que quizá no existe.
   *
   * La forma obvia sería un `useEffect` que resetee al cambiar `view`, pero el
   * lint del proyecto lo prohíbe (`react-hooks/set-state-in-effect`) y con razón:
   * un render extra por cada cambio de vista. Guardar la vista junto con la página
   * permite **detectar el cambio durante el render** y resetear ahí mismo, que es
   * el patrón que React recomienda para estado que depende de otro estado.
   */
  const viewKey = view.tab + ("id" in view ? `:${view.id}` : "name" in view ? `:${view.name}` : "");
  const [rowPager, setRowPager] = useState({ key: viewKey, page: 0 });
  if (rowPager.key !== viewKey) {
    setRowPager({ key: viewKey, page: 0 });
  }
  const rowPage = rowPager.key === viewKey ? rowPager.page : 0;
  const setRowPage = (page: number) => setRowPager({ key: viewKey, page });

  const renderRows = (
    ids: string[],
    originLabel: string,
    options: { showAlbum?: boolean; playlistId?: string } = {},
  ) => {
    if (ids.length === 0) return <EmptyBlock label="Acá no hay nada todavía." />;

    const pageCount = Math.max(1, Math.ceil(ids.length / ROW_PAGE_SIZE));
    // Si la lista cambió (otro género, un filtro), la página actual puede quedar
    // fuera de rango: se recorta en vez de mostrar una lista vacía.
    const safePage = Math.min(rowPage, pageCount - 1);
    const start = safePage * ROW_PAGE_SIZE;
    const pageIds = ids.slice(start, start + ROW_PAGE_SIZE);

    const metas = library.resolveMany(pageIds);
    if (metas.length === 0) return <EmptyBlock label="Acá no hay nada todavía." />;

    return (
      <>
        <TrackRows
          metas={metas}
          start={start}
          contextIds={ids}
          originLabel={originLabel}
          showAlbum={options.showAlbum ?? true}
          playlistId={options.playlistId}
          currentTrackId={player.currentTrackId}
          canPractice={playerUi.canPractice}
          onOpenMenu={onOpenMenu}
          onAddToPlaylist={onAddToPlaylist}
          onPracticeTrack={onPracticeTrack}
          /* Cambia cuando cambia el contenido de la página. Es lo que reinicia
             el montaje por tandas: si no, la lista nueva se montaría de un saque
             porque el contador ya llegó al tope. */
          listKey={`${viewKey}|${originLabel}|${safePage}`}
        />

        {pageCount > 1 && (
          <nav className="pm-rows-pager" aria-label={`Páginas de ${originLabel}`}>
            <button
              type="button"
              className="pm-btn"
              onClick={() => setRowPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
            >
              ◀ Anterior
            </button>
            <span className="pm-rows-pager__count">
              {start + 1}–{Math.min(start + ROW_PAGE_SIZE, ids.length)} de {ids.length}
            </span>
            <button
              type="button"
              className="pm-btn"
              onClick={() => setRowPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Siguiente ▶
            </button>
          </nav>
        )}
      </>
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
      /**
       * Una shelf por FAMILIA de géneros, no por género suelto.
       *
       * ── QUÉ ESTABA MAL ANTES ─────────────────────────────────────────────
       *
       * Había cuatro shelves escritas a mano —Vallenato, Boleros, Clásica y Pop &
       * Rock— con los géneros del catálogo original. Cuando la biblioteca pasó a
       * casi 4.000 canciones, esas cuatro quedaron desactualizadas: el Inicio
       * mostraba vallenato y clásica, y **no mostraba baladas ni rancheras**, que
       * son la mayoría de la música. Además el filtro se recalculaba en cada
       * render recorriendo las 3.977 canciones cuatro veces.
       *
       * Ahora sale una shelf por familia con contenido, y el porqué de la
       * agrupación está en `constants/genreFamilies.ts`: salsa con bolero,
       * vallenato con cumbia, ranchera con corrido. Es la misma lógica que la
       * vista de Colecciones, para que el Inicio y las Colecciones no se
       * contradigan.
       */
      ...GENRE_FAMILIES.map((family) => {
        const ids = tracks
          .filter((meta) => meta.genre && family.genres.includes(meta.genre))
          .map((meta) => meta.id);
        return renderShelf(
          `${family.emoji} ${family.label}`,
          ids,
          family.label,
          () => onViewChange({ tab: "family", id: family.id }),
        );
      }),
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
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Buscar en la biblioteca"
          />
          {localQuery && (
            <button
              type="button"
              className="pm-search__clear"
              onClick={handleClearQuery}
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

  /**
   * Una canción de muestra del género, para su portada.
   *
   * `Cover` cae al degradado del género con las iniciales cuando la canción no
   * tiene arte, así que no hace falta comprobar nada: si hay portada real se ve,
   * y si no, se ve el degradado. Buscar "la que tenga portada" exigiría saber
   * cuáles la tienen, y eso vive en `coverStore`, no acá.
   */
  const coverForGenre = (genre: string) =>
    tracks.find((meta) => meta.genre === genre);

  /**
   * Colecciones: la biblioteca agrupada por AFINIDAD musical.
   *
   * ── POR QUÉ ASÍ Y NO UNA LISTA DE 3.977 ÁLBUMES ─────────────────────────
   *
   * La versión anterior listaba un álbum por artista: **3.977 tarjetas** sin
   * jerarquía, y el usuario tenía que recorrerlas para encontrar algo. Una
   * biblioteca así no se navega, se sufre.
   *
   * Ahora hay tres niveles y cada uno tiene pocas opciones:
   *
   *   1. **Familias** (6 tarjetas): qué clima querés. "Tropical", "Romántica",
   *      "México y el norte"…
   *   2. **Géneros de esa familia** (1 a 5): el ritmo concreto, con su portada y
   *      su cantidad de canciones.
   *   3. **Canciones de ese género**, paginadas.
   *
   * La agrupación por afinidad es lo que hace que esto sea útil y no un índice:
   * salsa con bolero, vallenato con cumbia, ranchera con corrido. Son los géneros
   * que de verdad se mezclan en una misma lista.
   */
  const renderCollections = () => {
    // Sólo las familias que tienen algo: una tarjeta vacía es una promesa falsa.
    const families = GENRE_FAMILIES.map((family) => {
      const genres = family.genres
        .map((genre) => ({
          genre,
          meta: GENRE_META[genre],
          count: library.genreCounts.get(genre) ?? 0,
        }))
        .filter((entry) => entry.meta && entry.count > 0);
      return {
        family,
        genres,
        total: genres.reduce((sum, entry) => sum + entry.count, 0),
      };
    }).filter((entry) => entry.genres.length > 0);

    return (
      <>
        <header className="pm-page-head">
          <h1 className="pm-page-title">Colecciones</h1>
          <p className="pm-page-sub">
            Tu música agrupada por afinidad: los géneros que se mezclan bien entre sí
          </p>
        </header>

        <div className="pm-family-grid">
          {families.map(({ family, genres, total }) => (
            <button
              key={family.id}
              type="button"
              className="pm-family"
              style={{
                background: `linear-gradient(135deg, ${family.color}, ${family.colorAlt})`,
              }}
              onClick={() => onViewChange({ tab: "family", id: family.id })}
            >
              <span className="pm-family__top">
                <span className="pm-family__emoji" aria-hidden="true">
                  {family.emoji}
                </span>
                <span className="pm-family__names">
                  <span className="pm-family__label">{family.label}</span>
                  <span className="pm-family__count">
                    {total} cancion{total === 1 ? "" : "es"} · {genres.length} género
                    {genres.length === 1 ? "" : "s"}
                  </span>
                </span>
              </span>

              <span className="pm-family__desc">{family.description}</span>

              {/* Mosaico de las portadas de sus géneros: es lo que hace que la
                  tarjeta se reconozca de un vistazo, como en Spotify. */}
              <span className="pm-family__mosaic" aria-hidden="true">
                {genres.slice(0, 4).map(({ genre, meta }) => (
                  <span key={genre} className="pm-family__mosaic-cell">
                    <Cover
                      meta={coverForGenre(genre)}
                      size="sm"
                      label={meta.label}
                    />
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  };

  /** Una familia abierta: sus géneros, cada uno con su portada. */
  const renderFamily = (familyId: string) => {
    const family = GENRE_FAMILIES.find((entry) => entry.id === familyId);
    const genres = (family?.genres ?? [])
      .map((genre) => ({
        genre,
        meta: GENRE_META[genre],
        count: library.genreCounts.get(genre) ?? 0,
      }))
      .filter((entry) => entry.meta && entry.count > 0);

    if (!family) return <EmptyBlock label="Esta colección ya no existe" />;

    return (
      <>
        <header
          className="pm-page-head pm-page-head--family"
          style={{
            background: `linear-gradient(135deg, ${family.color}22, ${family.colorAlt}11)`,
          }}
        >
          <p className="pm-page-eyebrow">Colección</p>
          <h1 className="pm-page-title">
            <span aria-hidden="true">{family.emoji}</span> {family.label}
          </h1>
          <p className="pm-page-sub">{family.description}</p>
        </header>

        {genres.length === 0 ? (
          <EmptyBlock label="Esta colección todavía no tiene canciones" />
        ) : (
          <div className="pm-tile-grid">
            {genres.map(({ genre, meta, count }) => (
              <button
                key={genre}
                type="button"
                className="pm-card"
                onClick={() => onViewChange({ tab: "genre", id: genre })}
              >
                <Cover
                  meta={coverForGenre(genre)}
                  size="xl"
                  label={meta.label}
                />
                <span className="pm-card__title">{meta.label}</span>
                <span className="pm-card__sub">
                  {count} cancion{count === 1 ? "" : "es"}
                </span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  };

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
        return renderCollections();
      case "family":
        return renderFamily(view.id);
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

/** Cuántas filas se montan en el primer frame de una lista. */
const FIRST_PAINT_ROWS = 12;

/** Cuántas filas más entran en cada frame siguiente. */
const ROW_BATCH = 12;

/**
 * Cuántas filas de la página están montadas.
 *
 * ── POR QUÉ POR TANDAS Y NO TODAS JUNTAS ───────────────────────────────────
 *
 * Una página son hasta 100 filas (~2.500 elementos del DOM). Montarlas de una
 * sola vez bloquea el hilo ~200 ms, y en el buscador eso ocurría en cada tecla:
 * medido sobre el build de producción, escribir "corazon" dejaba 4 tareas largas
 * de hasta 261 ms, y en el piano hasta 492 ms. Se siente como "se trabó / se
 * cayó", aunque no haya ningún error de JavaScript.
 *
 * Montar 12 y seguir en los frames siguientes reparte EL MISMO trabajo: el total
 * montado no cambia —siguen siendo las 100 de la página—, así que el techo del
 * DOM sigue fijo (AGENTS.md) y la lista se ve igual, un par de frames después.
 *
 * `listKey` reinicia el conteo cuando cambia el contenido de la página: sin eso
 * la búsqueda siguiente se montaría de un saque, porque el contador ya llegó al
 * tope. Se ajusta durante el render —el patrón que React recomienda para estado
 * que depende de otro estado— y no en un `useEffect`, que agregaría un render
 * extra mostrando la lista vieja.
 */
function useBatchedRows(target: number, listKey: string): number {
  const [count, setCount] = useState(() => Math.min(FIRST_PAINT_ROWS, target));
  const [key, setKey] = useState(listKey);

  if (key !== listKey) {
    setKey(listKey);
    setCount(Math.min(FIRST_PAINT_ROWS, target));
  }

  useEffect(() => {
    if (count >= target) return;

    let frame = 0;
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      setCount((current) => Math.min(current + ROW_BATCH, target));
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [target, count]);

  return Math.min(count, target);
}

/**
 * Las filas de UNA página, montadas por tandas.
 *
 * Es un componente y no un `.map()` dentro de `renderRows` porque necesita
 * estado propio (cuántas filas van montadas) y `renderRows` es una función que
 * corre durante el render, no un componente.
 */
function TrackRows({
  metas,
  start,
  contextIds,
  originLabel,
  showAlbum,
  playlistId,
  currentTrackId,
  canPractice,
  onOpenMenu,
  onAddToPlaylist,
  onPracticeTrack,
  listKey,
}: {
  metas: TrackMeta[];
  start: number;
  contextIds: string[];
  originLabel: string;
  showAlbum: boolean;
  playlistId?: string;
  currentTrackId: string | null;
  canPractice: boolean;
  onOpenMenu: (meta: TrackMeta, event: MouseEvent<HTMLElement>) => void;
  onAddToPlaylist: (meta: TrackMeta) => void;
  onPracticeTrack?: (meta: TrackMeta) => void;
  listKey: string;
}) {
  const mounted = useBatchedRows(metas.length, listKey);

  /**
   * El botón "Practicar" de cada fila, armado UNA vez por lista.
   *
   * ── POR QUÉ NO SE ARMA AL VUELO ────────────────────────────────────────────
   *
   * `TrackRow` está memoizada: sólo se vuelve a renderizar si cambia alguna
   * prop. Armando el botón dentro del `.map()`, su identidad cambiaba en cada
   * render y **volvía a renderizar todas las filas ya montadas en cada tanda**:
   * con el montaje en tandas son cinco renders de hasta 100 filas por tecla en
   * vez de uno. Medido, eso duplicaba el JavaScript por tecla (99 → 213 ms) sin
   * que se viera nada distinto en pantalla.
   *
   * Durante el montaje por tandas `metas` no cambia de identidad (el padre no se
   * vuelve a renderizar), así que este `useMemo` no se recalcula y los botones
   * siguen siendo los mismos objetos: las filas ya montadas no se tocan.
   */
  const botonesPracticar = useMemo(() => {
    if (!onPracticeTrack || !canPractice) return null;
    const botones = new Map<string, ReactNode>();
    for (const meta of metas) {
      botones.set(
        meta.id,
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
        </button>,
      );
    }
    return botones;
  }, [metas, onPracticeTrack, canPractice]);

  return (
    <ol className="pm-rows">
      {metas.slice(0, mounted).map((meta, index) => (
        <TrackRow
          key={`${meta.id}-${start + index}`}
          meta={meta}
          /* El número que ve el usuario es global a la lista, no a la página:
             en la página 3 la primera fila es la 201, no la 1. */
          index={start + index}
          contextIds={contextIds}
          originLabel={originLabel}
          isActive={currentTrackId === meta.id}
          onOpenMenu={onOpenMenu}
          onAddToPlaylist={onAddToPlaylist}
          showAlbum={showAlbum}
          playlistId={playlistId}
          trailing={botonesPracticar?.get(meta.id)}
        />
      ))}
    </ol>
  );
}

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
